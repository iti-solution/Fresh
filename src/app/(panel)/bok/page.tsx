import { ChevronLeft, ChevronRight, Headset, MessageSquare, Phone, Search, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel, Segmented } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { DocRef, Pill, Plate } from "@/components/ui/status";
import { DATE_RE, formatPln } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { isFinished } from "@/modules/execution/domain/execution";
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
import { StopStatusPill } from "@/modules/ops/ui/route-strip";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { getDayOrders } from "@/modules/orders/server/queries";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Dostawy dla BOK" };

type Row = { stop: ReportStop; route: ReportRoute; ahead: number };
const FILTERS = [
  { key: "wszystkie", label: "Wszystkie" },
  { key: "w-drodze", label: "W drodze" },
  { key: "dostarczone", label: "Dostarczone" },
  { key: "problemy", label: "Problemy" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default async function CustomerServicePage({ searchParams }: PageProps<"/bok">) {
  const ctx = await requireAccess("/bok");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : today;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const filter: FilterKey = FILTERS.some((f) => f.key === sp.f) ? (sp.f as FilterKey) : "wszystkie";
  const nowHHMM = nowInWarsaw();
  const now = nowForDay(day, today, nowHHMM);

  const [routes, dayOrders] = await Promise.all([
    getReportRoutes(ctx.tenantId, day, day, { withNotes: true }),
    getDayOrders(ctx.tenantId, day),
  ]);

  const rows: Row[] = routes.flatMap((route) => {
    const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
    return stops.map((stop, i) => ({ stop, route, ahead: stops.slice(0, i).filter((s) => !isFinished(s.status)).length }));
  });
  rows.sort(
    (a, b) =>
      (a.stop.windowStart ?? "99").localeCompare(b.stop.windowStart ?? "99") ||
      a.stop.customer.localeCompare(b.stop.customer, "pl"),
  );

  const onRoutes = new Set(rows.flatMap((r) => r.stop.orderRefs));
  const notPlanned = dayOrders.filter((o) => o.status !== "cancelled" && !(o.external_ref && onRoutes.has(o.external_ref)));

  const isProblem = (r: Row) => {
    const t = stopTimeliness(r.stop, now);
    return (
      EXCEPTION_STATUSES.includes(r.stop.status) || t === "late" || t === "overdue" || t === "at_risk" || Boolean(r.stop.note)
    );
  };
  const counts: Record<FilterKey, number> = {
    wszystkie: rows.length,
    "w-drodze": rows.filter((r) => !isFinished(r.stop.status)).length,
    dostarczone: rows.filter((r) => ["delivered", "partial"].includes(r.stop.status)).length,
    problemy: rows.filter(isProblem).length,
  };
  const byFilter = rows.filter((r) =>
    filter === "w-drodze"
      ? !isFinished(r.stop.status)
      : filter === "dostarczone"
        ? ["delivered", "partial"].includes(r.stop.status)
        : filter === "problemy"
          ? isProblem(r)
          : true,
  );
  const hits = q ? rows.filter((r) => matchesQuery(r.stop, r.route, q)) : [];
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
        description="Odpowiedź dla klienta w kilka sekund: czy dostawa dotarła, kiedy będzie, kto ją wiezie i co się wydarzyło na punkcie."
        actions={
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
            placeholder="Nazwa klienta, miasto, nr zamówienia, telefon albo kierowca"
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

      {q && (
        <section aria-label="Wyniki wyszukiwania" className="mb-6">
          <h2 className="mb-3 text-[15px] font-semibold">
            {hits.length + orderHits.length === 0
              ? `Nic nie znaleziono dla „${q}” na ${formatDayLabel(day)}`
              : `Wyniki dla „${q}”`}
          </h2>
          {hits.length + orderHits.length === 0 ? (
            <p className="text-sm text-muted">
              Sprawdź pisownię albo zmień dzień strzałkami u góry. Szukamy po kliencie, oddziale, mieście, numerze zamówienia,
              telefonie i kierowcy.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {hits.slice(0, 9).map((r) => (
                <AnswerCard key={r.stop.id} row={r} now={now} />
              ))}
              {orderHits.slice(0, 6).map((o) => (
                <div
                  key={o.id}
                  className="rounded-[var(--radius-panel)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]"
                >
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
                    Zamówienie <DocRef>{o.external_ref ?? "bez numeru"}</DocRef> przyjęte na {formatDayLabel(day)}, okno{" "}
                    {o.window}.{" "}
                    {o.readiness === "awaiting_warehouse"
                      ? "Magazyn jeszcze je kompletuje."
                      : "Towar skompletowany, czeka na przypisanie do trasy."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <Panel
        title={`Dostawy na ${formatDayLabel(day)}`}
        description={
          notPlanned.length
            ? `${notPlanned.length} zamówień jeszcze bez trasy — nie ma ich na liście poniżej.`
            : "Wszystkie zamówienia dnia są na trasach."
        }
        actions={
          <Segmented
            items={FILTERS.map((f) => ({
              href: href({ f: f.key }),
              label: f.label,
              active: filter === f.key,
              count: counts[f.key],
            }))}
          />
        }
        flush
      >
        {rows.length === 0 ? (
          <EmptyState icon={<Headset />} title="Brak dostaw w tym dniu">
            Gdy dyspozytor zaplanuje trasy, dostawy pojawią się tu z bieżącym statusem.
          </EmptyState>
        ) : byFilter.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Brak dostaw w tym widoku.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium text-muted">
                  <th className="py-2.5 pr-3 pl-5 font-medium">Okno</th>
                  <th className="px-3 py-2.5 font-medium">Klient i oddział</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Kiedy</th>
                  <th className="px-3 py-2.5 font-medium">Trasa i kierowca</th>
                  <th className="px-3 py-2.5 font-medium">Zamówienia</th>
                  <th className="py-2.5 pr-5 pl-3 font-medium">Co się wydarzyło</th>
                </tr>
              </thead>
              <tbody>
                {byFilter.map((r) => (
                  <tr key={r.stop.id} className="border-b border-border align-top last:border-0 hover:bg-surface-2">
                    <td className="py-3 pr-3 pl-5 whitespace-nowrap tabular-nums">
                      {r.stop.windowStart ? `${r.stop.windowStart}–${r.stop.windowEnd}` : "—"}
                    </td>
                    <td className="max-w-[260px] px-3 py-3">
                      <p className="truncate font-medium">{r.stop.customer}</p>
                      <p className="truncate text-xs text-muted">
                        {r.stop.branch}, {r.stop.city}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <StopStatusPill stop={r.stop} now={now} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-[13px]">
                      <WhenText row={r} now={now} />
                    </td>
                    <td className="px-3 py-3">
                      <p className="truncate text-[13px]">{r.route.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        {r.route.driver ?? "—"}
                        {r.route.driverPhone && (
                          <a
                            className="text-primary-strong hover:underline"
                            href={`tel:${r.route.driverPhone.replace(/\s/g, "")}`}
                            title="Zadzwoń do kierowcy"
                          >
                            <Phone className="inline size-3" />
                          </a>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        {r.stop.orderRefs.map((ref) => (
                          <DocRef key={ref}>{ref}</DocRef>
                        ))}
                      </div>
                      <span className="text-xs text-muted tabular-nums">{formatPln(r.stop.valueGrosze)}</span>
                    </td>
                    <td className="max-w-[300px] py-3 pr-5 pl-3 text-[13px]">
                      {r.stop.reason || r.stop.note ? (
                        <p className="flex gap-1.5 text-foreground">
                          <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-plum" />
                          <span>{[r.stop.reason, r.stop.note].filter(Boolean).join(" · ")}</span>
                        </p>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function WhenText({ row, now }: { row: Row; now: string | null }) {
  const { stop, ahead } = row;
  if (stop.completedAt) return <span className="tabular-nums">{stop.completedAt}</span>;
  if (stop.status === "in_progress" || stop.status === "arrived")
    return <span className="font-medium text-info">kierowca na miejscu</span>;
  const state = routeProgress(row.route, now).state;
  if (state === "not_started" || state === "draft") return <span className="text-muted">trasa jeszcze nie wyjechała</span>;
  return (
    <span className="text-muted">
      {ahead === 0 ? "następny punkt" : `przed nim ${ahead} ${ahead === 1 ? "punkt" : ahead < 5 ? "punkty" : "punktów"}`}
    </span>
  );
}

/** Karta odpowiedzi dla klienta: wszystko, co BOK powie przez telefon. */
function AnswerCard({ row, now }: { row: Row; now: string | null }) {
  const { stop: s, route: r } = row;
  const t = stopTimeliness(s, now);
  const headline =
    s.status === "delivered"
      ? `Dostarczona o ${s.completedAt}${t === "late" ? " — po oknie" : ""}`
      : s.status === "partial"
        ? `Dostarczona częściowo o ${s.completedAt}`
        : s.status === "complaint"
          ? `Reklamacja zgłoszona o ${s.completedAt}`
          : s.status === "refused"
            ? `Odmowa przyjęcia o ${s.completedAt}`
            : s.status === "absent"
              ? `Nikt nie odebrał (${s.completedAt})`
              : s.status === "in_progress" || s.status === "arrived"
                ? "Kierowca jest teraz u klienta"
                : ["not_started", "draft"].includes(routeProgress(r, now).state)
                  ? `Trasa jeszcze nie wyjechała${t === "overdue" ? ` — okno minęło o ${s.windowEnd}` : ""}`
                  : t === "overdue"
                    ? `Spóźniona — okno minęło o ${s.windowEnd}`
                    : `W drodze — przed nią ${row.ahead} ${row.ahead === 1 ? "punkt" : row.ahead < 5 ? "punkty" : "punktów"}`;
  return (
    <article className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{s.customer}</p>
          <p className="truncate text-[13px] text-muted">
            {s.branch}, {s.city}
            {s.customerCode ? ` (${s.customerCode})` : ""}
          </p>
        </div>
        <StopStatusPill stop={s} now={now} />
      </div>
      <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">{headline}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-muted">Okno przyjęć</dt>
        <dd className="tabular-nums">{s.windowStart ? `${s.windowStart}–${s.windowEnd}` : "brak"}</dd>
        <dt className="text-muted">Trasa</dt>
        <dd>
          {r.name}, punkt {s.sequence} z {r.stops.length}
        </dd>
        <dt className="text-muted">Kierowca</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <Truck className="size-3.5 text-subtle" />
          {r.driver ?? "—"}
          <Plate>{r.vehicle}</Plate>
        </dd>
        <dt className="text-muted">Zamówienia</dt>
        <dd className="flex flex-wrap gap-x-2">
          {s.orderRefs.map((x) => (
            <DocRef key={x}>{x}</DocRef>
          ))}{" "}
          <span className="text-muted">{formatPln(s.valueGrosze)}</span>
        </dd>
        {s.salesRep && (
          <>
            <dt className="text-muted">Opiekun</dt>
            <dd>{s.salesRep}</dd>
          </>
        )}
      </dl>
      {(s.reason || s.note) && (
        <p className="rounded-lg bg-plum-soft px-3 py-2 text-[13px] text-plum">
          {[s.reason, s.note].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {r.driverPhone && (
          <a href={`tel:${r.driverPhone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Phone /> Kierowca {r.driverPhone}
          </a>
        )}
        {s.phone && (
          <a href={`tel:${s.phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Phone /> Klient
          </a>
        )}
      </div>
    </article>
  );
}
