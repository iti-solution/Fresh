"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TENANT_COOKIE } from "@/lib/env";
import type { FormState } from "@/lib/forms";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { PIN_RE } from "../domain/execution";
import { getTerminalTenant, setTerminalTenant } from "./terminal";

const driverEmail = (driverId: string) => `kierowca-${driverId}@kierowcy.example.com`;

/** Konto logowania kierowcy (bez e-maila — tylko PIN na terminalu) + członkostwo w firmie z rolą „kierowca”. */
async function ensureDriverAccount(driverId: string, tenantId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: d } = await admin.from("drivers").select("id, user_id, first_name, last_name").eq("id", driverId).eq("tenant_id", tenantId).maybeSingle();
  if (!d) return "Nie znaleziono kierowcy.";
  let userId = d.user_id;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: driverEmail(driverId),
      email_confirm: true,
      user_metadata: { driver_id: driverId, tenant_id: tenantId, name: `${d.first_name} ${d.last_name}` },
    });
    if (error || !data.user) return "Nie udało się utworzyć konta kierowcy.";
    userId = data.user.id;
    const { error: upErr } = await admin.from("drivers").update({ user_id: userId }).eq("id", driverId);
    if (upErr) return "Nie udało się podpiąć konta kierowcy.";
  }
  const { error: mErr } = await admin
    .from("memberships")
    .upsert({ tenant_id: tenantId, user_id: userId, role: "driver" }, { onConflict: "tenant_id,user_id", ignoreDuplicates: true });
  if (mErr) return "Nie udało się nadać roli kierowcy.";
  return null;
}

export async function setDriverPin(driverId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  if (!hasAdminKey()) return { ok: false, message: "Brak klucza serwerowego w konfiguracji Vercel (SUPABASE_SECRET_KEY)." };
  const pin = String(fd.get("pin") ?? "").trim();
  const pin2 = String(fd.get("pin2") ?? "").trim();
  if (!PIN_RE.test(pin)) return { ok: false, fieldErrors: { pin: ["PIN to 4–6 cyfr"] }, message: "Popraw PIN." };
  if (pin !== pin2) return { ok: false, fieldErrors: { pin2: ["PIN-y się różnią"] }, message: "Popraw PIN." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_driver_pin", { p_driver: driverId, p_pin: pin });
  if (error) return { ok: false, message: "Nie udało się ustawić PIN-u." };
  const accErr = await ensureDriverAccount(driverId, ctx.tenantId);
  if (accErr) return { ok: false, message: accErr };
  return { ok: true, message: "PIN ustawiony. Kierowca może zalogować się na terminalu." };
}

/** Admin/dyspozytor przypisuje ten telefon/terminal do firmy, a potem jest wylogowywany. */
export async function registerTerminal(): Promise<void> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) redirect("/driver/terminal?blad=uprawnienia");
  await setTerminalTenant(ctx.tenantId);
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(TENANT_COOKIE);
  redirect("/driver/login?terminal=1");
}

export async function driverLogin(driverId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const tenantId = await getTerminalTenant();
  if (!tenantId) return { ok: false, message: "Ten terminal nie jest przypisany do firmy." };
  const pin = String(fd.get("pin") ?? "");
  if (!PIN_RE.test(pin)) return { ok: false, message: "Wpisz PIN (4–6 cyfr)." };

  const admin = createAdminClient();
  const { data: d } = await admin.from("drivers").select("id, user_id, tenant_id").eq("id", driverId).eq("tenant_id", tenantId).maybeSingle();
  if (!d) return { ok: false, message: "Nie znaleziono kierowcy." };

  const { data: result, error } = await admin.rpc("verify_driver_pin", { p_driver: driverId, p_pin: pin });
  if (error) return { ok: false, message: "Nie udało się sprawdzić PIN-u. Spróbuj ponownie." };
  if (result === "locked") return { ok: false, message: "Za dużo błędnych prób. Spróbuj za 10 minut albo poproś dyspozytora o nowy PIN." };
  if (result !== "ok") return { ok: false, message: "Błędny PIN." };

  if (!d.user_id) {
    const accErr = await ensureDriverAccount(driverId, tenantId);
    if (accErr) return { ok: false, message: accErr };
  }
  const { data: fresh } = await admin.from("drivers").select("user_id").eq("id", driverId).single();
  const { data: u } = await admin.auth.admin.getUserById(fresh!.user_id!);
  const email = u.user?.email;
  if (!email) return { ok: false, message: "Konto kierowcy jest niekompletne — poproś dyspozytora o ponowne ustawienie PIN-u." };

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link.properties?.hashed_token) return { ok: false, message: "Nie udało się zalogować. Spróbuj ponownie." };
  const supabase = await createClient();
  const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (vErr) return { ok: false, message: "Nie udało się zalogować. Spróbuj ponownie." };

  (await cookies()).set(TENANT_COOKIE, tenantId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/driver");
}

export async function driverLogout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(TENANT_COOKIE);
  redirect("/driver/login");
}
