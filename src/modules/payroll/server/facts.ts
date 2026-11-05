import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toGrosze } from "@/lib/forms";
import type { Database } from "@/lib/supabase/database.types";
import { readComponents, type RouteFacts, type RuleRow } from "../domain/payroll";

type Db = SupabaseClient<Database>;
type RouteStatus = Database["public"]["Enums"]["route_status"];
const DONE = ["delivered", "partial"];
const hhmm = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hour12: false });
const isoWeekday = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Trasy kierowcy (albo wszystkich kierowców) w okresie → fakty do wynagrodzenia. */
export async function loadRouteFacts(
  db: Db,
  tenantId: string,
  from: string,
  to: string,
  opts: { driverId?: string; statuses?: RouteStatus[] } = {},
): Promise<(RouteFacts & { driverId: string })[]> {
  let q = db
    .from("routes")
    .select(
      `id, route_date, name, kind, course_no, status, driver_id, actual_km, odometer_start, odometer_end,
       route_stops(status, completed_at, delivery_points(delivery_point_windows(weekday, closes_at)),
         route_stop_orders(orders(order_value, pallets, status, window_end)))`,
    )
    .eq("tenant_id", tenantId)
    .gte("route_date", from)
    .lte("route_date", to)
    .not("driver_id", "is", null)
    .in("status", opts.statuses ?? ["completed", "closed"]);
  if (opts.driverId) q = q.eq("driver_id", opts.driverId);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const wd = isoWeekday(r.route_date);
    let stopsDone = 0;
    let withWindow = 0;
    let onTime = 0;
    let pallets = 0;
    let turnover = 0;
    let delivered = 0;
    for (const s of r.route_stops ?? []) {
      const orders = (s.route_stop_orders ?? [])
        .map((x) => x.orders)
        .filter((o): o is NonNullable<typeof o> => Boolean(o) && o!.status !== "cancelled");
      const done = DONE.includes(s.status);
      for (const o of orders) {
        turnover += toGrosze(o.order_value);
        if (done) {
          delivered += toGrosze(o.order_value);
          pallets += Number(o.pallets ?? 0);
        }
      }
      if (done) stopsDone += 1;
      const override = orders.find((o) => o.window_end)?.window_end ?? null;
      const winEnd =
        override ??
        (s.delivery_points?.delivery_point_windows ?? [])
          .filter((w) => w.weekday === wd)
          .map((w) => w.closes_at)
          .sort()
          .at(-1) ??
        null;
      if (done && winEnd && s.completed_at) {
        withWindow += 1;
        if (hhmm.format(new Date(s.completed_at)) <= winEnd.slice(0, 5)) onTime += 1;
      }
    }
    const km =
      r.actual_km !== null
        ? Number(r.actual_km)
        : r.odometer_end !== null && r.odometer_start !== null
          ? r.odometer_end - r.odometer_start
          : null;
    return {
      routeId: r.id,
      driverId: r.driver_id!,
      date: r.route_date,
      name: r.name,
      kind: r.kind,
      courseNo: r.course_no,
      km,
      stopsDone,
      stopsWithWindow: withWindow,
      stopsOnTime: onTime,
      palletsDelivered: Math.round(pallets * 100) / 100,
      turnoverGrosze: turnover,
      deliveredValueGrosze: delivered,
    };
  });
}

export async function loadRules(db: Db, tenantId: string): Promise<RuleRow[]> {
  const { data, error } = await db
    .from("driver_pay_rules")
    .select("id, driver_id, valid_from, valid_to, components")
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    driver_id: r.driver_id,
    valid_from: r.valid_from,
    valid_to: r.valid_to,
    components: readComponents(r.components),
  }));
}
