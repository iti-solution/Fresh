import "server-only";
// Model danych tablicy i monitora tras: z planu dnia (queries.ts) do kształtu, który rysuje UI.
import { STOP_STATUS_LABELS } from "@/modules/execution/domain/execution";
import { isStopDone, outsideWindow, planEtas } from "../domain/board";
import { canMarkReady, ROUTE_KIND_LABELS, ROUTE_STATUS_LABELS, type Dim } from "../domain/load";
import type { BoardRoute, BoardUnassigned } from "../ui/board";
import {
  backToDraft,
  copyRoute,
  deleteEmptyRoute,
  markReady,
  setRouteResource,
  sortByWindow,
} from "./actions";
import type { PlanRoute, UnassignedOrder } from "./queries";

const DIMS: { key: Dim; label: string; unit: string }[] = [
  { key: "kg", label: "Masa", unit: "kg" },
  { key: "m3", label: "Objętość", unit: "m³" },
  { key: "pallets", label: "Palety", unit: "pal" },
  { key: "crates", label: "Skrzynki", unit: "skrz" },
];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("pl-PL", { maximumFractionDigits: 1 }));

export function toBoardRoute(r: PlanRoute, day: string, now: string | null, editable: boolean, conflicts: string[]): BoardRoute {
  const locked = r.status !== "draft" && r.status !== "planned";
  const canChange = editable && !locked;
  const etas = planEtas(
    r.plannedStart,
    r.stops.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      status: s.status,
      windowStart: s.windowStart,
      windowEnd: s.windowEnd,
      arrivedAt: s.arrivedAt,
      completedAt: s.completedAt,
    })),
    now,
  );
  const stops = r.stops.map((s) => {
    const eta = etas.get(s.id) ?? null;
    const done = isStopDone(s.status);
    return {
      id: s.id,
      seq: s.sequence,
      customer: s.customer,
      address: [s.address, s.city].filter(Boolean).join(", ") || s.branch,
      phone: s.phone,
      window: s.window,
      eta,
      out: outsideWindow(s.windowEnd, eta ?? undefined),
      done,
      statusLabel: done ? (STOP_STATUS_LABELS[s.status as keyof typeof STOP_STATUS_LABELS] ?? s.status) : null,
      kg: s.orders.reduce((a, o) => a + o.weight_kg, 0),
      pallets: s.orders.reduce((a, o) => a + o.pallets, 0),
      crates: s.orders.reduce((a, o) => a + o.crates, 0),
      orderIds: s.orders.map((o) => o.id),
      awaiting: s.orders.some((o) => o.readiness === "awaiting_warehouse"),
      closed: s.closed,
      priority: s.orders.some((o) => o.priority > 0),
      note: s.orders.find((o) => o.notes_logistics)?.notes_logistics ?? null,
    };
  });
  const cap = r.load.capacity;
  const load = DIMS.map((d) => ({
    key: d.key,
    label: d.label,
    unit: d.unit,
    value: fmt(r.load.totals[d.key]),
    cap: cap && cap[d.key] > 0 ? fmt(cap[d.key]) : null,
    pct: r.load.pct[d.key],
    over: r.load.overloaded.includes(d.key),
  }));
  const decision = canMarkReady(r.issues);
  const issues = [
    ...conflicts,
    ...r.issues
      .filter((i) => i.code !== "overloaded" && i.code !== "no_vehicle" && i.code !== "no_driver" && i.code !== "awaiting_warehouse")
      .map((i) => i.label),
  ];
  return {
    id: r.id,
    name: r.name,
    subtitle: [
      r.kind !== "regular" ? (ROUTE_KIND_LABELS[r.kind] ?? r.kind) : null,
      r.courseNo > 1 ? `kurs ${r.courseNo}` : null,
      r.extraReason,
    ]
      .filter(Boolean)
      .join(" · "),
    status: r.status,
    statusLabel: ROUTE_STATUS_LABELS[r.status] ?? r.status,
    plannedStart: r.plannedStart,
    vehicleId: r.vehicleId,
    vehicleLabel: r.vehicleLabel,
    driverId: r.driverId,
    driverLabel: r.driverLabel,
    driverPhone: r.driverPhone,
    canChange,
    load,
    maxLoadPct: Math.max(0, ...Object.values(r.load.pct).map((p) => p ?? 0)),
    overloaded: r.load.overloaded.length > 0,
    missingResource: !r.vehicleId || !r.driverId,
    outOfWindow: stops.filter((s) => s.out).length,
    issues,
    stops,
    ready: decision.ok ? { ok: true, needsConfirm: false, reasons: [] } : { ok: false, needsConfirm: decision.needsConfirm, reasons: decision.reasons },
    printHref: `/druk/zaladunek?dzien=${day}&trasa=${r.id}`,
    actions: editable
      ? {
          setVehicle: setRouteResource.bind(null, r.id, "vehicle_id"),
          setDriver: setRouteResource.bind(null, r.id, "driver_id"),
          sortByWindow: sortByWindow.bind(null, r.id),
          markReady: markReady.bind(null, r.id, day, false),
          markReadyForce: markReady.bind(null, r.id, day, true),
          backToDraft: backToDraft.bind(null, r.id),
          deleteEmpty: r.kind !== "regular" ? deleteEmptyRoute.bind(null, r.id) : undefined,
          copy: copyRoute.bind(null, r.id, day),
        }
      : {},
  };
}

export function toBoardUnassigned(o: UnassignedOrder): BoardUnassigned {
  return {
    id: o.id,
    ref: o.ref,
    customer: o.customer,
    address: [o.address, o.city].filter(Boolean).join(", ") || o.branch,
    phone: o.phone,
    window: o.window,
    kg: o.weight_kg,
    pallets: o.pallets,
    crates: o.crates,
    awaiting: o.readiness === "awaiting_warehouse",
    priority: o.priority > 0,
  };
}
