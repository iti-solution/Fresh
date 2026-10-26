import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Plate } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { QUICK_STATUSES, quickStatusOf, STOP_STATUS_LABELS, type QuickStatus } from "@/modules/execution/domain/execution";
import { setQuickStatus, startRoute } from "@/modules/execution/server/actions";
import { getDriverRoute, getVehiclesForDriver } from "@/modules/execution/server/queries";
import { ActionForm } from "@/modules/execution/ui/action-form";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Trasa" };

const ON: Record<QuickStatus, string> = {
  none: "bg-surface text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12)]",
  now: "bg-info text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]",
  partial: "bg-warning text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]",
  done: "bg-success text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]",
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
        <Link href="/driver" className="h-11 text-sm text-primary-strong">
          ‹ Moje trasy
        </Link>
        <div>
          <p className="text-sm font-medium text-muted">{formatDayLabel(route.date)}</p>
          <h1 className="text-2xl font-semibold">{route.name}</h1>
          <p className="text-sm text-muted">
            {route.stops.length} punktów · pierwszy: {route.stops[0]?.customer ?? "—"} ({route.stops[0]?.window})
          </p>
        </div>
        <ActionForm
          action={startRoute.bind(null, id)}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Pojazd
            <select
              name="vehicle_id"
              defaultValue={route.vehicleId ?? ""}
              className="h-14 rounded-xl border border-border-strong bg-surface px-3 text-lg"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Stan licznika na start (km)
            <input
              name="odometer_start"
              inputMode="numeric"
              autoComplete="off"
              placeholder="np. 128455"
              className="h-14 rounded-xl border-2 border-primary bg-surface px-4 text-2xl font-bold tabular-nums"
            />
          </label>
          <button className="h-14 rounded-xl bg-primary text-lg font-semibold text-primary-foreground shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)] active:bg-primary-strong">
            Rozpocznij trasę
          </button>
        </ActionForm>
        <ol className="flex flex-col gap-2">
          {route.stops.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                {s.sequence}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.customer}</span>
                <span className="text-muted">
                  {s.branch} · okno {s.window}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-3 bg-ink px-4 pt-4 pb-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{route.name}</h1>
            <p className="text-xs text-ink-muted">licznik start {route.odometerStart?.toLocaleString("pl-PL")} km</p>
          </div>
          {route.vehicle && <Plate>{route.vehicle}</Plate>}
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-[#3fbf7f]" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-base font-semibold tabular-nums">
            {finished} / {route.stops.length}
          </span>
        </div>
      </header>

      {sp.zapisano && (
        <p role="status" className="mx-3 mt-3 rounded-lg bg-success-soft px-4 py-2 text-sm font-medium text-success">
          Zapisano punkt.
        </p>
      )}

      <ol className="flex flex-1 flex-col gap-2 p-3">
        {route.stops.map((s) => {
          const q = quickStatusOf(s.status);
          return (
            <li
              key={s.id}
              className={cn(
                "flex flex-col gap-2.5 rounded-2xl border bg-surface p-3",
                s.status === "in_progress" ? "border-2 border-info shadow-[0_0_0_4px_rgb(42_111_176/0.12)]" : "border-border",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    q === "done"
                      ? "bg-success text-white"
                      : q === "partial"
                        ? "bg-warning text-white"
                        : q === null
                          ? "bg-danger-soft text-danger"
                          : q === "now"
                            ? "bg-info text-white"
                            : "bg-ink text-white",
                  )}
                >
                  {s.sequence}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">{s.customer}</p>
                  <p className="text-sm text-muted">
                    {s.branch} · {s.address}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-steel-soft px-2 py-0.5 text-xs font-semibold text-ink-2 tabular-nums">
                      okno {s.window}
                    </span>
                    {s.notes.map((n) => (
                      <span key={n} className="rounded bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
                        {n}
                      </span>
                    ))}
                    {s.orders.some((o) => o.cod) && (
                      <span className="rounded bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">pobranie</span>
                    )}
                    {q === null && (
                      <span className="rounded bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
                        {STOP_STATUS_LABELS[s.status]}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/driver/trasa/${id}/punkt/${s.id}`}
                  className="flex h-11 items-center px-1 text-sm font-semibold text-primary-strong"
                >
                  Szczegóły ›
                </Link>
              </div>
              <div role="group" aria-label="Status punktu" className="grid grid-cols-4 gap-1 rounded-xl bg-foreground/[0.06] p-1">
                {(Object.keys(QUICK_STATUSES) as QuickStatus[]).map((k) => (
                  <form key={k} action={setQuickStatus.bind(null, id, s.id, k)}>
                    <button
                      aria-pressed={q === k}
                      className={cn(
                        "h-12 w-full rounded-lg px-1 text-xs font-bold leading-tight",
                        q === k ? ON[k] : "text-foreground/80",
                      )}
                    >
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
        <Link
          href={`/driver/trasa/${id}/koniec`}
          className={cn(buttonVariants({ size: "lg" }), "h-14 bg-ink text-base text-white hover:bg-ink-2")}
        >
          Zakończ zmianę
        </Link>
      </footer>
    </main>
  );
}
