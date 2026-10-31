import { ChevronRight, Plus, RotateCcw, ShoppingBasket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { formatPln, toGrosze } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { orderDeadline, portalOrderStatus } from "@/modules/portal/domain/portal";
import { requirePortalContext } from "@/modules/portal/server/context";
import { getLastPortalOrderId, getPortalOrders, getPortalPoints } from "@/modules/portal/server/queries";

export const metadata: Metadata = { title: "Moje zamówienia" };

type OrderRow = Awaited<ReturnType<typeof getPortalOrders>>["upcoming"][number];

function OrderItem({ o }: { o: OrderRow }) {
  const st = portalOrderStatus(o.status);
  return (
    <li>
      <Link
        href={`/portal/zamowienie/${o.id}`}
        className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold capitalize">{formatDayLabel(o.delivery_date)}</span>
          <span className="block truncate text-sm text-muted">
            {o.delivery_points?.name} · {o.order_lines.length ? `${o.order_lines.length} poz.` : (o.external_ref ?? "zamówienie")}
            {o.order_value !== null && ` · ${formatPln(toGrosze(o.order_value))}`}
          </span>
        </span>
        <Pill tone={st.tone}>{st.label}</Pill>
        <ChevronRight className="size-4 shrink-0 text-subtle" />
      </Link>
    </li>
  );
}

export default async function PortalHome() {
  const ctx = await requirePortalContext();
  const [points, orders, lastId] = await Promise.all([getPortalPoints(ctx), getPortalOrders(ctx), getLastPortalOrderId(ctx)]);
  const next = points.flatMap((p) => p.dates).sort()[0] ?? null;
  const deadline = next ? orderDeadline(next, ctx.settings) : null;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[var(--radius-panel)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
        {next ? (
          <>
            <p className="text-sm text-muted">Najbliższa możliwa dostawa</p>
            <p className="mt-0.5 text-[24px] font-semibold capitalize leading-tight tracking-[-0.01em]">{formatDayLabel(next)}</p>
            {deadline && (
              <p className="mt-1 text-sm text-muted">
                Zamów do <strong className="text-foreground">{deadline.time}</strong>{" "}
                <span className="capitalize">{formatDayLabel(deadline.date).split(",")[0]}</span>
              </p>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link href="/portal/zamow" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                <Plus /> Nowe zamówienie
              </Link>
              {lastId && (
                <Link
                  href={`/portal/zamow?powtorz=${lastId}`}
                  className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
                >
                  <RotateCcw /> Zamów to samo co ostatnio
                </Link>
              )}
            </div>
          </>
        ) : (
          <EmptyState icon={<ShoppingBasket />} title="Brak terminów dostawy do wyboru">
            {points.length === 0
              ? "Hurtownia nie przypisała jeszcze adresu dostawy do Twojego konta."
              : "W najbliższych dniach hurtownia nie dowozi pod Twoje adresy. Zadzwoń do opiekuna handlowego."}
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="nadchodzace">
        <h2 id="nadchodzace" className="mb-2 px-1 text-[15px] font-semibold">
          Nadchodzące dostawy
        </h2>
        {orders.upcoming.length === 0 ? (
          <p className="rounded-[var(--radius-panel)] border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
            Nie masz zamówionych dostaw.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]">
            {orders.upcoming.map((o) => (
              <OrderItem key={o.id} o={o} />
            ))}
          </ul>
        )}
      </section>

      {orders.past.length > 0 && (
        <section aria-labelledby="historia">
          <h2 id="historia" className="mb-2 px-1 text-[15px] font-semibold">
            Ostatnie 30 dni
          </h2>
          <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]">
            {orders.past.map((o) => (
              <OrderItem key={o.id} o={o} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
