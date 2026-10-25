"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, type FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import {
  EXCEPTION_STATUSES,
  parseCash,
  parseOdometer,
  parsePackaging,
  QUICK_STATUSES,
  validateOdometerEnd,
  type ExceptionStatus,
  type QuickStatus,
} from "../domain/execution";

// Wszystkie zapisy kierowcy idą przez klucz serwerowy — dopiero PO sprawdzeniu, że trasa należy do kierowcy.

type Ctx = { tenantId: string; driverId: string; userId: string; admin: ReturnType<typeof createAdminClient> };

async function driverCtx(): Promise<Ctx | null> {
  const ctx = await requireTenantContext();
  if (ctx.role !== "driver") return null;
  const admin = createAdminClient();
  const { data } = await admin.from("drivers").select("id").eq("user_id", ctx.userId).eq("tenant_id", ctx.tenantId).maybeSingle();
  return data ? { tenantId: ctx.tenantId, driverId: data.id, userId: ctx.userId, admin } : null;
}

async function ownRoute(c: Ctx, routeId: string) {
  const { data } = await c.admin
    .from("routes")
    .select("id, status, odometer_start, vehicle_id")
    .eq("id", routeId)
    .eq("tenant_id", c.tenantId)
    .eq("driver_id", c.driverId)
    .maybeSingle();
  return data;
}

async function ownStop(c: Ctx, routeId: string, stopId: string) {
  const { data } = await c.admin.from("route_stops").select("id, status, arrived_at, route_id").eq("id", stopId).eq("route_id", routeId).maybeSingle();
  return data;
}

