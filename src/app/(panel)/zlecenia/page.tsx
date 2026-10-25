import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/panel/module-placeholder";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { DATE_RE, formatPln, toGrosze } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { formatDayLabel, nextWorkingDay, READINESS_LABELS, shiftDay, summarizeOrders, todayInWarsaw } from "@/modules/orders/domain/orders";
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
    filter === "gotowe" ? o.readiness === "ready" :
    filter === "magazyn" ? o.readiness === "awaiting_warehouse" :
    filter === "uwagi" ? Boolean(o.notes_sales || o.notes_logistics) : true,
  );
  const groups = new Map<string, DayOrder[]>();
  for (const o of visible) groups.set(o.route, [...(groups.get(o.route) ?? []), o]);
  for (const list of groups.values()) list.sort((a, b) => a.window.localeCompare(b.window) || (a.external_ref ?? "").localeCompare(b.external_ref ?? ""));
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => (a === "Bez trasy stałej" ? 1 : b === "Bez trasy stałej" ? -1 : a.localeCompare(b, "pl")));
  const cancelled = all.length - active.length;
  const nearest = active.length === 0 ? await nearestDayWithOrders(ctx.tenantId, today) : null;
  const href = (d: string, f = filter) => `/zlecenia?dzien=${d}${f ? `&filtr=${f}` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Zamówienia" description="Zamówienia do dostarczenia w wybranym dniu, pogrupowane według tras stałych." />
        {editable && <Link href={`/zlecenia/nowe?dzien=${day}`} className={buttonVariants()}>+ Nowe zamówienie</Link>}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href(shiftDay(day, -1))} aria-label="Poprzedni dzień" className={buttonVariants({ variant: "outline", size: "sm" })}>‹</Link>
        <span className="min-w-44 text-center text-base font-semibold">{formatDayLabel(day)}</span>
        <Link href={href(shiftDay(day, 1))} aria-label="Następny dzień" className={buttonVariants({ variant: "outline", size: "sm" })}>›</Link>
        {day !== nextWorkingDay(today) && (
          <Link href={href(nextWorkingDay(today))} className="ml-2 text-sm text-primary hover:underline">najbliższy dzień roboczy</Link>
        )}
      </div>

      {sp.dodano && <p role="status" className="mb-4 rounded-md bg-accent px-4 py-3 text-sm text-primary">Dodano zamówienie.</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Tile label="Zamówienia" value={String(summary.count)} />
        <Tile label="Skompletowane" value={String(summary.ready)} tone="good" />
        <Tile label="Do realizacji" value={String(summary.awaiting)} tone={summary.awaiting ? "warn" : undefined} />
        <Tile label="Wartość" value={formatPln(summary.valueGrosze)} />
        <Tile label="Masa" value={`${summary.weightKg.toLocaleString("pl-PL")} kg`} />
        <Tile label="Palety" value={summary.pallets.toLocaleString("pl-PL")} />
        <Tile label="Skrzynki" value={summary.crates.toLocaleString("pl-PL")} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtr">
        {FILTERS.map((f) => (
          <Link key={f.key} href={href(day, f.key)} aria-pressed={filter === f.key}
            className={cn("h-9 rounded-full px-4 text-sm leading-9", filter === f.key ? "bg-foreground font-medium text-background" : "border border-border bg-surface hover:bg-accent")}>
            {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
          </Link>
        ))}
      </div>

      {active.length === 0 ? (
        <Card className="text-sm">
          Brak zamówień na {formatDayLabel(day)}.
          {nearest && nearest !== day && (
            <> Najbliższy dzień z zamówieniami: <Link href={href(nearest, "")} className="font-medium text-primary hover:underline">{formatDayLabel(nearest)}</Link>.</>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {sortedGroups.map(([route, orders]) => {
            const s = summarizeOrders(orders);
            return (
              <section key={route} aria-label={route} className="overflow-x-auto rounded-lg border border-border bg-surface">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-background px-3 py-2">
                  <h2 className="text-sm font-semibold">{route}</h2>
                  <p className="text-xs text-muted tabular-nums">
                    {s.count} zam. · {s.weightKg.toLocaleString("pl-PL")} kg · {s.pallets.toLocaleString("pl-PL")} pal · {s.crates} skrz · {formatPln(s.valueGrosze)}
                    {s.awaiting > 0 && <span className="font-semibold text-warning"> · {s.awaiting} do realizacji</span>}
                  </p>
                </header>
                <table className="w-full min-w-[960px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-36" /><col /><col className="w-28" /><col className="w-16" /><col className="w-14" /><col className="w-14" /><col className="w-28" /><col className="w-36" />{editable && <col className="w-20" />}
                  </colgroup>
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nr</th>
                      <th className="px-3 py-2 font-medium">Klient · oddział</th>
                      <th className="px-3 py-2 font-medium">Okno</th>
                      <th className="px-3 py-2 text-right font-medium">kg</th>
                      <th className="px-3 py-2 text-right font-medium">pal</th>
                      <th className="px-3 py-2 text-right font-medium">skrz</th>
                      <th className="px-3 py-2 text-right font-medium">Wartość</th>
                      <th className="px-3 py-2 font-medium">Magazyn</th>
                      {editable && <th className="px-3 py-2"><span className="sr-only">Akcje</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-t border-border align-top hover:bg-accent/40">
                        <td className="px-3 py-2 font-mono text-xs">
                          {o.external_ref ?? "—"}
                          {o.priority > 0 && <span className="ml-1 rounded bg-danger/10 px-1 font-sans text-[10px] font-semibold text-danger">PRIORYTET</span>}
                        </td>
                        <td className="px-3 py-2">
                          {o.customerId ? (
                            <Link href={`/kartoteki/klienci/${o.customerId}`} className="font-medium text-foreground hover:text-primary hover:underline">{o.customerName}</Link>
                          ) : (
                            <span className="font-medium">{o.customerName}</span>
                          )}
                          <span className="text-muted"> · {o.branchName}, {o.city}</span>
                          {o.notes_sales && <p className="text-xs text-muted">Handlowa: {o.notes_sales}</p>}
                          {o.notes_logistics && <p className="text-xs text-warning">Logistyczna: {o.notes_logistics}</p>}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{o.window}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Math.round(o.weight_kg)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{o.pallets || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{o.crates || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{o.order_value !== null ? formatPln(toGrosze(o.order_value)) : "—"}</td>
                        <td className="px-3 py-2">
                          {editable ? (
                            <form action={setReadiness.bind(null, o.id, o.readiness === "ready" ? "awaiting_warehouse" : "ready")}>
                              <button title="Kliknij, aby zmienić" className={readinessCls(o.readiness, true)}>{READINESS_LABELS[o.readiness]}</button>
                            </form>
                          ) : (
                            <span className={readinessCls(o.readiness)}>{READINESS_LABELS[o.readiness]}</span>
                          )}
                        </td>
                        {editable && (
                          <td className="px-3 py-2 text-right">
                            <form action={cancelOrder.bind(null, o.id)}>
                              <button className="text-xs text-muted hover:text-danger hover:underline">Anuluj</button>
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
    "inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold",
    r === "ready" ? "bg-accent text-primary" : "bg-warning/10 text-warning",
    button && "cursor-pointer hover:ring-2 hover:ring-current/30",
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "good" && "text-primary", tone === "warn" && "text-warning")}>{value}</p>
    </div>
  );
}
