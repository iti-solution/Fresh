import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Plus, Search, Upload } from "lucide-react";
import { EmptyState, Notice, Panel, Segmented } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { DocRef, Pill } from "@/components/ui/status";
import { DATE_RE, formatPln, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
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
import { unitLabel } from "@/modules/portal/domain/portal";
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
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const editable = canEdit(ctx.role);

  const supabase = await createClient();
  const [all, { count: unmatchedCount }] = await Promise.all([
    getDayOrders(ctx.tenantId, day),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenantId)
      .is("delivery_point_id", null)
      .neq("status", "cancelled")
      .gte("delivery_date", shiftDay(today, -14)),
  ]);
  const unmatched = unmatchedCount ?? 0;
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
  const cancelled = all.length - active.length;
  const nearest = active.length === 0 ? await nearestDayWithOrders(ctx.tenantId, today) : null;
  const href = (d: string, f = filter) => `/zlecenia?dzien=${d}${f ? `&filtr=${f}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const needle = q ? q.toLowerCase() : "";
  const searched = needle
    ? visible.filter((o) =>
        [o.customerName, o.customerCode ?? "", o.external_ref ?? "", o.city, o.address, o.dayRoute ?? "", o.route]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : visible;
  // jeden wiersz = adres dostawy (kontrahent + oddział); rozwinięcie pokazuje zamówienia i ich pozycje
  const points = new Map<string, DayOrder[]>();
  for (const o of searched) {
    const key = o.pointId ?? `brak-${o.id}`;
    points.set(key, [...(points.get(key) ?? []), o]);
  }
  const rows = [...points.values()].sort(
    (a, b) => a[0].customerName.localeCompare(b[0].customerName, "pl") || a[0].city.localeCompare(b[0].city, "pl"),
  );
  const unrouted = active.filter((o) => !o.dayRoute).length;

  return (
    <div className="space-y-2.5">
      <h1 className="sr-only">Zamówienia — {formatDayLabel(day)}</h1>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-[var(--shadow-panel)]">
        <div className="flex items-center">
          <Link href={href(shiftDay(day, -1))} aria-label="Poprzedni dzień" className={navBtn}>
            <ChevronLeft />
          </Link>
          <span className="mx-1 inline-flex h-9 min-w-[150px] items-center justify-center rounded-lg border border-border-strong px-3 text-[13px] font-semibold capitalize">
            {formatDayLabel(day)}
          </span>
          <Link href={href(shiftDay(day, 1))} aria-label="Następny dzień" className={navBtn}>
            <ChevronRight />
          </Link>
        </div>
        <form action="/zlecenia" className="relative w-full max-w-sm">
          <input type="hidden" name="dzien" value={day} />
          {filter && <input type="hidden" name="filtr" value={filter} />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Szukaj kontrahenta, dokumentu, trasy"
            aria-label="Szukaj zamówień"
            className="h-9 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-9 text-[13px] outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
          />
        </form>
        <Segmented
          items={FILTERS.map((f) => ({ href: href(day, f.key), label: f.label, active: filter === f.key, count: counts[f.key] }))}
        />
        {editable && (
          <div className="ml-auto flex items-center gap-2">
            <Link href="/zlecenia/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Upload /> Import z pliku
            </Link>
            <Link href={`/zlecenia/nowe?dzien=${day}`} className={buttonVariants({ size: "sm" })}>
              <Plus /> Nowe zamówienie
            </Link>
          </div>
        )}
      </div>

      {sp.dodano && <Notice>Dodano zamówienie.</Notice>}
      {unmatched > 0 && (
        <Notice tone="warning">
          {unmatched} zamówień z importu czeka na przypięcie do adresu dostawy.{" "}
          <Link href="/zlecenia/dopasuj" className="font-medium underline">
            Dopasuj teraz
          </Link>
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-1 text-[12px] text-muted">
        <span>Zamówienia na wybrany dzień — rozwiń kontrahenta, aby zobaczyć zamówienia, a zamówienie, aby zobaczyć pozycje</span>
        <span className="tabular-nums">
          {summary.count} zam. · {summary.weightKg.toLocaleString("pl-PL")} kg · {summary.crates} skrz. · {summary.pallets} pal. ·{" "}
          {formatPln(summary.valueGrosze)}
          {unrouted > 0 && (
            <Link href={`/planowanie?dzien=${day}`} className="ml-2 font-semibold text-info hover:underline">
              {unrouted} poza trasą
            </Link>
          )}
        </span>
      </div>

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
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-[12px] text-muted">
                  <th className="py-2.5 pr-3 pl-4 font-medium">Kod</th>
                  <th className="py-2.5 pr-3 font-medium">Kontrahent</th>
                  <th className="py-2.5 pr-3 font-medium">Miasto</th>
                  <th className="py-2.5 pr-3 font-medium">Adres</th>
                  <th className="py-2.5 pr-3 font-medium">Okno dostaw</th>
                  <th className="py-2.5 pr-3 font-medium">Trasa stała</th>
                  <th className="py-2.5 pr-3 font-medium">Trasa dnia</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Zam.</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Waga</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Objętość</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Skrz.</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Wartość</th>
                  <th className="py-2.5 pr-3 font-medium">Magazyn</th>
                  <th className="w-10 py-2.5" />
                </tr>
              </thead>
              {rows.map((orders) => (
                <PointRows key={orders[0].pointId ?? orders[0].id} orders={orders} editable={editable} />
              ))}
            </table>
          </div>
          {rows.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted">Nic nie pasuje do wyszukiwania.</p>}
          <p className="border-t border-border px-4 py-2 text-right text-[12px] text-muted tabular-nums">
            Adresy: {rows.length} · zamówienia: {searched.length}
            {cancelled > 0 && ` · anulowane w tym dniu: ${cancelled}`}
          </p>
        </div>
      )}
    </div>
  );
}

const navBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong text-muted hover:bg-surface-2 hover:text-foreground [&_svg]:size-4";

function PointRows({ orders, editable }: { orders: DayOrder[]; editable: boolean }) {
  const o0 = orders[0];
  const s = summarizeOrders(orders);
  const m3 = orders.reduce((a, o) => a + o.volume_m3, 0);
  const routes = [...new Set(orders.map((o) => o.dayRoute ?? ""))];
  const awaiting = orders.filter((o) => o.readiness === "awaiting_warehouse").length;
  const hasNotes = orders.some((o) => o.notes_sales || o.notes_logistics || o.customer_note);
  const id = `pt-${o0.pointId ?? o0.id}`;
  return (
    <tbody className="group/pt border-b border-border last:border-0">
      <tr className="hover:bg-surface-2 has-[input:checked]:bg-info-soft/50">
        <td className="py-2.5 pr-3 pl-4 font-mono text-[12px] text-muted">{o0.customerCode ?? "—"}</td>
        <td className="py-2.5 pr-3">
          <label className="cursor-pointer">
            <input id={id} type="checkbox" className="peer sr-only" aria-label={`Pokaż zamówienia: ${o0.customerName}`} />
            <span className="font-bold text-foreground">{o0.customerName}</span>
            <span className="block text-[12px] text-muted">{o0.branchName}</span>
          </label>
        </td>
        <td className="py-2.5 pr-3">{o0.city}</td>
        <td className="py-2.5 pr-3 text-muted">{o0.address || "—"}</td>
        <td className="py-2.5 pr-3 tabular-nums">{o0.window}</td>
        <td className="py-2.5 pr-3 text-muted">{o0.route}</td>
        <td className="py-2.5 pr-3">
          {routes.map((r) =>
            r ? (
              <span key={r} className="block font-semibold">
                {r}
              </span>
            ) : (
              <span key="none" className="block text-muted italic">
                poza trasą
              </span>
            ),
          )}
        </td>
        <td className="py-2.5 pr-3 text-right">
          <span className="rounded bg-info-soft px-1.5 py-0.5 text-[12px] font-bold text-info tabular-nums">{orders.length}</span>
        </td>
        <td className="py-2.5 pr-3 text-right tabular-nums">{s.weightKg.toLocaleString("pl-PL")} kg</td>
        <td className="py-2.5 pr-3 text-right tabular-nums">{m3.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} m³</td>
        <td className="py-2.5 pr-3 text-right tabular-nums">{s.crates || "—"}</td>
        <td className="py-2.5 pr-3 text-right tabular-nums">{formatPln(s.valueGrosze)}</td>
        <td className="py-2.5 pr-3">
          <span className="flex items-center gap-1.5">
            <span className={readinessCls(awaiting ? "awaiting_warehouse" : "ready")}>
              {awaiting ? `${awaiting} w magazynie` : "skompletowane"}
            </span>
            {hasNotes && <span className="h-2 w-2 rounded-full bg-info" title="Są uwagi do zamówienia" />}
          </span>
        </td>
        <td className="py-2.5 pr-3 text-subtle">
          <label htmlFor={id} className="flex cursor-pointer justify-center">
            <ChevronDown className="size-4 transition-transform group-has-[input:checked]/pt:rotate-180" />
          </label>
        </td>
      </tr>
      <tr className="hidden group-has-[input:checked]/pt:table-row">
        <td />
        <td colSpan={13} className="pr-4 pb-3">
          <div className="overflow-hidden rounded-lg border border-border">
            {orders.map((o) => (
              <div key={o.id} className="border-b border-border px-3 py-2 last:border-b-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <DocRef>{o.external_ref ?? "—"}</DocRef>
                  {o.source === "ai" && (
                    <Pill tone="plum" title="Odczytane z wiadomości klienta i sprawdzone przez człowieka">
                      AI
                    </Pill>
                  )}
                  {o.source === "portal" && <Pill tone="info">portal</Pill>}
                  {o.priority > 0 && <Pill tone="danger">priorytet</Pill>}
                  <span className="text-[12.5px] text-muted tabular-nums">
                    {o.window} · {Math.round(o.weight_kg)} kg · {o.crates} skrz.{o.pallets ? ` · ${o.pallets} pal.` : ""}
                    {o.order_value !== null ? ` · ${formatPln(toGrosze(o.order_value))}` : ""}
                    {o.cod_amount ? ` · pobranie ${formatPln(toGrosze(o.cod_amount))}` : ""}
                  </span>
                  <span className="flex-1" />
                  {editable ? (
                    <form action={setReadiness.bind(null, o.id, o.readiness === "ready" ? "awaiting_warehouse" : "ready")}>
                      <button title="Kliknij, aby zmienić" className={readinessCls(o.readiness, true)}>
                        {READINESS_LABELS[o.readiness]}
                      </button>
                    </form>
                  ) : (
                    <span className={readinessCls(o.readiness)}>{READINESS_LABELS[o.readiness]}</span>
                  )}
                  {editable && (
                    <form action={cancelOrder.bind(null, o.id)}>
                      <button className={buttonVariants({ variant: "ghost", size: "xs" })}>Anuluj</button>
                    </form>
                  )}
                </div>
                {o.notes_sales && <p className="mt-1 text-xs text-info">Handlowa: {o.notes_sales}</p>}
                {o.notes_logistics && <p className="mt-0.5 text-xs text-warning">Logistyczna: {o.notes_logistics}</p>}
                {o.customer_note && <p className="mt-0.5 text-xs text-plum">Klient: {o.customer_note}</p>}
                {o.lines.length > 0 && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted hover:text-foreground">
                      {o.lines.length} {o.lines.length === 1 ? "pozycja" : o.lines.length < 5 ? "pozycje" : "pozycji"}
                    </summary>
                    <ul className="mt-1 max-w-xl space-y-0.5">
                      {o.lines.map((l, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span>{l.name}</span>
                          <span className="whitespace-nowrap text-muted tabular-nums">
                            {l.qty.toLocaleString("pl-PL", { maximumFractionDigits: 3 })} {unitLabel(l.unit)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {o.customerId && (
                  <Link href={`/kartoteki/klienci/${o.customerId}`} className="mt-1 inline-block text-xs text-primary-strong hover:underline">
                    Karta klienta
                  </Link>
                )}
              </div>
            ))}
          </div>
        </td>
      </tr>
    </tbody>
  );
}

function readinessCls(r: string, button = false) {
  return cn(
    "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium before:h-1.5 before:w-1.5 before:rounded-full before:bg-current",
    r === "ready" ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
    button && "cursor-pointer hover:ring-2 hover:ring-current/25",
  );
}
