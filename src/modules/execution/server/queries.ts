import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isNoteActive } from "@/modules/masterdata/domain/schemas";
import { todayInWarsaw } from "@/modules/orders/domain/orders";
import { toGrosze } from "@/lib/forms";
import type { StopStatus } from "../domain/execution";
import type { PayPreview, RouteSnapshot, SnapshotStop } from "../domain/offline";

const t = (s?: string | null) => (s ? s.slice(0, 5) : "");

export type DriverRouteSummary = {
  id: string;
  name: string;
  date: string;
  status: string;
  courseNo: number;
  kind: string;
  vehicle: string | null;
  stops: number;
  finished: number;
};

/** Trasy zalogowanego kierowcy (RLS: tylko jego, od wczoraj do +3 dni, od statusu „Gotowa do załadunku”). */
export async function getDriverRoutes(): Promise<DriverRouteSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes")
    .select("id, name, route_date, status, course_no, kind, vehicles(registration), route_stops(status)")
    .order("route_date")
    .order("course_no");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    date: r.route_date,
    status: r.status,
    courseNo: r.course_no,
    kind: r.kind,
    vehicle: r.vehicles?.registration ?? null,
    stops: r.route_stops.length,
    finished: r.route_stops.filter((s) => !["pending", "arrived", "in_progress"].includes(s.status)).length,
  }));
}

export type DriverStop = {
  id: string;
  sequence: number;
  status: StopStatus;
  customer: string;
  customerCode: string | null;
  salesRep: string | null;
  salesRepPhone: string | null;
  branch: string;
  pointType: string | null;
  temporary: boolean;
  siteManager: string | null;
  siteManagerPhone: string | null;
  address: string;
  phone: string | null;
  window: string;
  windowEnd: string | null;
  call: string | null;
  access: string | null;
  floor: string | null;
  unloading: string | null;
  other: string | null;
  notes: string[];
  orders: { id: string; ref: string | null; crates: number; pallets: number; weight_kg: number; cod: number | null; notes_sales: string | null; notes_logistics: string | null }[];
  completedAt: string | null;
};

export type DriverRoute = {
  id: string;
  name: string;
  date: string;
  status: string;
  vehicleId: string | null;
  vehicle: string | null;
  odometerStart: number | null;
  odometerEnd: number | null;
  stops: DriverStop[];
};

export async function getDriverRoute(routeId: string): Promise<DriverRoute | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("routes")
    .select(
      `id, name, route_date, status, vehicle_id, odometer_start, odometer_end, vehicles(registration),
       route_stops(id, sequence, status, completed_at,
         delivery_points(name, address_line, postal_code, city, contact_phone, call_instructions, access_instructions, floor, unloading_zone, driver_instructions,
           site_manager_name, site_manager_phone, point_types(name, is_temporary),
           customers(name, external_code, sales_rep_name, sales_rep_phone),
           delivery_point_windows(weekday, opens_at, closes_at),
           delivery_point_notes(text, valid_from, valid_to)),
         route_stop_orders(orders(id, external_ref, crates, pallets, weight_kg, cod_amount, notes_sales, notes_logistics, window_start, window_end, status)))`,
    )
    .eq("id", routeId)
    .maybeSingle();
  if (error) throw error;
  if (!r) return null;
  const day = r.route_date;
  const weekday = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const today = todayInWarsaw();
  const fmtTime = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : null;

  const stops: DriverStop[] = [...r.route_stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => {
      const p = s.delivery_points;
      const orders = s.route_stop_orders.map((so) => so.orders).filter((o): o is NonNullable<typeof o> => Boolean(o) && o!.status !== "cancelled");
      const wins = (p?.delivery_point_windows ?? []).filter((w) => w.weekday === weekday).sort((a, b) => a.opens_at.localeCompare(b.opens_at));
      const override = orders.find((o) => o.window_start);
      const window = override ? `${t(override.window_start)}–${t(override.window_end)}` : wins.map((w) => `${t(w.opens_at)}–${t(w.closes_at)}`).join(", ");
      const windowEnd = override ? t(override.window_end) : wins.length ? t(wins[wins.length - 1].closes_at) : null;
      return {
        id: s.id,
        sequence: s.sequence,
        status: s.status as StopStatus,
        customer: p?.customers?.name ?? "—",
        customerCode: p?.customers?.external_code ?? null,
        salesRep: p?.customers?.sales_rep_name ?? null,
        salesRepPhone: p?.customers?.sales_rep_phone ?? null,
        branch: p?.name ?? "—",
        pointType: p?.point_types?.name ?? null,
        temporary: Boolean(p?.point_types?.is_temporary),
        siteManager: p?.site_manager_name ?? null,
        siteManagerPhone: p?.site_manager_phone ?? null,
        address: p ? `${p.address_line}, ${p.postal_code ?? ""} ${p.city}`.replace(/\s+/g, " ") : "",
        phone: p?.contact_phone ?? null,
        window: window || "—",
        windowEnd,
        call: p?.call_instructions ?? null,
        access: p?.access_instructions ?? null,
        floor: p?.floor ?? null,
        unloading: p?.unloading_zone ?? null,
        other: p?.driver_instructions ?? null,
        notes: (p?.delivery_point_notes ?? []).filter((n) => isNoteActive(n, day > today ? day : today)).map((n) => n.text),
        orders: orders.map((o) => ({
          id: o.id,
          ref: o.external_ref,
          crates: o.crates ?? 0,
          pallets: Number(o.pallets ?? 0),
          weight_kg: Number(o.weight_kg ?? 0),
          cod: o.cod_amount !== null ? Number(o.cod_amount) : null,
          notes_sales: o.notes_sales,
          notes_logistics: o.notes_logistics,
        })),
        completedAt: fmtTime(s.completed_at),
      };
    });

  return {
    id: r.id,
    name: r.name,
    date: r.route_date,
    status: r.status,
    vehicleId: r.vehicle_id,
    vehicle: r.vehicles?.registration ?? null,
    odometerStart: r.odometer_start,
    odometerEnd: r.odometer_end,
    stops,
  };
}

