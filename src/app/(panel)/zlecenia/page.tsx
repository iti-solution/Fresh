import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, Plus } from "lucide-react";
import { EmptyState, Notice, PageHeader, Panel, Segmented } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { DocRef, Pill } from "@/components/ui/status";
import { DATE_RE, formatPln, toGrosze } from "@/lib/forms";
import { cn } from "@/lib/utils";
import {
  formatDayLabel,
  nextWorkingDay,
  READINESS_LABELS,
  shiftDay,
  summarizeOrders,
  todayInWarsaw,
} from "@/modules/orders/domain/orders";
import { cancelOrder, setReadiness } from "@/modules/orders/server/actions";
import { getDayOrders, nearestDayWithOrders, type DayOrder } from "@/modules/orders/server/queries";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Zamówienia" };

const FILTERS = [
  { key: "", label: "Wszystkie" },
  { key: "gotowe", label: "Skompletowane" },
  { key: "magazyn", label: "Do realizacji" },
  { key: "uwagi", label: "Z uwagami" },
] as const;

export default async function OrdersPage({ searchParams }: PageProps<"/zlecenia">) {
  const ctx = await requireAccess("/zlecenia");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : nextWorkingDay(today);
  const filter = typeof sp.filtr === "string" ? sp.filtr : "";
  const editable = canEdit(ctx.role);

  const all = await getDayOrders(ctx.tenantId, day);
  const active = all.filter((o) => o.status !== "cancelled");
  const summary = summarizeOrders(active);
  const counts = {
    "": active.length,
    gotowe: summary.ready,
    magazyn: summary.awaiting,
    uwagi: active.filter((o) => o.notes_sales || o.notes_logistics).length,
  } as Record<string, number>;
  const visible = active.filter((o) =>
    filter === "gotowe"
      ? o.readiness === "ready"
      : filter === "magazyn"
        ? o.readiness === "awaiting_warehouse"
        : filter === "uwagi"
          ? Boolean(o.notes_sales || o.notes_logistics)
          : true,
  );
  const groups = new Map<string, DayOrder[]>();
  for (const o of visible) groups.set(o.route, [...(groups.get(o.route) ?? []), o]);
  for (const list of groups.values())
    list.sort((a, b) => a.window.localeCompare(b.window) || (a.external_ref ?? "").localeCompare(b.external_ref ?? ""));
  const sortedGroups = [...groups.entries()].sort(([a], [b]) =>
    a === "Bez trasy stałej" ? 1 : b === "Bez trasy stałej" ? -1 : a.localeCompare(b, "pl"),
  );
  const cancelled = all.length - active.length;
  const nearest = active.length === 0 ? await nearestDayWithOrders(ctx.tenantId, today) : null;
  const href = (d: string, f = filter) => `/zlecenia?dzien=${d}${f ? `&filtr=${f}` : ""}`;

  return (
    <>
      <PageHeader
        title="Zamówienia"
        description="Zamówienia do dostarczenia w wybranym dniu, pogrupowane według tras stałych. Status magazynu zmienisz jednym kliknięciem."
        actions={
          editable ? (
            <Link href={`/zlecenia/nowe?dzien=${day}`} className={buttonVariants({ size: "sm" })}>
              <Plus /> Nowe zamówienie
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={href(shiftDay(day, -1))}
          aria-label="Poprzedni dzień"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ChevronLeft />
        </Link>
        <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none min-w-40 capitalize")}>
          {formatDayLabel(day)}
        </span>
        <Link
          href={href(shiftDay(day, 1))}
          aria-label="Następny dzień"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ChevronRight />
        </Link>
        {day !== nextWorkingDay(today) && (
          <Link href={href(nextWorkingDay(today))} className="ml-2 text-sm text-primary-strong hover:underline">
            najbliższy dzień roboczy
          </Link>
        )}
      </div>

      {sp.dodano && <Notice>Dodano zamówienie.</Notice>}

      <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)] sm:grid-cols-4 xl:grid-cols-7">
        <Tile label="Zamówienia" value={String(summary.count)} />
        <Tile label="Skompletowane" value={String(summary.ready)} tone="good" />
        <Tile label="Do realizacji" value={String(summary.awaiting)} tone={summary.awaiting ? "warn" : undefined} />
        <Tile label="Wartość" value={formatPln(summary.valueGrosze)} />
        <Tile label="Masa" value={`${summary.weightKg.toLocaleString("pl-PL")} kg`} />
        <Tile label="Palety" value={summary.pallets.toLocaleString("pl-PL")} />
        <Tile label="Skrzynki" value={summary.crates.toLocaleString("pl-PL")} />
      </div>

      <Segmented
        className="mb-5"
        items={FILTERS.map((f) => ({ href: href(day, f.key), label: f.label, active: filter === f.key, count: counts[f.key] }))}
      />

      {active.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<ClipboardList />}
            title={`Brak zamówień na ${formatDayLabel(day)}`}
            action={
              nearest && nearest !== day ? (
                <Link href={href(nearest, "")} className={buttonVariants({ variant: "outline" })}>
                  Przejdź do {formatDayLabel(nearest)}
                </Link>
              ) : undefined
            }
          >
            Zamówienia pojawią się po imporcie z ERP albo po dodaniu ręcznym.
          </EmptyState>
        </Panel>
      ) : (
        <div className="flex flex-col gap-5">
          {sortedGroups.map(([route, orders]) => {
            const s = summarizeOrders(orders);
            return (
              <section
                key={route}
                aria-label={route}
                className="overflow-x-auto rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                  <h2 className="text-[15px] font-semibold">{route}</h2>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
                    <span>
                      <b className="font-semibold text-foreground">{s.count}</b> zamówień
                    </span>
                    <span>{s.weightKg.toLocaleString("pl-PL")} kg</span>
                    <span>{s.crates} skrzynek</span>
                    <span className="font-medium text-foreground">{formatPln(s.valueGrosze)}</span>
                    {s.awaiting > 0 && <Pill tone="warning">{s.awaiting} w magazynie</Pill>}
                  </p>
                </header>
                <table className="w-full min-w-[960px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-36" />
                    <col />
                    <col className="w-28" />
                    <col className="w-16" />
                    <col className="w-14" />
                    <col className="w-14" />
                    <col className="w-28" />
                    <col className="w-36" />
                    {editable && <col className="w-20" />}
                  </colgroup>
                  <thead className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                    <tr>
                      <th className="py-2 pr-3 pl-5 font-medium">Nr</th>
                      <th className="px-3 py-2 font-medium">Klient i oddział</th>
                      <th className="px-3 py-2 font-medium">Okno</th>
                      <th className="px-3 py-2 text-right font-medium">Kg</th>
                      <th className="px-3 py-2 text-right font-medium">Pal.</th>
                      <th className="px-3 py-2 text-right font-medium">Skrz.</th>
                      <th className="px-3 py-2 text-right font-medium">Wartość</th>
                      <th className="px-3 py-2 font-medium">Magazyn</th>
                      {editable && (
                        <th className="px-3 py-2">
                          <span className="sr-only">Akcje</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-t border-border align-top first:border-0 hover:bg-surface-2">
                        <td className="py-2.5 pr-3 pl-5">
                          <DocRef>{o.external_ref ?? "—"}</DocRef>
                          {o.priority > 0 && (
                            <Pill tone="danger" className="mt-1">
                              priorytet
                            </Pill>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {o.customerId ? (
                            <Link
                              href={`/kartoteki/klienci/${o.customerId}`}
                              className="font-medium text-foreground hover:text-primary-strong hover:underline"
                            >
                              {o.customerName}
                            </Link>
                          ) : (
                            <span className="font-medium">{o.customerName}</span>
                          )}
                          <span className="block text-xs text-muted">
                            {o.branchName}, {o.city}
                          </span>
                          {o.notes_sales && <p className="mt-1 text-xs text-info">Handlowa: {o.notes_sales}</p>}
                          {o.notes_logistics && <p className="mt-0.5 text-xs text-warning">Logistyczna: {o.notes_logistics}</p>}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{o.window}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(o.weight_kg)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{o.pallets || "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{o.crates || "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {o.order_value !== null ? formatPln(toGrosze(o.order_value)) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {editable ? (
                            <form
                              action={setReadiness.bind(null, o.id, o.readiness === "ready" ? "awaiting_warehouse" : "ready")}
                            >
                              <button title="Kliknij, aby zmienić" className={readinessCls(o.readiness, true)}>
                                {READINESS_LABELS[o.readiness]}
                              </button>
                            </form>
                          ) : (
                            <span className={readinessCls(o.readiness)}>{READINESS_LABELS[o.readiness]}</span>
                          )}
                        </td>
                        {editable && (
                          <td className="px-3 py-2.5 text-right">
                            <form action={cancelOrder.bind(null, o.id)}>
                              <button className={buttonVariants({ variant: "ghost", size: "xs" })}>Anuluj</button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}
      {cancelled > 0 && <p className="mt-4 text-xs text-muted">Anulowane w tym dniu: {cancelled}.</p>}
    </>
  );
}

function readinessCls(r: string, button = false) {
  return cn(
    "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium before:h-1.5 before:w-1.5 before:rounded-full before:bg-current",
    r === "ready" ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
    button && "cursor-pointer hover:ring-2 hover:ring-current/25",
  );
}

/** Pasek sum dnia — jedna ramka, liczby w równych kolumnach. */
function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="border-r border-b border-border px-4 py-3 last:border-r-0 xl:border-b-0">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "good" && "text-success",
          tone === "warn" && "text-warning",
        )}
      >
        {value}
      </p>
    </div>
  );
}
