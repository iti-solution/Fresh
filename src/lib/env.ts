// Publiczne zmienne środowiskowe (bezpieczne w przeglądarce).
// Klucz service_role NIGDY nie trafia tutaj — tylko do kodu serwerowego w późniejszych etapach.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = SUPABASE_URL !== "" && SUPABASE_PUBLISHABLE_KEY !== "";

export const TENANT_COOKIE = "fresh_tenant";
