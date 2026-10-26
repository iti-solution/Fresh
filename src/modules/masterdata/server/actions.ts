"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import {
  buildWindows,
  carrierSchema,
  customerSchema,
  driverSchema,
  noteSchema,
  pointSchema,
  templateSchema,
  vehicleSchema,
} from "../domain/schemas";

const NO_RIGHTS: FormState = { ok: false, message: "Nie masz uprawnień do zmiany kartotek." };
const DB_ERROR: FormState = { ok: false, message: "Nie udało się zapisać. Spróbuj ponownie." };

async function writer() {
  const ctx = await requireTenantContext();
  const canWrite = ctx.role === "admin" || ctx.role === "dispatcher";
  return { ctx, canWrite, supabase: await createClient() };
}

function uniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}

// ---------- KLIENCI ----------
export async function saveCustomer(customerId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return NO_RIGHTS;
  const parsed = customerSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);

  if (customerId) {
    const { error } = await supabase.from("customers").update(parsed.data).eq("id", customerId).eq("tenant_id", ctx.tenantId);
    if (uniqueViolation(error))
      return { ok: false, fieldErrors: { external_code: ["Ten kod jest już zajęty"] }, message: "Popraw zaznaczone pola." };
    if (error) return DB_ERROR;
    revalidatePath("/kartoteki/klienci");
    return { ok: true, message: "Zapisano zmiany." };
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ ...parsed.data, tenant_id: ctx.tenantId })
    .select("id")
    .single();
  if (uniqueViolation(error))
    return { ok: false, fieldErrors: { external_code: ["Ten kod jest już zajęty"] }, message: "Popraw zaznaczone pola." };
  if (error || !data) return DB_ERROR;
  revalidatePath("/kartoteki/klienci");
  redirect(`/kartoteki/klienci/${data.id}?nowy=1`);
}

// ---------- ODDZIAŁY (punkty dostaw) ----------
export async function savePoint(customerId: string, pointId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return NO_RIGHTS;
  const parsed = pointSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = parsed.data;

  const row = {
    name: v.name,
    branch_type: v.branch_type,
    external_code: v.external_code,
    address_line: v.address_line,
    postal_code: v.postal_code,
    city: v.city,
    contact_phone: v.contact_phone,
    delivery_weekdays: v.delivery_weekdays,
    service_minutes: v.service_minutes ?? 10,
    call_instructions: v.call_instructions,
    access_instructions: v.access_instructions,
    floor: v.floor,
    unloading_zone: v.unloading_zone,
    driver_instructions: v.driver_instructions,
    active_from: v.active_from,
    active_to: v.active_to,
    is_active: v.is_active,
  };

  let id = pointId;
  if (id) {
    const { error } = await supabase.from("delivery_points").update(row).eq("id", id).eq("tenant_id", ctx.tenantId);
    if (uniqueViolation(error))
      return { ok: false, fieldErrors: { external_code: ["Ten kod jest już zajęty"] }, message: "Popraw zaznaczone pola." };
    if (error) return DB_ERROR;
  } else {
    const { data, error } = await supabase
      .from("delivery_points")
      .insert({ ...row, tenant_id: ctx.tenantId, customer_id: customerId })
      .select("id")
      .single();
    if (uniqueViolation(error))
      return { ok: false, fieldErrors: { external_code: ["Ten kod jest już zajęty"] }, message: "Popraw zaznaczone pola." };
    if (error || !data) return DB_ERROR;
    id = data.id;
  }

  // Okna przyjęć: zastępujemy w całości tym, co jest w formularzu
  const { error: delErr } = await supabase
    .from("delivery_point_windows")
    .delete()
    .eq("delivery_point_id", id)
    .eq("tenant_id", ctx.tenantId);
  if (delErr) return DB_ERROR;
  const windows = buildWindows(v).map((w) => ({ ...w, tenant_id: ctx.tenantId, delivery_point_id: id! }));
  if (windows.length) {
    const { error } = await supabase.from("delivery_point_windows").insert(windows);
    if (error) return DB_ERROR;
  }

  revalidatePath(`/kartoteki/klienci/${customerId}`);
  revalidatePath("/kartoteki/klienci");
  redirect(`/kartoteki/klienci/${customerId}?zapisano=${pointId ? "oddzial" : "nowy-oddzial"}#oddzial-${id}`);
}

// ---------- UWAGI TYMCZASOWE ----------
export async function addNote(customerId: string, pointId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return NO_RIGHTS;
  const parsed = noteSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error, "Sprawdź treść i daty uwagi.");
  const { error } = await supabase.from("delivery_point_notes").insert({
    tenant_id: ctx.tenantId,
    delivery_point_id: pointId,
    text: parsed.data.text,
    valid_from: parsed.data.valid_from ?? undefined,
    valid_to: parsed.data.valid_to,
    created_by: ctx.userId,
  });
  if (error) return DB_ERROR;
  revalidatePath(`/kartoteki/klienci/${customerId}`);
  return { ok: true, message: "Dodano uwagę." };
}

export async function endNote(customerId: string, noteId: string): Promise<void> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return;
  // Zakończenie uwagi = ustawienie daty końca na wczoraj (historia zostaje)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await supabase.from("delivery_point_notes").update({ valid_to: yesterday }).eq("id", noteId).eq("tenant_id", ctx.tenantId);
  revalidatePath(`/kartoteki/klienci/${customerId}`);
}

