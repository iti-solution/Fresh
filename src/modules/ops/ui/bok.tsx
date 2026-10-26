import { Clock, MapPin, MessageSquare, Phone, Truck } from "lucide-react";
import { DocRef, Pill, Plate } from "@/components/ui/status";
import { formatPln } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { isFinished } from "@/modules/execution/domain/execution";
import { driverPosition, etaFitsWindow, type RouteEta } from "../domain/forecast";
import { routeProgress, stopTimeliness, type ReportRoute, type ReportStop } from "../domain/reports";
import { RouteStatePill, RouteStrip, StopStatusPill } from "./route-strip";

const tel = (p: string) => `tel:${p.replace(/\s/g, "")}`;
const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

/** Jednym zdaniem: gdzie teraz jest kierowca tej trasy. */
export function whereIsDriver(route: ReportRoute, now: string | null, eta: RouteEta): string {
  const p = routeProgress(route, now);
  const pos = driverPosition(route);
  if (p.state === "not_started" || p.state === "draft")
    return p.startOverdue
      ? `Trasa nie wyjechała — planowany wyjazd był o ${route.plannedStart}`
      : `Wyjazd z magazynu o ${route.plannedStart ?? "—"}`;
  if (p.state === "done" || p.state === "closed") return `Trasa zakończona — ostatni punkt o ${p.lastCompletedAt ?? "—"}`;
  if (pos.at) return `Kierowca jest teraz u: ${pos.at.customer}, ${pos.at.city} (punkt ${pos.at.sequence} z ${p.total})`;
  if (pos.lastDone)
    return `Ostatnio u: ${pos.lastDone.customer} o ${pos.lastDone.completedAt}; jedzie do: ${p.next?.customer ?? "—"}${p.next && eta.etas.get(p.next.id) ? ` (ok. ${eta.etas.get(p.next.id)})` : ""}`;
  return `W drodze do pierwszego punktu: ${p.next?.customer ?? "—"}`;
}

/** Nagłówek trasy: kto jedzie, czym, telefon, postęp, gdzie jest teraz, kiedy wróci. */
export function RouteHeader({
  route,
  now,
  eta,
  highlightId,
}: {
  route: ReportRoute;
  now: string | null;
  eta: RouteEta;
  highlightId?: string | string[];
}) {
  const p = routeProgress(route, now);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-[16px] font-semibold">{route.name}</h3>
        <RouteStatePill state={p.state} alarm={p.startOverdue} />
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <Truck className="size-4 text-subtle" />
          {route.driver ?? "bez kierowcy"}
          <Plate>{route.vehicle}</Plate>
        </span>
        {route.driverPhone && (
          <a
            href={tel(route.driverPhone)}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-strong hover:underline"
          >
            <Phone className="size-3.5" /> {route.driverPhone}
          </a>
        )}
        <span className="ml-auto text-[13px] text-muted tabular-nums">
          <b className="font-semibold text-foreground">{p.finished}</b> z {p.total} punktów
          {eta.backAt && p.state !== "done" && p.state !== "closed" && <> · powrót ok. {eta.backAt}</>}
        </span>
      </div>
      <RouteStrip stops={[...route.stops].sort((a, b) => a.sequence - b.sequence)} now={now} highlightId={highlightId} />
      <p className="flex items-center gap-2 text-[13px]">
        <MapPin className="size-4 shrink-0 text-primary" />
        <span>{whereIsDriver(route, now, eta)}</span>
      </p>
    </div>
  );
}

/** Lista punktów trasy w kolejności: zrealizowane z godziną, pozostałe z szacowanym dojazdem. */
export function StopList({
  route,
  now,
  eta,
  highlightId,
  onlyIds,
}: {
  route: ReportRoute;
  now: string | null;
  eta: RouteEta;
  highlightId?: string[];
  onlyIds?: Set<string>;
}) {
  const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence).filter((s) => !onlyIds || onlyIds.has(s.id));
  return (
    <ol className="divide-y divide-border">
      {stops.map((s) => (
        <StopRow key={s.id} stop={s} now={now} eta={eta.etas.get(s.id)} highlight={highlightId?.includes(s.id)} />
      ))}
    </ol>
  );
}

