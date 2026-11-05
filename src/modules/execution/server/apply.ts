import "server-only";
import { randomUUID } from "node:crypto";
import { isFinished, QUICK_STATUSES, type StopStatus } from "../domain/execution";
import { derivedUuid, outcomeStopStatus, validateEvent, type DriverEvent, type GeoPoint } from "../domain/offline";
import type { DriverCtx } from "./driver-context";

// Zapis zdarzeń z telefonu (M4.2). Każde zdarzenie ma client_event_id z telefonu — ponowne wysłanie niczego nie dubluje.
// Zapis idzie kluczem serwerowym, ale dopiero po sprawdzeniu, że trasa należy do zalogowanego kierowcy.

export type ApplyResult = { id: string; status: "ok" | "duplicate" | "rejected"; reason?: string };

const ewkt = (g?: GeoPoint | null) => (g ? `SRID=4326;POINT(${g.lng} ${g.lat})` : null);

const ORDER_STATUS: Record<string, string> = {
  pending: "planned",
  arrived: "in_progress",
  in_progress: "in_progress",
  delivered: "delivered",
  partial: "partial",
  refused: "failed",
  absent: "failed",
  complaint: "partial",
};

async function insertEvent(
  c: DriverCtx,
  id: string,
  routeId: string,
  stopId: string | null,
  type: string,
  payload: Record<string, unknown>,
  occurredAt: string,
  location?: GeoPoint | null,
): Promise<"ok" | "duplicate" | "error"> {
  const { error } = await c.admin.from("delivery_events").insert({
    tenant_id: c.tenantId,
    client_event_id: id,
    route_id: routeId,
    stop_id: stopId,
    driver_id: c.driverId,
    type,
    payload: payload as never,
    occurred_at: occurredAt,
    location: ewkt(location) as never,
  });
  if (error?.code === "23505") return "duplicate";
  return error ? "error" : "ok";
}

async function setStopStatus(c: DriverCtx, routeId: string, stopId: string, status: StopStatus, at: string) {
  const { data: stop } = await c.admin.from("route_stops").select("arrived_at").eq("id", stopId).eq("route_id", routeId).maybeSingle();
  if (status === "in_progress") {
    await c.admin.from("route_stops").update({ status: "pending" }).eq("route_id", routeId).eq("status", "in_progress").neq("id", stopId);
  }
  await c.admin
    .from("route_stops")
    .update({
      status: status as "pending",
      arrived_at: status === "in_progress" || isFinished(status) ? (stop?.arrived_at ?? at) : (stop?.arrived_at ?? null),
      completed_at: isFinished(status) ? at : null,
    })
    .eq("id", stopId)
    .eq("route_id", routeId);
  const { data: links } = await c.admin.from("route_stop_orders").select("order_id").eq("stop_id", stopId);
  const ids = (links ?? []).map((l) => l.order_id);
  if (ids.length) {
    await c.admin
      .from("orders")
      .update({ status: ORDER_STATUS[status] as "planned" })
      .in("id", ids)
      .neq("status", "cancelled");
  }
}

