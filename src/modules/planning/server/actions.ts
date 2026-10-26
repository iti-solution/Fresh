"use server";

import { revalidatePath } from "next/cache";
import { DATE_RE, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { canMarkReady, validateExtraRoute } from "../domain/load";
import { getPlanningDay } from "./queries";

async function planner() {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return null;
  return { ctx, supabase: await createClient() };
}

const done = () => revalidatePath("/planowanie");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createDay(day: string): Promise<void> {
  const p = await planner();
  if (!p || !DATE_RE.test(day)) return;
  await p.supabase.rpc("create_day_routes", { p_tenant: p.ctx.tenantId, p_date: day });
  done();
}

export async function assignOrder(orderId: string, fd: FormData): Promise<void> {
  const p = await planner();
  const routeId = str(fd, "route_id");
  if (!p || !routeId) return;
  if (routeId === "__none") await p.supabase.rpc("unassign_order", { p_order: orderId });
  else await p.supabase.rpc("assign_order_to_route", { p_order: orderId, p_route: routeId });
  done();
}

/** Przeniesienie całego postoju (wszystkich zamówień oddziału) na inną trasę. */
export async function moveStopToRoute(orderIds: string[], fd: FormData): Promise<void> {
  const p = await planner();
  const routeId = str(fd, "route_id");
  if (!p || !routeId) return;
  for (const id of orderIds) {
    if (routeId === "__none") await p.supabase.rpc("unassign_order", { p_order: id });
    else await p.supabase.rpc("assign_order_to_route", { p_order: id, p_route: routeId });
  }
  done();
}

export async function unassignStop(orderIds: string[]): Promise<void> {
  const p = await planner();
  if (!p) return;
  for (const id of orderIds) await p.supabase.rpc("unassign_order", { p_order: id });
  done();
}

export async function moveStop(stopId: string, dir: -1 | 1): Promise<void> {
  const p = await planner();
  if (!p) return;
  await p.supabase.rpc("move_stop", { p_stop: stopId, p_dir: dir });
  done();
}

export async function sortByWindow(routeId: string): Promise<void> {
  const p = await planner();
  if (!p) return;
  await p.supabase.rpc("sort_route_by_window", { p_route: routeId });
  done();
}

export async function setRouteResource(routeId: string, field: "vehicle_id" | "driver_id", fd: FormData): Promise<void> {
  const p = await planner();
  if (!p) return;
  const value = str(fd, field) || null;
  await p.supabase
    .from("routes")
    .update(
      field === "vehicle_id" ? { vehicle_id: value, status: "draft" as const } : { driver_id: value, status: "draft" as const },
    )
    .eq("id", routeId)
    .eq("tenant_id", p.ctx.tenantId)
    .in("status", ["draft", "planned"]);
  done();
}

/** „Gotowa do załadunku” — reguły sprawdzane ponownie na serwerze (przeciążenie tylko z force). */
export async function markReady(routeId: string, day: string, force: boolean): Promise<void> {
  const p = await planner();
  if (!p) return;
  const plan = await getPlanningDay(p.ctx.tenantId, day);
  const route = plan.routes.find((r) => r.id === routeId);
  if (!route || route.status !== "draft") return;
  if (!canMarkReady(route.issues, force).ok) return;
  await p.supabase
    .from("routes")
    .update({ status: "planned" })
    .eq("id", routeId)
    .eq("tenant_id", p.ctx.tenantId)
    .eq("status", "draft");
  done();
}

/** Wszystkie trasy dnia, które spełniają reguły bez potwierdzania (przeciążone zostają w szkicu). */
export async function markAllReady(day: string): Promise<void> {
  const p = await planner();
  if (!p) return;
  const plan = await getPlanningDay(p.ctx.tenantId, day);
  const ids = plan.routes.filter((r) => r.status === "draft" && canMarkReady(r.issues).ok).map((r) => r.id);
  if (ids.length) await p.supabase.from("routes").update({ status: "planned" }).in("id", ids).eq("tenant_id", p.ctx.tenantId);
  done();
}

export async function backToDraft(routeId: string): Promise<void> {
  const p = await planner();
  if (!p) return;
  await p.supabase
    .from("routes")
    .update({ status: "draft" })
    .eq("id", routeId)
    .eq("tenant_id", p.ctx.tenantId)
    .eq("status", "planned");
  done();
}

export async function deleteEmptyRoute(routeId: string): Promise<void> {
  const p = await planner();
  if (!p) return;
  const { count } = await p.supabase.from("route_stops").select("id", { count: "exact", head: true }).eq("route_id", routeId);
  if ((count ?? 0) > 0) return;
  await p.supabase.from("routes").delete().eq("id", routeId).eq("tenant_id", p.ctx.tenantId).eq("status", "draft");
  done();
}

export async function createExtraRoute(day: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const p = await planner();
  if (!p) return { ok: false, message: "Nie masz uprawnień do planowania." };
  if (!DATE_RE.test(day)) return { ok: false, message: "Niepoprawna data." };
  const input = { name: str(fd, "name"), kind: str(fd, "kind"), reason: str(fd, "reason") };
  const err = validateExtraRoute(input);
  if (err) return { ok: false, message: err };
  const vehicleId = str(fd, "vehicle_id") || null;
  const driverId = str(fd, "driver_id") || null;

  let courseNo = 1;
  if (driverId) {
    const { count } = await p.supabase
      .from("routes")
      .select("id", { count: "exact", head: true })
      .eq("route_date", day)
      .eq("driver_id", driverId);
    courseNo = (count ?? 0) + 1;
  }
  const { error } = await p.supabase.from("routes").insert({
    tenant_id: p.ctx.tenantId,
    route_date: day,
    name: input.name,
    kind: input.kind as "extra",
    course_no: courseNo,
    vehicle_id: vehicleId,
    driver_id: driverId,
    extra_reason: input.reason || null,
    status: "draft",
  });
  if (error) return { ok: false, message: "Nie udało się utworzyć kursu." };
  done();
  return { ok: true, message: `Utworzono kurs „${input.name}”. Przenieś na niego zamówienia z listy po lewej.` };
}

/**
 * „Przydziel jak ostatnio”: trasom stałym bez auta lub kierowcy podpowiada przydział z ostatniego
 * dnia, w którym ta trasa jechała (z dziennika przydziałów). Nie zmienia tego, co dyspozytor już ustawił.
 */
export async function copyLastAssignments(day: string): Promise<void> {
  const p = await planner();
  if (!p || !DATE_RE.test(day)) return;
  const { data: routes } = await p.supabase
    .from("routes")
    .select("id, template_id, vehicle_id, driver_id, course_no")
    .eq("tenant_id", p.ctx.tenantId)
    .eq("route_date", day)
    .in("status", ["draft", "planned"]);
  const usedVehicles = new Set((routes ?? []).filter((r) => r.vehicle_id).map((r) => `${r.course_no}:${r.vehicle_id}`));
  const usedDrivers = new Set((routes ?? []).filter((r) => r.driver_id).map((r) => `${r.course_no}:${r.driver_id}`));
  for (const r of routes ?? []) {
    if (!r.template_id || (r.vehicle_id && r.driver_id)) continue;
    const { data: last } = await p.supabase
      .from("routes")
      .select("vehicle_id, driver_id")
      .eq("tenant_id", p.ctx.tenantId)
      .eq("template_id", r.template_id)
      .lt("route_date", day)
      .not("vehicle_id", "is", null)
      .order("route_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) continue;
    const patch: { vehicle_id?: string; driver_id?: string } = {};
    if (!r.vehicle_id && last.vehicle_id && !usedVehicles.has(`${r.course_no}:${last.vehicle_id}`)) {
      patch.vehicle_id = last.vehicle_id;
      usedVehicles.add(`${r.course_no}:${last.vehicle_id}`);
    }
    if (!r.driver_id && last.driver_id && !usedDrivers.has(`${r.course_no}:${last.driver_id}`)) {
      patch.driver_id = last.driver_id;
      usedDrivers.add(`${r.course_no}:${last.driver_id}`);
    }
    if (Object.keys(patch).length)
      await p.supabase
        .from("routes")
        .update({ ...patch, status: "draft" })
        .eq("id", r.id)
        .eq("tenant_id", p.ctx.tenantId);
  }
  done();
}
