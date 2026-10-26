import type { Metadata } from "next";
import Link from "next/link";
import { RefreshCw, Route, Store } from "lucide-react";
import { EmptyState, Meter, Notice, PageHeader, Panel, StatTile } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Pill, Plate } from "@/components/ui/status";
import { formatPln } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { isNoteActive } from "@/modules/masterdata/domain/schemas";
import { formatDayLabel, nextWorkingDay, summarizeOrders, todayInWarsaw } from "@/modules/orders/domain/orders";
import { getDayOrders } from "@/modules/orders/server/queries";
import { resetDemoTenant } from "@/modules/tenancy/server/actions";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Pulpit" };

export default async function DashboardPage({ searchParams }: PageProps<"/pulpit">) {
  const ctx = await requireAccess("/pulpit");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayInWarsaw();
  const day = nextWorkingDay(today);

  const [orders, templatesRes, notesRes, vehiclesRes, customersRes] = await Promise.all([
    getDayOrders(ctx.tenantId, day),
    supabase
      .from("route_templates")
      .select("name, vehicles(registration, capacity_kg, capacity_pallets, capacity_crates), drivers(first_name, last_name)")
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("delivery_point_notes").select("valid_from, valid_to").eq("tenant_id", ctx.tenantId),
    supabase.from("vehicles").select("status, capacity_crates, capacity_kg").eq("tenant_id", ctx.tenantId),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId),
  ]);

  const active = orders.filter((o) => o.status !== "cancelled");
  const s = summarizeOrders(active);
  const activeNotes = (notesRes.data ?? []).filter((n) => isNoteActive(n, day)).length;
  const fleet = (vehiclesRes.data ?? []).filter((v) => v.status === "active");
  const fleetCrates = fleet.reduce((a, v) => a + (v.capacity_crates ?? 0), 0);
  const fleetKg = fleet.reduce((a, v) => a + Number(v.capacity_kg ?? 0), 0);

  const byRoute = new Map<string, typeof active>();
  for (const o of active) byRoute.set(o.route, [...(byRoute.get(o.route) ?? []), o]);
  const routes = (templatesRes.data ?? []).map((t) => {
    const os = byRoute.get(t.name) ?? [];
    const sum = summarizeOrders(os);
    const v = t.vehicles;
    const pct = (x: number, cap: number | string | null | undefined) =>
      cap && Number(cap) > 0 ? Math.round((x / Number(cap)) * 100) : null;
    return {
      name: t.name,
      vehicle: v?.registration ?? "—",
      driver: t.drivers ? `${t.drivers.first_name} ${t.drivers.last_name}` : "—",
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
        description={`Przygotowanie dostaw na ${formatDayLabel(day)}: zamówienia, kompletacja w magazynie i zajętość aut na trasach stałych.`}
        actions={
          <>
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
              <Route /> Planuj {formatDayLabel(day).split(",")[0]}
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
            <Link href="/wybierz-firme" className="text-primary hover:underline">
              wyboru firmy
            </Link>
            .
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile href={`/zlecenia?dzien=${day}`} label="Zamówienia" value={s.count} sub={formatPln(s.valueGrosze)} />
            <StatTile
              href={`/zlecenia?dzien=${day}&filtr=gotowe`}
              label="Skompletowane"
              value={s.ready}
              sub={s.count ? `${Math.round((s.ready / s.count) * 100)}% zamówień` : "—"}
              tone="success"
            />
            <StatTile
              href={`/zlecenia?dzien=${day}&filtr=magazyn`}
              label="W magazynie"
              value={s.awaiting}
              sub="czeka na kompletację"
              tone={s.awaiting ? "warning" : undefined}
            />
            <StatTile
              href="/kartoteki/klienci?uwagi=1"
              label="Oddziały z uwagami"
              value={activeNotes}
              sub="remonty, zmiany godzin"
              tone={activeNotes ? "warning" : undefined}
            />
            <StatTile
              href="/kartoteki/pojazdy"
              label="Skrzynki vs flota"
              value={`${s.crates} / ${fleetCrates}`}
              sub={`${fleet.length} aktywnych aut`}
            />
            <StatTile
              href="/kartoteki/pojazdy"
              label="Masa vs flota"
              value={`${(s.weightKg / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} t`}
              sub={`ładowność ${(fleetKg / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} t`}
            />
          </div>

          <Panel
            title={`Trasy stałe na ${formatDayLabel(day)}`}
            description="Zajętość domyślnego auta trasy. Przenoszenie zamówień i kolejność ustawisz w planowaniu."
            actions={unassigned > 0 ? <Pill tone="warning">{unassigned} zamówień poza trasami stałymi</Pill> : undefined}
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                    <th className="py-2.5 pr-3 pl-5 font-medium">Trasa</th>
                    <th className="px-3 py-2.5 font-medium">Auto i kierowca</th>
                    <th className="px-3 py-2.5 text-right font-medium">Zamówienia</th>
                    <th className="px-3 py-2.5 font-medium">Masa</th>
                    <th className="px-3 py-2.5 font-medium">Palety</th>
                    <th className="px-3 py-2.5 font-medium">Skrzynki</th>
                    <th className="py-2.5 pr-5 pl-3 text-right font-medium whitespace-nowrap">W magazynie</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.name} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="py-3 pr-3 pl-5 font-medium">
                        <Link href={`/planowanie?dzien=${day}`} className="hover:text-primary">
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2 text-[13px] text-muted">
                          <Plate>{r.vehicle === "—" ? null : r.vehicle}</Plate>
                          {r.driver}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.sum.count}</td>
                      <td className="px-3 py-3">
                        <LoadCell pct={r.kgPct} label={`${r.sum.weightKg} kg`} />
                      </td>
                      <td className="px-3 py-3">
                        <LoadCell pct={r.palPct} label={`${r.sum.pallets}`} />
                      </td>
                      <td className="px-3 py-3">
                        <LoadCell pct={r.cratesPct} label={`${r.sum.crates}`} />
                      </td>
                      <td className="py-3 pr-5 pl-3 text-right tabular-nums">
                        {r.sum.awaiting ? (
                          <span className="font-semibold text-warning">{r.sum.awaiting}</span>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
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
