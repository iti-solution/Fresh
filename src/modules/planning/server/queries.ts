import "server-only";
import { createClient } from "@/lib/supabase/server";
import { vehicleOptionLabel } from "@/modules/masterdata/domain/format";
import { computeLoad, routeIssues, type Issue, type RouteLoad } from "../domain/load";

const t = (s?: string | null) => (s ? s.slice(0, 5) : "");

export type PlanOrder = {
  id: string;
  ref: string | null;
  weight_kg: number;
  pallets: number;
  crates: number;
  volume_m3: number;
  readiness: "ready" | "awaiting_warehouse";
  priority: number;
  notes_logistics: string | null;
};

export type PlanStop = {
  id: string;
  sequence: number;
  pointId: string;
  customer: string;
  customerCode: string | null;
  branch: string;
  city: string;
  window: string;
  closed: boolean;
  orders: PlanOrder[];
};

export type PlanRoute = {
  id: string;
  name: string;
  kind: string;
  courseNo: number;
  status: string;
  extraReason: string | null;
  plannedStart: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  driverId: string | null;
  driverLabel: string | null;
  stops: PlanStop[];
  load: RouteLoad;
  issues: Issue[];
};

export type UnassignedOrder = PlanOrder & { customer: string; customerCode: string | null; branch: string; city: string; window: string };

export type PlanningDay = {
  routes: PlanRoute[];
  unassigned: UnassignedOrder[];
  holiday: string | null;
  vehicles: { id: string; label: string }[];
  drivers: { id: string; label: string }[];
  templatesForDay: number;
};

