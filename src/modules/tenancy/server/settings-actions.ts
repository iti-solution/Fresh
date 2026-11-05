"use server";

import { revalidatePath } from "next/cache";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { closureSchema, packagingTypeSchema, pointTypeSchema } from "@/modules/masterdata/domain/settings";
import { canEdit } from "../domain/access";
import { apiKeyName, generateApiKey, hashApiKey } from "../domain/api-keys";
import { requireTenantContext } from "./context";

const NO_RIGHTS: FormState = { ok: false, message: "Nie masz uprawnień do zmiany ustawień." };
const DB_ERROR: FormState = { ok: false, message: "Nie udało się zapisać. Spróbuj ponownie." };

async function editor() {
  const ctx = await requireTenantContext();
  return { ctx, ok: canEdit(ctx.role), supabase: await createClient() };
}

// ---------- TYPY ADRESÓW DOSTAWY ----------
export async function savePointType(typeId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, ok, supabase } = await editor();
  if (!ok) return NO_RIGHTS;
  const parsed = pointTypeSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = parsed.data;
  if (typeId) {
    const { error } = await supabase
      .from("point_types")
      .update({ name: v.name, is_temporary: v.is_temporary, is_active: v.is_active })
      .eq("id", typeId)
      .eq("tenant_id", ctx.tenantId);
    if (error?.code === "23505") return { ok: false, fieldErrors: { name: ["Taki typ już jest"] }, message: "Popraw nazwę." };
    if (error) return DB_ERROR;
  } else {
    const code = `custom_${Date.now().toString(36)}`;
    const { error } = await supabase
      .from("point_types")
      .insert({ tenant_id: ctx.tenantId, code, name: v.name, is_temporary: v.is_temporary, is_active: true, sort: 80 });
    if (error?.code === "23505") return { ok: false, fieldErrors: { name: ["Taki typ już jest"] }, message: "Popraw nazwę." };
    if (error) return DB_ERROR;
  }
  revalidatePath("/ustawienia");
  return { ok: true, message: typeId ? "Zapisano typ." : "Dodano typ adresu." };
}

// ---------- DNI WOLNE I ZAMKNIĘCIA ----------
/** Zamknięcie całej firmy (pointId = null) albo jednego adresu dostawy w wybrany dzień. */
export async function addClosure(pointId: string | null, revalidate: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, ok, supabase } = await editor();
  if (!ok) return NO_RIGHTS;
  const parsed = closureSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  if (pointId) {
    const { data } = await supabase.from("delivery_points").select("id").eq("id", pointId).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!data) return { ok: false, message: "Nie znaleziono adresu." };
  }
  // jeden wpis na dzień: nadpisujemy (np. „pracujemy” → „zamknięte”)
  let del = supabase.from("delivery_point_exceptions").delete().eq("tenant_id", ctx.tenantId).eq("date", parsed.data.date);
  del = pointId ? del.eq("delivery_point_id", pointId) : del.is("delivery_point_id", null);
  await del;
  const { error } = await supabase.from("delivery_point_exceptions").insert({
    tenant_id: ctx.tenantId,
    delivery_point_id: pointId,
    date: parsed.data.date,
    is_closed: true,
    reason: parsed.data.reason,
  });
  if (error) return DB_ERROR;
  revalidatePath(revalidate);
  revalidatePath("/planowanie");
  return { ok: true, message: "Dodano dzień zamknięty." };
}

/** Święto ustawowe jako dzień pracujący (albo cofnięcie tej decyzji). */
export async function setHolidayWorking(date: string, working: boolean): Promise<void> {
  const { ctx, ok, supabase } = await editor();
  if (!ok || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await supabase.from("delivery_point_exceptions").delete().eq("tenant_id", ctx.tenantId).eq("date", date).is("delivery_point_id", null);
  if (working) {
    await supabase
      .from("delivery_point_exceptions")
      .insert({ tenant_id: ctx.tenantId, delivery_point_id: null, date, is_closed: false, reason: "Dzień pracujący mimo święta" });
  }
  revalidatePath("/ustawienia");
  revalidatePath("/planowanie");
}

export async function removeClosure(exceptionId: string, revalidate: string): Promise<void> {
  const { ctx, ok, supabase } = await editor();
  if (!ok) return;
  await supabase.from("delivery_point_exceptions").delete().eq("id", exceptionId).eq("tenant_id", ctx.tenantId);
  revalidatePath(revalidate);
  revalidatePath("/planowanie");
}

// ---------- KLUCZE API ----------
export type ApiKeyState = FormState & { key?: string };

export async function createApiKey(_prev: ApiKeyState, fd: FormData): Promise<ApiKeyState> {
  const ctx = await requireTenantContext();
  if (ctx.role !== "admin") return { ok: false, message: "Klucze API tworzy tylko administrator." };
  const name = apiKeyName(fd.get("name"));
  if (!name) return { ok: false, fieldErrors: { name: ["Nazwij klucz, np. „WF-Mag eksport”"] }, message: "Podaj nazwę klucza." };
  const { key, prefix } = generateApiKey();
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_api_keys").insert({
    tenant_id: ctx.tenantId,
    name,
    key_prefix: prefix,
    key_hash: hashApiKey(key),
    created_by: ctx.userId,
  });
  if (error) return { ok: false, message: "Nie udało się utworzyć klucza." };
  revalidatePath("/ustawienia");
  return { ok: true, message: "Klucz utworzony. Skopiuj go teraz — później nie będzie widoczny.", key };
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const ctx = await requireTenantContext();
  if (ctx.role !== "admin") return;
  const supabase = await createClient();
  await supabase.from("tenant_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", keyId).eq("tenant_id", ctx.tenantId);
  revalidatePath("/ustawienia");
}

// ---------- TYPY OPAKOWAŃ ZWROTNYCH ----------
export async function savePackagingType(typeId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, ok, supabase } = await editor();
  if (!ok) return NO_RIGHTS;
  const parsed = packagingTypeSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = parsed.data;
  const row = { code: v.code, name: v.name, deposit_value: v.deposit_value, is_active: typeId ? v.is_active : true };
  const { error } = typeId
    ? await supabase.from("packaging_types").update(row).eq("id", typeId).eq("tenant_id", ctx.tenantId)
    : await supabase.from("packaging_types").insert({ ...row, tenant_id: ctx.tenantId });
  if (error?.code === "23505") return { ok: false, fieldErrors: { code: ["Ten kod jest zajęty"] }, message: "Popraw kod." };
  if (error) return DB_ERROR;
  revalidatePath("/ustawienia");
  return { ok: true, message: typeId ? "Zapisano opakowanie." : "Dodano opakowanie." };
}
