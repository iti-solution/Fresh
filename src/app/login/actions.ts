"use server";

import { headers } from "next/headers";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/modules/tenancy/domain/access";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!EMAIL_RE.test(email)) return { status: "error", message: "Podaj poprawny adres e-mail.", email };
  if (!isSupabaseConfigured) {
    return { status: "error", message: "Aplikacja nie jest połączona z bazą (brak kluczy Supabase).", email };
  }

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const redirectTo = `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) {
    const tooMany = error.status === 429;
    return {
      status: "error",
      message: tooMany
        ? "Za dużo prób w krótkim czasie. Odczekaj kilka minut i spróbuj ponownie."
        : "Nie udało się wysłać linku. Sprawdź adres i spróbuj ponownie.",
      email,
    };
  }
  return { status: "sent", email };
}
