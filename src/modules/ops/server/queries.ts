import "server-only";
import { toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import type { StopStatus } from "@/modules/execution/domain/execution";
import type { BalanceRow, ReportRoute, ReportStop } from "../domain/reports";

const t = (s?: string | null) => (s ? s.slice(0, 5) : null);
const hhmm = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hour12: false });
const localTime = (iso: string | null) => (iso ? hhmm.format(new Date(iso)) : null);
const isoWeekday = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Aktualna godzina w Warszawie „HH:MM”. */
export function nowInWarsaw(): string {
  return hhmm.format(new Date());
}

const NOTE_TYPES = ["stop_complaint", "stop_refused", "stop_absent", "return_recorded", "comment"];

/**
 * Trasy z punktami w zakresie dat — wspólne źródło dla BOK, centrum operacyjnego i raportu zarządu.
 * `withNotes` dociąga przyczyny reklamacji/odmów i komentarze kierowców (tylko dla widoków dnia).
 */
export async function getReportRoutes(
  tenantId: string,
  from: string,
  to: string,
  opts: { withNotes?: boolean } = {},
): Promise<ReportRoute[]> {
  const supabase = await createClient();
  const select = `id, route_date, name, kind, status, course_no, planned_start, actual_km, odometer_start, odometer_end,
    drivers(first_name, last_name, phone),
    vehicles(registration, cost_per_km, driver_cost_per_day, fixed_cost_per_day),
    route_stops(id, sequence, status, arrived_at, completed_at,
      delivery_points(name, city, contact_phone, customers(id, name, external_code, sales_rep_name), delivery_point_windows(weekday, opens_at, closes_at)),
      route_stop_orders(orders(external_ref, order_value, cod_amount, crates, weight_kg, window_start, window_end, status)))`;

  type Raw = NonNullable<Awaited<ReturnType<typeof fetchPage>>["data"]>[number];
  const fetchPage = (offset: number) =>
    supabase
      .from("routes")
      .select(select)
      .eq("tenant_id", tenantId)
      .gte("route_date", from)
      .lte("route_date", to)
      .neq("status", "cancelled")
      .order("route_date")
      .order("name")
      .range(offset, offset + 499);

  const raw: Raw[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await fetchPage(offset);
    if (error) throw error;
    raw.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }

  const notes = new Map<string, { reason: string | null; note: string | null }>();
  if (opts.withNotes && raw.length) {
    const { data, error } = await supabase
      .from("delivery_events")
      .select("stop_id, type, payload, occurred_at")
      .eq("tenant_id", tenantId)
      .in(
        "route_id",
        raw.map((r) => r.id),
      )
      .in("type", NOTE_TYPES)
      .order("occurred_at");
    if (error) throw error;
    for (const e of data ?? []) {
      if (!e.stop_id) continue;
      const p = (e.payload ?? {}) as { reason?: string; text?: string };
      const cur = notes.get(e.stop_id) ?? { reason: null, note: null };
      if (e.type.startsWith("stop_") && p.reason) cur.reason = p.reason;
      if ((e.type === "return_recorded" || e.type === "comment") && p.text) {
        cur.note = cur.note ? `${cur.note} · ${p.text}` : e.type === "return_recorded" ? `Zwrot: ${p.text}` : p.text;
      }
      notes.set(e.stop_id, cur);
    }
  }

  return raw.map((r) => {
    const weekday = isoWeekday(r.route_date);
    const stops: ReportStop[] = (r.route_stops ?? []).map((s) => {
      const p = s.delivery_points;
      const orders = (s.route_stop_orders ?? [])
        .map((so) => so.orders)
        .filter((o): o is NonNullable<typeof o> => Boolean(o) && o!.status !== "cancelled");
      const override = orders.find((o) => o.window_start);
      const wins = (p?.delivery_point_windows ?? [])
        .filter((w) => w.weekday === weekday)
        .sort((a, b) => a.opens_at.localeCompare(b.opens_at));
      const n = notes.get(s.id);
      return {
        id: s.id,
        routeId: r.id,
        sequence: s.sequence,
        status: s.status as StopStatus,
        customerId: p?.customers?.id ?? null,
        customer: p?.customers?.name ?? "—",
        customerCode: p?.customers?.external_code ?? null,
        branch: p?.name ?? "—",
        city: p?.city ?? "",
        phone: p?.contact_phone ?? null,
        salesRep: p?.customers?.sales_rep_name ?? null,
        windowStart: override ? t(override.window_start) : t(wins[0]?.opens_at),
        windowEnd: override ? t(override.window_end) : t(wins.at(-1)?.closes_at),
        arrivedAt: localTime(s.arrived_at),
        completedAt: localTime(s.completed_at),
        orderRefs: orders.map((o) => o.external_ref).filter((x): x is string => Boolean(x)),
        valueGrosze: orders.reduce((a, o) => a + toGrosze(o.order_value), 0),
        codGrosze: orders.reduce((a, o) => a + toGrosze(o.cod_amount), 0),
        crates: orders.reduce((a, o) => a + (o.crates ?? 0), 0),
        kg: Math.round(orders.reduce((a, o) => a + Number(o.weight_kg ?? 0), 0)),
        reason: n?.reason ?? null,
        note: n?.note ?? null,
      };
    });
    const v = r.vehicles;
    const km =
      r.actual_km !== null
        ? Number(r.actual_km)
        : r.odometer_end !== null && r.odometer_start !== null
          ? r.odometer_end - r.odometer_start
          : null;
    return {
      id: r.id,
      date: r.route_date,
      name: r.name,
      kind: r.kind,
      status: r.status,
      courseNo: r.course_no,
      plannedStart: localTime(r.planned_start),
      driver: r.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : null,
      driverPhone: r.drivers?.phone ?? null,
      vehicle: v?.registration ?? null,
      km,
      costPerKmGrosze: toGrosze(v?.cost_per_km),
      driverCostPerDayGrosze: toGrosze(v?.driver_cost_per_day),
      fixedCostPerDayGrosze: toGrosze(v?.fixed_cost_per_day),
      stops: stops.sort((a, b) => a.sequence - b.sequence),
    };
  });
}

