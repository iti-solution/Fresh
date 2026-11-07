import { ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Columns3, Inbox, Printer, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DATE_RE } from "@/lib/forms";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { normalizeSearch } from "@/modules/ops/domain/reports";
import { nowInWarsaw } from "@/modules/ops/server/queries";
import { hasProblems, sortRoutes } from "@/modules/planning/domain/board";
import { toBoardRoute } from "@/modules/planning/server/board-model";
import { getPlanningDay } from "@/modules/planning/server/queries";
import type { BoardLoad, BoardRoute } from "@/modules/planning/ui/board";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Trasy" };

const STATUS_TONE: Record<string, string> = {
  draft: "bg-foreground/[0.06] text-muted",
  planned: "bg-success-soft text-success",
  dispatched: "bg-info-soft text-info",
  in_progress: "bg-danger-soft text-danger",
  completed: "bg-success-soft text-success",
  closed: "bg-foreground/[0.06] text-muted",
};

/** Lista tras dnia: ładunek względem limitów auta, terminowość i postęp — rozwiń trasę, żeby zobaczyć punkty. */
export default async function RoutesPage({ searchParams }: PageProps<"/trasy">) {
  const ctx = await requireAccess("/trasy");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : today;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const onlyProblems = sp.problemy === "1";
  const plan = await getPlanningDay(ctx.tenantId, day);
  const now = day === today ? nowInWarsaw() : null;
  const all = sortRoutes(
    plan.routes.map((r) => ({ ...toBoardRoute(r, day, now, false, []), stopsCount: r.stops.length, orders: r.stops.reduce((a, s) => a + s.orders.length, 0) })),
    "name",
  );
  const needle = normalizeSearch(q);
  const routes = all.filter(
    (r) =>
      (!onlyProblems || hasProblems(r)) &&
      (!needle ||
        normalizeSearch([r.name, r.driverLabel ?? "", r.vehicleLabel ?? "", ...r.stops.map((s) => s.customer)].join(" ")).includes(needle)),
  );
  const problems = all.filter((r) => hasProblems(r)).length;
  const unassignedStops = new Set(plan.unassigned.map((o) => `${o.customer}|${o.address}`)).size;
  const link = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { dzien: day, q: q || undefined, problemy: onlyProblems ? "1" : undefined, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/trasy?${u.toString()}`;
  };

  return (
    <div className="space-y-2.5">
      <h1 className="sr-only">Trasy — {formatDayLabel(day)}</h1>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-[var(--shadow-panel)]">
        <div className="flex items-center">
          <Link href={link({ dzien: shiftDay(day, -1) })} aria-label="Poprzedni dzień" className={navBtn}>
            <ChevronLeft />
          </Link>
          <span className="mx-1 inline-flex h-9 min-w-[150px] items-center justify-center rounded-lg border border-border-strong px-3 text-[13px] font-semibold capitalize">
            {formatDayLabel(day)}
          </span>
          <Link href={link({ dzien: shiftDay(day, 1) })} aria-label="Następny dzień" className={navBtn}>
            <ChevronRight />
          </Link>
        </div>
        <form action="/trasy" className="relative w-full max-w-sm">
          <input type="hidden" name="dzien" value={day} />
          {onlyProblems && <input type="hidden" name="problemy" value="1" />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Szukaj trasy, kierowcy, nr rej., klienta"
            aria-label="Szukaj trasy"
            className="h-9 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-9 text-[13px] outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
          />
        </form>
        <Link
          href={`/planowanie?dzien=${day}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-info-soft px-3.5 text-[13px] font-semibold text-info hover:bg-info/15"
        >
          <Inbox className="size-4" /> Nieprzypisane: {unassignedStops} pkt
        </Link>
        {problems > 0 && (
          <Link
            href={link({ problemy: onlyProblems ? undefined : "1" })}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold",
              onlyProblems ? "bg-danger text-white" : "bg-danger-soft text-danger hover:bg-danger/15",
            )}
          >
            <CircleAlert className="size-4" /> {problems} {problems === 1 ? "trasa" : problems < 5 ? "trasy" : "tras"} z problemami
          </Link>
        )}
        <span className="ml-auto text-[12px] text-muted">Ładunek / limit pojazdu · czerwony oznacza przekroczenie</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-panel)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[12px] text-muted">
                <th className="w-10 py-2.5" />
                <th className="py-2.5 pr-3 font-medium">Trasa</th>
                <th className="py-2.5 pr-3 font-medium">Kierowca / pojazd</th>
                <th className="py-2.5 pr-3 font-medium">Status</th>
                <th className="py-2.5 pr-3 text-right font-medium">Punkty</th>
                <th className="py-2.5 pr-3 text-right font-medium">Zam.</th>
                <th className="py-2.5 pr-3 font-medium">Waga [kg]</th>
                <th className="py-2.5 pr-3 font-medium">Objętość [m³]</th>
                <th className="py-2.5 pr-3 font-medium">Palety</th>
                <th className="py-2.5 pr-3 font-medium">Skrzynki</th>
                <th className="py-2.5 pr-3 text-right font-medium">Wyjazd</th>
                <th className="py-2.5 pr-3 text-right font-medium">Ostatni punkt</th>
                <th className="py-2.5 pr-3 text-center font-medium">Poza oknem</th>
                <th className="py-2.5 pr-3 text-right font-medium">Realizacja</th>
                <th className="w-20 py-2.5" />
              </tr>
            </thead>
            {routes.map((r) => (
              <RouteRows key={r.id} route={r} orders={r.orders} day={day} />
            ))}
          </table>
        </div>
        {routes.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-muted">
            {all.length === 0 ? (
              <>
                Na ten dzień nie ma tras.{" "}
                <Link href={`/planowanie?dzien=${day}`} className="font-semibold text-primary-strong hover:underline">
                  Zaplanuj dzień na tablicy
                </Link>
              </>
            ) : (
              "Żadna trasa nie pasuje do wyszukiwania."
            )}
          </p>
        )}
        <p className="border-t border-border px-4 py-2 text-right text-[12px] text-muted tabular-nums">
          {routes.length} {routes.length === 1 ? "trasa" : routes.length < 5 && routes.length > 1 ? "trasy" : "tras"} ·{" "}
          {routes.reduce((a, r) => a + r.stops.length, 0)} punktów
        </p>
      </div>
    </div>
  );
}

const navBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong text-muted hover:bg-surface-2 hover:text-foreground [&_svg]:size-4";

function LoadCell({ l }: { l: BoardLoad | undefined }) {
  if (!l) return <td />;
  return (
    <td className="py-2 pr-3">
      <span className={cn("block text-[12.5px] tabular-nums", l.over ? "font-bold text-danger" : "text-foreground")}>
        {l.value}
        {l.cap ? <span className={l.over ? "" : "text-muted"}>/{l.cap}</span> : null}
      </span>
      <span className="mt-1 block h-[3px] w-24 overflow-hidden rounded-full bg-foreground/[0.08]">
        <span
          className={cn("block h-full rounded-full", l.over ? "bg-danger" : (l.pct ?? 0) >= 90 ? "bg-[#d99a00]" : "bg-info")}
          style={{ width: `${Math.min(100, l.pct ?? 0)}%` }}
        />
      </span>
    </td>
  );
}

function RouteRows({ route: r, orders, day }: { route: BoardRoute; orders: number; day: string }) {
  const load = new Map(r.load.map((l) => [l.key, l]));
  const done = r.stops.filter((s) => s.done).length;
  const last = [...r.stops].reverse().find((s) => s.eta)?.eta ?? "—";
  return (
    <tbody className="group/route border-b border-border last:border-0">
      <tr className="hover:bg-surface-2">
        <td className="py-2 pl-3">
          <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-subtle hover:bg-foreground/[0.06]">
            <input type="checkbox" className="peer sr-only" aria-label={`Pokaż punkty trasy ${r.name}`} />
            <ChevronDown className="size-4 -rotate-90 transition-transform peer-checked:rotate-0" />
          </label>
        </td>
        <td className="py-2 pr-3">
          <p className="font-bold text-foreground">{r.name}</p>
          {r.subtitle && <p className="text-[12px] text-muted">{r.subtitle}</p>}
        </td>
        <td className="py-2 pr-3">
          <p className={cn(!r.driverLabel && "font-semibold text-danger")}>{r.driverLabel ?? "brak kierowcy"}</p>
          <p className={cn("font-mono text-[12px]", r.vehicleLabel ? "text-muted" : "font-semibold text-danger")}>
            {r.vehicleLabel ?? "brak auta"}
          </p>
        </td>
        <td className="py-2 pr-3">
          <span className={cn("rounded px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", STATUS_TONE[r.status] ?? STATUS_TONE.draft)}>
            {r.statusLabel}
          </span>
        </td>
        <td className="py-2 pr-3 text-right">
          <span className="rounded bg-info-soft px-1.5 py-0.5 text-[12px] font-bold text-info tabular-nums">{r.stops.length}</span>
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">{orders}</td>
        <LoadCell l={load.get("kg")} />
        <LoadCell l={load.get("m3")} />
        <LoadCell l={load.get("pallets")} />
        <LoadCell l={load.get("crates")} />
        <td className="py-2 pr-3 text-right tabular-nums">{r.plannedStart ?? "—"}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{last}</td>
        <td className="py-2 pr-3 text-center">
          {r.outOfWindow > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-1.5 py-0.5 text-[12px] font-bold text-danger">
              <CircleAlert className="size-3.5" /> {r.outOfWindow}
            </span>
          ) : (
            <span className="text-subtle">—</span>
          )}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">{done > 0 ? `${done}/${r.stops.length}` : "—"}</td>
        <td className="py-2 pr-3">
          <span className="flex items-center justify-end gap-0.5">
            <Link
              href={`/planowanie?dzien=${day}`}
              title="Pokaż na tablicy"
              aria-label={`Trasa ${r.name} na tablicy`}
              className="rounded-md p-1.5 text-subtle hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <Columns3 className="size-4" />
            </Link>
            <Link
              href={r.printHref}
              title="Lista załadunkowa"
              aria-label={`Lista załadunkowa ${r.name}`}
              className="rounded-md p-1.5 text-subtle hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <Printer className="size-4" />
            </Link>
          </span>
        </td>
      </tr>
      {/* punkty trasy — widoczne po zaznaczeniu strzałki (bez JavaScriptu) */}
      <tr className="hidden group-has-[input:checked]/route:table-row">
        <td />
        <td colSpan={14} className="pb-3">
          <ol className="overflow-hidden rounded-lg border border-border">
            {r.stops.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "grid grid-cols-[32px_120px_minmax(0,1.2fr)_minmax(0,1.5fr)_130px_70px_110px] items-center gap-3 border-b border-l-[3px] border-b-border px-3 py-1.5 text-[12.5px] last:border-b-0",
                  s.done ? "border-l-border-strong bg-foreground/[0.03] text-muted" : "border-l-success",
                )}
              >
                <span className="text-right text-subtle tabular-nums">{s.seq}</span>
                <span className={cn("tabular-nums", s.out ? "font-semibold text-danger" : "text-muted")}>
                  {s.out && "▲ "}
                  {s.window}
                </span>
                <span className="truncate font-semibold">{s.customer}</span>
                <span className="truncate text-muted">{s.address}</span>
                <span className="text-muted tabular-nums">{s.phone ?? ""}</span>
                <span className={cn("text-right font-semibold tabular-nums", s.out && "text-danger")}>{s.done ? "" : (s.eta ?? "")}</span>
                <span className="text-right text-[12px] text-muted">{s.done ? `✓ ${s.statusLabel}` : `${Math.round(s.kg)} kg · ${s.crates} skrz.`}</span>
              </li>
            ))}
            {r.stops.length === 0 && <li className="px-3 py-3 text-center text-muted">Brak punktów</li>}
          </ol>
        </td>
      </tr>
    </tbody>
  );
}
