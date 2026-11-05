import type { Metadata } from "next";
import { InlineForm } from "@/components/forms/inline-form";
import { PageHeader, Panel } from "@/components/panel/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Pill } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { holidaysBetween } from "@/modules/masterdata/domain/holidays";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";
import {
  addClosure,
  removeClosure,
  revokeApiKey,
  savePackagingType,
  savePointType,
  setHolidayWorking,
} from "@/modules/tenancy/server/settings-actions";
import { ApiKeyForm } from "@/modules/tenancy/ui/api-key-form";

export const metadata: Metadata = { title: "Ustawienia" };

const d = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export default async function SettingsPage() {
  const ctx = await requireAccess("/ustawienia");
  const editable = canEdit(ctx.role);
  const isAdmin = ctx.role === "admin";
  const supabase = await createClient();
  const today = todayInWarsaw();
  const horizon = shiftDay(today, 366);

  const [typesRes, countsRes, excRes, keysRes, packRes] = await Promise.all([
    supabase.from("point_types").select("id, name, is_temporary, is_active, sort").eq("tenant_id", ctx.tenantId).order("sort").order("name"),
    supabase.from("delivery_points").select("point_type_id").eq("tenant_id", ctx.tenantId),
    supabase
      .from("delivery_point_exceptions")
      .select("id, date, is_closed, reason")
      .eq("tenant_id", ctx.tenantId)
      .is("delivery_point_id", null)
      .gte("date", today)
      .order("date"),
    isAdmin
      ? supabase
          .from("tenant_api_keys")
          .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
          .eq("tenant_id", ctx.tenantId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("packaging_types").select("id, code, name, deposit_value, is_active").eq("tenant_id", ctx.tenantId).order("code"),
  ]);
  for (const r of [typesRes, countsRes, excRes, keysRes, packRes]) if (r.error) throw r.error;

  const count = new Map<string, number>();
  for (const p of countsRes.data ?? []) if (p.point_type_id) count.set(p.point_type_id, (count.get(p.point_type_id) ?? 0) + 1);
  const exceptions = excRes.data ?? [];
  const holidays = holidaysBetween(today, horizon);
  const holidayDates = new Set(holidays.map((h) => h.date));
  const working = new Set(exceptions.filter((e) => !e.is_closed).map((e) => e.date));
  const companyClosures = exceptions.filter((e) => e.is_closed && !holidayDates.has(e.date));

  return (
    <>
      <PageHeader title="Ustawienia" description="Typy adresów dostawy, dni wolne firmy i klucze do integracji z ERP/WMS." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Typy adresów dostawy"
          description="Dopasuj listę do swoich odbiorców. „Adres tymczasowy” (np. budowa) pokazuje daty czynności i osobę na miejscu."
          flush
        >
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Typ</th>
                <th className="px-4 py-2 font-medium">Adresów</th>
                <th className="px-4 py-2 font-medium">Zmień</th>
              </tr>
            </thead>
            <tbody>
              {(typesRes.data ?? []).map((t) => (
                <tr key={t.id} className="border-t border-border align-top">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{t.name}</span>{" "}
                    {t.is_temporary && <Pill tone="warning">tymczasowy</Pill>}{" "}
                    {!t.is_active && <Pill>ukryty</Pill>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{count.get(t.id) ?? 0}</td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <InlineForm action={savePointType.bind(null, t.id)} submitLabel="Zapisz" variant="outline" resetOnSuccess={false}>
                        <Input name="name" defaultValue={t.name} aria-label="Nazwa typu" className="h-8 w-44" />
                        <label className="flex h-8 items-center gap-1.5 text-xs">
                          <input type="checkbox" name="is_temporary" defaultChecked={t.is_temporary} /> tymczasowy
                        </label>
                        <label className="flex h-8 items-center gap-1.5 text-xs">
                          <input type="checkbox" name="is_active" defaultChecked={t.is_active} /> w użyciu
                        </label>
                      </InlineForm>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && (
            <div className="border-t border-border p-4">
              <InlineForm action={savePointType.bind(null, null)} submitLabel="Dodaj typ">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Nowy typ
                  <Input name="name" placeholder="np. Hotel, Szkoła, Plac budowy" className="w-64" />
                </label>
                <label className="flex h-8 items-center gap-1.5 text-xs">
                  <input type="checkbox" name="is_temporary" /> adres tymczasowy
                </label>
              </InlineForm>
            </div>
          )}
        </Panel>

        <Panel
          title="Dni wolne i święta"
          description="Święta ustawowe są wbudowane. W planowaniu dzień zamknięty jest oznaczony alarmem, a portal klienta nie pozwoli na niego zamówić."
          flush
        >
          <ul className="divide-y divide-border text-sm">
            {holidays.map((h) => {
              const isWorking = working.has(h.date);
              return (
                <li key={h.date} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span>
                    <span className="tabular-nums text-muted">{formatDayLabel(h.date)}.{h.date.slice(0, 4)}</span> · {h.name}{" "}
                    {isWorking ? <Pill tone="success">pracujemy</Pill> : <Pill tone="danger">nie wozimy</Pill>}
                  </span>
                  {editable && (
                    <form action={setHolidayWorking.bind(null, h.date, !isWorking)}>
                      <Button size="xs" variant="ghost">
                        {isWorking ? "Jednak wolne" : "Pracujemy w ten dzień"}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
            {companyClosures.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 bg-warning-soft/40 px-4 py-2">
                <span>
                  <span className="tabular-nums text-muted">{d(e.date)}</span> · {e.reason} <Pill tone="warning">zamknięte</Pill>
                </span>
                {editable && (
                  <form action={removeClosure.bind(null, e.id, "/ustawienia")}>
                    <Button size="xs" variant="ghost">
                      Usuń
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <div className="border-t border-border p-4">
              <InlineForm action={addClosure.bind(null, null, "/ustawienia")} submitLabel="Dodaj dzień zamknięty">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Data
                  <Input type="date" name="date" min={today} className="w-40" />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Powód
                  <Input name="reason" placeholder="np. inwentaryzacja" className="w-56" />
                </label>
              </InlineForm>
              <p className="mt-2 text-xs text-muted">Zamknięcie pojedynczego adresu (remont, urlop klienta) dodasz na karcie klienta.</p>
            </div>
          )}
        </Panel>

        <Panel
          title="Opakowania zwrotne"
          description="Palety, skrzynki, kegi… Kierowca wpisuje wydane i odebrane na punkcie, a saldo i kaucja liczą się same."
          flush
        >
          <ul className="divide-y divide-border text-sm">
            {(packRes.data ?? []).length === 0 && <li className="px-4 py-3 text-muted">Brak typów opakowań.</li>}
            {(packRes.data ?? []).map((t) => (
              <li key={t.id} className="px-4 py-2">
                {editable ? (
                  <InlineForm action={savePackagingType.bind(null, t.id)} submitLabel="Zapisz" variant="outline" resetOnSuccess={false}>
                    <Input name="code" defaultValue={t.code} aria-label="Kod" className="h-8 w-28 font-mono" />
                    <Input name="name" defaultValue={t.name} aria-label="Nazwa" className="h-8 w-48" />
                    <Input name="deposit_value" defaultValue={t.deposit_value ?? ""} aria-label="Kaucja (zł)" placeholder="kaucja zł" className="h-8 w-28" />
                    <label className="flex h-8 items-center gap-1.5 text-xs">
                      <input type="checkbox" name="is_active" defaultChecked={t.is_active} /> w użyciu
                    </label>
                  </InlineForm>
                ) : (
                  <span>
                    <code className="font-mono">{t.code}</code> {t.name} {t.deposit_value ? `· kaucja ${t.deposit_value} zł` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <div className="border-t border-border p-4">
              <InlineForm action={savePackagingType.bind(null, null)} submitLabel="Dodaj opakowanie">
                <Input name="code" placeholder="kod, np. EUR" aria-label="Kod" className="w-28 font-mono" />
                <Input name="name" placeholder="nazwa, np. Paleta EUR" aria-label="Nazwa" className="w-48" />
                <Input name="deposit_value" placeholder="kaucja zł" aria-label="Kaucja (zł)" className="w-28" />
              </InlineForm>
            </div>
          )}
        </Panel>

        {isAdmin && (
          <Panel
            title="Integracja z ERP / WMS (API)"
            description="Klucz pozwala Twojemu systemowi wysyłać zamówienia do aplikacji — te same reguły co import z pliku."
            className="xl:col-span-2"
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
        )}
      </div>
    </>
  );
}
