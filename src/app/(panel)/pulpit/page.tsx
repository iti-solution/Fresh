import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, ChevronLeft, ChevronRight, RefreshCw, Route, Store } from "lucide-react";
import { EmptyState, Meter, Notice, PageHeader, Panel, StatTile } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Pill, Plate } from "@/components/ui/status";
import { DATE_RE, formatPln, formatPlnCompact, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { isNoteActive } from "@/modules/masterdata/domain/schemas";
import { formatDayLabel, shiftDay, summarizeOrders, todayInWarsaw } from "@/modules/orders/domain/orders";
import { getDayOrders } from "@/modules/orders/server/queries";
import { resetDemoTenant } from "@/modules/tenancy/server/actions";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Pulpit" };

export default async function DashboardPage({ searchParams }: PageProps<"/pulpit">) {
  const ctx = await requireAccess("/pulpit");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayInWarsaw();
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : today;

  const [orders, templatesRes, notesRes, cash, customersRes, dayRoutesRes] = await Promise.all([
    getDayOrders(ctx.tenantId, day),
    supabase
      .from("route_templates")
      .select("id, name, vehicles(registration, capacity_kg, capacity_pallets, capacity_crates)")
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("delivery_point_notes").select("valid_from, valid_to").eq("tenant_id", ctx.tenantId),
    supabase
      .from("cash_movements")
      .select("amount, routes!inner(route_date)")
      .eq("tenant_id", ctx.tenantId)
      .eq("party_type", "driver")
      .eq("reason", "cod_collected")
      .eq("routes.route_date", day),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId),
    supabase
      .from("routes")
      .select(
        "template_id, vehicles(registration, capacity_kg, capacity_pallets, capacity_crates), drivers(first_name, last_name)",
      )
      .eq("tenant_id", ctx.tenantId)
      .eq("route_date", day)
      .eq("kind", "regular")
      .neq("status", "cancelled"),
  ]);
  // przydział auta i kierowcy jest na dany dzień (trasa); przed utworzeniem dnia pokazujemy tylko auto podpowiadane przez trasę stałą
  const dayRoutes = new Map((dayRoutesRes.data ?? []).map((r) => [r.template_id, r]));

  const active = orders.filter((o) => o.status !== "cancelled");
  const s = summarizeOrders(active);
  const activeNotes = (notesRes.data ?? []).filter((n) => isNoteActive(n, day)).length;
  // do dostarczenia = zamówienia jeszcze niezrealizowane (bez dostarczonych, częściowych i nieodebranych)
  const open = active.filter((o) => !["delivered", "partial", "failed"].includes(o.status));
  const toDeliver = summarizeOrders(open);
  const delivered = active.length - open.length;
  // pobrania: gotówka, którą kierowcy mają odebrać od klientów za zamówienia tego dnia
  const codOrders = active.filter((o) => (o.cod_amount ?? 0) > 0);
  const codTotal = codOrders.reduce((a, o) => a + toGrosze(o.cod_amount), 0);
  const codCollected = (cash.data ?? []).reduce((a, m) => a + toGrosze(m.amount), 0);
  const dayLabel = day === today ? `dziś, ${formatDayLabel(day).split(", ")[1]}` : formatDayLabel(day);

  const byRoute = new Map<string, typeof active>();
  for (const o of active) byRoute.set(o.route, [...(byRoute.get(o.route) ?? []), o]);
  const routes = (templatesRes.data ?? []).map((t) => {
    const os = byRoute.get(t.name) ?? [];
    const sum = summarizeOrders(os);
    const planned = dayRoutes.get(t.id);
    const v = planned ? planned.vehicles : t.vehicles;
    const pct = (x: number, cap: number | string | null | undefined) =>
      cap && Number(cap) > 0 ? Math.round((x / Number(cap)) * 100) : null;
    return {
      name: t.name,
      vehicle: v?.registration ?? null,
      driver: planned?.drivers ? `${planned.drivers.first_name} ${planned.drivers.last_name}` : null,
      proposal: !planned,
      sum,
      kgPct: pct(sum.weightKg, v?.capacity_kg),
      cratesPct: pct(sum.crates, v?.capacity_crates),
      palPct: pct(sum.pallets, v?.capacity_pallets),
    };
  });
  const unassigned = byRoute.get("Bez trasy stałej")?.length ?? 0;
  const empty = (customersRes.count ?? 0) === 0;

  return (
    <>
      <PageHeader
        title="Pulpit"
        description={`Dostawy na ${dayLabel} i zajętość aut na trasach.`}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Link
                href={`/pulpit?dzien=${shiftDay(day, -1)}`}
                aria-label="Poprzedni dzień"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ChevronLeft />
              </Link>
              <Link href="/pulpit" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-w-36 capitalize")}>
                {dayLabel}
              </Link>
              <Link
                href={`/pulpit?dzien=${shiftDay(day, 1)}`}
                aria-label="Następny dzień"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ChevronRight />
              </Link>
            </div>
            {ctx.isDemo && ctx.role === "admin" && (
              <form action={resetDemoTenant}>
                <button
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  title="Usuwa dane demo i tworzy je od nowa: zamówienia na najbliższy dzień roboczy i 4 tygodnie historii tras"
                >
                  <RefreshCw /> Odśwież dane demo
                </button>
              </form>
            )}
            <Link href={`/planowanie?dzien=${day}`} className={buttonVariants({ size: "sm" })}>
              <Route /> Planowanie dnia
            </Link>
          </>
        }
      />
      {sp.demo === "odswiezone" && (
        <Notice>Dane demo odświeżone: zamówienia na {formatDayLabel(day)} i historia tras z ostatnich tygodni.</Notice>
      )}

      {empty ? (
        <Panel className="max-w-2xl">
          <EmptyState
            icon={<Store />}
            title="Kartoteki są puste"
            action={
              <Link href="/kartoteki/klienci/nowy" className={buttonVariants()}>
                Dodaj pierwszego klienta
              </Link>
            }
          >
            Zacznij od klientów i ich oddziałów albo załóż firmę demo na stronie{" "}
            <Link href="/wybierz-firme" className="text-primary-strong hover:underline">
              wyboru firmy
            </Link>
            .
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile
              href={`/zlecenia?dzien=${day}`}
              label="Zamówienia"
              value={s.count}
              sub={`${formatPln(s.valueGrosze)}${delivered ? `, ${delivered} zrealizowanych` : ""}`}
            />
            <StatTile
              href={`/zlecenia?dzien=${day}&filtr=magazyn`}
              label="Oczekuje na kompletację"
              value={s.awaiting}
              sub={s.count ? `${Math.round((s.ready / s.count) * 100)}% już skompletowane` : "—"}
              tone={s.awaiting ? "warning" : "success"}
            />
            <StatTile
              href={`/zlecenia?dzien=${day}`}
              label="Skrzynki do dostarczenia"
              value={toDeliver.crates.toLocaleString("pl-PL")}
              sub={delivered ? `z ${s.crates.toLocaleString("pl-PL")} na ten dzień` : `w ${open.length} zamówieniach`}
            />
            <StatTile
              href={`/zlecenia?dzien=${day}`}
              label="Palety do dostarczenia"
              value={toDeliver.pallets.toLocaleString("pl-PL")}
              sub={delivered ? `z ${s.pallets.toLocaleString("pl-PL")} na ten dzień` : `w ${open.length} zamówieniach`}
            />
            <StatTile
              href="/kartoteki/klienci?uwagi=1"
              label="Odbiorcy z uwagami"
              value={activeNotes}
              sub="remonty, zmiany godzin, objazdy"
              tone={activeNotes ? "warning" : undefined}
            />
            <StatTile
              href={`/zlecenia?dzien=${day}`}
              label="Gotówka do odebrania"
              value={formatPlnCompact(codTotal)}
              sub={
                codOrders.length
                  ? `${codOrders.length} zamówień za pobraniem${codCollected ? `, odebrano ${formatPlnCompact(codCollected)}` : ""}`
                  : "brak zamówień za pobraniem"
              }
              icon={<Banknote />}
            />
          </div>

          <Panel
            title={`Trasy stałe — ${dayLabel}`}
            description="Zajętość auta przydzielonego do trasy na ten dzień. Auto, kierowcę, kolejność i przenoszenie zamówień ustawisz w planowaniu."
            actions={unassigned > 0 ? <Pill tone="warning">{unassigned} zamówień poza trasami stałymi</Pill> : undefined}
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                    <th className="py-2.5 pr-3 pl-5 font-medium">Trasa</th>
                    <th className="px-3 py-2.5 font-medium">Przydział na ten dzień</th>
                    <th className="px-3 py-2.5 text-right font-medium">Zamówienia</th>
                    <th className="px-3 py-2.5 font-medium">Masa</th>
                    <th className="px-3 py-2.5 font-medium">Palety</th>
                    <th className="py-2.5 pr-5 pl-3 font-medium">Skrzynki</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.name} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="py-3 pr-3 pl-5 font-medium">
                        <Link href={`/planowanie?dzien=${day}`} className="hover:text-primary-strong">
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2 text-[13px] text-muted">
                          <Plate>{r.vehicle}</Plate>
                          {r.proposal ? (
                            <span className="text-subtle">propozycja — dzień jeszcze nie zaplanowany</span>
                          ) : (
                            (r.driver ?? <Pill tone="danger">bez kierowcy</Pill>)
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.sum.count}</td>
                      <td className="px-3 py-3">
                        <LoadCell pct={r.kgPct} label={`${r.sum.weightKg} kg`} />
                      </td>
                      <td className="px-3 py-3">
                        <LoadCell pct={r.palPct} label={`${r.sum.pallets}`} />
                      </td>
                      <td className="py-3 pr-5 pl-3">
                        <LoadCell pct={r.cratesPct} label={`${r.sum.crates}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

function LoadCell({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="text-muted">{label}</span>;
  const tone = pct > 100 ? "text-danger" : pct >= 90 ? "text-warning" : "text-muted";
  return (
    <div className="flex min-w-40 items-center gap-3">
      <Meter pct={pct} className="w-20" />
      <span className={cn("text-xs whitespace-nowrap tabular-nums", tone)}>
        <b className={cn("font-semibold", pct > 100 ? "text-danger" : pct >= 90 ? "text-warning" : "text-foreground")}>{pct}%</b>{" "}
        {label}
      </span>
    </div>
  );
}
