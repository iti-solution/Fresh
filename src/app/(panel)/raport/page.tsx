import { ChevronLeft, ChevronRight, ChartNoAxesCombined, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart, LineChart } from "@/components/panel/charts";
import { Delta, EmptyState, PageHeader, Panel, Segmented, StatTile } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { DATE_RE, formatPln, formatPlnCompact } from "@/lib/forms";
import { cn } from "@/lib/utils";
import {
  dayKpis,
  EXCEPTION_STATUSES,
  packagingSummary,
  pctChange,
  routeCostGrosze,
  sumKpis,
  topCustomers,
  type DayKpis,
  type ReportRoute,
} from "@/modules/ops/domain/reports";
import { getDriverCash, getPackagingBalances, getReportRoutes } from "@/modules/ops/server/queries";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Raport zarządu" };

const PERIODS = {
  dzien: { label: "Dzień", days: 1, compare: "ten sam dzień tydzień wcześniej" },
  tydzien: { label: "7 dni", days: 7, compare: "poprzednie 7 dni" },
  miesiac: { label: "4 tygodnie", days: 28, compare: "poprzednie 4 tygodnie" },
} as const;
type PeriodKey = keyof typeof PERIODS;

const short = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`);

export default async function ManagementReportPage({ searchParams }: PageProps<"/raport">) {
  const ctx = await requireAccess("/raport");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const period: PeriodKey = typeof sp.okres === "string" && sp.okres in PERIODS ? (sp.okres as PeriodKey) : "tydzien";
  const end = typeof sp.do === "string" && DATE_RE.test(sp.do) && sp.do <= today ? sp.do : today;
  const len = PERIODS[period].days;
  const start = shiftDay(end, -(len - 1));
  const prevEnd = len === 1 ? shiftDay(end, -7) : shiftDay(start, -1);
  const prevStart = shiftDay(prevEnd, -(len - 1));
  const trendStart = shiftDay(end, -27);
  const rangeStart = [prevStart, trendStart].sort()[0];

  const [all, current, cash, pack] = await Promise.all([
    getReportRoutes(ctx.tenantId, rangeStart, end),
    getReportRoutes(ctx.tenantId, start, end, { withNotes: true }),
    getDriverCash(ctx.tenantId),
    getPackagingBalances(ctx.tenantId),
  ]);

  const byDay = new Map<string, ReportRoute[]>();
  for (const r of all) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const kpisFor = (from: string, to: string) =>
    sumKpis([...byDay.entries()].filter(([d]) => d >= from && d <= to).map(([, rs]) => dayKpis(rs)));
  const cur = sumKpis([dayKpis(current)]);
  const prev = kpisFor(prevStart, prevEnd);
  const trendDays = Array.from({ length: 28 }, (_, i) => shiftDay(trendStart, i));
  const trend = trendDays.map((d) => ({ day: d, k: dayKpis(byDay.get(d) ?? []) }));
  const workDays = trend.filter((t) => t.k.stops > 0);
  const avgValue = workDays.length ? workDays.reduce((a, t) => a + t.k.deliveredValueGrosze, 0) / workDays.length : 0;

  const costShare = cur.deliveredValueGrosze ? Math.round((cur.costGrosze / cur.deliveredValueGrosze) * 1000) / 10 : null;
  const prevCostShare = prev.deliveredValueGrosze ? Math.round((prev.costGrosze / prev.deliveredValueGrosze) * 1000) / 10 : null;
  const perStop = (k: DayKpis) => (k.finished ? Math.round(k.costGrosze / k.finished) : 0);

  // efektywność kierunków (trasy stałe po nazwie, kursy dodatkowe razem)
  const lanes = new Map<string, ReportRoute[]>();
  for (const r of current) {
    const key = r.kind === "regular" ? r.name : "Kursy dodatkowe i dowózki";
    lanes.set(key, [...(lanes.get(key) ?? []), r]);
  }
  const laneRows = [...lanes.entries()]
    .map(([name, rs]) => ({
      name,
      k: dayKpis(rs),
      courses: rs.length,
      cost: rs.reduce((a, r) => a + (r.km !== null ? routeCostGrosze(r) : 0), 0),
    }))
    .sort((a, b) => b.k.deliveredValueGrosze - a.k.deliveredValueGrosze);
  const top = topCustomers(current, 6);
  const exceptions = current
    .flatMap((r) => r.stops.filter((s) => EXCEPTION_STATUSES.includes(s.status)).map((s) => ({ s, r })))
    .sort((a, b) => (b.r.date + (b.s.completedAt ?? "")).localeCompare(a.r.date + (a.s.completedAt ?? "")));
  const pkg = packagingSummary(pack.rows);
  const typeName = (code: string) => pack.types.find((t) => t.code === code)?.name ?? code;
  const pkgDeposit = pkg.atCustomers.reduce((a, t) => a + t.depositGrosze, 0);
  const driverHeld = pkg.drivers.reduce((a, d) => a + Object.values(d.byType).reduce((x, q) => x + Math.max(0, q), 0), 0);
  const driverMissing = pkg.drivers.reduce((a, d) => a + Object.values(d.byType).reduce((x, q) => x + Math.min(0, q), 0), 0);
  const cashOpen = cash.reduce((a, c) => a + Math.max(0, c.cashGrosze), 0);

  const href = (p: { okres?: PeriodKey; do?: string }) => {
    const u = new URLSearchParams();
    const o = p.okres ?? period;
    if (o !== "tydzien") u.set("okres", o);
    const d = p.do ?? end;
    if (d !== today) u.set("do", d);
    const s = u.toString();
    return `/raport${s ? `?${s}` : ""}`;
  };
  const rangeLabel = len === 1 ? formatDayLabel(end) : `${short(start)} – ${short(end)}`;

  return (
    <>
      <PageHeader
        title="Raport zarządu"
        description={`Sprzedaż dowieziona do klientów, jakość dostaw i koszt transportu. Porównanie: ${PERIODS[period].compare}.`}
        actions={
          <>
            <Segmented
              items={(Object.keys(PERIODS) as PeriodKey[]).map((k) => ({
                href: href({ okres: k }),
                label: PERIODS[k].label,
                active: k === period,
              }))}
            />
            <div className="flex items-center gap-1">
              <Link
                href={href({ do: shiftDay(end, -len) })}
                aria-label="Wcześniej"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ChevronLeft />
              </Link>
              <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none min-w-36 capitalize")}>
                {rangeLabel}
              </span>
              <Link
                href={href({ do: shiftDay(end, len) > today ? today : shiftDay(end, len) })}
                aria-label="Później"
                aria-disabled={end === today}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  end === today && "pointer-events-none opacity-40",
                )}
              >
                <ChevronRight />
              </Link>
            </div>
          </>
        }
      />

      {cur.stops === 0 ? (
        <Panel>
          <EmptyState icon={<ChartNoAxesCombined />} title="Brak zrealizowanych tras w tym okresie">
            Raport liczy się z tras, które kierowcy realizują w aplikacji. Wybierz inny okres albo poczekaj na pierwsze dostawy.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label="Sprzedaż dostarczona"
              value={formatPlnCompact(cur.deliveredValueGrosze)}
              delta={pctChange(cur.deliveredValueGrosze, prev.deliveredValueGrosze)}
              sub={`z ${formatPlnCompact(cur.plannedValueGrosze)} zaplanowanych`}
            />
            <StatTile
              label="Dostawy zrealizowane"
              value={cur.finished.toLocaleString("pl-PL")}
              delta={pctChange(cur.finished, prev.finished)}
              sub={`${cur.routes} kursów, ${cur.extraCourses} dodatkowych`}
            />
            <StatTile
              label="Terminowość"
              value={pct(cur.onTimePct)}
              tone={cur.onTimePct !== null && cur.onTimePct < 90 ? "warning" : "success"}
              delta={
                cur.onTimePct !== null && prev.onTimePct !== null ? Math.round((cur.onTimePct - prev.onTimePct) * 10) / 10 : null
              }
              deltaSuffix=" pp."
              sub="dostaw w oknie przyjęć"
            />
            <StatTile
              label="Reklamacje i odmowy"
              value={cur.exceptions}
              tone={cur.exceptions ? "plum" : undefined}
              delta={pctChange(cur.exceptions, prev.exceptions)}
              deltaGoodWhen="down"
              sub={
                cur.finished
                  ? `${((cur.exceptions / cur.finished) * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}% dostaw`
                  : undefined
              }
            />
            <StatTile
              label="Koszt transportu"
              value={formatPlnCompact(cur.costGrosze)}
              delta={costShare !== null && prevCostShare !== null ? Math.round((costShare - prevCostShare) * 10) / 10 : null}
              deltaGoodWhen="down"
              deltaSuffix=" pp."
              sub={`${pct(costShare)} sprzedaży · ${formatPln(perStop(cur))} na dostawę`}
            />
          </div>

          <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel
              title="Sprzedaż dostarczona dzień po dniu"
              description="Ostatnie 4 tygodnie. Ciemniejsze słupki to wybrany okres, linia przerywana — średnia dnia roboczego."
              actions={
                <span className="text-sm text-muted">
                  średnio <b className="font-semibold text-foreground">{formatPlnCompact(avgValue)}</b> dziennie
                </span>
              }
            >
              <BarChart
                ariaLabel="Sprzedaż dostarczona w kolejnych dniach"
                format={(v) => formatPlnCompact(v)}
                reference={avgValue ? { value: avgValue, label: "średnia" } : undefined}
                data={trend.map((t) => ({
                  key: t.day,
                  label: short(t.day),
                  value: t.k.deliveredValueGrosze,
                  highlight: t.day >= start && t.day <= end,
                  muted: t.k.stops === 0,
                  tooltip: t.k.stops
                    ? `${formatDayLabel(t.day)}: ${formatPln(t.k.deliveredValueGrosze)}, ${t.k.finished} dostaw`
                    : `${formatDayLabel(t.day)}: bez dostaw`,
                }))}
              />
            </Panel>
            <Panel title="Terminowość dzień po dniu" description="Udział dostaw w oknie przyjęć; cel 95%.">
              <LineChart
                ariaLabel="Terminowość w kolejnych dniach"
                min={70}
                max={100}
                format={(v) => `${v}%`}
                target={{ value: 95, label: "cel 95%" }}
                points={trend.map((t) => ({
                  key: t.day,
                  label: short(t.day),
                  value: t.k.onTimePct === null ? null : Math.max(70, t.k.onTimePct),
                  tooltip:
                    t.k.onTimePct === null
                      ? `${formatDayLabel(t.day)}: bez dostaw`
                      : `${formatDayLabel(t.day)}: ${pct(t.k.onTimePct)} (${t.k.onTime} z ${t.k.withWindow})`,
                }))}
              />
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
                <MiniStat label="km w okresie" value={cur.km.toLocaleString("pl-PL")} />
                <MiniStat
                  label="km na dostawę"
                  value={cur.finished ? (cur.km / cur.finished).toLocaleString("pl-PL", { maximumFractionDigits: 1 }) : "—"}
                />
                <MiniStat
                  label="dostaw na kurs"
                  value={cur.routes ? (cur.finished / cur.routes).toLocaleString("pl-PL", { maximumFractionDigits: 1 }) : "—"}
                />
              </div>
            </Panel>
          </div>

          <Panel
            title="Efektywność kierunków"
            description={`Trasy stałe w okresie ${rangeLabel}. Koszt: km × stawka auta + dzień kierowcy + koszt stały auta.`}
            flush
            className="mb-6"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                    <th className="py-2.5 pr-3 pl-5 font-medium">Kierunek</th>
                    <th className="px-3 py-2.5 text-right font-medium">Kursy</th>
                    <th className="px-3 py-2.5 text-right font-medium">Dostawy</th>
                    <th className="px-3 py-2.5 font-medium">Terminowość</th>
                    <th className="px-3 py-2.5 text-right font-medium">Wyjątki</th>
                    <th className="px-3 py-2.5 text-right font-medium">Km</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sprzedaż</th>
                    <th className="px-3 py-2.5 text-right font-medium">Koszt</th>
                    <th className="px-3 py-2.5 text-right font-medium">Na dostawę</th>
                    <th className="py-2.5 pr-5 pl-3 text-right font-medium">Koszt / sprzedaż</th>
                  </tr>
                </thead>
                <tbody>
                  {laneRows.map((l) => {
                    const share = l.k.deliveredValueGrosze ? (l.cost / l.k.deliveredValueGrosze) * 100 : null;
                    return (
                      <tr key={l.name} className="border-b border-border last:border-0 hover:bg-surface-2">
                        <td className="py-2.5 pr-3 pl-5 font-medium">{l.name}</td>
                        <td className="px-3 py-2.5 text-right">{l.courses}</td>
                        <td className="px-3 py-2.5 text-right">{l.k.finished}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-foreground/[0.07]">
                              <span
                                className={cn(
                                  "block h-full rounded-full",
                                  (l.k.onTimePct ?? 0) >= 95
                                    ? "bg-success"
                                    : (l.k.onTimePct ?? 0) >= 85
                                      ? "bg-warning"
                                      : "bg-danger",
                                )}
                                style={{ width: `${l.k.onTimePct ?? 0}%` }}
                              />
                            </span>
                            <span className="tabular-nums">{pct(l.k.onTimePct)}</span>
                          </span>
                        </td>
                        <td className={cn("px-3 py-2.5 text-right", l.k.exceptions && "font-medium text-plum")}>
                          {l.k.exceptions || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">{l.k.km.toLocaleString("pl-PL")}</td>
                        <td className="px-3 py-2.5 text-right">{formatPlnCompact(l.k.deliveredValueGrosze)}</td>
                        <td className="px-3 py-2.5 text-right">{formatPlnCompact(l.cost)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {l.k.finished ? formatPln(Math.round(l.cost / l.k.finished)) : "—"}
                        </td>
                        <td
                          className={cn(
                            "py-2.5 pr-5 pl-3 text-right font-medium",
                            share !== null && share > 15
                              ? "text-danger"
                              : share !== null && share > 10
                                ? "text-warning"
                                : "text-foreground",
                          )}
                        >
                          {share === null ? "—" : `${share.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mb-6 grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
            <Panel title="Najwięksi klienci" description="Sprzedaż dostarczona w okresie" flush>
              <ol className="divide-y divide-border text-sm">
                {top.map((c, i) => (
                  <li key={c.customerId} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-4 text-right text-xs text-subtle tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.customer}</span>
                      <span className="text-xs text-muted">
                        {c.stops} dostaw{c.exceptions ? `, ${c.exceptions} z problemem` : ""}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatPlnCompact(c.valueGrosze)}</span>
                  </li>
                ))}
              </ol>
            </Panel>

            <Panel title="Reklamacje, odmowy i braki odbioru" description={`${exceptions.length} w okresie ${rangeLabel}`} flush>
              {exceptions.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted">Bez problemów na punktach w tym okresie.</p>
              ) : (
                <ul className="max-h-[360px] divide-y divide-border overflow-y-auto text-sm">
                  {exceptions.map(({ s, r }) => (
                    <li key={s.id} className="flex gap-3 px-5 py-2.5">
                      <MessageSquare className="mt-0.5 size-4 shrink-0 text-plum" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{s.customer}</span>
                          <Pill tone={s.status === "complaint" ? "plum" : "danger"} dot={false}>
                            {s.status === "complaint" ? "reklamacja" : s.status === "refused" ? "odmowa" : "brak odbioru"}
                          </Pill>
                        </span>
                        <span className="block text-xs text-muted">
                          {short(r.date)}, {r.name}
                          {s.reason ? ` — ${s.reason}` : ""}
                        </span>
                      </span>
                      <span className="text-xs text-muted tabular-nums">{formatPlnCompact(s.valueGrosze)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="Opakowania i gotówka"
              description="Stan na dziś, z księgi ruchów"
              className="lg:col-span-2 2xl:col-span-1"
            >
              <div className="space-y-5 text-sm">
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="font-medium">U klientów</p>
                    <p className="text-xs text-muted">
                      kaucja <b className="font-semibold text-foreground tabular-nums">{formatPln(pkgDeposit)}</b>
                    </p>
                  </div>
                  <ul className="mt-2 grid grid-cols-3 gap-2">
                    {pkg.atCustomers.map((t) => (
                      <li key={t.typeCode} className="rounded-lg bg-surface-2 px-3 py-2">
                        <p className="text-lg font-semibold tabular-nums">{t.qty.toLocaleString("pl-PL")}</p>
                        <p className="truncate text-xs text-muted">{typeName(t.typeCode).toLowerCase()}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 font-medium">Najwięcej zalega u</p>
                  <ul className="space-y-1">
                    {pkg.customersOwing.slice(0, 4).map((c) => (
                      <li key={c.partyId} className="flex justify-between gap-3 text-[13px]">
                        <span className="truncate">{pack.customerNames.get(c.partyId) ?? "—"}</span>
                        <span className="whitespace-nowrap text-muted tabular-nums">
                          {Object.entries(c.byType)
                            .map(([code, q]) => `${q} ${code === "EUR" ? "pal." : "skrz."}`)
                            .join(", ")}{" "}
                          · {formatPln(c.depositGrosze)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <div>
                    <p className="text-xs text-muted">Gotówka nierozliczona</p>
                    <p className="text-lg font-semibold tabular-nums">{formatPlnCompact(cashOpen)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Opakowania u kierowców</p>
                    <p className="text-lg font-semibold tabular-nums">{driverHeld.toLocaleString("pl-PL")} szt.</p>
                    <p className={cn("text-xs", driverMissing ? "font-medium text-danger" : "text-muted")}>
                      {driverMissing ? `brakuje ${Math.abs(driverMissing)} szt.` : "do zdania na magazyn"}
                    </p>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          <p className="text-xs text-subtle">
            Porównanie okresu {rangeLabel} z {len === 1 ? formatDayLabel(prevEnd) : `${short(prevStart)} – ${short(prevEnd)}`}:
            sprzedaż <Delta value={pctChange(cur.deliveredValueGrosze, prev.deliveredValueGrosze)} />, dostawy{" "}
            <Delta value={pctChange(cur.finished, prev.finished)} />.
          </p>
        </>
      )}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
