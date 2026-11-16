import { ChartNoAxesCombined } from "lucide-react";
import type { Metadata } from "next";
import { Delta, EmptyState, PageHeader, Panel, Segmented, StatTile } from "@/components/panel/page";
import { formatPln, formatPlnCompact } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { dayKpis, groupByLane, nowForDay, pctChange, routeCostGrosze } from "@/modules/ops/domain/reports";
import { PERIOD_KEYS, PERIOD_LABELS, parsePeriod, resolvePeriod } from "@/modules/ops/domain/period";
import { getReportRoutes, nowInWarsaw } from "@/modules/ops/server/queries";
import { DayForecastPanel } from "@/modules/ops/ui/day-forecast";
import { formatDayLabel, nextWorkingDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Rentowność" };

const short = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`);

export default async function ProfitabilityPage({ searchParams }: PageProps<"/raport">) {
  const ctx = await requireAccess("/raport");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const periodKey = parsePeriod(sp.okres);
  const period = resolvePeriod(periodKey, today);
  const planKey = sp.plan === "jutro" ? "jutro" : "dzis";
  const planDate = planKey === "jutro" ? nextWorkingDay(today) : today;
  const planNow = nowForDay(planDate, today, nowInWarsaw());

  const [current, previous, planRoutes] = await Promise.all([
    getReportRoutes(ctx.tenantId, period.start, period.end),
    getReportRoutes(ctx.tenantId, period.prevStart, period.prevEnd),
    getReportRoutes(ctx.tenantId, planDate, planDate),
  ]);
  const cur = dayKpis(current);
  const prev = dayKpis(previous);
  const rangeLabel = period.start === period.end ? formatDayLabel(period.end) : `${short(period.start)} – ${short(period.end)}`;

  const netCur = cur.deliveredValueGrosze - cur.costGrosze;
  const netPrev = prev.deliveredValueGrosze - prev.costGrosze;
  const costShare = cur.deliveredValueGrosze ? Math.round((cur.costGrosze / cur.deliveredValueGrosze) * 1000) / 10 : null;
  const prevCostShare = prev.deliveredValueGrosze ? Math.round((prev.costGrosze / prev.deliveredValueGrosze) * 1000) / 10 : null;

  const lanes = [...groupByLane(current).entries()]
    .map(([name, rs]) => ({
      name,
      k: dayKpis(rs),
      courses: rs.length,
      cost: rs.reduce((a, r) => a + (r.km !== null ? routeCostGrosze(r) : 0), 0),
    }))
    .sort((a, b) => b.k.deliveredValueGrosze - a.k.deliveredValueGrosze);
  const problemLanes = [...lanes].filter((l) => l.k.exceptions > 0).sort((a, b) => b.k.exceptions - a.k.exceptions);

  const href = (p: { okres?: string; plan?: string }) => {
    const u = new URLSearchParams();
    const pl = p.plan ?? planKey;
    if (pl !== "dzis") u.set("plan", pl);
    const o = p.okres ?? periodKey;
    if (o !== "7") u.set("okres", o);
    const s = u.toString();
    return `/raport${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Rentowność"
        description="Ile dowieźliśmy, ile to kosztowało i gdzie tracimy. Wybierz okres; plan i prognoza dnia są zawsze na górze."
      />

      <Panel
        className="mb-6"
        title={planKey === "jutro" ? `Plan na ${formatDayLabel(planDate)}` : "Dziś: plan, realizacja i prognoza końca dnia"}
        description={
          planKey === "jutro"
            ? "Co zaplanował dyspozytor i jak skończy się dzień, jeśli trasy wyjadą o czasie."
            : "Prognoza zakłada, że pozostałe punkty zostaną dostarczone w obecnym tempie każdej trasy."
        }
        actions={
          <Segmented
            items={[
              { href: href({ plan: "dzis" }), label: "Dziś", active: planKey === "dzis" },
              {
                href: href({ plan: "jutro" }),
                label: formatDayLabel(nextWorkingDay(today)).split(",")[0],
                active: planKey === "jutro",
              },
            ]}
          />
        }
        flush
      >
        {planRoutes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Na {formatDayLabel(planDate)} nie ma jeszcze tras — plan pojawi się, gdy dyspozytor utworzy dzień.
          </p>
        ) : (
          <DayForecastPanel routes={planRoutes} now={planNow} future={planKey === "jutro"} />
        )}
      </Panel>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex flex-wrap items-baseline gap-x-2 text-[17px] font-semibold">
          Wyniki <span className="font-normal text-muted capitalize">{rangeLabel}</span>
          <span className="text-xs font-normal text-subtle">— porównanie: {period.compare}</span>
        </h2>
        <Segmented
          items={PERIOD_KEYS.map((k) => ({ href: href({ okres: k }), label: PERIOD_LABELS[k], active: k === periodKey }))}
        />
      </div>

      {cur.stops === 0 ? (
        <Panel>
          <EmptyState icon={<ChartNoAxesCombined />} title="Brak tras w tym okresie">
            Wyniki liczą się z tras realizowanych w aplikacji kierowcy. Wybierz inny okres.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="Sprzedaż dostarczona"
              value={formatPlnCompact(cur.deliveredValueGrosze)}
              delta={pctChange(cur.deliveredValueGrosze, prev.deliveredValueGrosze)}
              sub={`z ${formatPlnCompact(cur.plannedValueGrosze)} zaplanowanych`}
            />
            <StatTile
              label="Koszt transportu"
              value={formatPlnCompact(cur.costGrosze)}
              delta={pctChange(cur.costGrosze, prev.costGrosze)}
              deltaGoodWhen="down"
              sub={`${cur.km.toLocaleString("pl-PL")} km, ${cur.routes} kursów`}
            />
            <StatTile
              label="Po kosztach transportu"
              value={formatPlnCompact(netCur)}
              delta={pctChange(netCur, netPrev)}
              sub="sprzedaż minus transport"
            />
            <StatTile
              label="Koszt / sprzedaż"
              value={pct(costShare)}
              tone={costShare !== null && costShare > 10 ? "warning" : undefined}
              delta={costShare !== null && prevCostShare !== null ? Math.round((costShare - prevCostShare) * 10) / 10 : null}
              deltaGoodWhen="down"
              deltaSuffix=" pp."
              sub={cur.finished ? `${formatPln(Math.round(cur.costGrosze / cur.finished))} na dostawę` : undefined}
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
              label="Reklamacje i braki odbioru"
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
          </div>

          <Panel
            title="Efektywność tras"
            description="Trasy stałe, kursy dodatkowe razem. Koszt: km × stawka auta + dzień kierowcy + koszt stały auta."
            flush
            className="mb-6"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                    <th className="py-2.5 pr-3 pl-5 font-medium">Trasa</th>
                    <th className="px-3 py-2.5 text-right font-medium">Kursy</th>
                    <th className="px-3 py-2.5 text-right font-medium">Dostawy</th>
                    <th className="px-3 py-2.5 font-medium">Terminowość</th>
                    <th className="px-3 py-2.5 text-right font-medium">Km</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sprzedaż</th>
                    <th className="px-3 py-2.5 text-right font-medium">Koszt</th>
                    <th className="px-3 py-2.5 text-right font-medium">Na dostawę</th>
                    <th className="py-2.5 pr-5 pl-3 text-right font-medium">Koszt / sprzedaż</th>
                  </tr>
                </thead>
                <tbody>
                  {lanes.map((l) => {
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

          <Panel
            title="Reklamacje i braki odbioru"
            description={`Na których trasach pojawiają się problemy — ${cur.exceptions} w okresie ${rangeLabel}.`}
            flush
            className="mb-6"
          >
            {problemLanes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Bez reklamacji, odmów i braków odbioru w tym okresie.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                      <th className="py-2.5 pr-3 pl-5 font-medium">Trasa</th>
                      <th className="px-3 py-2.5 text-right font-medium">Dostawy</th>
                      <th className="px-3 py-2.5 text-right font-medium">Reklamacje</th>
                      <th className="px-3 py-2.5 text-right font-medium">Odmowy</th>
                      <th className="px-3 py-2.5 text-right font-medium">Brak odbioru</th>
                      <th className="px-3 py-2.5 text-right font-medium">Razem</th>
                      <th className="py-2.5 pr-5 pl-3 text-right font-medium">% dostaw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problemLanes.map((l) => {
                      const share = l.k.finished ? (l.k.exceptions / l.k.finished) * 100 : null;
                      const dash = (n: number) => (n ? n : "—");
                      return (
                        <tr key={l.name} className="border-b border-border last:border-0 hover:bg-surface-2">
                          <td className="py-2.5 pr-3 pl-5 font-medium">{l.name}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{l.k.finished}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{dash(l.k.complaints)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{dash(l.k.refused)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{dash(l.k.absent)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-plum tabular-nums">{l.k.exceptions}</td>
                          <td
                            className={cn(
                              "py-2.5 pr-5 pl-3 text-right font-medium tabular-nums",
                              share !== null && share > 8 ? "text-danger" : share !== null && share > 4 ? "text-warning" : "",
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
            )}
          </Panel>

          <p className="text-xs text-subtle">
            Porównanie okresu {rangeLabel} z{" "}
            {period.prevStart === period.prevEnd ? formatDayLabel(period.prevEnd) : `${short(period.prevStart)} – ${short(period.prevEnd)}`}
            : sprzedaż <Delta value={pctChange(cur.deliveredValueGrosze, prev.deliveredValueGrosze)} />, dostawy{" "}
            <Delta value={pctChange(cur.finished, prev.finished)} />.
          </p>
        </>
      )}
    </>
  );
}
