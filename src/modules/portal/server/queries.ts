import "server-only";
import { createClient } from "@/lib/supabase/server";
import { availableDeliveryDates, warsawNow } from "../domain/portal";
import type { PortalContext } from "./context";

export type PortalPoint = {
  id: string;
  name: string;
  address: string;
  window: string | null; // okno przyjęć w najbliższy dzień dostawy, np. "06:00–08:00"
  dates: string[];
};

/** Aktywne oddziały klienta z dniami, na które można dziś zamówić dostawę. */
export async function getPortalPoints(ctx: PortalContext): Promise<PortalPoint[]> {
  const supabase = await createClient();
  const now = warsawNow();
  const [{ data: points, error }, { data: exceptions }] = await Promise.all([
    supabase
      .from("delivery_points")
      .select(
        "id, name, address_line, postal_code, city, delivery_weekdays, active_from, active_to, delivery_point_windows(weekday, opens_at, closes_at)",
      )
      .eq("tenant_id", ctx.tenantId)
      .eq("customer_id", ctx.customerId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("delivery_point_exceptions")
      .select("delivery_point_id, date, is_closed")
      .eq("tenant_id", ctx.tenantId)
      .eq("is_closed", true)
      .gte("date", now.date),
  ]);
  if (error) throw error;

  return (points ?? []).map((p) => {
    const closedDates = (exceptions ?? [])
      .filter((e) => e.delivery_point_id === null || e.delivery_point_id === p.id)
      .map((e) => e.date);
    const dates = availableDeliveryDates(now, ctx.settings, {
      weekdays: p.delivery_weekdays ?? [],
      activeFrom: p.active_from,
      activeTo: p.active_to,
      closedDates,
    });
    const firstWd = dates[0] ? new Date(`${dates[0]}T12:00:00Z`).getUTCDay() || 7 : null;
    const w = (p.delivery_point_windows ?? [])
      .filter((x) => x.weekday === firstWd)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at));
    return {
      id: p.id,
      name: p.name,
      address: [p.address_line, [p.postal_code, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      window: w.length ? w.map((x) => `${x.opens_at.slice(0, 5)}–${x.closes_at.slice(0, 5)}`).join(", ") : null,
      dates,
    };
  });
}

export async function getPortalCatalog(ctx: PortalContext) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, code, name, category, unit, unit_weight_kg, price, pack_label, is_special, image_url")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true)
    .order("is_special", { ascending: false })
    .order("category", { nullsFirst: false })
    .order("sort")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getPortalFavorites(ctx: PortalContext): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("customer_favorites").select("product_id").eq("customer_id", ctx.customerId);
  return (data ?? []).map((f) => f.product_id);
}

const ORDER_LIST_COLS =
  "id, external_ref, delivery_date, status, order_value, weight_kg, source, placed_at, created_at, delivery_points(name), order_lines(id), route_stop_orders(stop_id)";

/** Zamówienia klienta: nadchodzące (od dziś) i ostatnie 30 dni. */
export async function getPortalOrders(ctx: PortalContext) {
  const supabase = await createClient();
  const today = warsawNow().date;
  const since = new Date(`${today}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 30);
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_LIST_COLS)
    .eq("tenant_id", ctx.tenantId)
    .gte("delivery_date", since.toISOString().slice(0, 10))
    .order("delivery_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = data ?? [];
  return {
    upcoming: rows.filter((o) => o.delivery_date >= today && o.status !== "cancelled").reverse(),
    past: rows.filter((o) => o.delivery_date < today || o.status === "cancelled"),
  };
}

export async function getPortalOrder(ctx: PortalContext, orderId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, external_ref, delivery_date, status, order_value, weight_kg, source, customer_note, placed_at, created_at, delivery_point_id, delivery_points(name, address_line, city), order_lines(line_no, product_id, product_code, product_name, unit, qty, unit_price), route_stop_orders(stop_id)",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, order_lines: [...(data.order_lines ?? [])].sort((a, b) => a.line_no - b.line_no) };
}

/** Pozycje ostatniego zamówienia z portalu (do „Zamów to samo”). */
export async function getLastPortalOrderId(ctx: PortalContext): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("source", "portal")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
