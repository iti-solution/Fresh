import { ArrowDown, ArrowDownWideNarrow, ArrowUp, ChevronLeft, MapPin, Plus, Search, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IconSubmit } from "@/components/forms/auto-submit-select";
import { FormRenderer } from "@/components/forms/form-renderer";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearch } from "@/modules/ops/domain/reports";
import { BRANCH_LABELS, formatTime } from "@/modules/masterdata/domain/format";
import {
  addTemplatePoints,
  moveTemplatePoint,
  removeTemplatePoint,
  saveTemplate,
  sortTemplateByWindow,
} from "@/modules/masterdata/server/actions";
import { templateSections } from "@/modules/masterdata/ui/field-defs";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Szablon trasy" };

type Win = { weekday: number; opens_at: string; closes_at: string };
const windowFor = (wins: Win[], weekday: number) => {
  const w = wins.filter((x) => x.weekday === weekday).sort((a, b) => a.opens_at.localeCompare(b.opens_at));
  return w.length ? w.map((x) => `${formatTime(x.opens_at)}–${formatTime(x.closes_at)}`).join(", ") : "—";
};

export default async function TemplatePage({ params, searchParams }: PageProps<"/kartoteki/szablony/[id]">) {
  const ctx = await requireAccess("/kartoteki/szablony");
  if (!canEdit(ctx.role)) redirect("/kartoteki/szablony");
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "nowy";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const city = typeof sp.miasto === "string" ? sp.miasto : "";
  const supabase = await createClient();

  const [tpl, vehicles, drivers, points] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null, error: null })
      : supabase.from("route_templates").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle(),
    supabase.from("vehicles").select("id, registration, status").eq("tenant_id", ctx.tenantId).order("registration"),
    supabase.from("drivers").select("id, first_name, last_name, is_active").eq("tenant_id", ctx.tenantId).order("last_name"),
    isNew
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("delivery_points")
          .select(
            "id, name, city, address_line, branch_type, is_active, customers(id, name, external_code), delivery_point_windows(weekday, opens_at, closes_at), route_template_points(template_id, sequence, route_templates(name))",
          )
          .eq("tenant_id", ctx.tenantId),
  ]);
  if (!isNew && !tpl.data) notFound();
  const t = tpl.data;
  const weekday = (t?.weekdays as number[] | undefined)?.[0] ?? 1;

  const all = (points.data ?? []).map((p) => {
    const mine = p.route_template_points.find((x) => x.template_id === id);
    return {
      id: p.id,
      customerId: p.customers?.id ?? null,
      customer: p.customers?.name ?? "—",
      code: p.customers?.external_code ?? null,
      branch: p.name,
      branchType: BRANCH_LABELS[p.branch_type] ?? p.branch_type,
      city: p.city,
      address: p.address_line,
      active: p.is_active,
      window: windowFor(p.delivery_point_windows, weekday),
      sequence: mine?.sequence ?? null,
      otherRoutes: p.route_template_points.filter((x) => x.template_id !== id).map((x) => x.route_templates?.name ?? "—"),
    };
  });
  const assigned = all.filter((p) => p.sequence !== null).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const cities = [...new Set(all.map((p) => p.city).filter((c): c is string => Boolean(c)))].sort((a, b) =>
    a.localeCompare(b, "pl"),
  );
  const nq = normalizeSearch(q);
  const candidates = all
    .filter((p) => p.sequence === null && p.active)
    .filter((p) => !city || p.city === city)
    .filter((p) => !nq || normalizeSearch(`${p.customer} ${p.code ?? ""} ${p.branch} ${p.city} ${p.address}`).includes(nq))
    .sort((a, b) => a.otherRoutes.length - b.otherRoutes.length || a.customer.localeCompare(b.customer, "pl"));
  const byCustomer = new Map<string, typeof candidates>();
  for (const p of candidates.slice(0, 80)) byCustomer.set(p.customer, [...(byCustomer.get(p.customer) ?? []), p]);

  const vehicleOptions = (vehicles.data ?? [])
    .filter((v) => v.status !== "inactive")
    .map((v) => ({ value: v.id, label: v.registration }));
  const driverOptions = (drivers.data ?? [])
    .filter((d) => d.is_active)
    .map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` }));
  const self = `/kartoteki/szablony/${id}`;

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href="/kartoteki/szablony" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
          <ChevronLeft className="size-4" /> Szablony tras
        </Link>
      </nav>
      <PageHeader
        title={isNew ? "Nowy szablon trasy" : (t?.name as string)}
        description={
          isNew
            ? "Najpierw nazwa, dni i godzina wyjazdu. Po zapisaniu dodasz oddziały klientów, które obsługuje ta trasa."
            : "Ustawienia trasy stałej i oddziały klientów, które obsługuje."
        }
      />
      {sp.nowy === "1" && <Notice>Szablon zapisany. Dodaj teraz oddziały klientów, które obsługuje ta trasa.</Notice>}

      <FormRenderer
        action={saveTemplate.bind(null, isNew ? null : id)}
        sections={templateSections(t, vehicleOptions, driverOptions)}
        submitLabel={isNew ? "Utwórz szablon" : "Zapisz ustawienia"}
        cancelHref="/kartoteki/szablony"
      />

      {!isNew && (
        <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
          <Panel
            title={`Punkty trasy (${assigned.length})`}
            description="Kolejność, w jakiej punkty trafią na trasę przy tworzeniu dnia. Zamówienia tych oddziałów przypiszą się do trasy automatycznie."
            actions={
              assigned.length > 1 ? (
                <form action={sortTemplateByWindow.bind(null, id)}>
                  <button
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    title="Ustawia kolejność według początku okien przyjęć"
                  >
                    <ArrowDownWideNarrow /> Sortuj wg okien
                  </button>
                </form>
              ) : undefined
            }
            flush
          >
            {assigned.length === 0 ? (
              <EmptyState icon={<MapPin />} title="Trasa nie ma jeszcze punktów">
                Wybierz oddziały klientów z listy obok i kliknij „Dodaj zaznaczone”.
              </EmptyState>
            ) : (
              <ol className="divide-y divide-border">
                {assigned.map((p, i) => (
                  <li
                    key={p.id}
                    className="group grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-2.5 text-sm hover:bg-surface-2"
                  >
                    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border-strong text-[11px] font-semibold tabular-nums">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        {p.customerId ? (
                          <Link
                            href={`/kartoteki/klienci/${p.customerId}#oddzial-${p.id}`}
                            className="truncate font-medium hover:text-primary-strong"
                          >
                            {p.customer}
                          </Link>
                        ) : (
                          <span className="truncate font-medium">{p.customer}</span>
                        )}
                        {!p.active && <Pill tone="neutral">nieaktywny</Pill>}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {p.branch} ({p.branchType}), {p.address}, {p.city} · okno {p.window}
                      </span>
                      {p.otherRoutes.length > 0 && (
                        <span className="block text-xs text-warning">także w trasie: {p.otherRoutes.join(", ")}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <form action={moveTemplatePoint.bind(null, id, p.id, -1)}>
                        <IconSubmit label="W górę" className={i === 0 ? "invisible" : ""}>
                          <ArrowUp />
                        </IconSubmit>
                      </form>
                      <form action={moveTemplatePoint.bind(null, id, p.id, 1)}>
                        <IconSubmit label="W dół" className={i === assigned.length - 1 ? "invisible" : ""}>
                          <ArrowDown />
                        </IconSubmit>
                      </form>
                      <form action={removeTemplatePoint.bind(null, id, p.id)}>
                        <IconSubmit label="Usuń z trasy" className="hover:text-danger">
                          <X />
                        </IconSubmit>
                      </form>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel
            title="Dodaj punkty"
            description="Oddziały klientów, których nie ma jeszcze na tej trasie. Najpierw te bez żadnej trasy stałej."
            flush
          >
            <form action={self} className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <div className="relative min-w-52 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Klient, kod, oddział, adres"
                  aria-label="Szukaj oddziału"
                  className="h-9 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-9 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                />
              </div>
              <select
                name="miasto"
                defaultValue={city}
                aria-label="Miasto"
                className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-sm"
              >
                <option value="">wszystkie miasta</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button className={buttonVariants({ variant: "outline", size: "sm" })}>Filtruj</button>
            </form>
            {candidates.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">
                {q || city ? "Nic nie pasuje do filtra." : "Wszystkie aktywne oddziały są już na tej trasie."}
              </p>
            ) : (
              <form action={addTemplatePoints.bind(null, id)}>
                <div className="max-h-[560px] overflow-y-auto">
                  {[...byCustomer.entries()].map(([customer, pts]) => (
                    <fieldset key={customer} className="border-b border-border px-5 py-2.5 last:border-0">
                      <legend className="sr-only">{customer}</legend>
                      <p className="mb-1 text-sm font-medium">
                        {customer} {pts[0].code && <span className="text-xs font-normal text-muted">({pts[0].code})</span>}
                      </p>
                      <div className="flex flex-col gap-1">
                        {pts.map((p) => (
                          <label
                            key={p.id}
                            className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 text-[13px] hover:bg-surface-2"
                          >
                            <input
                              type="checkbox"
                              name="point_id"
                              value={p.id}
                              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                            />
                            <span className="min-w-0 flex-1">
                              {p.branch}{" "}
                              <span className="text-muted">
                                ({p.branchType}), {p.address}, {p.city} · okno {p.window}
                              </span>
                              {p.otherRoutes.length > 0 && (
                                <span className="block text-xs text-muted">już w trasie: {p.otherRoutes.join(", ")}</span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  {candidates.length > 80 && (
                    <p className="px-5 py-3 text-xs text-muted">Pokazano 80 z {candidates.length} — zawęź wyszukiwanie.</p>
                  )}
                </div>
                <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3">
                  <span className="text-xs text-muted">Zaznacz oddziały i dodaj je na koniec trasy.</span>
                  <button className={buttonVariants({ size: "sm" })}>
                    <Plus /> Dodaj zaznaczone
                  </button>
                </div>
              </form>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
