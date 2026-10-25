import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Klient z kluczem serwerowym — OMIJA RLS. Używać wyłącznie po stronie serwera i tylko po sprawdzeniu
 * uprawnień w kodzie (np. że trasa należy do zalogowanego kierowcy). Nigdy nie przekazywać do przeglądarki.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Brak klucza serwerowego SUPABASE_SECRET_KEY w konfiguracji (Vercel → Environment Variables).");
  return createSupabaseClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hasAdminKey(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
}
