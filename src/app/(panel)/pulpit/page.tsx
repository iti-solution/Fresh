import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Columns3,
  Inbox,
  MessageSquareWarning,
  MonitorPlay,
  Package,
  RefreshCw,
  Store,
  Truck,
  User,
  Weight,
  type LucideIcon,
} from "lucide-react";
import { AutoRefresh } from "@/components/panel/auto-refresh";
import { EmptyState, Notice, Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { DATE_RE, formatPln, formatPlnCompact, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { isNoteActive } from "@/modules/masterdata/domain/schemas";
import { formatDayLabel, shiftDay, summarizeOrders, todayInWarsaw } from "@/modules/orders/domain/orders";
import { getDayOrders } from "@/modules/orders/server/queries";
import { nowInWarsaw } from "@/modules/ops/server/queries";
import { hasProblems, sortRoutes } from "@/modules/planning/domain/board";
import { toBoardRoute } from "@/modules/planning/server/board-model";
import { getPlanningDay } from "@/modules/planning/server/queries";
import type { BoardRoute } from "@/modules/planning/ui/board";
import { resetDemoTenant } from "@/modules/tenancy/server/actions";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Pulpit" };

const STATUS_TONE: Record<string, string> = {
  draft: "bg-foreground/[0.06] text-muted",
  planned: "bg-success-soft text-success",
  dispatched: "bg-info-soft text-info",
  in_progress: "bg-danger-soft text-danger",
  completed: "bg-success-soft text-success",
  closed: "bg-foreground/[0.06] text-muted",
};

type Attention = { tone: "danger" | "warning" | "info"; icon: LucideIcon; text: string; href: string };

/** Pulpit dyspozytora: jeden rzut oka na dzień — postęp tras, ładunek, terminowość i to, co wymaga reakcji. */
export default async function DashboardPage({ searchParams }: PageProps<"/pulpit">) {
  const ctx = await requireAccess("/pulpit");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayInWarsaw();
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : today;
  const isToday = day === today;
  const now = isToday ? nowInWarsaw() : null;

  const [orders, plan, notesRes, cash, customersRes] = await Promise.all([
    getDayOrders(ctx.tenantId, day),
    getPlanningDay(ctx.tenantId, day),
    supabase.from("delivery_point_notes").select("valid_from, valid_to").eq("tenant_id", ctx.tenantId),
    supabase
      .from("cash_movements")
      .select("amount, routes!inner(route_date)")
      .eq("tenant_id", ctx.tenantId)
      .eq("party_type", "driver")
      .eq("reason", "cod_collected")
      .eq("routes.route_date", day),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId),
  ]);

  const routes = sortRoutes(
    plan.routes.map((r) => ({ ...toBoardRoute(r, day, now, false, []), stopsCount: r.stops.length })),
    "name",
  );
  const active = orders.filter((o) => o.status !== "cancelled");
  const s = summarizeOrders(active);
  const activeNotes = (notesRes.data ?? []).filter((n) => isNoteActive(n, day)).length;
  const codOrders = active.filter((o) => (o.cod_amount ?? 0) > 0);
  const codTotal = codOrders.reduce((a, o) => a + toGrosze(o.cod_amount), 0);
  const codCollected = (cash.data ?? []).reduce((a, m) => a + toGrosze(m.amount), 0);

  const stops = routes.flatMap((r) => r.stops);
  const doneStops = stops.filter((x) => x.done).length;
  const outOfWindow = routes.reduce((a, r) => a + r.outOfWindow, 0);
  const onRoad = routes.filter((r) => r.status === "in_progress" || r.status === "dispatched").length;
  const finished = routes.filter((r) => r.status === "completed" || r.status === "closed").length;
  const dayPct = stops.length ? Math.round((doneStops / stops.length) * 100) : 0;
  const empty = (customersRes.count ?? 0) === 0;
  const dayLabel = isToday ? `Dziś, ${formatDayLabel(day).split(", ")[1] ?? ""}` : formatDayLabel(day);

  // co wymaga reakcji dyspozytora — od najpilniejszego
  const attention: Attention[] = [];
  const board = `/planowanie?dzien=${day}`;
  for (const r of routes) {
    if (!r.vehicleLabel) attention.push({ tone: "danger", icon: Truck, text: `${r.name}: brak auta`, href: board });
    if (!r.driverLabel) attention.push({ tone: "danger", icon: User, text: `${r.name}: brak kierowcy`, href: board });
    const over = r.load.filter((l) => l.over);
    if (over.length)
      attention.push({
        tone: "danger",
        icon: Weight,
        text: `${r.name}: przeciążenie (${over.map((l) => `${l.value}/${l.cap} ${l.unit}`).join(", ")})`,
        href: board,
      });
    if (r.outOfWindow > 0)
      attention.push({
        tone: "warning",
        icon: Clock,
        text: `${r.name}: ${r.outOfWindow} ${r.outOfWindow === 1 ? "punkt" : "punkty"} poza oknem dostawy`,
        href: board,
      });
  }
  if (plan.unassigned.length)
    attention.push({ tone: "warning", icon: Inbox, text: `${plan.unassigned.length} zamówień bez trasy`, href: board });
  if (s.awaiting)
    attention.push({
      tone: "info",
      icon: Package,
      text: `${s.awaiting} zamówień czeka na kompletację`,
      href: `/zlecenia?dzien=${day}&filtr=magazyn`,
    });
  if (activeNotes)
    attention.push({
      tone: "info",
      icon: MessageSquareWarning,
      text: `${activeNotes} odbiorców z uwagami tymczasowymi (remont, objazd, zmiana godzin)`,
      href: "/kartoteki/klienci?uwagi=1",
    });

  return (
    <div className="space-y-3">
      <h1 className="sr-only">Pulpit — {dayLabel}</h1>
      {/* pasek dnia */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-[var(--shadow-panel)]">
        <div className="flex items-center">
          <Link href={`/pulpit?dzien=${shiftDay(day, -1)}`} aria-label="Poprzedni dzień" className={navBtn}>
            <ChevronLeft />
          </Link>
          <Link
            href="/pulpit"
            className="mx-1 inline-flex h-9 min-w-[160px] items-center justify-center rounded-lg border border-border-strong px-3 text-[13px] font-semibold"
            title="Wróć do dziś"
          >
            {dayLabel}
          </Link>
          <Link href={`/pulpit?dzien=${shiftDay(day, 1)}`} aria-label="Następny dzień" className={navBtn}>
            <ChevronRight />
          </Link>
        </div>
        {isToday && !empty && <AutoRefresh stamp={now ?? ""} tenantId={ctx.tenantId} />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {ctx.isDemo && ctx.role === "admin" && (
            <form action={resetDemoTenant}>
              <button
                className={buttonVariants({ variant: "outline", size: "sm" })}
                title="Usuwa dane demo i tworzy je od nowa: dzisiejszy dzień w trakcie, plan na jutro i 4 tygodnie historii"
              >
                <RefreshCw /> Odśwież dane demo
              </button>
            </form>
          )}
          <Link href={`/monitor?dzien=${day}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <MonitorPlay /> Monitor tras
          </Link>
          <Link href={board} className={buttonVariants({ size: "sm" })}>
            <Columns3 /> Tablica tras
          </Link>
        </div>
      </div>

      {sp.demo === "odswiezone" && (
        <Notice>Dane demo odświeżone: dzisiejszy dzień w trakcie, plan na jutro i historia tras.</Notice>
      )}

      {empty ? (
        <Panel className="max-w-2xl">
          <EmptyState
            icon={<Store />}
            title="Kartoteki są puste"
            action={
              <Link href="/kartoteki/klienci/nowy" className={buttonVariants()}>
                Dodaj pierwszego klienta
              </Link>
            }
          >
            Zacznij od klientów i ich adresów dostaw albo przełącz się na „Dane przykładowe” w górnym pasku.
          </EmptyState>
        </Panel>
      ) : (
        <>
          {/* liczby dnia */}
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-panel)] sm:grid-cols-3 xl:grid-cols-6">
            <Kpi
              label="Dostawy zrealizowane"
              value={`${doneStops}/${stops.length}`}
              href={`/monitor?dzien=${day}`}
              extra={
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                  <div className="h-full rounded-full bg-info" style={{ width: `${dayPct}%` }} />
                </div>
              }
            />
            <Kpi
              label="Trasy"
              value={String(routes.length)}
              sub={routes.length ? `${onRoad} w trasie · ${finished} zakończonych` : "dzień nie zaplanowany"}
              href={`/trasy?dzien=${day}`}
            />
            <Kpi
              label="Poza oknem dostawy"
              value={String(outOfWindow)}
              sub={outOfWindow ? "wg prognozy dojazdu" : "wszystko w oknach"}
              tone={outOfWindow ? "danger" : "success"}
              href={`/trasy?dzien=${day}&problemy=1`}
            />
            <Kpi
              label="Zamówienia"
              value={String(s.count)}
              sub={`${formatPln(s.valueGrosze)} · ${s.awaiting ? `${s.awaiting} w magazynie` : "skompletowane"}`}
              tone={s.awaiting ? "warning" : undefined}
              href={`/zlecenia?dzien=${day}`}
            />
            <Kpi
              label="Ładunek dnia"
              value={`${s.weightKg.toLocaleString("pl-PL")} kg`}
              sub={`${s.crates.toLocaleString("pl-PL")} skrz. · ${s.pallets.toLocaleString("pl-PL")} pal.`}
              href={`/zlecenia?dzien=${day}`}
            />
            <Kpi
              label="Gotówka do odebrania"
              value={formatPlnCompact(codTotal)}
              sub={codOrders.length ? `odebrano ${formatPlnCompact(codCollected)} · ${codOrders.length} pobrań` : "brak pobrań"}
              icon={<Banknote />}
              href="/opakowania"
            />
          </div>

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* trasy dnia */}
            <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-panel)]">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-[15px] font-semibold">Trasy dnia</h2>
                <Link href={`/trasy?dzien=${day}`} className="text-[13px] font-semibold text-primary-strong hover:underline">
                  Wszystkie szczegóły
                </Link>
              </header>
              {routes.length === 0 ? (
                <EmptyState
                  title="Na ten dzień nie ma jeszcze tras"
                  action={
                    <Link href={board} className={buttonVariants({ size: "sm" })}>
                      <Columns3 /> Zaplanuj na tablicy
                    </Link>
                  }
                >
                  {active.length} zamówień czeka na plan. Tablica utworzy trasy ze stałych szablonów jednym kliknięciem.
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-[13px]">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-left text-[12px] text-muted">
                        <th className="py-2 pr-3 pl-4 font-medium">Trasa</th>
                        <th className="py-2 pr-3 font-medium">Auto i kierowca</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Postęp</th>
                        <th className="py-2 pr-3 font-medium">Ładunek</th>
                        <th className="py-2 pr-3 font-medium">Następny punkt</th>
                        <th className="py-2 pr-4 text-center font-medium">Poza oknem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((r) => (
                        <RouteRow key={r.id} r={r} href={board} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* wymaga uwagi */}
            <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-panel)]">
              <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-[15px] font-semibold">Wymaga uwagi</h2>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
                    attention.length ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
                  )}
                >
                  {attention.length}
                </span>
              </header>
              {attention.length === 0 ? (
                <p className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[13px] text-muted">
                  <CircleCheck className="size-5 text-success" />
                  Nic nie wymaga reakcji.
                </p>
              ) : (
                <ul className="max-h-[520px] overflow-y-auto">
                  {attention.map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <li key={i} className="border-b border-border last:border-0">
                        <Link
                          href={a.href}
                          className={cn(
                            "flex items-start gap-2.5 border-l-[3px] px-3.5 py-2.5 text-[13px] hover:bg-surface-2",
                            a.tone === "danger" ? "border-l-danger" : a.tone === "warning" ? "border-l-warning" : "border-l-info",
                          )}
                        >
                          <Icon
                            className={cn(
                              "mt-0.5 size-4 shrink-0",
                              a.tone === "danger" ? "text-danger" : a.tone === "warning" ? "text-warning" : "text-info",
                            )}
                          />
                          <span>{a.text}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

const navBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong text-muted hover:bg-surface-2 hover:text-foreground [&_svg]:size-4";

function Kpi({
  label,
  value,
  sub,
  tone,
  href,
  icon,
  extra,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "warning" | "success";
  href: string;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block border-r border-b border-border px-4 py-3 transition-colors last:border-r-0 hover:bg-surface-2 xl:border-b-0"
    >
      <p className="flex items-center justify-between gap-2 text-[12px] font-medium text-muted">
        {label}
        {icon && <span className="text-subtle [&_svg]:size-4">{icon}</span>}
      </p>
      <p
        className={cn(
          "mt-1 text-[24px] leading-tight font-semibold tracking-[-0.02em] tabular-nums",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-muted">{sub}</p>}
      {extra}
    </Link>
  );
}

function RouteRow({ r, href }: { r: BoardRoute; href: string }) {
  const done = r.stops.filter((s) => s.done).length;
  const pct = r.stops.length ? Math.round((done / r.stops.length) * 100) : 0;
  const next = r.stops.find((s) => !s.done);
  const kg = r.load.find((l) => l.key === "kg");
  const worst = [...r.load].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  return (
    <tr className={cn("border-b border-border last:border-0 hover:bg-surface-2", hasProblems(r) && "bg-danger-soft/30")}>
      <td className="py-2.5 pr-3 pl-4">
        <Link href={href} className="font-bold text-foreground hover:text-primary-strong">
          {r.name}
        </Link>
        {r.plannedStart && <p className="text-[12px] text-muted">wyjazd {r.plannedStart}</p>}
      </td>
      <td className="py-2.5 pr-3">
        <p className={cn("font-mono text-[12.5px] font-semibold", !r.vehicleLabel && "text-danger")}>
          {r.vehicleLabel ?? "brak auta"}
        </p>
        <p className={cn("text-[12px]", r.driverLabel ? "text-muted" : "font-semibold text-danger")}>
          {r.driverLabel ?? "brak kierowcy"}
        </p>
      </td>
      <td className="py-2.5 pr-3">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
            STATUS_TONE[r.status] ?? STATUS_TONE.draft,
          )}
        >
          {r.statusLabel}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-foreground/[0.08]">
            <div className="h-full rounded-full bg-steel" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[12px] font-semibold tabular-nums">
            {done}/{r.stops.length}
          </span>
        </div>
      </td>
      <td className="py-2.5 pr-3">
        {kg && (
          <p className={cn("text-[12.5px] tabular-nums", kg.over ? "font-bold text-danger" : "text-foreground")}>
            {kg.value}
            {kg.cap ? `/${kg.cap}` : ""} kg
          </p>
        )}
        {worst && worst.pct !== null && worst.key !== "kg" && (
          <p className={cn("text-[11.5px] tabular-nums", worst.over ? "font-semibold text-danger" : "text-muted")}>
            {worst.label}: {worst.pct}%
          </p>
        )}
      </td>
      <td className="max-w-[240px] py-2.5 pr-3">
        {next ? (
          <>
            <p className="truncate font-medium">{next.customer}</p>
            <p className={cn("text-[12px] tabular-nums", next.out ? "font-semibold text-danger" : "text-muted")}>
              {next.out && "▲ "}okno {next.window}
              {next.eta && ` · ok. ${next.eta}`}
            </p>
          </>
        ) : (
          <span className="text-[12px] text-success">{r.stops.length ? "✓ wszystkie punkty" : "brak punktów"}</span>
        )}
      </td>
      <td className="py-2.5 pr-4 text-center">
        {r.outOfWindow > 0 ? (
          <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-1.5 py-0.5 text-[12px] font-bold text-danger">
            <CircleAlert className="size-3.5" /> {r.outOfWindow}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>
    </tr>
  );
}
