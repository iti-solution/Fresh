"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured, TENANT_COOKIE } from "@/lib/env";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { mergeCart, placeOrderSchema, portalErrorMessage } from "../domain/portal";
import { requirePortalContext } from "./context";

export type PortalLoginState = { error?: string; email?: string };

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/** Logowanie klienta: e-mail + hasło nadane przez hurtownię. */
export async function portalLogin(_prev: PortalLoginState, fd: FormData): Promise<PortalLoginState> {
  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Podaj e-mail i hasło.", email };
  if (!isSupabaseConfigured) return { error: "Portal nie jest połączony z bazą.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return {
      error: error?.status === 429 ? "Za dużo prób. Odczekaj kilka minut." : "Nieprawidłowy e-mail lub hasło.",
      email,
    };
  }
  const { data: links } = await supabase
    .from("customer_portal_users")
    .select("tenant_id")
    .eq("user_id", data.user.id)
    .eq("is_active", true);
  if (!links?.length) {
    await supabase.auth.signOut();
    return { error: "To konto nie ma aktywnego dostępu do portalu zamówień. Skontaktuj się z hurtownią.", email };
  }
  (await cookies()).set(TENANT_COOKIE, links[0].tenant_id, COOKIE_OPTS);
  redirect("/portal");
}

export async function portalLogout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(TENANT_COOKIE);
  redirect("/portal/login");
}

/** Złożenie zamówienia: walidacja tutaj (czytelne błędy), a dostęp, termin i ceny sprawdza baza. */
export async function placePortalOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  await requirePortalContext();
  const parsed = placeOrderSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error, parsed.error.issues[0]?.message ?? "Popraw zamówienie.");
  const v = parsed.data;
  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("portal_place_order", {
    p_point: v.delivery_point_id,
    p_date: v.delivery_date,
    p_lines: mergeCart(v.lines),
    p_note: v.note ?? undefined,
  });
  if (error || !orderId) return { ok: false, message: portalErrorMessage(error?.message) };
  revalidatePath("/portal");
  redirect(`/portal/zamowienie/${orderId}?nowe=1`);
}

export async function cancelPortalOrder(orderId: string): Promise<void> {
  await requirePortalContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_cancel_order", { p_order: orderId });
  revalidatePath("/portal");
  redirect(`/portal/zamowienie/${orderId}${error ? "?blad=anulowanie" : "?anulowano=1"}`);
}
