"use server";

import { revalidatePath } from "next/cache";
import type { RawRow } from "@/lib/tabular";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import {
  customerKey,
  normalizeCustomerRow,
  pointKey,
  type CustomerMapping,
  type NormalizedCustomerRow,
} from "../domain/customer-import";

type Issue = { line: number; ref: string; problem: string };
export type CustomerImportPayload = { fileName: string; defaultDate: string; mapping: CustomerMapping; rows: RawRow[]; firstLine: number };

const MAX_ROWS = 5000;

/** Puste pola z pliku nie kasują danych w kartotece. */
function withoutNulls<T extends Record<string, unknown>>(o: T): Partial<{ [K in keyof T]: NonNullable<T[K]> }> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) as Partial<{ [K in keyof T]: NonNullable<T[K]> }>;
}

/**
 * M1.7 — kartoteka klientów i adresów z Excela. Klient po kodzie (albo nazwie), adres po kodzie (albo ulicy i mieście).
 * Istniejące rekordy są uzupełniane; adres z ręcznie zablokowaną lokalizacją nie zmienia ulicy ani miasta.
 */
export async function importCustomersWizard(p: CustomerImportPayload): Promise<{
  ok: boolean;
  message?: string;
  summary?: Record<string, number>;
  issues?: Issue[];
}> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień do importu kartoteki." };
  if (!Array.isArray(p.rows) || !p.rows.length) return { ok: false, message: "Plik nie ma wierszy z danymi." };
  if (p.rows.length > MAX_ROWS) return { ok: false, message: `Maksymalnie ${MAX_ROWS} wierszy w jednym pliku.` };
  if (!p.mapping.customer_name || !p.mapping.address || !p.mapping.city)
    return { ok: false, message: "Wskaż kolumny: nazwa klienta, ulica i miejscowość." };
  const db = await createClient();
  const tenantId = ctx.tenantId;

  await db.from("import_mappings").upsert({
    tenant_id: tenantId,
    kind: "customers",
    mapping: p.mapping as never,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  });

  const { data: types } = await db.from("point_types").select("id, code, name").eq("tenant_id", tenantId);
  const issues: Issue[] = [];
  const rows: NormalizedCustomerRow[] = [];
  let invalid = 0;
  p.rows.forEach((raw, i) => {
    const r = normalizeCustomerRow(raw, p.mapping, types ?? [], (p.firstLine ?? 2) + i);
    if (r.ok) {
      rows.push(r.row);
      for (const w of r.row.warnings) issues.push({ line: r.row.line, ref: r.row.customer.external_code ?? r.row.customer.name, problem: w });
    } else {
      invalid += 1;
      issues.push({ line: r.line, ref: r.ref, problem: r.errors.join("; ") });
    }
  });

  // istniejąca kartoteka
  const [{ data: customers, error: cErr }, { data: points, error: pErr }] = await Promise.all([
    db.from("customers").select("id, external_code, name").eq("tenant_id", tenantId).limit(20000),
    db.from("delivery_points").select("id, customer_id, external_code, address_line, city, location_locked").eq("tenant_id", tenantId).limit(50000),
  ]);
  if (cErr || pErr) return { ok: false, message: "Nie udało się wczytać kartoteki." };
  const custByKey = new Map<string, string>();
  for (const c of customers ?? []) {
    custByKey.set(customerKey({ external_code: null, name: c.name }), c.id);
    if (c.external_code) custByKey.set(customerKey(c), c.id);
  }
  const pointByCode = new Map<string, { id: string; locked: boolean }>();
  const pointByCustAddr = new Map<string, { id: string; locked: boolean }>();
  for (const pt of points ?? []) {
    const v = { id: pt.id, locked: pt.location_locked };
    if (pt.external_code) pointByCode.set(pointKey(pt), v);
    pointByCustAddr.set(`${pt.customer_id}|${pointKey({ ...pt, external_code: null })}`, v);
  }

  const summary = { total: p.rows.length, customers_created: 0, customers_updated: 0, points_created: 0, points_updated: 0, errors: 0 };
  const touchedCustomers = new Set<string>();

  for (const r of rows) {
    const ref = r.customer.external_code ?? r.customer.name;
    // ---- klient
    const ck = customerKey(r.customer);
    // po kodzie, a gdy w kartotece klient nie ma jeszcze kodu — po nazwie
    let customerId = custByKey.get(ck) ?? custByKey.get(customerKey({ external_code: null, name: r.customer.name }));
    const custPatch = withoutNulls(r.customer);
    if (customerId) {
      if (!touchedCustomers.has(customerId)) {
        const { error } = await db.from("customers").update(custPatch).eq("id", customerId).eq("tenant_id", tenantId);
        if (error) {
          summary.errors += 1;
          issues.push({ line: r.line, ref, problem: error.code === "23505" ? "kod klienta zajęty przez innego klienta" : "błąd zapisu klienta" });
          continue;
        }
        summary.customers_updated += 1;
      }
    } else {
      const { data, error } = await db
        .from("customers")
        .insert({ ...r.customer, tenant_id: tenantId, is_active: true })
        .select("id")
        .single();
      if (error || !data) {
        summary.errors += 1;
        issues.push({ line: r.line, ref, problem: "błąd zapisu klienta" });
        continue;
      }
      customerId = data.id;
      custByKey.set(ck, customerId);
      custByKey.set(customerKey({ external_code: null, name: r.customer.name }), customerId);
      summary.customers_created += 1;
    }
    touchedCustomers.add(customerId);

    // ---- adres dostawy
    const pt = r.point;
    const existing =
      (pt.external_code ? pointByCode.get(pointKey(pt)) : undefined) ?? pointByCustAddr.get(`${customerId}|${pointKey({ ...pt, external_code: null })}`);
    const base = {
      name: pt.name,
      point_type_id: pt.point_type_id,
      external_code: pt.external_code,
      contact_phone: pt.contact_phone,
      service_minutes: pt.service_minutes,
      site_manager_name: pt.site_manager_name,
      site_manager_phone: pt.site_manager_phone,
      call_instructions: pt.call_instructions,
      access_instructions: pt.access_instructions,
      driver_instructions: pt.driver_instructions,
      active_from: pt.active_from,
      active_to: pt.active_to,
      delivery_weekdays: pt.delivery_weekdays,
    };
    const address = { address_line: pt.address_line, postal_code: pt.postal_code, city: pt.city };
    let pointId: string;
    if (existing) {
      const patch = withoutNulls({ ...base, ...(existing.locked ? {} : address) });
      const { error } = await db.from("delivery_points").update(patch).eq("id", existing.id).eq("tenant_id", tenantId);
      if (error) {
        summary.errors += 1;
        issues.push({ line: r.line, ref, problem: error.code === "23505" ? "kod adresu zajęty przez inny adres" : "błąd zapisu adresu" });
        continue;
      }
      if (existing.locked) issues.push({ line: r.line, ref, problem: "adres ma zablokowaną lokalizację — ulicy i miasta nie zmieniono" });
      pointId = existing.id;
      summary.points_updated += 1;
    } else {
      const { data, error } = await db
        .from("delivery_points")
        .insert({
          ...base,
          ...address,
          tenant_id: tenantId,
          customer_id: customerId,
          service_minutes: pt.service_minutes ?? 10,
          delivery_weekdays: pt.delivery_weekdays ?? [1, 2, 3, 4, 5, 6],
          is_active: true,
        })
        .select("id")
        .single();
      if (error || !data) {
        summary.errors += 1;
        issues.push({ line: r.line, ref, problem: error?.code === "23505" ? "kod adresu zajęty przez inny adres" : "błąd zapisu adresu" });
        continue;
      }
      pointId = data.id;
      const v = { id: pointId, locked: false };
      if (pt.external_code) pointByCode.set(pointKey(pt), v);
      pointByCustAddr.set(`${customerId}|${pointKey({ ...pt, external_code: null })}`, v);
      summary.points_created += 1;
    }

    // ---- okna przyjęć (gdy plik je podaje)
    if (pt.windows) {
      const days = pt.delivery_weekdays ?? [1, 2, 3, 4, 5, 6];
      await db.from("delivery_point_windows").delete().eq("tenant_id", tenantId).eq("delivery_point_id", pointId);
      const wins = days.flatMap((weekday) =>
        pt.windows!.map(([opens_at, closes_at]) => ({ tenant_id: tenantId, delivery_point_id: pointId, weekday, opens_at, closes_at })),
      );
      if (wins.length) await db.from("delivery_point_windows").insert(wins);
    }
  }
  summary.errors += invalid;

  await db.from("order_imports").insert({
    tenant_id: tenantId,
    kind: "customers",
    source: "file",
    file_name: p.fileName.slice(0, 200),
    column_mapping: p.mapping as never,
    rows_total: summary.total,
    rows_ok: summary.points_created + summary.points_updated,
    rows_updated: summary.points_updated,
    report: issues.slice(0, 500) as never,
    created_by: ctx.userId,
  });
  revalidatePath("/kartoteki/klienci");
  issues.sort((a, b) => a.line - b.line);
  return { ok: true, summary, issues: issues.slice(0, 300) };
}