// ---------- POJAZDY ----------
export async function saveVehicle(vehicleId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return NO_RIGHTS;
  const parsed = vehicleSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = {
    ...parsed.data,
    capacity_kg: parsed.data.capacity_kg ?? 0,
    capacity_pallets: parsed.data.capacity_pallets ?? 0,
    capacity_crates: parsed.data.capacity_crates ?? 0,
    capacity_m3: parsed.data.capacity_m3 ?? 0,
  };
  if (v.is_own) v.carrier_id = null;

  const { error } = vehicleId
    ? await supabase.from("vehicles").update(v).eq("id", vehicleId).eq("tenant_id", ctx.tenantId)
    : await supabase.from("vehicles").insert({ ...v, tenant_id: ctx.tenantId });
  if (uniqueViolation(error))
    return {
      ok: false,
      fieldErrors: { registration: ["Pojazd o tym numerze już istnieje"] },
      message: "Popraw zaznaczone pola.",
    };
  if (error) return DB_ERROR;
  revalidatePath("/kartoteki/pojazdy");
  redirect("/kartoteki/pojazdy?zapisano=1");
}

// ---------- KIEROWCY ----------
export async function saveDriver(driverId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return NO_RIGHTS;
  const parsed = driverSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const { error } = driverId
    ? await supabase.from("drivers").update(parsed.data).eq("id", driverId).eq("tenant_id", ctx.tenantId)
    : await supabase.from("drivers").insert({ ...parsed.data, tenant_id: ctx.tenantId });
  if (error) return DB_ERROR;
  revalidatePath("/kartoteki/kierowcy");
  redirect("/kartoteki/kierowcy?zapisano=1");
}

// ---------- PRZEWOŹNICY ----------
export async function saveCarrier(_prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return NO_RIGHTS;
  const parsed = carrierSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const { error } = await supabase.from("carriers").insert({ ...parsed.data, tenant_id: ctx.tenantId });
  if (uniqueViolation(error))
    return { ok: false, fieldErrors: { name: ["Przewoźnik o tej nazwie już istnieje"] }, message: "Popraw zaznaczone pola." };
  if (error) return DB_ERROR;
  revalidatePath("/kartoteki/przewoznicy");
  return { ok: true, message: "Dodano przewoźnika." };
}

// ---------- SZABLONY TRAS ----------
const tplPath = (id: string) => `/kartoteki/szablony/${id}`;

export async function saveTemplate(templateId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return NO_RIGHTS;
  const parsed = templateSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  if (templateId) {
    const { error } = await supabase
      .from("route_templates")
      .update(parsed.data)
      .eq("id", templateId)
      .eq("tenant_id", ctx.tenantId);
    if (error) return DB_ERROR;
    revalidatePath("/kartoteki/szablony");
    revalidatePath(tplPath(templateId));
    return { ok: true, message: "Zapisano szablon." };
  }
  const { data, error } = await supabase
    .from("route_templates")
    .insert({ ...parsed.data, tenant_id: ctx.tenantId })
    .select("id")
    .single();
  if (error || !data) return DB_ERROR;
  revalidatePath("/kartoteki/szablony");
  redirect(`${tplPath(data.id)}?nowy=1`);
}

/** Dodaje zaznaczone oddziały na koniec szablonu (pomija już przypisane). */
export async function addTemplatePoints(templateId: string, fd: FormData): Promise<void> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return;
  const ids = [...new Set(fd.getAll("point_id").map(String).filter(Boolean))];
  if (!ids.length) return;
  const { data: existing } = await supabase
    .from("route_template_points")
    .select("delivery_point_id, sequence")
    .eq("template_id", templateId)
    .eq("tenant_id", ctx.tenantId);
  const have = new Set((existing ?? []).map((e) => e.delivery_point_id));
  let seq = Math.max(0, ...(existing ?? []).map((e) => e.sequence));
  const rows = ids
    .filter((id) => !have.has(id))
    .map((id) => ({ tenant_id: ctx.tenantId, template_id: templateId, delivery_point_id: id, sequence: ++seq }));
  if (rows.length) await supabase.from("route_template_points").insert(rows);
  revalidatePath(tplPath(templateId));
  revalidatePath("/kartoteki/szablony");
}

export async function removeTemplatePoint(templateId: string, pointId: string): Promise<void> {
  const { ctx, canWrite, supabase } = await writer();
  if (!canWrite) return;
  await supabase
    .from("route_template_points")
    .delete()
    .eq("template_id", templateId)
    .eq("delivery_point_id", pointId)
    .eq("tenant_id", ctx.tenantId);
  revalidatePath(tplPath(templateId));
  revalidatePath("/kartoteki/szablony");
}

export async function moveTemplatePoint(templateId: string, pointId: string, dir: -1 | 1): Promise<void> {
  const { canWrite, supabase } = await writer();
  if (!canWrite) return;
  await supabase.rpc("move_template_point", { p_template: templateId, p_point: pointId, p_dir: dir });
  revalidatePath(tplPath(templateId));
}

export async function sortTemplateByWindow(templateId: string): Promise<void> {
  const { canWrite, supabase } = await writer();
  if (!canWrite) return;
  await supabase.rpc("sort_template_by_window", { p_template: templateId });
  revalidatePath(tplPath(templateId));
}
