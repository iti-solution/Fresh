import { RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/panel/page";
import { Button, buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { formatPln, toGrosze } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { canCustomerCancel, orderDeadline, portalOrderStatus, unitLabel, warsawNow } from "@/modules/portal/domain/portal";
import { cancelPortalOrder } from "@/modules/portal/server/actions";
import { requirePortalContext } from "@/modules/portal/server/context";
import { getPortalOrder } from "@/modules/portal/server/queries";

export const metadata: Metadata = { title: "Zamówienie" };

export default async function PortalOrderPage({ params, searchParams }: PageProps<"/portal/zamowienie/[id]">) {
  const ctx = await requirePortalContext();
  const { id } = await params;
  const sp = await searchParams;
  const o = await getPortalOrder(ctx, id);
  if (!o) notFound();

  const st = portalOrderStatus(o.status);
  const cancellable = canCustomerCancel(
    {
      status: o.status,
      delivery_date: o.delivery_date,
      onRoute: Array.isArray(o.route_stop_orders) ? o.route_stop_orders.length > 0 : Boolean(o.route_stop_orders),
    },
    warsawNow(),
    ctx.settings,
  );
  const deadline = orderDeadline(o.delivery_date, ctx.settings);
  const qty = (n: number | string, unit: string) =>
    `${Number(n).toLocaleString("pl-PL", { maximumFractionDigits: 3 })} ${unitLabel(unit)}`;

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-sm">
        <Link href="/portal" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
          ‹ Moje zamówienia
        </Link>
      </nav>

      {sp.nowe === "1" && (
        <Notice>
          <strong>Dziękujemy — zamówienie przyjęte.</strong>
          {cancellable && (
            <span>
              Możesz je anulować do {deadline.time} ({formatDayLabel(deadline.date).split(",")[0]}).
            </span>
          )}
        </Notice>
      )}
      {sp.anulowano === "1" && <Notice tone="info">Zamówienie anulowane.</Notice>}
      {sp.blad === "anulowanie" && <Notice tone="danger">Nie udało się anulować — hurtownia już realizuje to zamówienie.</Notice>}

      <section className="rounded-[var(--radius-panel)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-xs text-muted">{o.external_ref ?? "—"}</p>
            <h1 className="text-[24px] font-semibold capitalize leading-tight tracking-[-0.01em]">
              {formatDayLabel(o.delivery_date)}
            </h1>
            <p className="text-sm text-muted">
              {o.delivery_points?.name}
              {o.delivery_points?.address_line && ` · ${o.delivery_points.address_line}, ${o.delivery_points.city ?? ""}`}
            </p>
          </div>
          <Pill tone={st.tone} className="text-sm">
            {st.label}
          </Pill>
        </div>
        {o.customer_note && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">„{o.customer_note}”</p>}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]">
        {o.order_lines.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            Zamówienie przyjęte przez hurtownię bez listy produktów w portalu
            {o.order_value !== null && <> — wartość {formatPln(toGrosze(o.order_value))}</>}.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Produkt</th>
                <th className="px-4 py-2 text-right font-medium">Ilość</th>
                <th className="px-4 py-2 text-right font-medium">Netto</th>
              </tr>
            </thead>
            <tbody>
              {o.order_lines.map((l) => (
                <tr key={l.line_no} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">{l.product_name}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{qty(l.qty, l.unit)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted tabular-nums">
                    {l.unit_price !== null ? formatPln(Math.round(Number(l.qty) * toGrosze(l.unit_price))) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            {o.order_value !== null && (
              <tfoot>
                <tr className="bg-surface-2 font-semibold">
                  <td className="px-4 py-2.5" colSpan={2}>
                    Razem netto (orientacyjnie)
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{formatPln(toGrosze(o.order_value))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </section>
      <p className="px-1 text-xs text-muted">
        Ceny orientacyjne; obowiązuje faktura hurtowni (ilości ważone przy kompletacji mogą się różnić).
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {o.order_lines.length > 0 && (
          <Link
            href={`/portal/zamow?powtorz=${o.id}`}
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
          >
            <RotateCcw /> Zamów to samo
          </Link>
        )}
        {cancellable && (
          <form action={cancelPortalOrder.bind(null, o.id)}>
            <Button type="submit" size="lg" variant="ghost" className="w-full text-danger hover:bg-danger-soft hover:text-danger">
              Anuluj zamówienie
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
