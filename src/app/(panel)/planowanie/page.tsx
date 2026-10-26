import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitSelect, IconSubmit } from "@/components/forms/auto-submit-select";
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  History,
  Clock,
  PackageCheck,
  Route,
  TriangleAlert,
  X,
} from "lucide-react";
import { EmptyState, Meter, PageHeader, Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { DocRef, Dot, Pill, Plate } from "@/components/ui/status";
import { DATE_RE } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { formatDayLabel, nextWorkingDay, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { canMarkReady, DIM_LABELS, ROUTE_KIND_LABELS, ROUTE_STATUS_LABELS, type Dim } from "@/modules/planning/domain/load";
import {
  assignOrder,
  backToDraft,
  createDay,
  createExtraRoute,
  deleteEmptyRoute,
  copyLastAssignments,
  markAllReady,
  markReady,
  moveStop,
  moveStopToRoute,
  setRouteResource,
  sortByWindow,
  unassignStop,
} from "@/modules/planning/server/actions";
import { getPlanningDay, type PlanRoute } from "@/modules/planning/server/queries";
import { assignmentConflicts } from "@/modules/planning/domain/assignments";
import { ExtraRouteForm } from "@/modules/planning/ui/extra-route-form";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Planowanie tras" };

const DIMS: Dim[] = ["kg", "pallets", "crates", "m3"];

export default async function PlanningPage({ searchParams }: PageProps<"/planowanie">) {
  const ctx = await requireAccess("/planowanie");
  const sp = await searchParams;
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : nextWorkingDay(todayInWarsaw());
  const editable = canEdit(ctx.role);
  const plan = await getPlanningDay(ctx.tenantId, day);
  const { routes, unassigned } = plan;

  const routeOptions = routes
    .filter((r) => r.status === "draft" || r.status === "planned")
    .map((r) => ({ value: r.id, label: `${r.name}${r.vehicleLabel ? ` · ${r.vehicleLabel}` : ""}` }));
  const readyCount = routes.filter((r) => r.status === "planned").length;
  const canReadyNow = routes.filter((r) => r.status === "draft" && canMarkReady(r.issues).ok).length;
  const overloaded = routes.filter((r) => r.load.overloaded.length);
  const noDriverOrVehicle = routes.filter((r) => !r.driverId || !r.vehicleId);
  const awaitingOnRoutes = routes.reduce(
    (a, r) => a + r.stops.flatMap((s) => s.orders).filter((o) => o.readiness === "awaiting_warehouse").length,
    0,
  );
  const awaitingUnassigned = unassigned.filter((o) => o.readiness === "awaiting_warehouse").length;
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
  const missingAssignment = routes.filter(
    (r) => (r.status === "draft" || r.status === "planned") && (!r.vehicleId || !r.driverId),
  ).length;

  const alerts: { text: string; tone: "danger" | "warn" }[] = [];
  if (plan.holiday) alerts.push({ text: `Święto: ${plan.holiday}`, tone: "danger" });
  if (unassigned.length) alerts.push({ text: `${unassigned.length} zamówień bez trasy`, tone: "warn" });
  if (awaitingOnRoutes + awaitingUnassigned)
    alerts.push({ text: `${awaitingOnRoutes + awaitingUnassigned} do realizacji w magazynie`, tone: "warn" });
  for (const r of overloaded)
    alerts.push({
      text: `${r.name}: przeciążenie (${r.load.overloaded.map((d) => `${DIM_LABELS[d]} ${r.load.pct[d]}%`).join(", ")})`,
      tone: "danger",
    });
  for (const r of noDriverOrVehicle)
    alerts.push({ text: `${r.name}: ${!r.vehicleId ? "brak pojazdu" : "brak kierowcy"}`, tone: "danger" });

  const totalOrders = routes.reduce((a, r) => a + r.stops.reduce((x, st) => x + st.orders.length, 0), 0) + unassigned.length;

  return (
    <>
      <PageHeader
        title="Planowanie tras"
        description="Plan dnia z tras stałych: przenoszenie zamówień, kolejność, ładowność i przekazanie do załadunku."
        actions={
          editable && routes.length > 0 ? (
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
                    title="Trasom bez auta lub kierowcy podpowiada przydział z ostatniego dnia, w którym jechały. Zmienisz go na karcie trasy."
                  >
                    <History /> Przydziel jak ostatnio ({missingAssignment})
                  </button>
                </form>
              )}
              <form action={markAllReady.bind(null, day)}>
                <button
                  disabled={canReadyNow === 0}
                  className={buttonVariants({ size: "sm" })}
                  title="Oznacza trasy bez blokad. Przeciążone trzeba potwierdzić osobno."
                >
                  <PackageCheck /> Przekaż do załadunku ({readyCount + canReadyNow} z {routes.length})
                </button>
              </form>
            </>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-1">
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
        </div>
        {routes.length > 0 && (
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted">Trasy</dt>
              <dd className="font-semibold tabular-nums">{routes.length}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted">Zamówienia</dt>
              <dd className="font-semibold tabular-nums">{totalOrders}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted">Gotowe do załadunku</dt>
              <dd className={cn("font-semibold tabular-nums", readyCount === routes.length && "text-success")}>
                {readyCount} z {routes.length}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {alerts.length > 0 && routes.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-warning/25 bg-warning-soft px-4 py-2.5 text-sm">
          <TriangleAlert className="size-4 text-warning" />
          <span className="mr-1 font-semibold text-[#6e4700]">Do wyjaśnienia przed załadunkiem</span>
          {alerts.map((a) => (
            <Pill key={a.text} tone={a.tone === "danger" ? "danger" : "warning"} className="bg-surface">
              {a.text}
            </Pill>
          ))}
        </div>
      )}

      {routes.length === 0 ? (
        <Panel className="max-w-2xl">
          <EmptyState
            icon={<Route />}
            title={`Na ${formatDayLabel(day)} nie ma jeszcze planu`}
            action={
              editable && plan.templatesForDay > 0 ? (
                <form action={createDay.bind(null, day)}>
                  <button className={buttonVariants()}>Utwórz dzień z tras stałych</button>
                </form>
              ) : undefined
            }
          >
            W ten dzień jeździ {plan.templatesForDay} tras stałych, zamówień jest {unassigned.length}. System utworzy trasy z
            szablonów i sam przypisze zamówienia według oddziałów.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <section
            aria-label="Zamówienia nieprzydzielone"
            className="flex flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)] lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]"
          >
            <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
              <h2 className="text-[15px] font-semibold">Nieprzydzielone</h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                  unassigned.length ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
                )}
              >
                {unassigned.length}
              </span>
            </header>
            <div className="flex flex-col gap-2 overflow-y-auto p-3">
              {unassigned.length === 0 && (
                <p className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted">
                  <CircleCheck className="size-5 text-success" />
                  Wszystkie zamówienia są na trasach.
                </p>
              )}
              {unassigned.map((o) => (
                <div key={o.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <DocRef>{o.ref ?? "—"}</DocRef>
                    <Pill tone={o.readiness === "ready" ? "success" : "warning"}>
                      {o.readiness === "ready" ? "skompletowane" : "w magazynie"}
                    </Pill>
                  </div>
                  <p className="text-sm font-semibold leading-snug">{o.customer}</p>
                  <p className="text-xs text-muted">
                    {o.branch}, {o.city}
                  </p>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <WindowChip window={o.window} />
                    <span className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 tabular-nums text-muted">
                      {Math.round(o.weight_kg)} kg, {o.crates} skrz.{o.pallets ? `, ${o.pallets} pal.` : ""}
                    </span>
                    {o.priority > 0 && <Pill tone="danger">priorytet</Pill>}
                  </div>
                  {editable && routeOptions.length > 0 && (
                    <form action={assignOrder.bind(null, o.id)} className="mt-1">
                      <AutoSubmitSelect
                        name="route_id"
                        label={`Przypisz ${o.ref ?? "zamówienie"} do trasy`}
                        placeholder="Przypisz do trasy…"
                        options={routeOptions}
                        className="h-9 w-full text-[13px]"
                      />
                    </form>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="grid min-w-0 grid-cols-1 gap-5 min-[1720px]:grid-cols-2 min-[2500px]:grid-cols-3">
            {routes.map((r) => (
              <RouteCard
                key={r.id}
                route={r}
                conflicts={conflicts.get(r.id) ?? []}
                day={day}
                editable={editable}
                routeOptions={routeOptions}
                vehicles={plan.vehicles}
                drivers={plan.drivers}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function WindowChip({ window, closed }: { window: string; closed?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        closed ? "bg-danger-soft text-danger" : "bg-steel-soft text-ink-2",
      )}
      title={closed ? "Oddział zamknięty tego dnia" : "Okno przyjęć"}
    >
      <Clock className="size-3" />
      {window}
    </span>
  );
}

function RouteCard({
  route: r,
  conflicts,
  day,
  editable,
  routeOptions,
  vehicles,
  drivers,
}: {
  route: PlanRoute;
  conflicts: string[];
  day: string;
  editable: boolean;
  routeOptions: { value: string; label: string }[];
  vehicles: { id: string; label: string }[];
  drivers: { id: string; label: string }[];
}) {
  const decision = canMarkReady(r.issues);
  const locked = r.status !== "draft" && r.status !== "planned";
  const canChange = editable && !locked;
  const totals = r.load.totals;
  const others = [...routeOptions.filter((o) => o.value !== r.id), { value: "__none", label: "↩ zdejmij z trasy" }];

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border bg-surface shadow-[var(--shadow-panel)]",
        r.status === "planned"
          ? "border-success/50 ring-1 ring-success/20"
          : r.load.overloaded.length
            ? "border-danger/40"
            : "border-border",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold leading-snug">{r.name}</h3>
          <p className="text-xs text-muted">
            {[
              ROUTE_KIND_LABELS[r.kind] ?? r.kind,
              r.courseNo > 1 ? `kurs ${r.courseNo}` : null,
              r.plannedStart ? `wyjazd ${r.plannedStart}` : null,
              r.extraReason,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
        <Pill tone={r.status === "planned" ? "success" : locked ? "info" : "neutral"}>
          {ROUTE_STATUS_LABELS[r.status] ?? r.status}
        </Pill>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {canChange ? (
          <>
            <form action={setRouteResource.bind(null, r.id, "vehicle_id")}>
              <AutoSubmitSelect
                name="vehicle_id"
                label={`Pojazd trasy ${r.name}`}
                defaultValue={r.vehicleId}
                placeholder="— pojazd —"
                options={vehicles.map((v) => ({ value: v.id, label: v.label }))}
                className={cn("font-mono", !r.vehicleId && "border-danger")}
              />
            </form>
            <form action={setRouteResource.bind(null, r.id, "driver_id")}>
              <AutoSubmitSelect
                name="driver_id"
                label={`Kierowca trasy ${r.name}`}
                defaultValue={r.driverId}
                placeholder="— kierowca —"
                options={drivers.map((d) => ({ value: d.id, label: d.label }))}
                className={cn(!r.driverId && "border-danger")}
              />
            </form>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm">
            <Plate>{r.vehicleLabel}</Plate> {r.driverLabel ?? "bez kierowcy"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 px-4 pt-4">
        {DIMS.map((d) => {
          const pct = r.load.pct[d];
          const over = r.load.overloaded.includes(d);
          const near = r.load.nearFull.includes(d);
          const value = d === "kg" ? `${totals.kg}` : d === "m3" ? `${totals.m3}` : String(totals[d]);
          const cap = r.load.capacity && r.load.capacity[d] > 0 ? r.load.capacity[d] : null;
          return (
            <div key={d} className="flex min-w-0 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-1 text-[11px]">
                <span className="text-muted">{DIM_LABELS[d]}</span>
                <span
                  className={cn("font-semibold tabular-nums", over ? "text-danger" : near ? "text-warning" : "text-foreground")}
                >
                  {pct === null ? "—" : `${pct}%`}
                </span>
              </div>
              <Meter pct={pct} label={DIM_LABELS[d]} />
              <span className="truncate text-[11px] text-subtle tabular-nums">
                {value}
                {cap ? ` / ${cap}` : ""}
                {d === "kg" ? " kg" : d === "m3" ? " m³" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {r.issues.length + conflicts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {conflicts.map((c) => (
            <Pill key={c} tone="danger">
              {c}
            </Pill>
          ))}
          {r.issues.map((i) => (
            <Pill key={i.code} tone={i.severity === "info" ? "warning" : "danger"}>
              {i.label}
            </Pill>
          ))}
        </div>
      )}

      <ol className="mt-3 flex flex-col border-t border-border">
        {r.stops.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            Pusta trasa. Przypisz zamówienia z listy nieprzydzielonych.
          </li>
        )}
        {r.stops.map((s, idx) => {
          const kg = Math.round(s.orders.reduce((a, o) => a + o.weight_kg, 0));
          const crates = s.orders.reduce((a, o) => a + o.crates, 0);
          const awaiting = s.orders.some((o) => o.readiness === "awaiting_warehouse");
          const orderIds = s.orders.map((o) => o.id);
          return (
            <li
              key={s.id}
              className="group grid grid-cols-[22px_auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border px-4 py-2 text-sm last:border-0 hover:bg-surface-2"
            >
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-border-strong text-[11px] font-semibold text-muted tabular-nums">
                {s.sequence}
              </span>
              <WindowChip window={s.window} closed={s.closed} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium" title={s.customer}>
                    {s.customer}
                  </span>
                  {awaiting && <Dot tone="warning" title="Zamówienie jeszcze w magazynie" />}
                </span>
                <span className="block truncate text-xs text-muted">
                  {s.branch}, {s.city} <span className="text-subtle">·</span>{" "}
                  <span className="tabular-nums">
                    {kg} kg, {crates} skrz.{s.orders.length > 1 ? `, ${s.orders.length} zam.` : ""}
                  </span>
                </span>
              </span>
              {canChange ? (
                <span className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <form action={moveStop.bind(null, s.id, -1)}>
                    <IconSubmit label="W górę" className={idx === 0 ? "invisible" : ""}>
                      <ArrowUp />
                    </IconSubmit>
                  </form>
                  <form action={moveStop.bind(null, s.id, 1)}>
                    <IconSubmit label="W dół" className={idx === r.stops.length - 1 ? "invisible" : ""}>
                      <ArrowDown />
                    </IconSubmit>
                  </form>
                  <form action={moveStopToRoute.bind(null, orderIds)}>
                    <AutoSubmitSelect
                      name="route_id"
                      label={`Przenieś ${s.customer} na inną trasę`}
                      placeholder="Przenieś…"
                      options={others}
                      className="h-7 w-24"
                    />
                  </form>
                  <form action={unassignStop.bind(null, orderIds)}>
                    <IconSubmit label="Zdejmij z trasy" className="hover:text-danger">
                      <X />
                    </IconSubmit>
                  </form>
                </span>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ol>

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-border bg-surface-2 px-4 py-2.5 text-xs text-muted">
        <span className="tabular-nums">{r.stops.length} punktów</span>
        <span className="flex-1" />
        {canChange && r.stops.length > 1 && (
          <form action={sortByWindow.bind(null, r.id)}>
            <button
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              title="Ustawia kolejność według początku okien przyjęć"
            >
              <ArrowDownWideNarrow /> Sortuj wg okien
            </button>
          </form>
        )}
        {canChange && r.status === "draft" && r.stops.length === 0 && r.kind !== "regular" && (
          <form action={deleteEmptyRoute.bind(null, r.id)}>
            <button className={buttonVariants({ variant: "ghost", size: "sm" })}>Usuń kurs</button>
          </form>
        )}
        {canChange &&
          r.status === "draft" &&
          (decision.ok ? (
            <form action={markReady.bind(null, r.id, day, false)}>
              <button className={buttonVariants({ size: "sm" })}>Gotowa do załadunku</button>
            </form>
          ) : decision.needsConfirm ? (
            <form action={markReady.bind(null, r.id, day, true)}>
              <button className={buttonVariants({ size: "sm", variant: "danger" })} title={decision.reasons.join(", ")}>
                Gotowa mimo przeciążenia
              </button>
            </form>
          ) : (
            <button
              disabled
              className={buttonVariants({ size: "sm", variant: "outline" })}
              title={`Najpierw: ${decision.reasons.join(", ")}`}
            >
              Gotowa do załadunku
            </button>
          ))}
        {canChange && r.status === "planned" && (
          <form action={backToDraft.bind(null, r.id)}>
            <button className={buttonVariants({ variant: "outline", size: "sm" })}>Cofnij do szkicu</button>
          </form>
        )}
      </footer>
    </article>
  );
}
