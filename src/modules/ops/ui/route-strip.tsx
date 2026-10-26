import { Pill, type Tone } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { STOP_STATUS_LABELS } from "@/modules/execution/domain/execution";
import { ROUTE_STATE_LABELS, stopTimeliness, type ReportStop, type RouteState, type Timeliness } from "../domain/reports";

/** Kolor punktu: wynik dostawy + terminowość. Reklamacje/zwroty śliwkowe, alarmy pomidorowe. */
export function stopTone(s: Pick<ReportStop, "status">, t: Timeliness): Tone {
  if (s.status === "complaint") return "plum";
  if (s.status === "refused" || s.status === "absent") return "danger";
  if (s.status === "in_progress" || s.status === "arrived") return "info";
  if (t === "overdue") return "danger";
  if (t === "at_risk") return "warning";
  if (t === "late") return "warning";
  if (s.status === "delivered" || s.status === "partial") return "success";
  return "neutral";
}

export function stopLabel(s: Pick<ReportStop, "status">, t: Timeliness): string {
  if (s.status === "in_progress" || s.status === "arrived") return "kierowca na miejscu";
  if (s.status === "pending" && t === "overdue") return "spóźniona";
  if (s.status === "pending" && t === "at_risk") return "zagrożona";
  if (s.status === "pending") return "w drodze";
  if ((s.status === "delivered" || s.status === "partial") && t === "late") return `${STOP_STATUS_LABELS[s.status]} po oknie`;
  return STOP_STATUS_LABELS[s.status];
}

export function StopStatusPill({ stop, now }: { stop: ReportStop; now: string | null }) {
  const t = stopTimeliness(stop, now);
  return <Pill tone={stopTone(stop, t)}>{stopLabel(stop, t)}</Pill>;
}

const ROUTE_STATE_TONE: Record<RouteState, Tone> = {
  draft: "neutral",
  not_started: "neutral",
  in_progress: "info",
  done: "warning",
  closed: "success",
};

export function RouteStatePill({ state, alarm }: { state: RouteState; alarm?: boolean }) {
  return <Pill tone={alarm ? "danger" : ROUTE_STATE_TONE[state]}>{ROUTE_STATE_LABELS[state]}</Pill>;
}

const FILL: Record<Tone, string> = {
  success: "bg-success border-success",
  warning: "bg-warning border-warning",
  danger: "bg-danger border-danger",
  info: "bg-info border-info",
  plum: "bg-plum border-plum",
  primary: "bg-primary border-primary",
  neutral: "bg-surface border-border-strong",
};

/**
 * Linia trasy jak linia metra: każdy przystanek to kropka w kolejności dostaw.
 * Pełna kropka = zrealizowany, pusta = przed kierowcą, pierścień = kierowca teraz tutaj.
 */
export function RouteStrip({ stops, now, className }: { stops: ReportStop[]; now: string | null; className?: string }) {
  if (stops.length === 0) return <span className="text-xs text-subtle">brak punktów</span>;
  const lastDone = stops.reduce((acc, s, i) => (s.status !== "pending" ? i : acc), -1);
  return (
    <div className={cn("relative flex items-center", className)} role="img" aria-label={`Trasa: ${stops.length} punktów`}>
      <div className="absolute inset-x-1 top-1/2 h-[2px] -translate-y-1/2 rounded bg-border" aria-hidden />
      {lastDone >= 0 && (
        <div
          className="absolute left-1 top-1/2 h-[2px] -translate-y-1/2 rounded bg-success/60"
          style={{ width: `calc(${(lastDone / Math.max(stops.length - 1, 1)) * 100}% - 8px)` }}
          aria-hidden
        />
      )}
      <ol className="relative flex w-full items-center justify-between">
        {stops.map((s) => {
          const t = stopTimeliness(s, now);
          const tone = stopTone(s, t);
          const pending = s.status === "pending";
          const here = s.status === "in_progress" || s.status === "arrived";
          return (
            <li key={s.id} className="group relative flex h-5 items-center justify-center" style={{ width: 10 }}>
              <span
                className={cn(
                  "block rounded-full border-2",
                  here ? "h-3.5 w-3.5 bg-surface ring-4 ring-info/20 border-info live-dot" : "h-2.5 w-2.5",
                  !here &&
                    (pending
                      ? tone === "neutral"
                        ? "border-border-strong bg-surface"
                        : cn("bg-surface", FILL[tone].split(" ")[1])
                      : FILL[tone]),
                )}
                title={`${s.sequence}. ${s.customer} — ${stopLabel(s, t)}${s.windowEnd ? ` (okno ${s.windowStart ?? ""}–${s.windowEnd})` : ""}${s.completedAt ? `, ${s.completedAt}` : ""}`}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
