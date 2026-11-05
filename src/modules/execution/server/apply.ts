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
    // współrzędne także w treści zdarzenia — biuro czyta je bez funkcji PostGIS
    payload: (location
      ? { ...payload, gps: { lat: location.lat, lng: location.lng, accuracy: location.accuracy } }
      : payload) as never,
    occurred_at: occurredAt,
    location: ewkt(location) as never,
  });
  if (error?.code === "23505") return "duplicate";
  return error ? "error" : "ok";
}

/** Rzuca wyjątek przy błędzie zapisu — żeby zdarzenie wróciło do telefonu jako „spróbuj ponownie”. */
function must<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

async function setStopStatus(c: DriverCtx, routeId: string, stopId: string, status: StopStatus, at: string) {
  const { data: stop } = must(
    await c.admin.from("route_stops").select("arrived_at").eq("id", stopId).eq("route_id", routeId).maybeSingle(),
  );
  if (status === "in_progress") {
    must(
      await c.admin
        .from("route_stops")
        .update({ status: "pending" })
        .eq("route_id", routeId)
        .eq("status", "in_progress")
        .neq("id", stopId),
    );
  }
  must(
    await c.admin
      .from("route_stops")
      .update({
        status: status as "pending",
        arrived_at: status === "in_progress" || isFinished(status) ? (stop?.arrived_at ?? at) : (stop?.arrived_at ?? null),
        completed_at: isFinished(status) ? at : null,
      })
      .eq("id", stopId)
      .eq("route_id", routeId),
  );
  const { data: links } = must(await c.admin.from("route_stop_orders").select("order_id").eq("stop_id", stopId));
  const ids = (links ?? []).map((l) => l.order_id);
  if (ids.length) {
    must(
      await c.admin
        .from("orders")
        .update({ status: ORDER_STATUS[status] as "planned" })
        .in("id", ids)
        .neq("status", "cancelled"),
    );
  }
}

/** Opakowania i gotówka z punktu: zdarzenie niesie stan absolutny, do księgi dopisujemy tylko różnicę (bez nadpisywania). */
async function applyStopMoney(c: DriverCtx, e: Extract<DriverEvent, { type: "stop_saved" }>, eventRowId: string | null) {
  const { data: point } = must(
    await c.admin.from("route_stops").select("delivery_points(customer_id)").eq("id", e.stop_id).single(),
  );
  const customerId = point?.delivery_points?.customer_id;
  if (!customerId) return;
  const { data: types } = must(await c.admin.from("packaging_types").select("id").eq("tenant_id", c.tenantId));
  const { data: existing } = must(
    await c.admin
      .from("packaging_movements")
      .select("packaging_type_id, qty, reason")
      .eq("stop_id", e.stop_id)
      .eq("party_type", "customer"),
  );
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
      const common = {
        tenant_id: c.tenantId,
        movement_group: g,
        packaging_type_id: typeId,
        reason,
        stop_id: e.stop_id,
        note,
        created_by: c.userId,
        source_event_id: eventRowId,
      };
      rows.push(
        { ...common, party_type: "customer" as const, party_id: customerId, qty: toCustomer },
        { ...common, party_type: "driver" as const, party_id: c.driverId, qty: -toCustomer },
      );
    }
  }
  if (rows.length) must(await c.admin.from("packaging_movements").insert(rows));

  if (e.cash_grosze !== null) {
    const { data: prev } = must(
      await c.admin
        .from("cash_movements")
        .select("amount")
        .eq("stop_id", e.stop_id)
        .eq("party_type", "driver")
        .eq("reason", "cod_collected"),
    );
    const already = Math.round((prev ?? []).reduce((a, m) => a + Number(m.amount) * 100, 0));
    const delta = e.cash_grosze - already;
    if (delta !== 0) {
      const g = randomUUID();
      const amount = Number((delta / 100).toFixed(2));
      const common = {
        tenant_id: c.tenantId,
        movement_group: g,
        reason: "cod_collected",
        route_id: e.route_id,
        stop_id: e.stop_id,
        created_by: c.userId,
        source_event_id: eventRowId,
      };
      must(
        await c.admin.from("cash_movements").insert([
          { ...common, party_type: "driver" as const, party_id: c.driverId, amount },
          { ...common, party_type: "customer" as const, party_id: customerId, amount: -amount },
        ]),
      );
    }
  }
}

/** Skutki zdarzenia w bazie. Idempotentne: ponowne wykonanie (po zerwanym połączeniu) daje ten sam stan. */
async function applyEffects(c: DriverCtx, e: DriverEvent, odometerStart: number | null, eventRowId: string | null) {
  const at = e.occurred_at;
  switch (e.type) {
    case "route_started":
      must(
        await c.admin
          .from("routes")
          .update({
            status: "in_progress",
            odometer_start: e.odometer_start,
            ...(e.vehicle_id ? { vehicle_id: e.vehicle_id } : {}),
          })
          .eq("id", e.route_id)
          .in("status", ["planned", "dispatched", "in_progress"]),
      );
      return;
    case "stop_quick":
      await setStopStatus(c, e.route_id, e.stop_id, QUICK_STATUSES[e.status].stop, at);
      return;
    case "stop_saved": {
      await applyStopMoney(c, e, eventRowId);
      // pochodne zapisy z deterministycznym id — ponowienie nie dubluje
      if (e.return_text.trim())
        await insertOrThrow(
          c,
          derivedUuid(e.client_event_id, "return"),
          e.route_id,
          e.stop_id,
          "return_recorded",
          { text: e.return_text.trim() },
          at,
          e.location,
        );
      if (e.comment.trim())
        await insertOrThrow(
          c,
          derivedUuid(e.client_event_id, "comment"),
          e.route_id,
          e.stop_id,
          "comment",
          { text: e.comment.trim() },
          at,
          e.location,
        );
      const next = outcomeStopStatus(e.outcome);
      if (next) await setStopStatus(c, e.route_id, e.stop_id, next, at);
      return;
    }
    case "problem_reported":
      return;
    case "route_finished":
      must(
        await c.admin
          .from("routes")
          .update({
            status: "completed",
            odometer_end: e.odometer_end,
            actual_km: e.odometer_end - (odometerStart ?? e.odometer_end),
          })
          .eq("id", e.route_id)
          .eq("status", "in_progress"),
      );
      return;
  }
}

