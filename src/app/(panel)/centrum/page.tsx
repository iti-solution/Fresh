import { CircleCheck, Clock, Phone, Radar, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/panel/auto-refresh";
import { DayNav } from "@/components/panel/day-nav";
import { EmptyState, PageHeader, Panel, StatTile } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Dot, TONE_TEXT } from "@/components/ui/status";
import { DATE_RE } from "@/lib/forms";
import { cn } from "@/lib/utils";
import {
  dayKpis,
  dispatcherAlerts,
  miniKpis,
  nowForDay,
  routeProgress,
  type Alert,
} from "@/modules/ops/domain/reports";
import { getReportRoutes, nowInWarsaw } from "@/modules/ops/server/queries";
import { getDayReports } from "@/modules/ops/server/proof";
import { DayForecastPanel } from "@/modules/ops/ui/day-forecast";
import { formatDayLabel, todayInWarsaw } from "@/modules/orders/domain/orders";
import { canEdit } from "@/modules/tenancy/domain/access";
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

  const [routes, reports] = await Promise.all([
    getReportRoutes(ctx.tenantId, day, day, { withNotes: true }),
    getDayReports(ctx.tenantId, day),
  ]);

  const progress = new Map(routes.map((r) => [r.id, routeProgress(r, now)]));
  const k = dayKpis(routes);
  const alerts = dispatcherAlerts(routes, now);
  const totalStops = k.stops;
  const onRoad = routes.filter((r) => progress.get(r.id)!.state === "in_progress").length;
  const overdue = [...progress.values()].reduce((a, p) => a + p.overdue, 0);
  const atRisk = [...progress.values()].reduce((a, p) => a + p.atRisk, 0);
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
            {day === today && <AutoRefresh seconds={60} stamp={nowHHMM} tenantId={ctx.tenantId} />}
            <DayNav day={day} today={today} href={(d) => (d === today ? "/centrum" : `/centrum?dzien=${d}`)} />
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
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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
          </div>
          <p className="-mt-3 mb-6 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            {(() => {
              const m = miniKpis(k);
              return (
                <>
                  <span>
                    km na punkt:{" "}
                    <b className="font-semibold text-foreground tabular-nums">{m.kmPerStop?.toLocaleString("pl-PL") ?? "—"}</b>
                  </span>
                  <span>
                    punkty na trasę:{" "}
                    <b className="font-semibold text-foreground tabular-nums">
                      {m.stopsPerRoute?.toLocaleString("pl-PL") ?? "—"}
                    </b>
                  </span>
                  <span>
                    średni czas obsługi punktu:{" "}
                    <b className="font-semibold text-foreground tabular-nums">
                      {m.serviceMinutesAvg !== null ? `${m.serviceMinutesAvg} min` : "—"}
                    </b>
                  </span>
                </>
              );
            })()}
          </p>

          <Panel
            className="mb-6"
            title={day > today ? `Plan na ${formatDayLabel(day)}` : day === today ? "Dziś: plan, realizacja i prognoza końca dnia" : `Plan i realizacja — ${formatDayLabel(day)}`}
            description={
              day > today
                ? "Co zaplanował dyspozytor i jak skończy się dzień, jeśli trasy wyjadą o czasie."
                : "Prognoza zakłada, że pozostałe punkty zostaną dostarczone w obecnym tempie każdej trasy."
            }
            flush
          >
            <DayForecastPanel routes={routes} now={now} future={day > today} day={day} canClose={canEdit(ctx.role)} />
          </Panel>

          <div className="grid gap-6">
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
                  <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
                    {alerts.map((a, i) => (
                      <AlertRow key={`${a.routeId}-${a.stopId ?? ""}-${i}`} alert={a} />
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Zgłoszenia z trasy"
                description={
                  reports.length ? `${reports.length} z dnia, najnowsze na górze` : "problemy, opóźnienia, reklamacje i zwroty"
                }
                flush
              >
                {reports.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">Kierowcy nic nie zgłosili.</p>
                ) : (
                  <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                    {reports.map((x) => (
                      <li key={x.id} className="flex gap-3 px-5 py-3">
                        <span className="w-11 shrink-0 text-xs tabular-nums text-muted">{x.at}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-medium leading-snug">
                            {x.stopId ? (
                              <Link href={`/centrum/punkt/${x.stopId}`} className="hover:text-primary-strong hover:underline">
                                {x.label}
                                {x.customer ? `: ${x.customer}` : ""} ›
                              </Link>
                            ) : (
                              <>{x.label} · cała trasa</>
                            )}
                          </p>
                          <p className="text-xs text-muted">
                            {x.route}
                            {x.driver ? ` · ${x.driver}` : ""}
                            {x.text ? ` · ${x.text}` : ""}
                          </p>
                          {x.photos.length > 0 && (
                            <div className="mt-1.5 flex gap-1.5">
                              {x.photos.slice(0, 4).map((u) => (
                                <a key={u} href={u} target="_blank" rel="noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- podpisany link z prywatnego magazynu */}
                                  <img src={u} alt="Zdjęcie zgłoszenia" className="h-12 w-12 rounded-md object-cover" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        {x.driverPhone && (
                          <a
                            href={`tel:${x.driverPhone.replace(/\s/g, "")}`}
                            className="self-start text-xs font-medium text-primary-strong"
                            title="Zadzwoń do kierowcy"
                          >
                            <Phone className="size-4" />
                          </a>
                        )}
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
  const href = a.href ?? (a.stopId ? `/centrum/punkt/${a.stopId}` : undefined);
  return (
    <li className="flex gap-3 px-5 py-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_TEXT[ALERT_TONE[a.severity]])} />
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium leading-snug">
          {href ? (
            <Link href={href} className="hover:text-primary-strong hover:underline">
              {a.title} ›
            </Link>
          ) : (
            a.title
          )}
        </p>
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
