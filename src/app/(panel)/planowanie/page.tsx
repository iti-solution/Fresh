import type { Metadata } from "next";
import Link from "next/link";
import { Copy, History, PackageCheck, Printer, Route, TriangleAlert } from "lucide-react";
import { EmptyState, Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { DATE_RE } from "@/lib/forms";
import { formatDayLabel, nextWorkingDay, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { nowInWarsaw } from "@/modules/ops/server/queries";
import { assignmentConflicts } from "@/modules/planning/domain/assignments";
import { canMarkReady } from "@/modules/planning/domain/load";
import {
  boardMoveOrders,
  boardMoveStop,
  copyDay,
  copyLastAssignments,
  createDay,
  createExtraRoute,
  markAllReady,
} from "@/modules/planning/server/actions";
import { toBoardRoute, toBoardUnassigned } from "@/modules/planning/server/board-model";
import { getPlanningDay } from "@/modules/planning/server/queries";
import { PlanningBoard, type BoardRoute } from "@/modules/planning/ui/board";
import { ExtraRouteForm } from "@/modules/planning/ui/extra-route-form";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Tablica tras" };

export default async function PlanningPage({ searchParams }: PageProps<"/planowanie">) {
  const ctx = await requireAccess("/planowanie");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : await defaultDay(ctx.tenantId, today);
  const editable = canEdit(ctx.role);
  const plan = await getPlanningDay(ctx.tenantId, day);
  const { routes, unassigned } = plan;
  const now = day === today ? nowInWarsaw() : null;
  const href = (d: string) => `/planowanie?dzien=${d}`;

  const conflicts = assignmentConflicts(
    routes.map((r) => ({
      id: r.id,
      name: r.name,
      courseNo: r.courseNo,
      vehicleId: r.vehicleId,
      vehicleLabel: r.vehicleLabel,
      driverId: r.driverId,
      driverLabel: r.driverLabel,
    })),
  );

  const boardRoutes: BoardRoute[] = routes.map((r) => toBoardRoute(r, day, now, editable, conflicts.get(r.id) ?? []));
  const readyCount = routes.filter((r) => r.status === "planned").length;
  const canReadyNow = routes.filter((r) => r.status === "draft" && canMarkReady(r.issues).ok).length;
  const missingAssignment = routes.filter(
    (r) => (r.status === "draft" || r.status === "planned") && (!r.vehicleId || !r.driverId),
  ).length;
  const awaiting =
    routes.reduce((a, r) => a + r.stops.flatMap((s) => s.orders).filter((o) => o.readiness === "awaiting_warehouse").length, 0) +
    unassigned.filter((o) => o.readiness === "awaiting_warehouse").length;

  if (routes.length === 0) {
    return (
      <div className="space-y-4">
        <DayNav day={day} href={href} />
        <Panel className="max-w-2xl">
          <EmptyState
            icon={<Route />}
            title={`Na ${formatDayLabel(day)} nie ma jeszcze planu`}
            action={
              editable ? (
                <div className="flex flex-col items-center gap-3">
                  {plan.templatesForDay > 0 && (
                    <form action={createDay.bind(null, day)}>
                      <button className={buttonVariants()}>Utwórz dzień z tras stałych</button>
                    </form>
                  )}
                  <form action={copyDay.bind(null, day)} className="flex flex-wrap items-center justify-center gap-2 text-sm">
                    <span className="text-muted">albo skopiuj plan z dnia</span>
                    <input
                      type="date"
                      name="from"
                      defaultValue={shiftDay(day, -7)}
                      aria-label="Dzień, z którego kopiujesz plan"
                      className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-sm"
                    />
                    <button className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Copy /> Kopiuj trasy
                    </button>
                  </form>
                </div>
              ) : undefined
            }
          >
            W ten dzień jeździ {plan.templatesForDay} tras stałych, zamówień jest {unassigned.length}. System utworzy trasy z
            szablonów i sam przypisze zamówienia według adresów dostaw.
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const notices =
    plan.holiday || awaiting > 0 ? (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-1.5 text-[12.5px] text-[#6e4700]">
        <TriangleAlert className="size-4 text-warning" />
        {plan.holiday && <span className="font-semibold text-danger">Święto: {plan.holiday}</span>}
        {awaiting > 0 && <span>{awaiting} zamówień jeszcze w magazynie (kropka przy punkcie)</span>}
      </div>
    ) : null;

  return (
    <>
      <h1 className="sr-only">Tablica tras — {formatDayLabel(day)}</h1>
      <PlanningBoard
        day={day}
        dayLabel={formatDayLabel(day)}
        prevHref={href(shiftDay(day, -1))}
        nextHref={href(shiftDay(day, 1))}
        routes={boardRoutes}
        unassigned={unassigned.map(toBoardUnassigned)}
        editable={editable}
        vehicles={plan.vehicles}
        drivers={plan.drivers}
        moveOrders={boardMoveOrders}
        moveStop={boardMoveStop}
        notices={notices}
        toolbarActions={
          <>
            <Link
              href={`/druk/zaladunek?dzien=${day}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              title="Listy załadunkowe wszystkich tras dnia"
            >
              <Printer /> Listy załadunkowe
            </Link>
            {editable && (
              <>
                <ExtraRouteForm action={createExtraRoute.bind(null, day)} vehicles={plan.vehicles} drivers={plan.drivers} />
                {plan.templatesForDay > routes.filter((r) => r.kind === "regular").length && (
                  <form action={createDay.bind(null, day)}>
                    <button className={buttonVariants({ variant: "outline", size: "sm" })}>Dodaj brakujące trasy stałe</button>
                  </form>
                )}
                {missingAssignment > 0 && (
                  <form action={copyLastAssignments.bind(null, day)}>
                    <button
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      title="Trasom bez auta lub kierowcy podpowiada przydział z ostatniego dnia, w którym jechały."
                    >
                      <History /> Przydziel jak ostatnio ({missingAssignment})
                    </button>
                  </form>
                )}
                <form action={markAllReady.bind(null, day)}>
                  <button
                    disabled={canReadyNow === 0}
                    className={buttonVariants({ size: "sm" })}
                    title="Oznacza trasy bez blokad. Przeciążone trzeba potwierdzić osobno (menu trasy)."
                  >
                    <PackageCheck /> Do załadunku ({readyCount + canReadyNow}/{routes.length})
                  </button>
                </form>
              </>
            )}
          </>
        }
      />
    </>
  );
}

/** Bez wskazanego dnia: dziś, jeśli są trasy; inaczej najbliższy dzień roboczy (plan na jutro). */
async function defaultDay(tenantId: string, today: string): Promise<string> {
  const todayPlan = await getPlanningDay(tenantId, today);
  return todayPlan.routes.length > 0 ? today : nextWorkingDay(today);
}

function DayNav({ day, href }: { day: string; href: (d: string) => string }) {
  return (
    <div className="flex items-center gap-1">
      <Link href={href(shiftDay(day, -1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Poprzedni dzień">
        ‹
      </Link>
      <span className="inline-flex h-8 min-w-40 items-center justify-center rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold capitalize">
        {formatDayLabel(day)}
      </span>
      <Link href={href(shiftDay(day, 1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Następny dzień">
        ›
      </Link>
    </div>
  );
}
