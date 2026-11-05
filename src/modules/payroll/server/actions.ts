"use server";

import { revalidatePath } from "next/cache";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { closePreviousVersion, readComponents, ruleFormSchema } from "../domain/payroll";
import { driversWithRoutes, recomputeSettlement, refreshTotal } from "./settlement";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NO_RIGHTS: FormState = { ok: false, message: "Nie masz uprawnień." };

async function editor() {
  const ctx = await requireTenantContext();
  return { ctx, ok: canEdit(ctx.role), db: await createClient() };
}

/** Nowa wersja reguły wynagrodzeń (domyślnej albo dla kierowcy). Poprzednia wersja kończy się dzień wcześniej. */
export async function saveRule(_prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, db } = await editor();
  if (ctx.role !== "admin") return { ok: false, message: "Stawki ustawia administrator." };
  const parsed = ruleFormSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = parsed.data;
  if (v.driver_id) {
    const { data } = await db.from("drivers").select("id").eq("id", v.driver_id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!data) return { ok: false, message: "Nie znaleziono kierowcy." };
  }
  const { data: rules } = await db.from("driver_pay_rules").select("id, driver_id, valid_from, valid_to, components").eq("tenant_id", ctx.tenantId);
  const rows = (rules ?? []).map((r) => ({ ...r, components: readComponents(r.components) }));
  if (rows.some((r) => r.driver_id === v.driver_id && r.valid_from === v.valid_from))
    return { ok: false, fieldErrors: { valid_from: ["Wersja od tego dnia już jest — wybierz inną datę"] }, message: "Popraw datę." };
  for (const c of closePreviousVersion(rows, v.driver_id, v.valid_from)) {
    await db.from("driver_pay_rules").update({ valid_to: c.valid_to }).eq("id", c.id).eq("tenant_id", ctx.tenantId);
  }
  // nowa wersja kończy się przed kolejną, jeśli ta już istnieje (wstawianie wstecz)
  const later = rows.filter((r) => r.driver_id === v.driver_id && r.valid_from > v.valid_from).sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0];
  let validTo: string | null = null;
  if (later) {
    const d = new Date(`${later.valid_from}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    validTo = d.toISOString().slice(0, 10);
  }
  const { error } = await db.from("driver_pay_rules").insert({
    tenant_id: ctx.tenantId,
    driver_id: v.driver_id,
    valid_from: v.valid_from,
    valid_to: validTo,
    components: v.components as never,
  });
  if (error) return { ok: false, message: "Nie udało się zapisać reguły." };
  revalidatePath("/rozliczenia");
  return { ok: true, message: `Zapisano stawki „${v.components.name}” od ${v.valid_from}. Przelicz otwarte miesiące, żeby je uwzględnić.` };
}

export async function recomputeMonth(month: string): Promise<void> {
  const { ctx, ok, db } = await editor();
  if (!ok || !MONTH_RE.test(month)) return;
  for (const driverId of await driversWithRoutes(db, ctx.tenantId, month)) await recomputeSettlement(db, ctx.tenantId, driverId, month);
  revalidatePath("/rozliczenia");
}

export async function recomputeDriver(driverId: string, month: string): Promise<void> {
  const { ctx, ok, db } = await editor();
  if (!ok || !MONTH_RE.test(month)) return;
  await recomputeSettlement(db, ctx.tenantId, driverId, month);
  revalidatePath("/rozliczenia");
}

/** Dodatek ręczny (premia uznaniowa, potrącenie) — zawsze z opisem. */
export async function addManualLine(settlementId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx, ok, db } = await editor();
  if (!ok) return NO_RIGHTS;
  const note = String(fd.get("note") ?? "").trim();
  const date = String(fd.get("date") ?? "");
  const amount = Number(String(fd.get("amount") ?? "").replace(/\s/g, "").replace(",", "."));
  if (note.length < 3) return { ok: false, fieldErrors: { note: ["Opisz, za co"] }, message: "Podaj opis dodatku." };
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) return { ok: false, fieldErrors: { amount: ["Kwota ≠ 0, np. 150 albo -50"] }, message: "Popraw kwotę." };
  const { data: s } = await db.from("driver_settlements").select("id, status, period_start, period_end").eq("id", settlementId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!s) return { ok: false, message: "Nie znaleziono rozliczenia." };
  if (s.status !== "draft") return { ok: false, message: "Rozliczenie jest zatwierdzone." };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= s.period_start && date <= s.period_end ? date : s.period_end;
  const { error } = await db.from("driver_settlement_lines").insert({
    tenant_id: ctx.tenantId,
    settlement_id: s.id,
    work_date: day,
    component: "manual",
    code: "manual",
    label: amount > 0 ? "Dodatek ręczny" : "Potrącenie",
    quantity: 1,
    rate: Math.round(amount * 100) / 100,
    amount: Math.round(amount * 100) / 100,
    note,
    is_manual: true,
    created_by: ctx.userId,
  });
  if (error) return { ok: false, message: "Nie udało się dodać pozycji." };
  await refreshTotal(db, s.id);
  revalidatePath("/rozliczenia");
  return { ok: true, message: "Dodano pozycję." };
}

export async function deleteManualLine(lineId: string, settlementId: string): Promise<void> {
  const { ctx, ok, db } = await editor();
  if (!ok) return;
  await db.from("driver_settlement_lines").delete().eq("id", lineId).eq("tenant_id", ctx.tenantId).eq("is_manual", true);
  await refreshTotal(db, settlementId);
  revalidatePath("/rozliczenia");
}

/** Zatwierdzenie przez kierownika (admin): rozliczenie zamrożone do eksportu dla kadr. */
export async function approveSettlement(settlementId: string, approve: boolean): Promise<void> {
  const ctx = await requireTenantContext();
  if (ctx.role !== "admin") return;
  const db = await createClient();
  await db
    .from("driver_settlements")
    .update(approve ? { status: "approved", approved_by: ctx.userId, approved_at: new Date().toISOString() } : { status: "draft", approved_by: null, approved_at: null })
    .eq("id", settlementId)
    .eq("tenant_id", ctx.tenantId);
  revalidatePath("/rozliczenia");
}
