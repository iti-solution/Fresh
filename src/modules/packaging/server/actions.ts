"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseCash } from "@/modules/execution/domain/execution";
import { recomputeSettlement } from "@/modules/payroll/server/settlement";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/forms";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { CORRECTION_REASONS, type CorrectionReason } from "../domain/ledger";

const CLOSE_ERRORS: Record<string, string> = {
  CLOSE_NO_ACCESS: "Nie masz uprawnień do zamknięcia tej trasy.",
  CLOSE_ALREADY_CLOSED: "Trasa jest już zamknięta.",
  CLOSE_NOT_STARTED: "Trasa nie została rozpoczęta.",
  CLOSE_NO_DRIVER: "Trasa nie ma kierowcy.",
  CLOSE_ODOMETER: "Kierowca nie zakończył zmiany — wpisz stan licznika na koniec (nie mniejszy niż startowy).",
  CLOSE_BAD_QTY: "Popraw liczby opakowań.",
  CLOSE_BAD_CASH: "Popraw kwotę gotówki.",
};

/** M5.5 — zamknięcie trasy przez dyspozytora: przyjęcie opakowań i gotówki, wynagrodzenie dnia do rozliczenia. */
export async function closeRoute(routeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  const db = await createClient();
  const { data: types } = await db.from("packaging_types").select("id").eq("tenant_id", ctx.tenantId);
  const packaging = [];
  for (const t of types ?? []) {
    const raw = String(fd.get(`recv_${t.id}`) ?? "").trim();
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { ok: false, fieldErrors: { [`recv_${t.id}`]: ["Liczba całkowita"] }, message: "Popraw liczby opakowań." };
    packaging.push({ type_id: t.id, received: n });
  }
  const cashRaw = String(fd.get("cash_received") ?? "").trim();
  const cash = cashRaw === "" ? 0 : parseCash(cashRaw);
  if (cash === null) return { ok: false, fieldErrors: { cash_received: ["Kwota w zł, np. 640,50"] }, message: "Popraw kwotę." };
  const odoRaw = String(fd.get("odometer_end") ?? "").trim();
  const odo = odoRaw === "" ? null : Number(odoRaw);
  if (odo !== null && (!Number.isInteger(odo) || odo < 0)) return { ok: false, fieldErrors: { odometer_end: ["Same cyfry"] }, message: "Popraw licznik." };
  const note = String(fd.get("note") ?? "").slice(0, 500);

  const { data, error } = await db.rpc("close_route", {
    p_route: routeId,
    p_cash_received: cash / 100,
    p_packaging: packaging,
    p_odometer_end: odo ?? undefined,
    p_note: note,
    p_report: {},
  });
  if (error) {
    const code = Object.keys(CLOSE_ERRORS).find((k) => error.message.includes(k));
    return { ok: false, message: code ? CLOSE_ERRORS[code] : "Nie udało się zamknąć trasy." };
  }
  const res = data as { driver_id: string; route_date: string };
  // rozliczenie dzienne: od razu przeliczamy miesiąc kierowcy (kwoty widać w Rozliczeniach)
  await recomputeSettlement(db, ctx.tenantId, res.driver_id, res.route_date.slice(0, 7)).catch(() => undefined);
  revalidatePath("/centrum");
  revalidatePath("/opakowania");
  revalidatePath("/rozliczenia");
  redirect(`/rozliczenia/zamkniecie/${routeId}?zamknieto=1`);
}

/** M5.2 — korekta salda opakowań z powodem (uszkodzenie, inwentaryzacja). Para z magazynem, księga bez nadpisywania. */
export async function addPackagingCorrection(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  const partyType = String(fd.get("party_type") ?? "");
  const partyId = String(fd.get("party_id") ?? "");
  const typeId = String(fd.get("packaging_type_id") ?? "");
  const reason = String(fd.get("reason") ?? "") as CorrectionReason;
  const qty = Number(String(fd.get("qty") ?? "").replace(/\s/g, ""));
  const note = String(fd.get("note") ?? "").trim();
  if (!["customer", "driver"].includes(partyType) || !partyId) return { ok: false, message: "Wybierz klienta albo kierowcę." };
  if (!CORRECTION_REASONS.includes(reason)) return { ok: false, message: "Wybierz powód." };
  if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 100000) return { ok: false, fieldErrors: { qty: ["Liczba ≠ 0, np. -3"] }, message: "Popraw ilość." };
  if (note.length < 3) return { ok: false, fieldErrors: { note: ["Opisz korektę"] }, message: "Podaj opis." };
  const db = await createClient();
  const table = partyType === "customer" ? "customers" : "drivers";
  const [{ data: party }, { data: type }] = await Promise.all([
    db.from(table).select("id").eq("id", partyId).eq("tenant_id", ctx.tenantId).maybeSingle(),
    db.from("packaging_types").select("id").eq("id", typeId).eq("tenant_id", ctx.tenantId).maybeSingle(),
  ]);
  if (!party || !type) return { ok: false, message: "Nie znaleziono strony albo typu opakowania." };
  const g = randomUUID();
  const common = { tenant_id: ctx.tenantId, movement_group: g, packaging_type_id: typeId, reason, note, created_by: ctx.userId };
  const { error } = await db.from("packaging_movements").insert([
    { ...common, party_type: partyType as "customer", party_id: partyId, qty },
    { ...common, party_type: "depot" as const, party_id: ctx.tenantId, qty: -qty },
  ]);
  if (error) return { ok: false, message: "Nie udało się zapisać korekty." };
  revalidatePath("/opakowania");
  return { ok: true, message: "Zapisano korektę." };
}

/** M5.2a — korekta gotówki kierowcy (np. wyjaśniona różnica kasowa). */
export async function addCashCorrection(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  const driverId = String(fd.get("driver_id") ?? "");
  const raw = String(fd.get("amount") ?? "").replace(/\s/g, "").replace(",", ".");
  const amount = Number(raw);
  const note = String(fd.get("note") ?? "").trim();
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return { ok: false, fieldErrors: { amount: ["Kwota ≠ 0"] }, message: "Popraw kwotę." };
  if (note.length < 3) return { ok: false, fieldErrors: { note: ["Opisz korektę"] }, message: "Podaj opis." };
  const db = await createClient();
  const { data: d } = await db.from("drivers").select("id").eq("id", driverId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!d) return { ok: false, message: "Wybierz kierowcę." };
  const g = randomUUID();
  const a = Math.round(amount * 100) / 100;
  const common = { tenant_id: ctx.tenantId, movement_group: g, reason: "correction", note, created_by: ctx.userId };
  const { error } = await db.from("cash_movements").insert([
    { ...common, party_type: "driver" as const, party_id: driverId, amount: a },
    { ...common, party_type: "office" as const, party_id: null, amount: -a },
  ]);
  if (error) return { ok: false, message: "Nie udało się zapisać korekty." };
  revalidatePath("/opakowania");
  revalidatePath("/centrum");
  return { ok: true, message: "Zapisano korektę gotówki." };
}
