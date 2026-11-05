import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { suggestPoints, type PointForMatch } from "@/modules/orders/domain/import";
import { shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { MatchList } from "@/modules/orders/ui/match-list";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Do dopasowania" };

export default async function UnmatchedPage() {
  const ctx = await requireAccess("/zlecenia");
  const supabase = await createClient();
  const [ordersRes, pointsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, external_ref, delivery_date, raw_customer_code, raw_point_code, raw_customer_name, raw_address")
      .eq("tenant_id", ctx.tenantId)
      .is("delivery_point_id", null)
      .neq("status", "cancelled")
      .gte("delivery_date", shiftDay(todayInWarsaw(), -14))
      .order("delivery_date")
      .order("external_ref")
      .limit(300),
    supabase
      .from("delivery_points")
      .select("id, name, external_code, address_line, city, is_active, customer_id, customers(name, external_code)")
      .eq("tenant_id", ctx.tenantId)
      .limit(5000),
  ]);
  if (ordersRes.error) throw ordersRes.error;
  if (pointsRes.error) throw pointsRes.error;

  const points: PointForMatch[] = (pointsRes.data ?? []).map((p) => ({
    id: p.id,
    external_code: p.external_code,
    address_line: p.address_line,
    city: p.city,
    is_active: p.is_active,
    customer_id: p.customer_id,
    customer_code: p.customers?.external_code ?? null,
    customer_name: p.customers?.name ?? "",
  }));
  const label = new Map(
    (pointsRes.data ?? []).map((p) => [
      p.id,
      `${p.customers?.external_code ? p.customers.external_code + " · " : ""}${p.customers?.name ?? ""} — ${p.name}, ${p.address_line}, ${p.city ?? ""}${p.is_active ? "" : " (nieaktywny)"}`,
    ]),
  );
  const orders = (ordersRes.data ?? []).map((o) => ({
    id: o.id,
    ref: o.external_ref,
    date: o.delivery_date,
    customerCode: o.raw_customer_code,
    pointCode: o.raw_point_code,
    customerName: o.raw_customer_name,
    address: o.raw_address,
    suggestions: suggestPoints(o, points).map((p) => p.id),
  }));

  return (
    <>
      <PageHeader
        title="Zamówienia do dopasowania"
        description="Import nie rozpoznał, do którego adresu dostawy należą te zamówienia. Wybierz adres — zaznacz „zapamiętaj kod”, a kolejny import zrobi to sam."
        actions={
          <Link href="/kartoteki/klienci/nowy" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Nowy klient
          </Link>
        }
      />
      {orders.length === 0 ? (
        <Panel>
          <EmptyState title="Wszystko dopasowane">Nie ma zamówień bez adresu dostawy z ostatnich dwóch tygodni.</EmptyState>
        </Panel>
      ) : canEdit(ctx.role) ? (
        <Panel title={`${orders.length} zamówień bez adresu`} flush>
          <MatchList orders={orders} points={points.map((p) => ({ id: p.id, label: label.get(p.id) ?? p.id }))} />
        </Panel>
      ) : (
        <Panel>Masz dostęp tylko do podglądu.</Panel>
      )}
    </>
  );
}