function isoWeekday(day: string) {
  return ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

export async function getPlanningDay(tenantId: string, day: string): Promise<PlanningDay> {
  const supabase = await createClient();
  const weekday = isoWeekday(day);
  const orderCols = "id, external_ref, weight_kg, pallets, crates, volume_m3, readiness, priority, notes_logistics, window_start, window_end, status";
  const pointCols = "id, name, city, customers(name, external_code), delivery_point_windows(weekday, opens_at, closes_at)";

  const [routesRes, ordersRes, excRes, vehRes, drvRes, tplRes] = await Promise.all([
    supabase
      .from("routes")
      .select(
        `id, name, kind, course_no, status, extra_reason, planned_start, vehicle_id, driver_id,
         vehicles(registration, capacity_kg, capacity_pallets, capacity_crates, capacity_m3),
         drivers(first_name, last_name),
         route_stops(id, sequence, delivery_point_id, delivery_points(${pointCols}), route_stop_orders(orders(${orderCols})))`,
      )
      .eq("tenant_id", tenantId)
      .eq("route_date", day)
      .neq("status", "cancelled")
      .order("kind")
      .order("name"),
    supabase
      .from("orders")
      .select(`${orderCols}, delivery_points(${pointCols}), route_stop_orders(stop_id)`)
      .eq("tenant_id", tenantId)
      .eq("delivery_date", day)
      .not("status", "in", "(cancelled,delivered,failed)")
      .order("external_ref"),
    supabase.from("delivery_point_exceptions").select("delivery_point_id, is_closed, reason").eq("tenant_id", tenantId).eq("date", day),
    supabase.from("vehicles").select("id, registration, name, vehicle_type, body_type, status").eq("tenant_id", tenantId).order("registration"),
    supabase.from("drivers").select("id, first_name, last_name, is_active").eq("tenant_id", tenantId).order("last_name"),
    supabase.from("route_templates").select("id, weekdays, is_active").eq("tenant_id", tenantId),
  ]);
  for (const r of [routesRes, ordersRes, excRes, vehRes, drvRes, tplRes]) if (r.error) throw r.error;

  const exceptions = excRes.data ?? [];
  const holiday = exceptions.find((e) => e.delivery_point_id === null && e.is_closed)?.reason ?? null;
  const closedPoints = new Set(exceptions.filter((e) => e.delivery_point_id && e.is_closed).map((e) => e.delivery_point_id as string));

  type Win = { weekday: number; opens_at: string; closes_at: string };
  const pointWindow = (wins: Win[] | undefined) =>
    (wins ?? [])
      .filter((w) => w.weekday === weekday)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
      .map((w) => `${t(w.opens_at)}–${t(w.closes_at)}`)
      .join(", ");

  type RawOrder = NonNullable<typeof ordersRes.data>[number];
  const toPlanOrder = (o: Pick<RawOrder, "id" | "external_ref" | "weight_kg" | "pallets" | "crates" | "volume_m3" | "readiness" | "priority" | "notes_logistics">): PlanOrder => ({
    id: o.id,
    ref: o.external_ref,
    weight_kg: Number(o.weight_kg ?? 0),
    pallets: Number(o.pallets ?? 0),
    crates: o.crates ?? 0,
    volume_m3: Number(o.volume_m3 ?? 0),
    readiness: o.readiness,
    priority: o.priority,
    notes_logistics: o.notes_logistics,
  });

  const routes: PlanRoute[] = (routesRes.data ?? []).map((r) => {
    const stops: PlanStop[] = [...(r.route_stops ?? [])]
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => {
        const p = s.delivery_points;
        const orders = (s.route_stop_orders ?? []).map((so) => so.orders).filter((o): o is NonNullable<typeof o> => Boolean(o));
        const override = orders.find((o) => o.window_start);
        return {
          id: s.id,
          sequence: s.sequence,
          pointId: s.delivery_point_id,
          customer: p?.customers?.name ?? "—",
          customerCode: p?.customers?.external_code ?? null,
          branch: p?.name ?? "—",
          city: p?.city ?? "",
          window: override ? `${t(override.window_start)}–${t(override.window_end)}` : pointWindow(p?.delivery_point_windows) || "—",
          closed: closedPoints.has(s.delivery_point_id),
          orders: orders.map(toPlanOrder),
        };
      });
    const allOrders = stops.flatMap((s) => s.orders);
    const load = computeLoad(allOrders, r.vehicles);
    const issues = routeIssues({
      vehicleId: r.vehicle_id,
      driverId: r.driver_id,
      stopsCount: stops.length,
      awaitingCount: allOrders.filter((o) => o.readiness === "awaiting_warehouse").length,
      closedPointsCount: stops.filter((s) => s.closed).length,
      load,
    });
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      courseNo: r.course_no,
      status: r.status,
      extraReason: r.extra_reason,
      plannedStart: r.planned_start
        ? new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }).format(new Date(r.planned_start))
        : null,
      vehicleId: r.vehicle_id,
      vehicleLabel: r.vehicles?.registration ?? null,
      driverId: r.driver_id,
      driverLabel: r.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : null,
      stops,
      load,
      issues,
    };
  });

  const unassigned: UnassignedOrder[] = (ordersRes.data ?? [])
    .filter((o) => !o.route_stop_orders)
    .map((o) => {
      const p = o.delivery_points;
      return {
        ...toPlanOrder(o),
        customer: p?.customers?.name ?? "—",
        customerCode: p?.customers?.external_code ?? null,
        branch: p?.name ?? "—",
        city: p?.city ?? "",
        window: o.window_start ? `${t(o.window_start)}–${t(o.window_end)}` : pointWindow(p?.delivery_point_windows) || "—",
      };
    })
    .sort((a, b) => a.window.localeCompare(b.window));

  return {
    routes,
    unassigned,
    holiday,
    vehicles: (vehRes.data ?? []).filter((v) => v.status === "active").map((v) => ({ id: v.id, label: vehicleOptionLabel(v) })),
    drivers: (drvRes.data ?? []).filter((d) => d.is_active).map((d) => ({ id: d.id, label: `${d.first_name} ${d.last_name}` })),
    templatesForDay: (tplRes.data ?? []).filter((x) => x.is_active && x.weekdays.includes(weekday)).length,
  };
}