async function insertOrThrow(...args: Parameters<typeof insertEvent>) {
  if ((await insertEvent(...args)) === "error") throw new Error("insert");
}

function eventRow(e: DriverEvent): { stopId: string | null; type: string; payload: Record<string, unknown> } {
  switch (e.type) {
    case "route_started":
      return { stopId: null, type: "route_started", payload: { odometer_start: e.odometer_start, vehicle_id: e.vehicle_id } };
    case "stop_quick":
      return { stopId: e.stop_id, type: `stop_${QUICK_STATUSES[e.status].stop}`, payload: { source: "route_list" } };
    case "stop_saved": {
      const next = outcomeStopStatus(e.outcome);
      const payload: Record<string, unknown> = { source: "stop_screen", photos: e.photos, signature: e.signature };
      if (e.reason.trim()) payload.reason = e.reason.trim();
      if (e.comment.trim()) payload.comment = e.comment.trim();
      return { stopId: e.stop_id, type: next ? `stop_${next}` : "stop_saved", payload };
    }
    case "problem_reported":
      return { stopId: e.stop_id, type: "problem_reported", payload: { kind: e.kind, text: e.text.trim(), photos: e.photos } };
    case "route_finished":
      return { stopId: null, type: "route_finished", payload: { odometer_end: e.odometer_end } };
  }
}

/**
 * Przyjęcie zdarzenia z telefonu. Błąd przejściowy (baza, sieć) → „retry” (telefon wyśle ponownie);
 * odrzucenie tylko, gdy zdarzenie jest niezgodne ze stanem trasy. Ponowione zdarzenie wykonuje skutki jeszcze raz
 * (są idempotentne), więc przerwany zapis zawsze się dokończy.
 */
export async function applyDriverEvent(c: DriverCtx, e: DriverEvent): Promise<ApplyResult> {
  const id = e.client_event_id;
  const reject = (reason: string): ApplyResult => ({ id, status: "rejected", reason });
  const retry: ApplyResult = { id, status: "rejected", reason: "retry" };
  try {
    const { data: route } = must(
      await c.admin
        .from("routes")
        .select("id, status, odometer_start, route_stops(id)")
        .eq("id", e.route_id)
        .eq("tenant_id", c.tenantId)
        .eq("driver_id", c.driverId)
        .maybeSingle(),
    );
    const { data: seen } = must(
      await c.admin.from("delivery_events").select("id").eq("tenant_id", c.tenantId).eq("client_event_id", id).maybeSingle(),
    );
    if (seen) {
      // już przyjęte: dokończ skutki (gdyby poprzednia próba przerwała się w połowie), chyba że trasa jest zamknięta
      if (route && route.status !== "closed" && route.status !== "cancelled")
        await applyEffects(c, e, route.odometer_start, seen.id);
      return { id, status: "duplicate" };
    }
    if (!route) return reject("To nie jest Twoja trasa (dyspozytor mógł ją przydzielić innemu kierowcy).");
    const problem = validateEvent(
      { status: route.status, odometerStart: route.odometer_start, stops: route.route_stops as never },
      e,
    );
    if (problem) return reject(problem);
    if (e.type === "route_started" && e.vehicle_id) {
      const { data: v } = must(
        await c.admin
          .from("vehicles")
          .select("id")
          .eq("id", e.vehicle_id)
          .eq("tenant_id", c.tenantId)
          .eq("status", "active")
          .maybeSingle(),
      );
      if (!v) return reject("Wybrany pojazd jest nieaktywny albo nie należy do firmy.");
    }
    const row = eventRow(e);
    const r = await insertEvent(c, id, e.route_id, row.stopId, row.type, row.payload, e.occurred_at, e.location);
    if (r === "error") return retry;
    const { data: stored } = must(
      await c.admin.from("delivery_events").select("id").eq("tenant_id", c.tenantId).eq("client_event_id", id).maybeSingle(),
    );
    await applyEffects(c, e, route.odometer_start, stored?.id ?? null);
    return { id, status: r === "duplicate" ? "duplicate" : "ok" };
  } catch {
    return retry;
  }
}

export type IncomingPosition = {
  route_id: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  recorded_at: string;
};

/** Pozycje GPS z otwartej trasy (co kilka minut) — wysyłane paczkami, duplikaty pomijane. */
export async function savePositions(c: DriverCtx, list: IncomingPosition[]): Promise<number> {
  if (!list.length) return 0;
  const routeIds = [...new Set(list.map((p) => p.route_id).filter((x): x is string => Boolean(x)))];
  const own = new Set<string>();
  if (routeIds.length) {
    const { data } = await c.admin
      .from("routes")
      .select("id")
      .eq("tenant_id", c.tenantId)
      .eq("driver_id", c.driverId)
      .in("id", routeIds);
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
  const { error } = await c.admin
    .from("driver_positions")
    .upsert(rows, { onConflict: "driver_id,recorded_at", ignoreDuplicates: true });
  return error ? 0 : rows.length;
}
