import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Readiness } from "../domain/orders";

export type DayOrder = {
  id: string;
  external_ref: string | null;
  readiness: Readiness;
  status: string;
  priority: number;
  order_value: number | null;
  weight_kg: number;
  pallets: number;
  crates: number;
  notes_sales: string | null;
  notes_logistics: string | null;
  window: string;
  customerName: string;
  customerCode: string | null;
  customerId: string | null;
  branchName: string;
  city: string;
  route: string;
};

const t = (s?: string | null) => (s ? s.slice(0, 5) : "");

/** Zamówienia firmy na dzień, z oddziałem, klientem, oknem i trasą stałą. */
export async function getDayOrders(tenantId: string, day: string): Promise<DayOrder[]> {
  const supabase = await createClient();
  const weekday = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // ISO: 1 = pon
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, external_ref, readiness, status, priority, order_value, weight_kg, pallets, crates, notes_sales, notes_logistics, window_start, window_end, delivery_points(name, city, customers(id, name, external_code), delivery_point_windows(weekday, opens_at, closes_at), route_template_points(route_templates(name)))",
    )
    .eq("tenant_id", tenantId)
    .eq("delivery_date", day)
    .order("external_ref");
  if (error) throw error;

  return (data ?? []).map((o) => {
    const p = o.delivery_points;
    const pointWindows = (p?.delivery_point_windows ?? [])
      .filter((w) => w.weekday === weekday)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
      .map((w) => `${t(w.opens_at)}–${t(w.closes_at)}`);
    const window = o.window_start ? `${t(o.window_start)}–${t(o.window_end)}` : pointWindows.join(", ") || "—";
    return {
      id: o.id,
      external_ref: o.external_ref,
      readiness: o.readiness,
      status: o.status,
      priority: o.priority,
      order_value: o.order_value,
      weight_kg: Number(o.weight_kg ?? 0),
      pallets: Number(o.pallets ?? 0),
      crates: o.crates ?? 0,
      notes_sales: o.notes_sales,
      notes_logistics: o.notes_logistics,
      window,
      customerName: p?.customers?.name ?? "—",
      customerCode: p?.customers?.external_code ?? null,
      customerId: p?.customers?.id ?? null,
      branchName: p?.name ?? "—",
      city: p?.city ?? "",
      route: p?.route_template_points?.[0]?.route_templates?.name ?? "Bez trasy stałej",
    };
  });
}

/** Najbliższy dzień (od podanego) z jakimikolwiek zamówieniami — podpowiedź, gdy wybrany dzień jest pusty. */
export async function nearestDayWithOrders(tenantId: string, from: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("delivery_date")
    .eq("tenant_id", tenantId)
    .gte("delivery_date", from)
    .neq("status", "cancelled")
    .order("delivery_date")
    .limit(1)
    .maybeSingle();
  return data?.delivery_date ?? null;
}
