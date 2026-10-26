import { ChevronDown, ChevronLeft, ChevronRight, Headset, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/panel/auto-refresh";
import { EmptyState, PageHeader, Panel, Segmented } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { DocRef, Pill } from "@/components/ui/status";
import { DATE_RE } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { isFinished } from "@/modules/execution/domain/execution";
import { estimateRoute } from "@/modules/ops/domain/forecast";
import {
  EXCEPTION_STATUSES,
  matchesQuery,
  nowForDay,
  routeProgress,
  stopTimeliness,
  type ReportRoute,
  type ReportStop,
} from "@/modules/ops/domain/reports";
import { getReportRoutes, nowInWarsaw } from "@/modules/ops/server/queries";
import { CustomerAnswer, RouteHeader, StopList } from "@/modules/ops/ui/bok";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { getDayOrders } from "@/modules/orders/server/queries";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Dostawy dla BOK" };

const FILTERS = [
  { key: "wszystkie", label: "Wszystkie trasy" },
  { key: "w-drodze", label: "W drodze" },
  { key: "problemy", label: "Problemy" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const STATE_ORDER = { in_progress: 0, not_started: 1, draft: 1, done: 2, closed: 3 } as const;

export default async function CustomerServicePage({ searchParams }: PageProps<"/bok">) {
  const ctx = await requireAccess("/bok");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : today;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const filter: FilterKey = FILTERS.some((f) => f.key === sp.f) ? (sp.f as FilterKey) : "wszystkie";
  const nowHHMM = nowInWarsaw();
  const now = nowForDay(day, today, nowHHMM);

  const [routesRaw, dayOrders] = await Promise.all([
    getReportRoutes(ctx.tenantId, day, day, { withNotes: true }),
    getDayOrders(ctx.tenantId, day),
  ]);
  const routes = [...routesRaw].sort(
    (a, b) =>
      STATE_ORDER[routeProgress(a, now).state] - STATE_ORDER[routeProgress(b, now).state] || a.name.localeCompare(b.name, "pl"),
  );
  const etas = new Map(routes.map((r) => [r.id, estimateRoute(r, now)]));

  const onRoutes = new Set(routes.flatMap((r) => r.stops.flatMap((s) => s.orderRefs)));
  const notPlanned = dayOrders.filter((o) => o.status !== "cancelled" && !(o.external_ref && onRoutes.has(o.external_ref)));

  const isProblem = (s: ReportStop) => {
    const t = stopTimeliness(s, now);
    return EXCEPTION_STATUSES.includes(s.status) || t === "late" || t === "overdue" || t === "at_risk" || Boolean(s.note);
  };
  const onRoad = (r: ReportRoute) => ["in_progress", "not_started", "draft"].includes(routeProgress(r, now).state);
  const hasProblem = (r: ReportRoute) => r.stops.some(isProblem) || routeProgress(r, now).startOverdue;
  const routeMatchesFilter = (r: ReportRoute) =>
    filter === "w-drodze" ? onRoad(r) : filter === "problemy" ? hasProblem(r) : true;
  const counts: Record<FilterKey, number> = {
    wszystkie: routes.length,
    "w-drodze": routes.filter(onRoad).length,
    problemy: routes.filter(hasProblem).length,
  };

  // Wyszukiwanie: zawsze w kontekście trasy. Gdy pasuje cała trasa (kierowca, auto, nazwa) — pokazujemy trasę.
  const hits = q
    ? routes
        .map((r) => {
          const matched = r.stops.filter((s) => matchesQuery(s, r, q));
          const wholeRoute = matched.length === r.stops.length && r.stops.length > 1;
          return { route: r, matched: wholeRoute ? [] : matched, wholeRoute };
        })
        .filter((h) => h.wholeRoute || h.matched.length > 0)
    : [];
  const orderHits = q
    ? notPlanned.filter((o) =>
        matchesQuery(
          {
            customer: o.customerName,
            customerCode: o.customerCode,
            branch: o.branchName,
            city: o.city,
            orderRefs: o.external_ref ? [o.external_ref] : [],
            phone: null,
          } as ReportStop,
          { name: "", driver: null, vehicle: null },
          q,
        ),
      )
    : [];

  const finished = routes.reduce((a, r) => a + r.stops.filter((s) => isFinished(s.status)).length, 0);
  const total = routes.reduce((a, r) => a + r.stops.length, 0);
  const href = (p: { dzien?: string; f?: string; q?: string }) => {
    const u = new URLSearchParams();
    const d = p.dzien ?? day;
    if (d !== today) u.set("dzien", d);
    const f = p.f ?? filter;
    if (f !== "wszystkie") u.set("f", f);
    if (p.q ?? q) u.set("q", p.q ?? q);
    const s = u.toString();
    return `/bok${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Dostawy dla BOK"
        description="Gdzie jest dostawa klienta, gdzie jest teraz kierowca, ile punktów ma przed sobą i kiedy dojedzie."
        actions={
          <>
            {day === today && <AutoRefresh seconds={60} stamp={nowHHMM} />}
            <div className="flex items-center gap-1">
              <Link
                href={href({ dzien: shiftDay(day, -1) })}
                aria-label="Poprzedni dzień"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ChevronLeft />
              </Link>
              <Link
                href={href({ dzien: today })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-w-40 capitalize")}
              >
                {day === today ? `Dziś, ${formatDayLabel(day).split(", ")[1]}` : formatDayLabel(day)}
              </Link>
              <Link
                href={href({ dzien: shiftDay(day, 1) })}
                aria-label="Następny dzień"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ChevronRight />
              </Link>
            </div>
          </>
        }
      />

      <form
        action="/bok"
        className="mb-6 flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-[var(--shadow-panel)] sm:flex-row sm:items-center"
      >
        {day !== today && <input type="hidden" name="dzien" value={day} />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-subtle" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            autoFocus={!q}
            placeholder="Klient, miasto, nr zamówienia, telefon, kierowca albo trasa"
            aria-label="Szukaj dostawy"
            className="h-12 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-11 text-[15px] outline-none placeholder:text-subtle focus:border-primary focus:ring-[3px] focus:ring-primary/15"
          />
        </div>
        <button className={buttonVariants({ size: "lg" })}>Szukaj</button>
        {q && (
          <Link href={href({ q: "" })} className="text-sm text-muted hover:text-foreground hover:underline">
            Wyczyść
          </Link>
        )}
      </form>

      {q ? (
        <section aria-label="Wyniki wyszukiwania" className="flex flex-col gap-5">
          <h2 className="text-[15px] font-semibold">
            {hits.length + orderHits.length === 0
              ? `Nic nie znaleziono dla „${q}” na ${formatDayLabel(day)}`
              : `Wyniki dla „${q}” — ${formatDayLabel(day)}`}
          </h2>
          {hits.length + orderHits.length === 0 && (
            <p className="text-sm text-muted">
              Sprawdź pisownię albo zmień dzień strzałkami u góry. Szukamy po kliencie, oddziale, mieście, numerze zamówienia,
              telefonie, kierowcy, aucie i nazwie trasy.
            </p>
          )}
          {hits.map(({ route, matched, wholeRoute }) => {
            const eta = etas.get(route.id)!;
            return (
              <Panel key={route.id} flush>
                <div className="flex flex-col gap-4 px-5 py-4">
                  <RouteHeader route={route} now={now} eta={eta} highlightId={matched.map((m) => m.id)} />
                  {matched.map((s) => (
                    <CustomerAnswer key={s.id} route={route} stop={s} now={now} eta={eta} />
                  ))}
                </div>
                <details open={wholeRoute} className="group border-t border-border">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-primary-strong hover:bg-surface-2">
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                    {wholeRoute ? "Punkty trasy" : "Cała trasa kierowcy"} ({route.stops.length})
                  </summary>
                  <StopList route={route} now={now} eta={eta} highlightId={matched.map((m) => m.id)} />
                </details>
              </Panel>
            );
          })}
          {orderHits.map((o) => (
            <Panel key={o.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold">{o.customerName}</p>
                  <p className="text-[13px] text-muted">
                    {o.branchName}, {o.city}
                  </p>
                </div>
                <Pill tone="neutral">jeszcze bez trasy</Pill>
              </div>
              <p className="mt-3 text-sm">
                Zamówienie <DocRef>{o.external_ref ?? "bez numeru"}</DocRef> przyjęte na {formatDayLabel(day)}, okno {o.window}.{" "}
                {o.readiness === "awaiting_warehouse"
                  ? "Magazyn jeszcze je kompletuje."
                  : "Towar skompletowany, czeka na przypisanie do trasy."}
              </p>
            </Panel>
          ))}
        </section>
      ) : routes.length === 0 ? (
        <Panel>
          <EmptyState icon={<Headset />} title="Brak tras w tym dniu">
            Gdy dyspozytor zaplanuje trasy, pojawią się tu z bieżącą realizacją i szacowanymi godzinami dojazdu.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              <b className="font-semibold text-foreground tabular-nums">{finished}</b> z {total} dostaw zrealizowanych na{" "}
              {routes.length} trasach
              {notPlanned.length > 0 && <>, {notPlanned.length} zamówień jeszcze bez trasy</>}.
            </p>
            <Segmented
              items={FILTERS.map((f) => ({
                href: href({ f: f.key }),
                label: f.label,
                active: filter === f.key,
                count: counts[f.key],
              }))}
            />
          </div>
          <div className="flex flex-col gap-4">
            {routes.filter(routeMatchesFilter).map((r) => {
              const eta = etas.get(r.id)!;
              const p = routeProgress(r, now);
              const problemIds = filter === "problemy" ? new Set(r.stops.filter(isProblem).map((s) => s.id)) : undefined;
              return (
                <Panel key={r.id} flush className={cn(p.state === "in_progress" && "ring-1 ring-info/25")}>
                  <div className="px-5 py-4">
                    <RouteHeader route={r} now={now} eta={eta} />
                  </div>
                  <details open={p.state === "in_progress" || filter === "problemy"} className="group border-t border-border">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-primary-strong hover:bg-surface-2">
                      <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                      {filter === "problemy"
                        ? `Punkty z problemem (${problemIds?.size ?? 0})`
                        : `Punkty trasy (${p.finished} z ${p.total} zrealizowane)`}
                    </summary>
                    <StopList route={r} now={now} eta={eta} onlyIds={problemIds} />
                  </details>
                </Panel>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
