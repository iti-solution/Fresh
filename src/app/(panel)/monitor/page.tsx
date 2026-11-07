import type { Metadata } from "next";
import { DATE_RE } from "@/lib/forms";
import { formatDayLabel, todayInWarsaw } from "@/modules/orders/domain/orders";
import { nowInWarsaw } from "@/modules/ops/server/queries";
import { RouteMonitor } from "@/modules/ops/ui/route-monitor";
import { sortRoutes } from "@/modules/planning/domain/board";
import { toBoardRoute, toBoardUnassigned } from "@/modules/planning/server/board-model";
import { getPlanningDay } from "@/modules/planning/server/queries";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Monitor tras" };

/** Monitor tras na telewizor: wszystkie trasy dnia obok siebie, odświeżane co 30 s. */
export default async function MonitorPage({ searchParams }: PageProps<"/monitor">) {
  const ctx = await requireAccess("/monitor");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : today;
  const plan = await getPlanningDay(ctx.tenantId, day);
  const now = day === today ? nowInWarsaw() : null;
  const routes = sortRoutes(
    plan.routes.map((r) => ({ ...toBoardRoute(r, day, now, false, []), stopsCount: r.stops.length })),
    "name",
  );
  return (
    <>
      <h1 className="sr-only">Monitor tras — {formatDayLabel(day)}</h1>
      <RouteMonitor
        dayLabel={formatDayLabel(day)}
        isToday={day === today}
        routes={routes}
        unassigned={plan.unassigned.map(toBoardUnassigned)}
      />
    </>
  );
}
