import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { RawRow } from "@/lib/tabular";
import {
  buildPointIndex,
  dedupeOrders,
  LOCKED_ORDER_STATUSES,
  matchOrderToPoint,
  normalizeOrderRow,
  type ImportSummary,
  type NormalizedOrder,
  type OrderMapping,
} from "../domain/import";

type Db = SupabaseClient<Database>;

export type ImportIssue = { line: number; ref: string; problem: string };
export type ImportResult = { summary: ImportSummary; issues: ImportIssue[]; importId: string | null };

const CHUNK = 400;

async function loadPoints(db: Db, tenantId: string) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("delivery_points")
      .select("id, external_code, address_line, city, is_active, customer_id, customers(external_code, name)")
      .eq("tenant_id", tenantId)
      .range(from, from + 999);
    if (error) throw error;
    out.push(
      ...(data ?? []).map((p) => ({
        id: p.id,
        external_code: p.external_code,
        address_line: p.address_line,
        city: p.city,
        is_active: p.is_active,
        customer_id: p.customer_id,
        customer_code: p.customers?.external_code ?? null,
        customer_name: p.customers?.name ?? "",
      })),
    );
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Wspólny import zamówień: plik (klient użytkownika, RLS) i API (klient serwerowy po weryfikacji klucza).
 * Zamówienie o tym samym numerze i dniu jest aktualizowane, chyba że już jedzie albo jest zakończone.
 */
export async function runOrderImport(
  db: Db,
  args: {
    tenantId: string;
    userId: string | null;
    rows: RawRow[];
    mapping: OrderMapping;
    defaultDate: string;
    source: "file" | "api";
    fileName?: string | null;
    firstLine?: number; // nr pierwszego wiersza danych w pliku (2 = pod nagłówkiem)
  },
): Promise<ImportResult> {
  const { tenantId } = args;
  const issues: ImportIssue[] = [];
  const valid: NormalizedOrder[] = [];
  args.rows.forEach((row, i) => {
    const r = normalizeOrderRow(row, args.mapping, { date: args.defaultDate }, (args.firstLine ?? 2) + i);
    if (r.ok) valid.push(r.order);
    else issues.push({ line: r.line, ref: r.ref, problem: r.errors.join("; ") });
  });
  const { orders, duplicates } = dedupeOrders(valid);

  const idx = buildPointIndex(await loadPoints(db, tenantId));

  // istniejące zamówienia o tych numerach (po numerze; dzień porównujemy w pamięci)
  const refs = [...new Set(orders.map((o) => o.external_ref))];
  const existing = new Map<string, { id: string; status: string; delivery_point_id: string | null }>();
  for (let i = 0; i < refs.length; i += CHUNK) {
    const { data, error } = await db
      .from("orders")
      .select("id, external_ref, delivery_date, status, delivery_point_id")
      .eq("tenant_id", tenantId)
      .in("external_ref", refs.slice(i, i + CHUNK));
    if (error) throw error;
    for (const o of data ?? []) existing.set(`${o.external_ref}|${o.delivery_date}`, o);
  }

  const { data: imp } = await db
    .from("order_imports")
    .insert({
      tenant_id: tenantId,
      kind: "orders",
      source: args.source,
      file_name: args.fileName ?? null,
      column_mapping: args.mapping as never,
      created_by: args.userId,
    })
    .select("id")
    .single();
  const importId = imp?.id ?? null;

  const summary: ImportSummary = { total: args.rows.length, created: 0, updated: 0, unmatched: 0, skipped: duplicates, errors: issues.length };
  const inserts: Database["public"]["Tables"]["orders"]["Insert"][] = [];

  for (const o of orders) {
    const m = matchOrderToPoint(o, idx);
    const pointId = m.pointId;
    if (!pointId) {
      summary.unmatched += 1;
      issues.push({ line: o.line, ref: o.external_ref, problem: `do dopasowania: ${(m as { reason: string }).reason}` });
    }
    const fields = {
      weight_kg: o.weight_kg,
      pallets: o.pallets,
      volume_m3: o.volume_m3,
      crates: o.crates,
      order_value: o.order_value,
      cod_amount: o.cod_amount,
      window_start: o.window_start,
      window_end: o.window_end,
      priority: o.priority,
      type: o.type,
      notes_sales: o.notes_sales,
      notes_logistics: o.notes_logistics,
      raw_customer_code: o.customer_code,
      raw_point_code: o.point_code,
      raw_customer_name: o.customer_name,
      raw_address: [o.address, [o.postal_code, o.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      ...(o.readiness ? { readiness: o.readiness } : {}),
    };
    const prev = existing.get(`${o.external_ref}|${o.delivery_date}`);
    if (prev) {
      if ((LOCKED_ORDER_STATUSES as readonly string[]).includes(prev.status)) {
        summary.skipped += 1;
        issues.push({ line: o.line, ref: o.external_ref, problem: "pominięte — zamówienie jest już w realizacji albo zakończone" });
        continue;
      }
      const update = {
        ...fields,
        import_id: importId,
        // dopasowanie z pliku nie zmienia adresu zamówienia już przypiętego ręcznie
        ...(prev.delivery_point_id ? {} : { delivery_point_id: pointId, status: pointId ? ("new" as const) : ("unmatched" as const) }),
      };
      const { error } = await db.from("orders").update(update).eq("id", prev.id).eq("tenant_id", tenantId);
      if (error) {
        summary.errors += 1;
        issues.push({ line: o.line, ref: o.external_ref, problem: "błąd zapisu" });
      } else summary.updated += 1;
    } else {
      inserts.push({
        ...fields,
        tenant_id: tenantId,
        import_id: importId,
        external_ref: o.external_ref,
        delivery_date: o.delivery_date,
        delivery_point_id: pointId,
        status: pointId ? "new" : "unmatched",
        source: args.source,
        readiness: o.readiness ?? "ready",
      });
    }
  }

  for (let i = 0; i < inserts.length; i += CHUNK) {
    const part = inserts.slice(i, i + CHUNK);
    const { error } = await db.from("orders").insert(part);
    if (error) {
      summary.errors += part.length;
      issues.push({ line: 0, ref: "", problem: `błąd zapisu ${part.length} zamówień: ${error.message}` });
    } else summary.created += part.length;
  }

  if (importId) {
    await db
      .from("order_imports")
      .update({
        rows_total: summary.total,
        rows_ok: summary.created + summary.updated - summary.unmatched,
        rows_unmatched: summary.unmatched,
        rows_updated: summary.updated,
        rows_skipped: summary.skipped,
        report: issues.slice(0, 500) as never,
      })
      .eq("id", importId);
  }
  issues.sort((a, b) => a.line - b.line);
  return { summary, issues, importId };
}
