import type { Metadata } from "next";
import Link from "next/link";
import { requirePortalContext } from "@/modules/portal/server/context";
import { getPortalCatalog, getPortalOrder, getPortalPoints } from "@/modules/portal/server/queries";
import { OrderBuilder } from "@/modules/portal/ui/order-builder";

export const metadata: Metadata = { title: "Nowe zamówienie" };

export default async function NewPortalOrderPage({ searchParams }: PageProps<"/portal/zamow">) {
  const ctx = await requirePortalContext();
  const sp = await searchParams;
  const repeatId = typeof sp.powtorz === "string" ? sp.powtorz : null;
  const [points, products, repeat] = await Promise.all([
    getPortalPoints(ctx),
    getPortalCatalog(ctx),
    repeatId ? getPortalOrder(ctx, repeatId) : Promise.resolve(null),
  ]);

  // „Zamów to samo”: pozycje, które nadal są w ofercie
  const offered = new Set(products.map((p) => p.id));
  const initialQty: Record<string, number> = {};
  let skipped = 0;
  for (const l of repeat?.order_lines ?? []) {
    if (l.product_id && offered.has(l.product_id)) initialQty[l.product_id] = (initialQty[l.product_id] ?? 0) + Number(l.qty);
    else skipped += 1;
  }
  const notice = repeat
    ? `Koszyk wypełniony jak w zamówieniu ${repeat.external_ref ?? ""}. Zmień ilości i wybierz dzień.` +
      (skipped ? ` ${skipped} ${skipped === 1 ? "produkt jest" : "produkty są"} już niedostępne.` : "")
    : undefined;

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href="/portal" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
          ‹ Moje zamówienia
        </Link>
      </nav>
      <h1 className="mb-4 text-[24px] font-semibold leading-tight tracking-[-0.01em]">Nowe zamówienie</h1>
      {products.length === 0 ? (
        <p className="rounded-[var(--radius-panel)] border border-border bg-surface p-5 text-sm text-muted">
          Hurtownia nie udostępniła jeszcze katalogu produktów. Zadzwoń do opiekuna handlowego.
        </p>
      ) : (
        <OrderBuilder
          points={points}
          products={products}
          initialQty={initialQty}
          initialPointId={repeat?.delivery_point_id ?? undefined}
          notice={notice}
        />
      )}
    </>
  );
}
