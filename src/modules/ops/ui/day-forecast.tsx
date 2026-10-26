import type { ReactNode } from "react";
import { Meter } from "@/components/panel/page";
import { Plate } from "@/components/ui/status";
import { formatPln, formatPlnCompact } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { dayForecast } from "../domain/forecast";
import { routeProgress, type ReportRoute } from "../domain/reports";
import { RouteStatePill } from "./route-strip";

const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`);

/**
 * Plan dnia, bieżąca realizacja i prognoza końca dnia (przy założeniu, że pozostałe punkty zostaną dostarczone
 * w obecnym tempie tras). Dla zarządu — działa też dla dnia, który jeszcze się nie zaczął.
 */
export function DayForecastPanel({ routes, now, future }: { routes: ReportRoute[]; now: string | null; future: boolean }) {
  const f = dayForecast(routes, now);
  const byId = new Map(f.routes.map((r) => [r.routeId, r]));
  const planned = f.plannedValueGrosze || 1;
  const seg = (v: number) => `${(v / planned) * 100}%`;
  const vsPlan = f.plannedValueGrosze ? Math.round((f.forecastValueGrosze / f.plannedValueGrosze) * 1000) / 10 : null;

  return (
    <div className="flex flex-col">
      <div className="grid gap-px border-b border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label="Zaplanowana sprzedaż"
          value={formatPlnCompact(f.plannedValueGrosze)}
          sub={`${f.plannedStops} dostaw na ${routes.length} trasach`}
        />
        <Figure
          label={future ? "Dostarczono" : "Dostarczono do teraz"}
          value={formatPlnCompact(f.deliveredValueGrosze)}
          sub={`${f.doneStops} z ${f.plannedStops} dostaw`}
          tone="text-success"
        />
        <Figure
          label="Prognoza na koniec dnia"
          value={formatPlnCompact(f.forecastValueGrosze)}
          sub={`${pct(vsPlan)} planu${f.lostValueGrosze ? `, ${formatPlnCompact(f.lostValueGrosze)} odmów i braków odbioru` : ""}`}
        />
        <Figure
          label="Terminowość: teraz → prognoza"
          value={
            <>
              {pct(f.currentOnTimePct)} <span className="text-subtle">→</span> {pct(f.forecastOnTimePct)}
            </>
          }
          sub={f.forecastLate ? `${f.forecastLate} punktów zagrożonych spóźnieniem` : "pozostałe punkty zdążą w oknach"}
          tone={f.forecastLate ? "text-warning" : undefined}
        />
      </div>

      <div className="flex flex-col gap-2 px-5 pt-4 pb-2">
        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-foreground/[0.06]"
          role="img"
          aria-label="Struktura planu dnia"
        >
          <span className="h-full bg-success" style={{ width: seg(f.deliveredValueGrosze) }} />
          <span className="ml-[2px] h-full bg-steel/70" style={{ width: seg(f.remainingValueGrosze) }} />
          {f.lostValueGrosze > 0 && <span className="ml-[2px] h-full bg-danger" style={{ width: seg(f.lostValueGrosze) }} />}
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-success" /> dostarczone {formatPln(f.deliveredValueGrosze)}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-steel/70" /> do dowiezienia {formatPln(f.remainingValueGrosze)}
          </li>
          {f.lostValueGrosze > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-danger" /> nie dojedzie {formatPln(f.lostValueGrosze)}
            </li>
          )}
          <li className="ml-auto">
            Trasy: {f.routesOnRoad} w drodze, {f.routesNotStarted} przed wyjazdem, {f.routesDone} zakończone
            {f.lastBackAt && (
              <>
                {" "}
                · ostatni powrót ok. <b className="font-semibold text-foreground">{f.lastBackAt}</b>
              </>
            )}
          </li>
        </ul>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-y border-border bg-surface-2 text-left text-xs text-muted">
              <th className="py-2.5 pr-3 pl-5 font-medium">Trasa</th>
              <th className="px-3 py-2.5 font-medium">Kierowca i auto</th>
              <th className="px-3 py-2.5 font-medium">Realizacja</th>
              <th className="px-3 py-2.5 text-right font-medium">Plan</th>
              <th className="px-3 py-2.5 text-right font-medium">Dostarczono</th>
              <th className="px-3 py-2.5 text-right font-medium">Do dowiezienia</th>
              <th className="px-3 py-2.5 text-right font-medium">Zagrożone</th>
              <th className="py-2.5 pr-5 pl-3 text-right font-medium">Koniec / powrót</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => {
              const x = byId.get(r.id)!;
              const p = routeProgress(r, now);
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="py-2.5 pr-3 pl-5">
                    <span className="font-medium">{r.name}</span>
                    <span className="mt-0.5 block">
                      <RouteStatePill state={p.state} alarm={p.startOverdue} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2 text-[13px]">
                      <Plate>{r.vehicle}</Plate>
                      <span className="truncate text-muted">{r.driver ?? "bez kierowcy"}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <Meter
                        pct={x.plannedStops ? Math.round((x.doneStops / x.plannedStops) * 100) : 0}
                        tone="success"
                        className="w-24"
                      />
                      <span className="text-xs tabular-nums text-muted">
                        {x.doneStops}/{x.plannedStops}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPlnCompact(x.plannedValueGrosze)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-success">{formatPlnCompact(x.deliveredValueGrosze)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {x.remainingValueGrosze ? formatPlnCompact(x.remainingValueGrosze) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      x.forecastLate ? "font-semibold text-warning" : "text-subtle",
                    )}
                  >
                    {x.forecastLate || "—"}
                  </td>
                  <td className="py-2.5 pr-5 pl-3 text-right text-[13px] tabular-nums whitespace-nowrap">
                    {p.state === "done" || p.state === "closed" ? (
                      <span className="text-muted">zakończona {x.lastStopAt ?? ""}</span>
                    ) : x.backAt ? (
                      <>
                        ok. {x.lastStopAt} <span className="text-subtle">/ {x.backAt}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className={cn("mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums", tone)}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
