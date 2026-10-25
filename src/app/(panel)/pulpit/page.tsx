import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/panel/module-placeholder";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
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
    const pct = (x: number, cap: number | string | null | undefined) => (cap && Number(cap) > 0 ? Math.round((x / Number(cap)) * 100) : null);
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Pulpit" description={`${ctx.tenantName} · przygotowanie dostaw na ${formatDayLabel(day)}`} />
        {ctx.isDemo && ctx.role === "admin" && (
          <form action={resetDemoTenant}>
            <button className={buttonVariants({ variant: "outline", size: "sm" })} title="Usuwa dane demo i tworzy je od nowa z zamówieniami na najbliższy dzień roboczy">
              Odśwież dane demo
            </button>
          </form>
        )}
      </div>
      {sp.demo === "odswiezone" && <p role="status" className="mb-4 rounded-md bg-accent px-4 py-3 text-sm text-primary">Dane demo odświeżone — zamówienia na {formatDayLabel(day)}.</p>}

      {empty ? (
        <Card className="max-w-2xl text-sm">
          Kartoteki są puste. Dodaj pierwszego <Link href="/kartoteki/klienci/nowy" className="text-primary hover:underline">klienta</Link> albo
          załóż firmę demo na stronie <Link href="/wybierz-firme" className="text-primary hover:underline">wyboru firmy</Link>.
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile href={`/zlecenia?dzien=${day}`} label={`Zamówienia · ${formatDayLabel(day)}`} value={String(s.count)} sub={formatPln(s.valueGrosze)} />
            <Tile href={`/zlecenia?dzien=${day}&filtr=gotowe`} label="Skompletowane" value={String(s.ready)} sub={s.count ? `${Math.round((s.ready / s.count) * 100)}% zamówień` : "—"} tone="good" />
            <Tile href={`/zlecenia?dzien=${day}&filtr=magazyn`} label="Do realizacji w magazynie" value={String(s.awaiting)} sub="czeka na kompletację" tone={s.awaiting ? "warn" : undefined} />
            <Tile href="/kartoteki/klienci?uwagi=1" label="Oddziały z uwagami" value={String(activeNotes)} sub="remonty, zmiany godzin" tone={activeNotes ? "warn" : undefined} />
            <Tile href="/kartoteki/pojazdy" label="Skrzynki vs flota" value={`${s.crates} / ${fleetCrates}`} sub={`${fleet.length} aktywnych aut`} />
            <Tile href="/kartoteki/pojazdy" label="Masa vs flota" value={`${s.weightKg.toLocaleString("pl-PL")} kg`} sub={`ładowność ${fleetKg.toLocaleString("pl-PL")} kg`} />
          </div>

          <section aria-label="Trasy stałe" className="overflow-x-auto rounded-lg border border-border bg-surface">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">Trasy stałe na {formatDayLabel(day)}</h2>
              <p className="text-xs text-muted">Zajętość domyślnego auta trasy · planowanie i przenoszenie zamówień — etap M3</p>
            </header>
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Trasa</th>
                  <th className="px-4 py-2 font-medium">Auto · kierowca</th>
                  <th className="px-4 py-2 text-right font-medium">Zam.</th>
                  <th className="px-4 py-2 font-medium">Masa</th>
                  <th className="px-4 py-2 font-medium">Palety</th>
                  <th className="px-4 py-2 font-medium">Skrzynki</th>
                  <th className="px-4 py-2 text-right font-medium">Do realizacji</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.name} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium">
                      <Link href={`/zlecenia?dzien=${day}`} className="text-foreground hover:text-primary hover:underline">{r.name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted"><span className="font-mono text-foreground">{r.vehicle}</span> · {r.driver}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sum.count}</td>
                    <td className="px-4 py-2.5"><LoadBar pct={r.kgPct} label={`${r.sum.weightKg} kg`} /></td>
                    <td className="px-4 py-2.5"><LoadBar pct={r.palPct} label={`${r.sum.pallets}`} /></td>
                    <td className="px-4 py-2.5"><LoadBar pct={r.cratesPct} label={`${r.sum.crates}`} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sum.awaiting ? <span className="font-semibold text-warning">{r.sum.awaiting}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unassigned > 0 && (
              <p className="border-t border-border px-4 py-2 text-sm text-warning">
                {unassigned} zamówień dla oddziałów bez trasy stałej — <Link href={`/zlecenia?dzien=${day}`} className="underline">zobacz</Link>.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Tile({ label, value, sub, href, tone }: { label: string; value: string; sub?: string; href: string; tone?: "good" | "warn" }) {
  return (
    <Link href={href} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "good" && "text-primary", tone === "warn" && "text-warning")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Link>
  );
}

function LoadBar({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="text-muted">{label}</span>;
  const color = pct > 100 ? "bg-danger" : pct >= 90 ? "bg-warning" : "bg-primary";
  const text = pct > 100 ? "text-danger" : pct >= 90 ? "text-warning" : "text-muted";
  return (
    <div className="flex min-w-36 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/60">
        <div className={cn("h-2 rounded-full", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={cn("w-28 whitespace-nowrap text-right text-xs tabular-nums", text)}>{label} · {pct}%</span>
    </div>
  );
}
