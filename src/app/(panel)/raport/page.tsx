import { ChartNoAxesCombined, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Delta, EmptyState, PageHeader, Panel, Segmented, StatTile } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { DATE_RE, formatPln, formatPlnCompact } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { dayKpis, groupByLane, pctChange, routeCostGrosze } from "@/modules/ops/domain/reports";
import { VIEW_KEYS, VIEW_LABELS, daysBetween, parseView, resolveView } from "@/modules/ops/domain/period";
import { getReportRoutes } from "@/modules/ops/server/queries";
import { formatDayLabel, todayInWarsaw } from "@/modules/orders/domain/orders";
import { monthLabel } from "@/modules/payroll/domain/month";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Rentowność" };

const short = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`);

export default async function ProfitabilityPage({ searchParams }: PageProps<"/raport">) {
  const ctx = await requireAccess("/raport");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const view = parseView(sp.widok);
  const anchor = typeof sp.data === "string" && DATE_RE.test(sp.data) ? sp.data : today;
  const period = resolveView(view, anchor);

  const [current, previous] = await Promise.all([
    getReportRoutes(ctx.tenantId, period.start, period.end),
    getReportRoutes(ctx.tenantId, period.prevStart, period.prevEnd),
  ]);
  const cur = dayKpis(current);
  const prev = dayKpis(previous);
  const rangeLabel =
    view === "dzien"
      ? formatDayLabel(period.end)
      : view === "miesiac"
        ? monthLabel(period.start.slice(0, 7))
        : `${short(period.start)} – ${short(period.end)}`;

  // pasek dni (tydzień i miesiąc): wynik każdego dnia, kliknięcie otwiera widok dnia
  const byDay = new Map<string, typeof current>();
  for (const r of current) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const strip = daysBetween(period.start, period.end).map((d) => {
    const rs = byDay.get(d) ?? [];
    const k = dayKpis(rs);
    const cost = rs.reduce((a, r) => a + (r.km !== null ? routeCostGrosze(r) : 0), 0);
    const share = k.deliveredValueGrosze ? (cost / k.deliveredValueGrosze) * 100 : null;
    return { day: d, has: rs.length > 0 && k.stops > 0, k, cost, share };
  });

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

  const href = (v: string, d: string) => {
    const u = new URLSearchParams();
    if (v !== "dzien") u.set("widok", v);
    if (d !== today) u.set("data", d);
    const q = u.toString();
    return `/raport${q ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Rentowność"
        description="Ile dowieźliśmy, ile to kosztowało i gdzie tracimy — dla dowolnego dnia, tygodnia albo całego miesiąca."
        actions={
          <>
            <Segmented
              items={VIEW_KEYS.map((v) => ({ href: href(v, anchor), label: VIEW_LABELS[v], active: v === view }))}
            />
            <div className="flex items-center gap-1">
              <Link href={href(view, period.prevAnchor)} aria-label="Poprzedni okres" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ChevronLeft />
              </Link>
              <Link
                href={href(view, today)}
                aria-label="Wróć do dzisiaj"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-w-44 font-semibold capitalize")}
              >
                {rangeLabel}
              </Link>
              <Link href={href(view, period.nextAnchor)} aria-label="Następny okres" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ChevronRight />
              </Link>
            </div>
          </>
        }
      />

      <p className="mb-3 text-xs text-subtle">Porównanie: {period.compare}.</p>

      {view !== "dzien" && (
        <Panel
          className="mb-6"
          title={view === "miesiac" ? "Dni miesiąca" : "Dni tygodnia"}
          description="Kolor pokazuje, ile sprzedaży zjadł transport (koszt / sprzedaż). Kliknij dzień, aby zobaczyć jego wynik."
        >
          <div className={cn("grid gap-1.5", view === "miesiac" ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-7")}>
            {strip.map((d) => (
              <Link
                key={d.day}
                href={href("dzien", d.day)}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-center transition-colors hover:border-primary-strong",
                  !d.has
                    ? "border-border bg-surface-2 text-subtle"
                    : d.share !== null && d.share > 15
                      ? "border-danger/40 bg-danger-soft"
                      : d.share !== null && d.share > 10
                        ? "border-warning/40 bg-warning-soft"
                        : "border-success/30 bg-success-soft",
                )}
                title={d.has ? `${formatDayLabel(d.day)}: sprzedaż ${formatPln(d.k.deliveredValueGrosze)}, transport ${formatPln(d.cost)}` : formatDayLabel(d.day)}
              >
                <span className="block text-[11px] text-muted capitalize">{formatDayLabel(d.day).split(",")[0].slice(0, 3)}</span>
                <span className="block text-sm font-semibold tabular-nums">{Number(d.day.slice(8, 10))}</span>
                <span className="block text-[11px] tabular-nums">{d.has ? formatPlnCompact(d.k.deliveredValueGrosze) : "—"}</span>
                <span className="block text-[11px] text-muted tabular-nums">{d.share === null ? "" : pct(Math.round(d.share * 10) / 10)}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {cur.stops === 0 ? (
        <Panel>
          <EmptyState icon={<ChartNoAxesCombined />} title="Brak tras w tym okresie">
            Wyniki liczą się z tras realizowanych w aplikacji kierowcy. Wybierz inny dzień, tydzień lub miesiąc.
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
