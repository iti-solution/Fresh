import type { Metadata } from "next";
import Link from "next/link";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader, Panel } from "@/components/panel/page";
import { Pill } from "@/components/ui/status";
import { formatPln } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { todayInWarsaw } from "@/modules/orders/domain/orders";
import { PAY_MODELS, readComponents, type PayComponents } from "@/modules/payroll/domain/payroll";
import { saveRule } from "@/modules/payroll/server/actions";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Stawki kierowców" };

function describe(c: PayComponents): string {
  const p = (g: number) => formatPln(g);
  return [
    c.daily_rate && `dniówka ${p(c.daily_rate)}`,
    c.per_km && `${p(c.per_km)}/km${c.km_threshold ? ` ponad ${c.km_threshold} km` : ""}`,
    c.per_stop && `${p(c.per_stop)}/punkt`,
    c.per_pallet && `${p(c.per_pallet)}/paleta`,
    c.per_extra_route && `${p(c.per_extra_route)}/kurs dodatkowy`,
    c.turnover_bp && `${c.turnover_bp / 100}% obrotu trasy`,
    c.delivered_value_bp && `${c.delivered_value_bp / 100}% wartości dostaw`,
    c.on_time_bonus && `premia ${p(c.on_time_bonus)} przy terminowości ≥ ${c.on_time_threshold_pct}%`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function RatesPage() {
  const ctx = await requireAccess("/rozliczenia");
  const db = await createClient();
  const [{ data: rules }, { data: drivers }] = await Promise.all([
    db.from("driver_pay_rules").select("id, driver_id, valid_from, valid_to, components").eq("tenant_id", ctx.tenantId).order("valid_from", { ascending: false }),
    db.from("drivers").select("id, first_name, last_name, is_active").eq("tenant_id", ctx.tenantId).order("last_name"),
  ]);
  const name = new Map((drivers ?? []).map((d) => [d.id, `${d.first_name} ${d.last_name}`]));
  const today = todayInWarsaw();
  const groups = new Map<string, NonNullable<typeof rules>>();
  for (const r of rules ?? []) groups.set(r.driver_id ?? "", [...(groups.get(r.driver_id ?? "") ?? []), r]);

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href="/rozliczenia" className="text-muted hover:text-foreground">
          ‹ Rozliczenia
        </Link>
      </nav>
      <PageHeader
        title="Stawki kierowców"
        description="Reguła domyślna obowiązuje wszystkich, reguła kierowcy ją zastępuje. Zmiana stawek = nowa wersja od wybranego dnia — rozliczenia za wcześniejsze dni się nie zmieniają."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Obowiązujące i historyczne" flush>
          {(rules ?? []).length === 0 && <p className="px-5 py-4 text-sm text-muted">Brak stawek. Dodaj regułę domyślną po prawej.</p>}
          {[...groups.entries()].map(([driverId, list]) => (
            <section key={driverId} className="border-t border-border first:border-t-0">
              <h3 className="bg-surface-2 px-5 py-1.5 text-xs font-semibold text-muted">{driverId ? name.get(driverId) ?? "kierowca" : "Domyślna (wszyscy kierowcy)"}</h3>
              <ul className="divide-y divide-border text-sm">
                {list.map((r) => {
                  const c = readComponents(r.components);
                  const active = r.valid_from <= today && (!r.valid_to || r.valid_to >= today);
                  return (
                    <li key={r.id} className="px-5 py-2.5">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name || "bez nazwy"}</span>
                        <Pill tone={c.model === "delivery" ? "info" : "neutral"} dot={false}>
                          {PAY_MODELS[c.model]}
                        </Pill>
                        {active && <Pill tone="success">obowiązuje</Pill>}
                        <span className="text-xs text-muted tabular-nums">
                          od {r.valid_from}
                          {r.valid_to ? ` do ${r.valid_to}` : ""}
                        </span>
                      </p>
                      <p className="text-xs text-muted">{describe(c) || "bez składników"}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </Panel>
        {ctx.role === "admin" ? (
          <FormRenderer
            action={saveRule}
            submitLabel="Zapisz stawki"
            sections={[
              {
                title: "Nowa reguła / nowa wersja",
                fields: [
                  { kind: "text", name: "name", label: "Nazwa", required: true, span: 2, placeholder: "np. Etat — trasy stałe" },
                  {
                    kind: "select",
                    name: "model",
                    label: "Model",
                    defaultValue: "employee",
                    options: Object.entries(PAY_MODELS).map(([value, label]) => ({ value, label })),
                  },
                  {
                    kind: "select",
                    name: "driver_id",
                    label: "Dla kogo",
                    emptyLabel: "Domyślna — wszyscy kierowcy",
                    options: (drivers ?? []).filter((d) => d.is_active).map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` })),
                    span: 2,
                  },
                  { kind: "date", name: "valid_from", label: "Obowiązuje od", defaultValue: `${today.slice(0, 7)}-01`, required: true },
                ],
              },
              {
                title: "Etat",
                description: "Dniówka liczona raz na dzień pracy. Kilometrówka od km ponad próg (suma km z kursów w dniu).",
                fields: [
                  { kind: "number", name: "daily_rate", label: "Dniówka", suffix: "zł" },
                  { kind: "number", name: "per_km", label: "Za km", suffix: "zł", step: "0.01" },
                  { kind: "number", name: "km_threshold", label: "Próg km w dniówce", suffix: "km" },
                  { kind: "number", name: "on_time_bonus", label: "Premia za terminowość (dzień)", suffix: "zł" },
                  { kind: "number", name: "on_time_threshold_pct", label: "Próg terminowości", suffix: "%", defaultValue: 95 },
                ],
              },
              {
                title: "Dowóz i dodatki",
                description: "Obrót trasy = wartość wszystkich zamówień na trasie. Wartość dostaw = tylko dostarczone. Kierowca nie widzi obrotu, tylko swoją kwotę.",
                fields: [
                  { kind: "number", name: "per_stop", label: "Za zrealizowany punkt", suffix: "zł", step: "0.01" },
                  { kind: "number", name: "per_pallet", label: "Za paletę", suffix: "zł", step: "0.01" },
                  { kind: "number", name: "per_extra_route", label: "Za kurs dodatkowy", suffix: "zł" },
                  { kind: "number", name: "turnover_pct", label: "% od obrotu trasy", suffix: "%", step: "0.01" },
                  { kind: "number", name: "delivered_value_pct", label: "% od wartości dostaw", suffix: "%", step: "0.01" },
                ],
              },
            ]}
          />
        ) : (
          <Panel>
            <p className="text-sm text-muted">Stawki zmienia administrator.</p>
          </Panel>
        )}
      </div>
    </>
  );
}