export async function getPackagingTypes() {
  const supabase = await createClient();
  const { data } = await supabase.from("packaging_types").select("id, code, name").eq("is_active", true).order("code");
  return data ?? [];
}

export async function getVehiclesForDriver() {
  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select("id, registration, status").order("registration");
  return (data ?? []).filter((v) => v.status === "active");
}


/** Migawka trasy do telefonu (M4.2): trasa + zapisane opakowania, gotówka, zdjęcia na punktach + słowniki. */
export async function getRouteSnapshot(
  routeId: string,
  pay: PayPreview | null = null,
  balances: Map<string, Record<string, number>> | null = null,
): Promise<RouteSnapshot | null> {
  const route = await getDriverRoute(routeId);
  if (!route) return null;
  const supabase = await createClient();
  const stopIds = route.stops.map((s) => s.id);
  const ids = stopIds.length ? stopIds : ["00000000-0000-0000-0000-000000000000"];
  const [types, vehicles, pack, cash, att] = await Promise.all([
    getPackagingTypes(),
    getVehiclesForDriver(),
    supabase.from("packaging_movements").select("stop_id, packaging_type_id, qty, reason").eq("party_type", "driver").in("stop_id", ids),
    supabase.from("cash_movements").select("stop_id, amount").eq("party_type", "driver").eq("reason", "cod_collected").in("stop_id", ids),
    supabase.from("attachments").select("stop_id, kind").in("stop_id", ids),
  ]);
  const stops: SnapshotStop[] = route.stops.map((s) => {
    const mv = (pack.data ?? []).filter((m) => m.stop_id === s.id);
    const packaging = Object.fromEntries(
      types.map((t) => {
        const rows = mv.filter((m) => m.packaging_type_id === t.id);
        // księga kierowcy: wydanie klientowi = minus u kierowcy, zwrot = plus
        return [
          t.id,
          {
            out: -rows.filter((m) => m.reason === "issue").reduce((a, m) => a + m.qty, 0),
            back: rows.filter((m) => m.reason === "return").reduce((a, m) => a + m.qty, 0),
          },
        ];
      }),
    );
    const files = (att.data ?? []).filter((a) => a.stop_id === s.id);
    return {
      ...s,
      packaging,
      cashGrosze: (cash.data ?? []).filter((c) => c.stop_id === s.id).reduce((a, c) => a + toGrosze(c.amount), 0),
      photos: files.filter((f) => f.kind === "photo").length,
      signed: files.some((f) => f.kind === "signature"),
      customerBalance: balances?.get(s.id),
    };
  });
  return {
    id: route.id,
    name: route.name,
    date: route.date,
    status: route.status,
    vehicleId: route.vehicleId,
    vehicle: route.vehicle,
    odometerStart: route.odometerStart,
    odometerEnd: route.odometerEnd,
    stops,
    packagingTypes: types,
    vehicles: vehicles.map((v) => ({ id: v.id, registration: v.registration })),
    pay,
    fetchedAt: new Date().toISOString(),
  };
}
