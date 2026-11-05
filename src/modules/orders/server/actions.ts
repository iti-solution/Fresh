"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { DATE_RE } from "@/lib/forms";
import type { RawRow } from "@/lib/tabular";
import type { OrderMapping } from "../domain/import";
import { orderSchema, READINESS, type Readiness } from "../domain/orders";
import { runOrderImport, type ImportResult } from "./import";

export async function createOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień do dodawania zamówień." };
  const parsed = orderSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();

  // Oddział musi należeć do tej firmy (RLS i tak to wymusza — tu dajemy czytelny błąd)
  const { data: point } = await supabase
    .from("delivery_points")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", v.delivery_point_id)
    .maybeSingle();
  if (!point)
    return {
      ok: false,
      fieldErrors: { delivery_point_id: ["Nie znaleziono adresu dostawy"] },
      message: "Popraw zaznaczone pola.",
    };

  const { error } = await supabase.from("orders").insert({
    tenant_id: ctx.tenantId,
    delivery_point_id: v.delivery_point_id,
    delivery_date: v.delivery_date,
    external_ref: v.external_ref,
    order_value: v.order_value,
    weight_kg: v.weight_kg ?? 0,
    pallets: v.pallets ?? 0,
    crates: v.crates ?? 0,
    window_start: v.window_start,
    window_end: v.window_end,
    readiness: v.readiness,
    notes_sales: v.notes_sales,
    notes_logistics: v.notes_logistics,
    type: "delivery",
    status: "new",
  });
  if (error?.code === "23505")
    return {
      ok: false,
      fieldErrors: { external_ref: ["Zamówienie o tym numerze na ten dzień już istnieje"] },
      message: "Popraw zaznaczone pola.",
    };
  if (error) return { ok: false, message: "Nie udało się zapisać zamówienia." };
  revalidatePath("/zlecenia");
  revalidatePath("/pulpit");
  redirect(`/zlecenia?dzien=${v.delivery_date}&dodano=1`);
}

export async function setReadiness(orderId: string, readiness: Readiness): Promise<void> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role) || !READINESS.includes(readiness)) return;
  const supabase = await createClient();
  await supabase.from("orders").update({ readiness }).eq("id", orderId).eq("tenant_id", ctx.tenantId);
  revalidatePath("/zlecenia");
  revalidatePath("/pulpit");
}

export async function cancelOrder(orderId: string): Promise<void> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return;
  const supabase = await createClient();
  await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("tenant_id", ctx.tenantId)
    .neq("status", "delivered");
  revalidatePath("/zlecenia");
  revalidatePath("/pulpit");
}

// ---------- IMPORT Z PLIKU (M1.5) ----------
export type FileImportPayload = {
  fileName: string;
  defaultDate: string;
  mapping: OrderMapping;
  rows: RawRow[];
  firstLine: number;
};

export type FileImportResult = { ok: boolean; message?: string; result?: ImportResult };

const MAX_ROWS = 5000;

export async function importOrdersFromFile(payload: FileImportPayload): Promise<FileImportResult> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień do importu zamówień." };
  if (!DATE_RE.test(payload.defaultDate)) return { ok: false, message: "Wybierz dzień dostawy." };
  if (!payload.mapping.external_ref) return { ok: false, message: "Wskaż kolumnę z numerem zamówienia." };
  if (!payload.mapping.customer_code && !payload.mapping.point_code && !payload.mapping.address)
    return {
      ok: false,
      message: "Wskaż kolumnę z kodem klienta, kodem adresu albo adresem — inaczej nie da się dopasować zamówień.",
    };
  if (!Array.isArray(payload.rows) || payload.rows.length === 0) return { ok: false, message: "Plik nie ma wierszy z danymi." };
  if (payload.rows.length > MAX_ROWS) return { ok: false, message: `Maksymalnie ${MAX_ROWS} wierszy w jednym pliku.` };
  const supabase = await createClient();
  await supabase.from("import_mappings").upsert({
    tenant_id: ctx.tenantId,
    kind: "orders",
    mapping: payload.mapping as never,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  });
  const result = await runOrderImport(supabase, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    rows: payload.rows,
    mapping: payload.mapping,
    defaultDate: payload.defaultDate,
    source: "file",
    fileName: payload.fileName.slice(0, 200),
    firstLine: payload.firstLine,
  });
  revalidatePath("/zlecenia");
  revalidatePath("/pulpit");
  revalidatePath("/planowanie");
  return { ok: true, result };
}

// ---------- RĘCZNE DOPASOWANIE ----------
/** Przypina zamówienie do adresu; opcjonalnie zapamiętuje kod z ERP na adresie/kliencie, żeby kolejny import trafił sam. */
export async function assignOrderPoint(orderId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  const pointId = String(fd.get("point_id") ?? "");
  const remember = fd.get("remember") === "on";
  if (!pointId) return { ok: false, message: "Wybierz adres dostawy." };
  const supabase = await createClient();
  const [{ data: order }, { data: point }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, raw_point_code, raw_customer_code, status")
      .eq("id", orderId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle(),
    supabase
      .from("delivery_points")
      .select("id, external_code, customer_id, customers(external_code)")
      .eq("id", pointId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle(),
  ]);
  if (!order || !point) return { ok: false, message: "Nie znaleziono zamówienia albo adresu." };
  if (!["unmatched", "new"].includes(order.status))
    return { ok: false, message: "Zamówienie jest już na trasie albo zrealizowane — zmień adres w planowaniu." };
  const { count: onStop } = await supabase
    .from("route_stop_orders")
    .select("order_id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if (onStop) return { ok: false, message: "Zamówienie jest już na trasie — najpierw zdejmij je z trasy w planowaniu." };
  const { error } = await supabase
    .from("orders")
    .update({ delivery_point_id: pointId, status: order.status === "unmatched" ? "new" : order.status })
    .eq("id", orderId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, message: "Nie udało się zapisać." };
  let remembered = "";
  if (remember) {
    if (order.raw_point_code && !point.external_code) {
      const { error: e } = await supabase
        .from("delivery_points")
        .update({ external_code: order.raw_point_code })
        .eq("id", pointId)
        .eq("tenant_id", ctx.tenantId);
      if (!e) remembered = ` Zapamiętano kod adresu ${order.raw_point_code}.`;
    } else if (order.raw_customer_code && !point.customers?.external_code) {
      const { error: e } = await supabase
        .from("customers")
        .update({ external_code: order.raw_customer_code })
        .eq("id", point.customer_id)
        .eq("tenant_id", ctx.tenantId);
      if (!e) remembered = ` Zapamiętano kod klienta ${order.raw_customer_code}.`;
    }
  }
  revalidatePath("/zlecenia");
  revalidatePath("/zlecenia/dopasuj");
  revalidatePath("/planowanie");
  return { ok: true, message: `Dopasowano.${remembered}` };
}

/** Kreator importu (wspólny komponent) — ten sam import, wynik w formacie kreatora. */
export async function importOrdersWizard(p: FileImportPayload): Promise<{
  ok: boolean;
  message?: string;
  summary?: Record<string, number>;
  issues?: { line: number; ref: string; problem: string }[];
}> {
  const r = await importOrdersFromFile(p);
  return r.ok && r.result
    ? { ok: true, summary: r.result.summary, issues: r.result.issues.slice(0, 300) }
    : { ok: false, message: r.message };
}