/** Opakowania i gotówka z punktu: zdarzenie niesie stan absolutny, do księgi dopisujemy tylko różnicę (bez nadpisywania). */
async function applyStopMoney(c: DriverCtx, e: Extract<DriverEvent, { type: "stop_saved" }>, eventRowId: string | null) {
  const { data: point } = await c.admin.from("route_stops").select("delivery_points(customer_id)").eq("id", e.stop_id).single();
  const customerId = point?.delivery_points?.customer_id;
  if (!customerId) return;
  const { data: types } = await c.admin.from("packaging_types").select("id").eq("tenant_id", c.tenantId);
  const { data: existing } = await c.admin
    .from("packaging_movements")
    .select("packaging_type_id, qty, reason")
    .eq("stop_id", e.stop_id)
    .eq("party_type", "customer");
  const sum = (typeId: string, r: string) =>
    (existing ?? []).filter((m) => m.packaging_type_id === typeId && m.reason === r).reduce((a, m) => a + m.qty, 0);
  const rows = [];
  for (const { id: typeId } of types ?? []) {
    const w = e.packaging.find((x) => x.typeId === typeId) ?? { out: 0, back: 0 };
    const issued = sum(typeId, "issue");
    const returned = -sum(typeId, "return");
    for (const [delta, reason] of [
      [w.out - issued, "issue"],
      [w.back - returned, "return"],
    ] as const) {
      if (delta === 0) continue;
      const g = randomUUID();
      const toCustomer = reason === "issue" ? delta : -delta;
      const note = issued || returned ? "korekta kierowcy" : null;
      const common = { tenant_id: c.tenantId, movement_group: g, packaging_type_id: typeId, reason, stop_id: e.stop_id, note, created_by: c.userId, source_event_id: eventRowId };
      rows.push(
        { ...common, party_type: "customer" as const, party_id: customerId, qty: toCustomer },
        { ...common, party_type: "driver" as const, party_id: c.driverId, qty: -toCustomer },
      );
    }
  }
  if (rows.length) await c.admin.from("packaging_movements").insert(rows);

  if (e.cash_grosze !== null) {
    const { data: prev } = await c.admin
      .from("cash_movements")
      .select("amount")
      .eq("stop_id", e.stop_id)
      .eq("party_type", "driver")
      .eq("reason", "cod_collected");
    const already = Math.round((prev ?? []).reduce((a, m) => a + Number(m.amount) * 100, 0));
    const delta = e.cash_grosze - already;
    if (delta !== 0) {
      const g = randomUUID();
      const amount = Number((delta / 100).toFixed(2));
      const common = { tenant_id: c.tenantId, movement_group: g, reason: "cod_collected", route_id: e.route_id, stop_id: e.stop_id, created_by: c.userId, source_event_id: eventRowId };
      await c.admin.from("cash_movements").insert([
        { ...common, party_type: "driver" as const, party_id: c.driverId, amount },
        { ...common, party_type: "customer" as const, party_id: customerId, amount: -amount },
      ]);
    }
  }
}