async function event(c: Ctx, routeId: string, type: string, payload: Record<string, unknown>, stopId?: string) {
  const { data } = await c.admin
    .from("delivery_events")
    .insert({
      tenant_id: c.tenantId,
      client_event_id: randomUUID(),
      route_id: routeId,
      stop_id: stopId ?? null,
      driver_id: c.driverId,
      type,
      payload: payload as never,
      occurred_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

const refresh = (routeId: string) => {
  revalidatePath(`/driver/trasa/${routeId}`);
  revalidatePath("/driver");
  revalidatePath("/planowanie");
};

export async function startRoute(routeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const c = await driverCtx();
  if (!c) return { ok: false, message: "Zaloguj się jako kierowca." };
  const route = await ownRoute(c, routeId);
  if (!route) return { ok: false, message: "To nie jest Twoja trasa." };
  if (!["planned", "dispatched"].includes(route.status)) return { ok: false, message: "Tej trasy nie można teraz rozpocząć." };
  const odo = parseOdometer(fd.get("odometer_start"));
  if (odo === null) return { ok: false, fieldErrors: { odometer_start: ["Wpisz stan licznika (same cyfry)"] }, message: "Popraw licznik." };
  const vehicleId = String(fd.get("vehicle_id") ?? "") || route.vehicle_id;
  const { error } = await c.admin.from("routes").update({ status: "in_progress", odometer_start: odo, vehicle_id: vehicleId }).eq("id", routeId);
  if (error) return { ok: false, message: "Nie udało się rozpocząć trasy." };
  await event(c, routeId, "route_started", { odometer_start: odo, vehicle_id: vehicleId });
  refresh(routeId);
  redirect(`/driver/trasa/${routeId}`);
}

async function applyStopStatus(c: Ctx, routeId: string, stopId: string, stopStatus: string, orderStatus: string, payload: Record<string, unknown>) {
  const stop = await ownStop(c, routeId, stopId);
  if (!stop) return false;
  const now = new Date().toISOString();
  const finished = !["pending", "in_progress", "arrived"].includes(stopStatus);
  if (stopStatus === "in_progress") {
    // „Teraz realizuję” tylko na jednym punkcie naraz
    await c.admin.from("route_stops").update({ status: "pending" }).eq("route_id", routeId).eq("status", "in_progress").neq("id", stopId);
  }
  await c.admin
    .from("route_stops")
    .update({
      status: stopStatus as "pending",
      arrived_at: stopStatus === "in_progress" ? stop.arrived_at ?? now : stop.arrived_at,
      completed_at: finished ? now : null,
    })
    .eq("id", stopId);
  const { data: links } = await c.admin.from("route_stop_orders").select("order_id").eq("stop_id", stopId);
  const ids = (links ?? []).map((l) => l.order_id);
  if (ids.length) await c.admin.from("orders").update({ status: orderStatus as "planned" }).in("id", ids).neq("status", "cancelled");
  await event(c, routeId, `stop_${stopStatus}`, payload, stopId);
  return true;
}

export async function setQuickStatus(routeId: string, stopId: string, status: QuickStatus): Promise<void> {
  const c = await driverCtx();
  if (!c) return;
  const route = await ownRoute(c, routeId);
  if (!route || route.status !== "in_progress" || !(status in QUICK_STATUSES)) return;
  const s = QUICK_STATUSES[status];
  await applyStopStatus(c, routeId, stopId, s.stop, s.order, { source: "route_list" });
  refresh(routeId);
}

/** Ekran punktu: wynik dostawy, opakowania (wydano/zwrot), gotówka, zwrot towaru, komentarz. */
export async function saveStop(routeId: string, stopId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const c = await driverCtx();
  if (!c) return { ok: false, message: "Zaloguj się jako kierowca." };
  const route = await ownRoute(c, routeId);
  if (!route || route.status !== "in_progress") return { ok: false, message: "Trasa nie jest w realizacji — najpierw ją rozpocznij." };
  const stop = await ownStop(c, routeId, stopId);
  if (!stop) return { ok: false, message: "Nie znaleziono punktu." };

  const v = formToObject(fd);
  const outcome = String(v.outcome ?? "keep");
  const reason = String(v.reason ?? "").trim();
  const comment = String(v.comment ?? "").trim();
  const returnText = String(v.return_text ?? "").trim();

  if (outcome in EXCEPTION_STATUSES && EXCEPTION_STATUSES[outcome as ExceptionStatus].needsReason && reason.length < 3) {
    return { ok: false, fieldErrors: { reason: ["Opisz przyczynę"] }, message: "Dla reklamacji i odmowy podaj przyczynę." };
  }
  const cash = parseCash(v.cash);
  if (String(v.cash ?? "").trim() !== "" && cash === null) return { ok: false, fieldErrors: { cash: ["Kwota w zł, np. 640,50"] }, message: "Popraw kwotę." };

  // Opakowania: dopisujemy tylko różnicę względem tego, co już zapisano na tym punkcie (księga bez nadpisywania)
  const { data: types } = await c.admin.from("packaging_types").select("id").eq("tenant_id", c.tenantId);
  const wanted = parsePackaging(v, (types ?? []).map((x) => x.id));
  const { data: point } = await c.admin.from("route_stops").select("delivery_points(customer_id)").eq("id", stopId).single();
  const customerId = point?.delivery_points?.customer_id;
  const { data: existing } = await c.admin.from("packaging_movements").select("packaging_type_id, qty, reason").eq("stop_id", stopId).eq("party_type", "customer");
  const sum = (typeId: string, r: string) => (existing ?? []).filter((m) => m.packaging_type_id === typeId && m.reason === r).reduce((a, m) => a + m.qty, 0);
  const allTypes = new Set([...(types ?? []).map((x) => x.id)]);
  const rows: { tenant_id: string; movement_group: string; packaging_type_id: string; party_type: "customer" | "driver"; party_id: string; qty: number; reason: string; stop_id: string; note: string | null; created_by: string }[] = [];
  if (customerId) {
    for (const typeId of allTypes) {
      const w = wanted.find((x) => x.typeId === typeId) ?? { out: 0, back: 0 };
      const issued = sum(typeId, "issue");
      const returned = -sum(typeId, "return");
      const pairs: [number, string][] = [
        [w.out - issued, "issue"],
        [w.back - returned, "return"],
      ];
      for (const [delta, reasonCode] of pairs) {
        if (delta === 0) continue;
        const g = randomUUID();
        const toCustomer = reasonCode === "issue" ? delta : -delta;
        const note = issued || returned ? "korekta kierowcy" : null;
        rows.push(
          { tenant_id: c.tenantId, movement_group: g, packaging_type_id: typeId, party_type: "customer", party_id: customerId, qty: toCustomer, reason: reasonCode, stop_id: stopId, note, created_by: c.userId },
          { tenant_id: c.tenantId, movement_group: g, packaging_type_id: typeId, party_type: "driver", party_id: c.driverId, qty: -toCustomer, reason: reasonCode, stop_id: stopId, note, created_by: c.userId },
        );
      }
    }
  }
  if (rows.length) {
    const { error } = await c.admin.from("packaging_movements").insert(rows);
    if (error) return { ok: false, message: "Nie udało się zapisać opakowań." };
  }

  // Gotówka z pobrania — też tylko różnica
  if (cash !== null && customerId) {
    const { data: prevCash } = await c.admin.from("cash_movements").select("amount").eq("stop_id", stopId).eq("party_type", "driver").eq("reason", "cod_collected");
    const already = Math.round((prevCash ?? []).reduce((a, m) => a + Number(m.amount) * 100, 0));
    const delta = cash - already;
    if (delta !== 0) {
      const g = randomUUID();
      const amount = (delta / 100).toFixed(2);
      const { error } = await c.admin.from("cash_movements").insert([
        { tenant_id: c.tenantId, movement_group: g, party_type: "driver", party_id: c.driverId, amount: Number(amount), reason: "cod_collected", route_id: routeId, stop_id: stopId, created_by: c.userId },
        { tenant_id: c.tenantId, movement_group: g, party_type: "customer", party_id: customerId, amount: -Number(amount), reason: "cod_collected", route_id: routeId, stop_id: stopId, created_by: c.userId },
      ]);
      if (error) return { ok: false, message: "Nie udało się zapisać gotówki." };
    }
  }

  if (returnText) await event(c, routeId, "return_recorded", { text: returnText }, stopId);
  if (comment) await event(c, routeId, "comment", { text: comment }, stopId);

  if (outcome === "delivered" || outcome === "partial") {
    const s = QUICK_STATUSES[outcome === "delivered" ? "done" : "partial"];
    await applyStopStatus(c, routeId, stopId, s.stop, s.order, { source: "stop_screen", comment: comment || undefined });
  } else if (outcome in EXCEPTION_STATUSES) {
    const s = EXCEPTION_STATUSES[outcome as ExceptionStatus];
    await applyStopStatus(c, routeId, stopId, s.stop, s.order, { source: "stop_screen", reason });
  }
  refresh(routeId);
  redirect(`/driver/trasa/${routeId}?zapisano=${stopId}`);
}

export async function finishRoute(routeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const c = await driverCtx();
  if (!c) return { ok: false, message: "Zaloguj się jako kierowca." };
  const route = await ownRoute(c, routeId);
  if (!route || route.status !== "in_progress") return { ok: false, message: "Trasa nie jest w realizacji." };
  const end = parseOdometer(fd.get("odometer_end"));
  const err = validateOdometerEnd(route.odometer_start, end);
  if (err) return { ok: false, fieldErrors: { odometer_end: [err] }, message: err };
  const { error } = await c.admin.from("routes").update({ status: "completed", odometer_end: end, actual_km: end! - (route.odometer_start ?? end!) }).eq("id", routeId);
  if (error) return { ok: false, message: "Nie udało się zakończyć trasy." };
  await event(c, routeId, "route_finished", { odometer_end: end });
  refresh(routeId);
  redirect(`/driver/trasa/${routeId}/raport`);
}