export type DriverMoney = { driverId: string; name: string; phone: string | null; cashGrosze: number };

/** Gotówka u kierowców (saldo z księgi gotówki) — do rozliczenia przy zamknięciu trasy. */
export async function getDriverCash(tenantId: string): Promise<DriverMoney[]> {
  const supabase = await createClient();
  const [bal, drv] = await Promise.all([
    supabase.from("cash_balances").select("party_id, balance").eq("tenant_id", tenantId).eq("party_type", "driver"),
    supabase.from("drivers").select("id, first_name, last_name, phone").eq("tenant_id", tenantId),
  ]);
  if (bal.error) throw bal.error;
  const names = new Map((drv.data ?? []).map((d) => [d.id, d]));
  return (bal.data ?? [])
    .map((b) => {
      const d = names.get(b.party_id ?? "");
      return {
        driverId: b.party_id ?? "",
        name: d ? `${d.first_name} ${d.last_name}` : "—",
        phone: d?.phone ?? null,
        cashGrosze: toGrosze(b.balance),
      };
    })
    .filter((x) => x.cashGrosze !== 0)
    .sort((a, b) => b.cashGrosze - a.cashGrosze);
}

export type PackagingContext = {
  rows: BalanceRow[];
  types: { code: string; name: string }[];
  customerNames: Map<string, string>;
  driverNames: Map<string, string>;
};

export async function getPackagingBalances(tenantId: string): Promise<PackagingContext> {
  const supabase = await createClient();
  const [bal, types, cust, drv] = await Promise.all([
    supabase.from("packaging_balances").select("party_type, party_id, packaging_type_id, balance").eq("tenant_id", tenantId),
    supabase.from("packaging_types").select("id, code, name, deposit_value").eq("tenant_id", tenantId).order("code"),
    supabase.from("customers").select("id, name").eq("tenant_id", tenantId),
    supabase.from("drivers").select("id, first_name, last_name").eq("tenant_id", tenantId),
  ]);
  if (bal.error) throw bal.error;
  const typeById = new Map((types.data ?? []).map((x) => [x.id, x]));
  return {
    rows: (bal.data ?? []).flatMap((b) => {
      const ty = typeById.get(b.packaging_type_id ?? "");
      if (!ty || !b.party_type || !b.party_id) return [];
      return [
        {
          partyType: b.party_type,
          partyId: b.party_id,
          typeCode: ty.code,
          balance: Number(b.balance ?? 0),
          depositGrosze: toGrosze(ty.deposit_value),
        },
      ];
    }),
    types: (types.data ?? []).map((x) => ({ code: x.code, name: x.name })),
    customerNames: new Map((cust.data ?? []).map((c) => [c.id, c.name])),
    driverNames: new Map((drv.data ?? []).map((d) => [d.id, `${d.first_name} ${d.last_name}`])),
  };
}
