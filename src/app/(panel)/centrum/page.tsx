import { Banknote, ChevronLeft, ChevronRight, CircleCheck, Clock, Package, Phone, Radar, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/panel/auto-refresh";
import { EmptyState, PageHeader, Panel, StatTile } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Dot, Plate, TONE_TEXT } from "@/components/ui/status";
import { DATE_RE, formatPln, formatPlnCompact } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { dayKpis, dispatcherAlerts, nowForDay, packagingSummary, routeProgress, type Alert } from "@/modules/ops/domain/reports";
import { getDriverCash, getPackagingBalances, getReportRoutes, nowInWarsaw } from "@/modules/ops/server/queries";
import { RouteStatePill, RouteStrip } from "@/modules/ops/ui/route-strip";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { ROUTE_KIND_LABELS } from "@/modules/planning/domain/load";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Centrum operacyjne" };

const ALERT_ICON = { danger: TriangleAlert, warn: Clock, info: CircleCheck } as const;
const ALERT_TONE = { danger: "danger", warn: "warning", info: "info" } as const;

export default async function OperationsCenterPage({ searchParams }: PageProps<"/centrum">) {
  const ctx = await requireAccess("/centrum");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : today;
  const nowHHMM = nowInWarsaw();
  const now = nowForDay(day, today, nowHHMM);

  const [routes, cash, pack] = await Promise.all([
    getReportRoutes(ctx.tenantId, day, day, { withNotes: true }),
    getDriverCash(ctx.tenantId),
    getPackagingBalances(ctx.tenantId),
  ]);

  const progress = new Map(routes.map((r) => [r.id, routeProgress(r, now)]));
  const k = dayKpis(routes);
  const alerts = dispatcherAlerts(routes, now);
  const totalStops = k.stops;
  const onRoad = routes.filter((r) => progress.get(r.id)!.state === "in_progress").length;
  const overdue = [...progress.values()].reduce((a, p) => a + p.overdue, 0);
  const atRisk = [...progress.values()].reduce((a, p) => a + p.atRisk, 0);
  const cashTotal = cash.reduce((a, c) => a + Math.max(0, c.cashGrosze), 0);
  const pkg = packagingSummary(pack.rows);
  const driverPkg = pkg.drivers
    .map((d) => ({ ...d, name: pack.driverNames.get(d.partyId) ?? "—" }))
    .sort(
      (a, b) =>
        Object.values(a.byType).reduce((x, y) => x + Math.abs(y), 0) -
        Object.values(b.byType).reduce((x, y) => x + Math.abs(y), 0),
    )
    .reverse();
  const sorted = [...routes].sort((a, b) => {
    const pa = progress.get(a.id)!;
    const pb = progress.get(b.id)!;
    const score = (p: typeof pa) =>
      p.startOverdue
        ? 0
        : p.overdue
          ? 1
          : p.state === "in_progress"
            ? 2
            : p.state === "done"
              ? 3
              : p.state === "not_started" || p.state === "draft"
                ? 4
                : 5;
    return score(pa) - score(pb) || a.name.localeCompare(b.name, "pl");
  });

  return (
    <>
      <PageHeader
        title="Centrum operacyjne"
        description={
          day === today
            ? "Co dzieje się teraz na trasach: postęp, spóźnienia względem okien, wyjątki i rozliczenia po powrocie."
            : `Przebieg dnia ${formatDayLabel(day)}.`
        }
        actions={
          <>
            {day === today && <AutoRefresh seconds={60} stamp={nowHHMM} />}
            <div className="flex items-center gap-1">
              <Link
                href={`/centrum?dzien=${shiftDay(day, -1)}`}
                aria-label="Poprzedni dzień"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ChevronLeft />
              </Link>
              <Link href="/centrum" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-w-40 capitalize")}>
                {day === today ? `Dziś, ${formatDayLabel(day).split(", ")[1]}` : formatDayLabel(day)}
              </Link>
              <Link
                href={`/centrum?dzien=${shiftDay(day, 1)}`}
                aria-label="Następny dzień"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ChevronRight />
              </Link>
            </div>
          </>
        }
      />

      {routes.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Radar />}
            title={`Na ${formatDayLabel(day)} nie ma tras`}
            action={
              <Link href={`/planowanie?dzien=${day}`} className={buttonVariants()}>
                Zaplanuj dzień
              </Link>
            }
          >
            Trasy pojawią się tutaj, gdy powstanie plan dnia w module planowania.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="Trasy w drodze"
              value={`${onRoad} z ${routes.length}`}
              sub={k.extraCourses ? `w tym ${k.extraCourses} kursy dodatkowe` : "bez kursów dodatkowych"}
            />
            <StatTile
              label="Punkty zrealizowane"
              value={`${k.finished} / ${totalStops}`}
              sub={`${totalStops ? Math.round((k.finished / totalStops) * 100) : 0}% planu dnia`}
              tone={k.finished === totalStops ? "success" : undefined}
            />
            <StatTile
              label="Terminowość"
              value={k.onTimePct === null ? "—" : `${k.onTimePct.toLocaleString("pl-PL")}%`}
              sub={`${k.onTime} z ${k.withWindow} w oknie przyjęć`}
              tone={k.onTimePct !== null && k.onTimePct < 90 ? "warning" : "success"}
            />
            <StatTile
              label="Spóźnione teraz"
              value={overdue}
              sub={atRisk ? `${atRisk} zagrożonych w ciągu 30 min` : "brak zagrożonych"}
              tone={overdue ? "danger" : atRisk ? "warning" : "success"}
              icon={<Clock />}
            />
            <StatTile
              label="Wyjątki"
              value={k.exceptions}
              sub={exceptionSummary(k) || "bez reklamacji i odmów"}
              tone={k.exceptions ? "plum" : undefined}
            />
            <StatTile
              label="Gotówka u kierowców"
              value={formatPlnCompact(cashTotal)}
              sub={`${cash.filter((c) => c.cashGrosze > 0).length} kierowców do rozliczenia`}
              icon={<Banknote />}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
            <Panel
              title="Trasy dnia"
              description="Najpierw te, które wymagają reakcji. Kropki to punkty w kolejności dostaw — najedź, żeby zobaczyć szczegóły."
              flush
            >
              <ul className="divide-y divide-border">
                {sorted.map((r) => {
                  const p = progress.get(r.id)!;
                  const next = p.current ?? p.next;
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        "grid gap-x-6 gap-y-3 px-5 py-4 lg:grid-cols-[minmax(200px,1.1fr)_minmax(220px,1.6fr)_minmax(180px,1fr)]",
                        (p.startOverdue || p.overdue > 0) && "bg-danger-soft/40",
                      )}
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/planowanie?dzien=${day}`}
                            className="truncate text-[15px] font-semibold hover:text-primary"
                          >
                            {r.name}
                          </Link>
                          {r.kind !== "regular" && (
                            <span className="rounded bg-foreground/[0.06] px-1.5 text-[11px] font-medium text-muted">
                              {ROUTE_KIND_LABELS[r.kind] ?? r.kind}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                          <Plate>{r.vehicle}</Plate>
                          <span className="truncate">{r.driver ?? "bez kierowcy"}</span>
                          {r.driverPhone && (
                            <a
                              href={`tel:${r.driverPhone.replace(/\s/g, "")}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                              title="Zadzwoń do kierowcy"
                            >
                              <Phone className="size-3.5" />
                              {r.driverPhone}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 space-y-2 self-center">
                        <RouteStrip stops={r.stops} now={now} />
                        <div className="flex justify-between text-xs text-muted">
                          <span>start {r.plannedStart ?? "—"}</span>
                          <span className="tabular-nums">
                            <b className="font-semibold text-foreground">{p.finished}</b> z {p.total} punktów
                            {p.late > 0 && <span className="text-warning"> · {p.late} po oknie</span>}
                          </span>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col justify-center gap-1.5 text-[13px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <RouteStatePill state={p.state} alarm={p.startOverdue} />
                          {p.overdue > 0 && <span className="text-xs font-semibold text-danger">{p.overdue} po oknie</span>}
                          {p.exceptions > 0 && <span className="text-xs font-medium text-plum">{p.exceptions} wyjątki</span>}
                        </div>
                        {p.state === "in_progress" && next ? (
                          <p className="truncate text-muted">
                            {p.current ? "Teraz: " : "Następny: "}
                            <span className="font-medium text-foreground">{next.customer}</span>
                            {next.windowEnd && <span> · okno do {next.windowEnd}</span>}
                          </p>
                        ) : p.state === "done" || p.state === "closed" ? (
                          <p className="text-muted">
                            Ostatni punkt {p.lastCompletedAt ?? "—"}
                            {r.km !== null && <span> · {r.km} km</span>}
                          </p>
                        ) : (
                          <p className="text-muted">
                            {p.startOverdue ? `Miała ruszyć o ${r.plannedStart}` : `Wyjazd ${r.plannedStart ?? "bez godziny"}`}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <div className="flex flex-col gap-6">
              <Panel
                title="Wymaga uwagi"
                description={alerts.length ? `${alerts.length} spraw, od najpilniejszych` : undefined}
                flush
              >
                {alerts.length === 0 ? (
                  <EmptyState icon={<CircleCheck />} title="Wszystko idzie zgodnie z planem">
                    Brak spóźnień, wyjątków i tras do zamknięcia.
                  </EmptyState>
                ) : (
                  <ul className="max-h-[520px] divide-y divide-border overflow-y-auto">
                    {alerts.map((a, i) => (
                      <AlertRow key={`${a.routeId}-${a.stopId ?? ""}-${i}`} alert={a} />
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Gotówka u kierowców" description="Pobrania do przyjęcia w kasie przy zamknięciu trasy" flush>
                {cash.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted">Cała gotówka rozliczona.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {cash.map((c) => (
                      <li key={c.driverId} className="flex items-center justify-between gap-3 px-5 py-2.5">
                        <span className="truncate">{c.name}</span>
                        <span className={cn("font-semibold tabular-nums", c.cashGrosze < 0 && "text-danger")}>
                          {formatPln(c.cashGrosze)}
                        </span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between bg-surface-2 px-5 py-2.5 text-[13px] font-semibold">
                      <span>Razem do przyjęcia</span>
                      <span className="tabular-nums">{formatPln(cashTotal)}</span>
                    </li>
                  </ul>
                )}
              </Panel>

              <Panel
                title="Opakowania u kierowców"
                description="Dodatnie: do zdania na magazyn. Ujemne: brak — różnica do wyjaśnienia."
                flush
              >
                {driverPkg.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted">Wszystkie opakowania zdane.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {driverPkg.map((d) => (
                      <li key={d.partyId} className="flex gap-3 px-5 py-2.5">
                        <Package className="mt-0.5 size-4 shrink-0 text-subtle" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{d.name}</span>
                          <span className="flex flex-wrap gap-x-3 text-[13px] tabular-nums">
                            {Object.entries(d.byType)
                              .filter(([, q]) => q !== 0)
                              .map(([code, q]) => (
                                <span key={code} className={q < 0 ? "font-semibold text-danger" : "text-foreground"}>
                                  {q > 0 ? "+" : "−"}
                                  {Math.abs(q)}{" "}
                                  <span className="text-muted">
                                    {pack.types.find((t) => t.code === code)?.name.toLowerCase() ?? code}
                                  </span>
                                </span>
                              ))}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AlertRow({ alert: a }: { alert: Alert }) {
  const Icon = ALERT_ICON[a.severity];
  return (
    <li className="flex gap-3 px-5 py-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_TEXT[ALERT_TONE[a.severity]])} />
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium leading-snug">{a.title}</p>
        <p className="mt-0.5 text-xs text-muted">{a.detail}</p>
      </div>
      <Dot tone={ALERT_TONE[a.severity]} className="mt-1.5 ml-auto" />
    </li>
  );
}

function exceptionSummary(k: { complaints: number; refused: number; absent: number }): string {
  return [
    k.complaints && `${k.complaints} ${k.complaints === 1 ? "reklamacja" : "reklamacje"}`,
    k.refused && `${k.refused} ${k.refused === 1 ? "odmowa" : "odmowy"}`,
    k.absent && `${k.absent} brak odbioru`,
  ]
    .filter(Boolean)
    .join(", ");
}
