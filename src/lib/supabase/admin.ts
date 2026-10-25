import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Klient z kluczem serwerowym — OMIJA RLS. Używać wyłącznie po stronie serwera i tylko po sprawdzeniu
 * uprawnień w kodzie (np. że trasa należy do zalogowanego kierowcy). Nigdy nie przekazywać do przeglądarki.
 */
function rawKey(): string | undefined {
  return (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim() || undefined;
}

export function createAdminClient() {
  const key = rawKey();
  if (!key) throw new Error("Brak klucza serwerowego SUPABASE_SECRET_KEY w konfiguracji (Vercel → Environment Variables).");
  return createSupabaseClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hasAdminKey(): boolean {
  return Boolean(rawKey());
}

/** Rozpoznaje typowe pomyłki przy wklejaniu klucza do Vercela. Zwraca opis problemu albo null. */
export function adminKeyProblem(): string | null {
  if (SUPABASE_URL.startsWith("http://127.0.0.1") && rawKey()) return null; // lokalne testy
  return describeKeyProblem(rawKey());
}

export function describeKeyProblem(key: string | undefined): string | null {
  if (!key) return "Brak klucza SUPABASE_SECRET_KEY w Vercel.";
  if (key.startsWith("sb_publishable_")) return "W SUPABASE_SECRET_KEY jest klucz publiczny (sb_publishable_…). Wklej klucz sekretny (sb_secret_…).";
  if (key.startsWith("sb_secret_")) return null;
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { role?: string };
      if (payload.role === "anon") return "W SUPABASE_SECRET_KEY jest klucz „anon” (publiczny). Wklej klucz „service_role” albo sekretny (sb_secret_…).";
      if (payload.role === "service_role") return null;
    } catch {
      /* nieczytelny token — niżej */
    }
  }
  return "Klucz w SUPABASE_SECRET_KEY nie wygląda na klucz sekretny Supabase (powinien zaczynać się od sb_secret_…).";
}
