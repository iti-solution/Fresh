import "server-only";
import { toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type AssignmentRow = {
  routeId: string;
  date: string;
  routeName: string;
  kind: string;
  courseNo: number;
  status: string;
  vehicleId: string | null;
  vehicle: string | null;
  driverId: string | null;
  driver: string | null;
  odometerStart: number | null;
  odometerEnd: number | null;
  km: number | null;
  orders: number;
  orderRefs: string[];
  stops: number;
  finished: number;
  valueGrosze: number;
};

const FINISHED = ["delivered", "partial", "refused", "absent", "skipped", "complaint"];

/**
 * Dziennik przydziałów: kto, którym autem i z jakimi zamówieniami jechał danego dnia.
 * Źródłem jest trasa (routes) — pojazd i kierowca są przypisywane do trasy na konkretny dzień,
 * a kierowca może zmienić auto przy starcie trasy (zapisane w trasie i w zdarzeniu route_started).
 */
export async function getAssignments(
  tenantId: string,
  opts: { from: string; to: string; vehicleId?: string | null; driverId?: string | null },
): Promise<AssignmentRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("routes")
    .select(
      `id, route_date, name, kind, course_no, status, vehicle_id, driver_id, odometer_start, odometer_end, actual_km,
       vehicles(registration), drivers(first_name, last_name),
       route_stops(status, route_stop_orders(orders(external_ref, order_value, status)))`,
    )
    .eq("tenant_id", tenantId)
    .gte("route_date", opts.from)
    .lte("route_date", opts.to)
    .neq("status", "cancelled")
    .order("route_date", { ascending: false })
    .order("name")
    .limit(1000);
  if (opts.vehicleId) q = q.eq("vehicle_id", opts.vehicleId);
  if (opts.driverId) q = q.eq("driver_id", opts.driverId);
  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r) => {
    const orders = (r.route_stops ?? [])
      .flatMap((s) => (s.route_stop_orders ?? []).map((so) => so.orders))
      .filter((o): o is NonNullable<typeof o> => Boolean(o) && o!.status !== "cancelled");
    const km =
      r.actual_km !== null
        ? Number(r.actual_km)
        : r.odometer_start !== null && r.odometer_end !== null
          ? r.odometer_end - r.odometer_start
          : null;
    return {
      routeId: r.id,
      date: r.route_date,
      routeName: r.name,
      kind: r.kind,
      courseNo: r.course_no,
      status: r.status,
      vehicleId: r.vehicle_id,
      vehicle: r.vehicles?.registration ?? null,
      driverId: r.driver_id,
      driver: r.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : null,
      odometerStart: r.odometer_start,
      odometerEnd: r.odometer_end,
      km,
      orders: orders.length,
      orderRefs: orders.map((o) => o.external_ref).filter((x): x is string => Boolean(x)),
      stops: (r.route_stops ?? []).length,
      finished: (r.route_stops ?? []).filter((s) => FINISHED.includes(s.status)).length,
      valueGrosze: orders.reduce((a, o) => a + toGrosze(o.order_value), 0),
    };
  });
}

/** Ostatni przydział każdego auta i każdego kierowcy (do list kartotek). */
export async function getLastAssignments(tenantId: string, from: string, to: string) {
  const rows = await getAssignments(tenantId, { from, to });
  const byVehicle = new Map<string, AssignmentRow>();
  const byDriver = new Map<string, AssignmentRow>();
  for (const r of rows) {
    if (r.vehicleId && !byVehicle.has(r.vehicleId)) byVehicle.set(r.vehicleId, r);
    if (r.driverId && !byDriver.has(r.driverId)) byDriver.set(r.driverId, r);
  }
  return { byVehicle, byDriver };
}
