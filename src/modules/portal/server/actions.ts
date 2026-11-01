"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured, TENANT_COOKIE } from "@/lib/env";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { adminKeyProblem, createAdminClient } from "@/lib/supabase/admin";
import { audioExtension, audioProblem, portalMessageSchema } from "@/modules/intake/domain/intake";
import { createDraft } from "@/modules/intake/server/create-draft";
import { mergeCart, placeOrderSchema, PORTAL_ERRORS, portalErrorMessage } from "../domain/portal";
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

/** Gwiazdka w portalu: dodaje / usuwa produkt z ulubionych klienta. */
export async function toggleFavorite(productId: string, on: boolean): Promise<void> {
  const ctx = await requirePortalContext();
  const supabase = await createClient();
  if (on) {
    await supabase
      .from("customer_favorites")
      .upsert(
        { tenant_id: ctx.tenantId, customer_id: ctx.customerId, product_id: productId },
        { onConflict: "customer_id,product_id", ignoreDuplicates: true },
      );
  } else {
    await supabase.from("customer_favorites").delete().eq("customer_id", ctx.customerId).eq("product_id", productId);
  }
}

/**
 * Klient pisze albo nagrywa zamówienie własnymi słowami. Serwer zapisuje nagranie, rozpoznaje pozycje
 * i wysyła szkic do BOK — zamówieniem staje się dopiero po zatwierdzeniu przez człowieka.
 */
export async function submitPortalMessage(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requirePortalContext();
  const parsed = portalMessageSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error, parsed.error.issues[0]?.message ?? "Popraw zamówienie.");
  const v = parsed.data;
  const audio = fd.get("audio");
  const file = audio instanceof File && audio.size > 0 ? audio : null;
  const audioErr = audioProblem(file);
  if (audioErr) return { ok: false, message: audioErr };
  if (!v.body && !file) return { ok: false, message: "Napisz albo nagraj, czego potrzebujesz." };

  // Dostęp i termin sprawdzamy jako klient (RLS + funkcja bazy), dopiero potem zapis kluczem serwerowym
  const supabase = await createClient();
  const { data: point } = await supabase
    .from("delivery_points")
    .select("id, customer_id")
    .eq("id", v.delivery_point_id)
    .eq("customer_id", ctx.customerId)
    .eq("is_active", true)
    .maybeSingle();
  if (!point) return { ok: false, message: PORTAL_ERRORS.PORTAL_NO_ACCESS };
  const { data: allowed } = await supabase.rpc("portal_date_allowed", { p_point: point.id, p_date: v.delivery_date });
  if (!allowed) return { ok: false, message: PORTAL_ERRORS.PORTAL_DATE_NOT_ALLOWED };
  if (adminKeyProblem()) return { ok: false, message: "Portal chwilowo nie przyjmuje wiadomości. Zadzwoń do hurtowni." };

  const admin = createAdminClient();
  let audioPath: string | null = null;
  if (file) {
    audioPath = `${ctx.tenantId}/${ctx.customerId}/${crypto.randomUUID()}.${audioExtension(file.type)}`;
    const { error } = await admin.storage.from("order-audio").upload(audioPath, file, { contentType: file.type, upsert: false });
    if (error) return { ok: false, message: "Nie udało się wysłać nagrania. Spróbuj ponownie albo napisz zamówienie." };
  }

  const res = await createDraft(admin, {
    tenantId: ctx.tenantId,
    channel: "portal",
    sender: ctx.email,
    body: v.body || "(nagranie głosowe bez transkrypcji — odsłuchaj)",
    audioPath,
    createdBy: ctx.userId,
    customerId: ctx.customerId,
    pointId: point.id,
    deliveryDate: v.delivery_date,
  });
  if ("error" in res) return { ok: false, message: "Nie udało się wysłać zamówienia. Spróbuj ponownie." };
  revalidatePath("/portal");
  redirect(`/portal/wiadomosc/${res.draftId}?wyslano=1`);
}
