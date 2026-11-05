import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { apiOrderToRow, IDENTITY_MAPPING } from "@/modules/orders/domain/import";
import { nextWorkingDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { runOrderImport } from "@/modules/orders/server/import";
import { apiKeyFromHeaders, hashApiKey } from "@/modules/tenancy/domain/api-keys";

// M1.6 — zamówienia z ERP/WMS. Te same reguły co import z pliku (dopasowanie, aktualizacja po numerze i dniu).
// Klucz API firmy w nagłówku `Authorization: Bearer drv_…`. W bazie tylko jego skrót.

const MAX_ORDERS = 2000;

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const key = apiKeyFromHeaders((n) => request.headers.get(n));
  if (!key) return json(401, { error: "missing_api_key", message: "Brak klucza API (Authorization: Bearer drv_…)." });
  if (!hasAdminKey()) return json(503, { error: "server_not_configured" });

  const admin = createAdminClient();
  const { data: apiKey } = await admin
    .from("tenant_api_keys")
    .select("id, tenant_id, revoked_at")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();
  if (!apiKey || apiKey.revoked_at) return json(401, { error: "invalid_api_key", message: "Nieznany albo wyłączony klucz API." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json", message: "Treść żądania musi być poprawnym JSON-em." });
  }
  const list = Array.isArray(body) ? body : (body as { orders?: unknown })?.orders;
  if (!Array.isArray(list) || list.length === 0) return json(400, { error: "no_orders", message: "Podaj tablicę `orders`." });
  if (list.length > MAX_ORDERS)
    return json(413, { error: "too_many_orders", message: `Maksymalnie ${MAX_ORDERS} zamówień w jednym żądaniu.` });
  if (!list.every((o) => o && typeof o === "object" && !Array.isArray(o)))
    return json(400, { error: "invalid_order", message: "Każde zamówienie musi być obiektem." });

  await admin.from("tenant_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);
  const result = await runOrderImport(admin, {
    tenantId: apiKey.tenant_id,
    userId: null,
    rows: (list as Record<string, unknown>[]).map(apiOrderToRow),
    mapping: IDENTITY_MAPPING,
    defaultDate: nextWorkingDay(todayInWarsaw()),
    source: "api",
    fileName: "API",
    firstLine: 1,
  });
  // „line” = pozycja w tablicy `orders` (od 1)
  return json(200, { import_id: result.importId, summary: result.summary, issues: result.issues });
}
