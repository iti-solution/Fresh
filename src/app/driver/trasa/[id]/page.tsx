import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QUICK_STATUSES, quickStatusOf, STOP_STATUS_LABELS, type QuickStatus } from "@/modules/execution/domain/execution";
import { setQuickStatus, startRoute } from "@/modules/execution/server/actions";
import { getDriverRoute, getVehiclesForDriver } from "@/modules/execution/server/queries";
import { ActionForm } from "@/modules/execution/ui/action-form";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Trasa" };

const ON: Record<QuickStatus, string> = {
  none: "bg-white text-foreground ring-2 ring-inset ring-muted",
  now: "bg-[#1d4ed8] text-white",
  partial: "bg-warning text-white",
  done: "bg-primary text-white",
};

export default async function DriverRoutePage({ params, searchParams }: PageProps<"/driver/trasa/[id]">) {
  const ctx = await requireTenantContext();
  if (ctx.role !== "driver") redirect("/driver");
  const { id } = await params;
  const sp = await searchParams;
  const route = await getDriverRoute(id);
  if (!route) notFound();
  if (route.status === "completed") redirect(`/driver/trasa/${id}/raport`);
  const finished = route.stops.filter((s) => !["pending", "arrived", "in_progress"].includes(s.status)).length;
  const pct = route.stops.length ? Math.round((finished / route.stops.length) * 100) : 0;

  if (route.status === "planned" || route.status === "dispatched") {
    const vehicles = await getVehiclesForDriver();
    return (
      <main className="flex flex-col gap-4 p-5">
        <Link href="/driver" className="h-11 text-sm text-primary">‹ Moje trasy</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{formatDayLabel(route.date)}</p>
          <h1 className="text-2xl font-semibold">{route.name}</h1>
          <p className="text-sm text-muted">{route.stops.length} punktów · pierwszy: {route.stops[0]?.customer ?? "—"} ({route.stops[0]?.window})</p>
        </div>
        <ActionForm action={startRoute.bind(null, id)} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Pojazd
            <select name="vehicle_id" defaultValue={route.vehicleId ?? ""} className="h-14 rounded-xl border border-border bg-surface px-3 text-lg">
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Stan licznika na start (km)
            <input name="odometer_start" inputMode="numeric" autoComplete="off" placeholder="np. 128455" className="h-14 rounded-xl border-2 border-primary bg-surface px-4 text-2xl font-bold tabular-nums" />
          </label>
          <button className="h-14 rounded-xl bg-primary text-lg font-bold text-primary-foreground">Rozpocznij trasę</button>
        </ActionForm>
        <ol className="flex flex-col gap-2">
          {route.stops.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">{s.sequence}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{s.customer}</span><span className="text-muted">{s.branch} · okno {s.window}</span></span>
            </li>
          ))}
        </ol>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">{route.name}</h1>
          <span className="text-sm text-muted">{route.vehicle}</span>
        </div>
        <p className="text-xs text-muted">licznik start {route.odometerStart?.toLocaleString("pl-PL")} km</p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/60"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
          <span className="text-sm font-bold tabular-nums">{finished} / {route.stops.length}</span>
        </div>
      </header>

      {sp.zapisano && <p role="status" className="mx-3 mt-3 rounded-lg bg-accent px-4 py-2 text-sm text-primary">Zapisano punkt.</p>}

      <ol className="flex flex-1 flex-col gap-2 p-3">
        {route.stops.map((s) => {
          const q = quickStatusOf(s.status);
          return (
            <li key={s.id} className={cn("flex flex-col gap-2.5 rounded-2xl border bg-surface p-3", s.status === "in_progress" ? "border-2 border-[#1d4ed8]" : "border-border")}>
              <div className="flex items-start gap-3">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", q === "done" || q === "partial" || q === null ? "bg-accent text-primary" : "bg-foreground text-background")}>{s.sequence}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">{s.customer}</p>
                  <p className="text-sm text-muted">{s.branch} · {s.address}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="rounded bg-accent px-2 py-0.5 text-xs font-semibold text-primary">okno {s.window}</span>
                    {s.notes.map((n) => <span key={n} className="rounded bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">{n}</span>)}
                    {s.orders.some((o) => o.cod) && <span className="rounded bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">pobranie</span>}
                    {q === null && <span className="rounded bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">{STOP_STATUS_LABELS[s.status]}</span>}
                  </div>
                </div>
                <Link href={`/driver/trasa/${id}/punkt/${s.id}`} className="flex h-11 items-center px-1 text-sm font-semibold text-primary">Szczegóły ›</Link>
              </div>
              <div role="group" aria-label="Status punktu" className="grid grid-cols-4 gap-1 rounded-xl bg-border/40 p-1">
                {(Object.keys(QUICK_STATUSES) as QuickStatus[]).map((k) => (
                  <form key={k} action={setQuickStatus.bind(null, id, s.id, k)}>
                    <button aria-pressed={q === k} className={cn("h-12 w-full rounded-lg px-1 text-xs font-bold leading-tight", q === k ? ON[k] : "text-foreground/80")}>
                      {QUICK_STATUSES[k].label}
                    </button>
                  </form>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="sticky bottom-0 grid grid-cols-1 gap-2 border-t border-border bg-surface p-3">
        <Link href={`/driver/trasa/${id}/koniec`} className={cn(buttonVariants({ size: "lg" }), "h-14 bg-foreground text-base text-background hover:bg-foreground/90")}>Zakończ zmianę</Link>
      </footer>
    </main>
  );
}