function StopRow({ stop: s, now, eta, highlight }: { stop: ReportStop; now: string | null; eta?: string; highlight?: boolean }) {
  const done = isFinished(s.status);
  const fits = etaFitsWindow(s, eta);
  const here = s.status === "in_progress" || s.status === "arrived";
  return (
    <li
      className={cn(
        "grid grid-cols-[28px_minmax(0,1.6fr)_minmax(110px,auto)_minmax(150px,1fr)] items-start gap-x-3 px-5 py-2.5 text-sm max-md:grid-cols-[28px_minmax(0,1fr)] max-md:gap-y-1",
        done && !highlight && "text-muted",
        here && "bg-info-soft/60",
        highlight && "bg-accent",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
          done ? "border-border text-subtle" : "border-border-strong text-foreground",
        )}
      >
        {s.sequence}
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate font-medium", done && !highlight ? "text-muted" : "text-foreground")}>
          {s.customer}
        </span>
        <span className="block truncate text-xs text-muted">
          {s.branch}, {s.city}
          {s.orderRefs.length > 0 && (
            <>
              {" · "}
              {s.orderRefs.map((r) => (
                <DocRef key={r}>{r} </DocRef>
              ))}
            </>
          )}
        </span>
        {(s.reason || s.note) && (
          <span className="mt-1 flex gap-1.5 text-xs text-plum">
            <MessageSquare className="mt-0.5 size-3 shrink-0" />
            {[s.reason, s.note].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      <span className="max-md:col-start-2">
        <StopStatusPill stop={s} now={now} />
      </span>
      <span className="text-[13px] tabular-nums max-md:col-start-2">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-subtle" />
          okno {s.windowStart ? `${s.windowStart}–${s.windowEnd}` : "—"}
        </span>
        {done ? (
          <span className="block text-xs">
            {stopTimeliness(s, null) === "late" ? (
              <span className="text-warning">dostawa {s.completedAt}, po oknie</span>
            ) : (
              `dostawa ${s.completedAt}`
            )}
          </span>
        ) : eta ? (
          <span className={cn("block text-xs font-medium", fits === false ? "text-danger" : "text-info")}>
            {here ? `kierowca na miejscu od ${eta}` : `szac. dojazd ok. ${eta}`}
            {fits === false && " — po oknie"}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** Odpowiedź dla klienta: status jego dostawy w kontekście trasy (gdzie kierowca, ile punktów przed nim). */
export function CustomerAnswer({
  route,
  stop: s,
  now,
  eta,
}: {
  route: ReportRoute;
  stop: ReportStop;
  now: string | null;
  eta: RouteEta;
}) {
  const sorted = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const ahead = sorted.filter((x) => x.sequence < s.sequence && !isFinished(x.status));
  const e = eta.etas.get(s.id);
  const fits = etaFitsWindow(s, e);
  const p = routeProgress(route, now);
  const t = stopTimeliness(s, now);
  const headline = isFinished(s.status)
    ? s.status === "delivered"
      ? `Dostarczona o ${s.completedAt}${t === "late" ? " (po oknie)" : ""}`
      : s.status === "partial"
        ? `Dostarczona częściowo o ${s.completedAt}`
        : s.status === "complaint"
          ? `Reklamacja zgłoszona o ${s.completedAt}`
          : s.status === "refused"
            ? `Odmowa przyjęcia o ${s.completedAt}`
            : `Nikt nie odebrał (${s.completedAt})`
    : s.status === "in_progress" || s.status === "arrived"
      ? "Kierowca jest teraz u klienta"
      : e
        ? `Szacowany dojazd ok. ${e}${fits === false ? " — po oknie przyjęć" : ""}`
        : "Czeka na trasę";
  const sub = isFinished(s.status)
    ? null
    : p.state === "not_started" || p.state === "draft"
      ? `Trasa jeszcze nie wyjechała. Klient jest ${s.sequence}. punktem z ${p.total}.`
      : ahead.length === 0
        ? "Klient jest następny na trasie."
        : `Przed klientem ${ahead.length} ${plural(ahead.length, "punkt", "punkty", "punktów")}: ${ahead.map((a) => `${a.customer}${eta.etas.get(a.id) ? ` (${eta.etas.get(a.id)})` : ""}`).join(", ")}.`;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-accent/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{s.customer}</p>
          <p className="text-[13px] text-muted">
            {s.branch}, {s.city}
            {s.customerCode ? ` (${s.customerCode})` : ""} · okno {s.windowStart ? `${s.windowStart}–${s.windowEnd}` : "brak"} ·{" "}
            {formatPln(s.valueGrosze)}
          </p>
        </div>
        <StopStatusPill stop={s} now={now} />
      </div>
      <p
        className={cn(
          "text-[18px] font-semibold leading-snug",
          fits === false || t === "overdue" ? "text-danger" : "text-foreground",
        )}
      >
        {headline}
      </p>
      {sub && <p className="text-[13px] text-muted">{sub}</p>}
      {(s.reason || s.note) && (
        <p className="rounded-lg bg-plum-soft px-3 py-2 text-[13px] text-plum">
          {[s.reason, s.note].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1 text-[13px]">
        {s.orderRefs.map((r) => (
          <Pill key={r} tone="neutral" dot={false}>
            {r}
          </Pill>
        ))}
        {s.phone && (
          <a href={tel(s.phone)} className="inline-flex items-center gap-1 font-medium text-primary-strong hover:underline">
            <Phone className="size-3.5" /> klient {s.phone}
          </a>
        )}
        {s.salesRep && <span className="text-muted">opiekun: {s.salesRep}</span>}
      </div>
    </div>
  );
}