export async function applyDriverEvent(c: DriverCtx, e: DriverEvent): Promise<ApplyResult> {
  const id = e.client_event_id;
  const reject = (reason: string): ApplyResult => ({ id, status: "rejected", reason });

  // już przyjęte? (ponowne wysłanie po zerwanym połączeniu)
  const { data: seen } = await c.admin.from("delivery_events").select("id").eq("tenant_id", c.tenantId).eq("client_event_id", id).maybeSingle();
  if (seen) return { id, status: "duplicate" };

  const { data: route } = await c.admin
    .from("routes")
    .select("id, status, odometer_start, route_stops(id)")
    .eq("id", e.route_id)
    .eq("tenant_id", c.tenantId)
    .eq("driver_id", c.driverId)
    .maybeSingle();
  if (!route) return reject("To nie jest Twoja trasa (dyspozytor mógł ją przydzielić innemu kierowcy).");
  const problem = validateEvent({ status: route.status, odometerStart: route.odometer_start, stops: route.route_stops as never }, e);
  if (problem) return reject(problem);

  const at = e.occurred_at;
  switch (e.type) {
    case "route_started": {
      const r = await insertEvent(c, id, e.route_id, null, "route_started", { odometer_start: e.odometer_start, vehicle_id: e.vehicle_id }, at, e.location);
      if (r !== "ok") return r === "duplicate" ? { id, status: "duplicate" } : reject("błąd zapisu");
      await c.admin
        .from("routes")
        .update({ status: "in_progress", odometer_start: e.odometer_start, ...(e.vehicle_id ? { vehicle_id: e.vehicle_id } : {}) })
        .eq("id", e.route_id);
      return { id, status: "ok" };
    }
    case "stop_quick": {
      const st = QUICK_STATUSES[e.status];
      const r = await insertEvent(c, id, e.route_id, e.stop_id, `stop_${st.stop}`, { source: "route_list" }, at, e.location);
      if (r !== "ok") return r === "duplicate" ? { id, status: "duplicate" } : reject("błąd zapisu");
      await setStopStatus(c, e.route_id, e.stop_id, st.stop, at);
      return { id, status: "ok" };
    }
    case "stop_saved": {
      const next = outcomeStopStatus(e.outcome);
      const type = next ? `stop_${next}` : "stop_saved";
      const payload: Record<string, unknown> = { source: "stop_screen", photos: e.photos, signature: e.signature };
      if (e.reason.trim()) payload.reason = e.reason.trim();
      if (e.comment.trim()) payload.comment = e.comment.trim();
      const r = await insertEvent(c, id, e.route_id, e.stop_id, type, payload, at, e.location);
      if (r !== "ok") return r === "duplicate" ? { id, status: "duplicate" } : reject("błąd zapisu");
      const { data: row } = await c.admin.from("delivery_events").select("id").eq("tenant_id", c.tenantId).eq("client_event_id", id).maybeSingle();
      await applyStopMoney(c, e, row?.id ?? null);
      if (e.return_text.trim())
        await insertEvent(c, derivedUuid(id, "return"), e.route_id, e.stop_id, "return_recorded", { text: e.return_text.trim() }, at, e.location);
      if (e.comment.trim()) await insertEvent(c, derivedUuid(id, "comment"), e.route_id, e.stop_id, "comment", { text: e.comment.trim() }, at, e.location);
      if (next) await setStopStatus(c, e.route_id, e.stop_id, next, at);
      return { id, status: "ok" };
    }
    case "problem_reported": {
      const r = await insertEvent(c, id, e.route_id, e.stop_id, "problem_reported", { kind: e.kind, text: e.text.trim(), photos: e.photos }, at, e.location);
      return r === "ok" ? { id, status: "ok" } : r === "duplicate" ? { id, status: "duplicate" } : reject("błąd zapisu");
    }
    case "route_finished": {
      const r = await insertEvent(c, id, e.route_id, null, "route_finished", { odometer_end: e.odometer_end }, at, e.location);
      if (r !== "ok") return r === "duplicate" ? { id, status: "duplicate" } : reject("błąd zapisu");
      await c.admin
        .from("routes")
        .update({ status: "completed", odometer_end: e.odometer_end, actual_km: e.odometer_end - (route.odometer_start ?? e.odometer_end) })
        .eq("id", e.route_id);
      return { id, status: "ok" };
    }
  }
}

export type IncomingPosition = { route_id: string | null; lat: number; lng: number; accuracy: number | null; recorded_at: string };

/** Pozycje GPS z otwartej trasy (co kilka minut) — wysyłane paczkami, duplikaty pomijane. */
export async function savePositions(c: DriverCtx, list: IncomingPosition[]): Promise<number> {
  if (!list.length) return 0;
  const routeIds = [...new Set(list.map((p) => p.route_id).filter((x): x is string => Boolean(x)))];
  const own = new Set<string>();
  if (routeIds.length) {
    const { data } = await c.admin.from("routes").select("id").eq("tenant_id", c.tenantId).eq("driver_id", c.driverId).in("id", routeIds);
    for (const r of data ?? []) own.add(r.id);
  }
  const rows = list.map((p) => ({
    tenant_id: c.tenantId,
    driver_id: c.driverId,
    route_id: p.route_id && own.has(p.route_id) ? p.route_id : null,
    location: ewkt(p) as never,
    accuracy_m: p.accuracy,
    recorded_at: p.recorded_at,
  }));
  const { error } = await c.admin.from("driver_positions").upsert(rows, { onConflict: "driver_id,recorded_at", ignoreDuplicates: true });
  return error ? 0 : rows.length;
}
