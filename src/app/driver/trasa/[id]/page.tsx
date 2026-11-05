import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UUID_RE } from "@/modules/execution/domain/offline";
import { customerBalancesForRoute, getDriverCtx } from "@/modules/execution/server/driver-context";
import { getRouteSnapshot } from "@/modules/execution/server/queries";
import { RouteApp } from "@/modules/execution/ui/route-app";
import { getDriverPayPreview } from "@/modules/payroll/server/preview";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Trasa" };

// Trasa w telefonie: serwer podaje migawkę, dalej wszystko działa w przeglądarce — także bez zasięgu (M4.2).
export default async function DriverRoutePage({ params }: PageProps<"/driver/trasa/[id]">) {
  const ctx = await requireTenantContext();
  if (ctx.role !== "driver") redirect("/driver");
  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/driver");
  const c = await getDriverCtx();
  const [pay, balances] = c
    ? await Promise.all([getDriverPayPreview(c, id).catch(() => null), customerBalancesForRoute(c, id).catch(() => null)])
    : [null, null];
  const snapshot = await getRouteSnapshot(id, pay, balances);
  if (!snapshot) redirect("/driver");
  return <RouteApp routeId={id} initial={snapshot} />;
}
