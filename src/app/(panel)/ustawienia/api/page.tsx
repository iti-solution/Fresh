import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/panel/page";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { requireAccess } from "@/modules/tenancy/server/context";
import { revokeApiKey } from "@/modules/tenancy/server/settings-actions";
import { ApiKeyForm } from "@/modules/tenancy/ui/api-key-form";

const d = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export const metadata: Metadata = { title: "Ustawienia API" };

export default async function Page() {
  const ctx = await requireAccess("/ustawienia/api");
  const supabase = await createClient();
  const keysRes = await supabase
    .from("tenant_api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });
  if (keysRes.error) throw keysRes.error;

  return (
    <>
      <PageHeader title="Ustawienia API" description="Klucze do integracji z ERP/WMS. Ten obszar dokończymy w kolejnym kroku." />
          <Panel
            title="Integracja z ERP / WMS (API)"
            description="Klucz pozwala Twojemu systemowi wysyłać zamówienia do aplikacji — te same reguły co import z pliku."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <ApiKeyForm />
                <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                  {(keysRes.data ?? []).length === 0 && <li className="px-3 py-2 text-muted">Brak kluczy.</li>}
                  {(keysRes.data ?? []).map((k) => (
                    <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>
                        <span className="font-medium">{k.name}</span>{" "}
                        <code className="font-mono text-xs text-muted">{k.key_prefix}…</code>{" "}
                        {k.revoked_at ? (
                          <Pill tone="danger">wyłączony</Pill>
                        ) : (
                          <Pill tone="success">{k.last_used_at ? `użyty ${d(k.last_used_at.slice(0, 10))}` : "nieużywany"}</Pill>
                        )}
                      </span>
                      {!k.revoked_at && (
                        <form action={revokeApiKey.bind(null, k.id)}>
                          <Button size="xs" variant="ghost">
                            Wyłącz
                          </Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-sm">
                <p className="font-medium">Jak wysłać zamówienia</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-ink-foreground">{`POST /api/v1/orders
Authorization: Bearer drv_…
Content-Type: application/json

{ "orders": [ {
  "external_ref": "WZ/2026/11/0042",
  "delivery_date": "2026-11-06",
  "customer_code": "K0142",
  "point_code": "K0142-01",
  "weight_kg": 180, "pallets": 1,
  "crates": 12, "order_value": 1840.50,
  "cod_amount": 0,
  "window_start": "06:00", "window_end": "08:00",
  "readiness": "awaiting_warehouse"
} ] }`}</pre>
                <p className="mt-2 text-xs text-muted">
                  Dopasowanie: najpierw kod adresu (<code>point_code</code>), potem kod klienta, na końcu adres. Zamówienie z tym
                  samym numerem i dniem zostanie zaktualizowane (np. zmiana gotowości z magazynu). Niedopasowane trafią na listę
                  „Do dopasowania”.
                </p>
              </div>
            </div>
          </Panel>

    </>
  );
}
