"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { orderSchema, READINESS, type Readiness } from "../domain/orders";

export async function createOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień do dodawania zamówień." };
  const parsed = orderSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();

  // Oddział musi należeć do tej firmy (RLS i tak to wymusza — tu dajemy czytelny błąd)
  const { data: point } = await supabase.from("delivery_points").select("id").eq("tenant_id", ctx.tenantId).eq("id", v.delivery_point_id).maybeSingle();
  if (!point) return { ok: false, fieldErrors: { delivery_point_id: ["Nie znaleziono oddziału"] }, message: "Popraw zaznaczone pola." };

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
  if (error?.code === "23505") return { ok: false, fieldErrors: { external_ref: ["Zamówienie o tym numerze na ten dzień już istnieje"] }, message: "Popraw zaznaczone pola." };
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
  await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId).eq("tenant_id", ctx.tenantId).neq("status", "delivered");
  revalidatePath("/zlecenia");
  revalidatePath("/pulpit");
}
