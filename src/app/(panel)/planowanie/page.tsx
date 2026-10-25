import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitSelect, IconSubmit } from "@/components/forms/auto-submit-select";
import { PageHeader } from "@/components/panel/module-placeholder";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
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
  markAllReady,
  markReady,
  moveStop,
  moveStopToRoute,
  setRouteResource,
  sortByWindow,
  unassignStop,
} from "@/modules/planning/server/actions";
import { getPlanningDay, type PlanRoute } from "@/modules/planning/server/queries";
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
  const awaitingOnRoutes = routes.reduce((a, r) => a + r.stops.flatMap((s) => s.orders).filter((o) => o.readiness === "awaiting_warehouse").length, 0);
  const awaitingUnassigned = unassigned.filter((o) => o.readiness === "awaiting_warehouse").length;
  const href = (d: string) => `/planowanie?dzien=${d}`;

  const alerts: { text: string; tone: "danger" | "warn" }[] = [];
  if (plan.holiday) alerts.push({ text: `Święto: ${plan.holiday}`, tone: "danger" });
  if (unassigned.length) alerts.push({ text: `${unassigned.length} zamówień bez trasy`, tone: "warn" });
  if (awaitingOnRoutes + awaitingUnassigned) alerts.push({ text: `${awaitingOnRoutes + awaitingUnassigned} do realizacji w magazynie`, tone: "warn" });
  for (const r of overloaded) alerts.push({ text: `${r.name}: przeciążenie (${r.load.overloaded.map((d) => `${DIM_LABELS[d]} ${r.load.pct[d]}%`).join(", ")})`, tone: "danger" });
  for (const r of noDriverOrVehicle) alerts.push({ text: `${r.name}: ${!r.vehicleId ? "brak pojazdu" : "brak kierowcy"}`, tone: "danger" });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Planowanie tras" description="Plan dnia z tras stałych: przenoszenie zamówień, kolejność, ładowność i przekazanie do załadunku." />
        {editable && routes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <ExtraRouteForm action={createExtraRoute.bind(null, day)} vehicles={plan.vehicles} drivers={plan.drivers} />
            {plan.templatesForDay > routes.filter((r) => r.kind === "regular").length && (
              <form action={createDay.bind(null, day)}>
                <button className={buttonVariants({ variant: "outline", size: "sm" })}>Dodaj brakujące trasy stałe</button>
              </form>
            )}
            <form action={markAllReady.bind(null, day)}>
              <button disabled={canReadyNow === 0} className={buttonVariants({ size: "sm" })} title="Oznacza trasy bez blokad. Przeciążone trzeba potwierdzić osobno.">
                Przekaż do załadunku ({readyCount + canReadyNow} z {routes.length})
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href(shiftDay(day, -1))} aria-label="Poprzedni dzień" className={buttonVariants({ variant: "outline", size: "sm" })}>‹</Link>
        <span className="min-w-44 text-center text-base font-semibold">{formatDayLabel(day)}</span>
        <Link href={href(shiftDay(day, 1))} aria-label="Następny dzień" className={buttonVariants({ variant: "outline", size: "sm" })}>›</Link>
        {readyCount > 0 && <span className="ml-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary">Gotowe do załadunku: {readyCount} z {routes.length}</span>}
      </div>

      {alerts.length > 0 && routes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#f3dcc0] bg-[#fff7ed] px-4 py-2.5 text-sm">
          <span className="font-semibold text-[#8a3b07]">Do wyjaśnienia przed załadunkiem:</span>
          {alerts.map((a) => (
            <span key={a.text} className={cn("rounded px-2 py-0.5 font-semibold", a.tone === "danger" ? "bg-danger/10 text-danger" : "bg-white text-[#8a3b07]")}>{a.text}</span>
          ))}
        </div>
      )}

      {routes.length === 0 ? (
        <Card className="flex max-w-2xl flex-col gap-3">
          <p className="text-base font-semibold">Na {formatDayLabel(day)} nie ma jeszcze planu.</p>
          <p className="text-sm text-muted">
            W ten dzień jeździ {plan.templatesForDay} tras stałych. Zamówień na ten dzień: {unassigned.length}.
            System utworzy trasy z szablonów i sam przypisze zamówienia według oddziałów.
          </p>
          {editable && plan.templatesForDay > 0 && (
            <form action={createDay.bind(null, day)}>
              <button className={buttonVariants()}>Utwórz dzień z tras stałych</button>
            </form>
          )}
        </Card>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <section aria-label="Zamówienia nieprzydzielone" className="flex min-w-0 max-w-sm flex-[1_1_280px] flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Nieprzydzielone</h2>
              <span className="text-xs text-muted">{unassigned.length} zamówień</span>
            </div>
            {unassigned.length === 0 && <p className="py-4 text-center text-sm text-muted">Wszystkie zamówienia są na trasach.</p>}
            {unassigned.map((o) => (
              <div key={o.id} className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-2.5">
                <div className="flex justify-between gap-2 text-xs text-muted">
                  <span className="font-mono">{o.ref ?? "—"}</span>
                  <span className={cn("font-semibold", o.readiness === "ready" ? "text-primary" : "text-warning")}>
                    {o.readiness === "ready" ? "Skompletowane" : "Do realizacji"}
                  </span>
                </div>
                <p className="text-sm font-semibold">{o.customer}</p>
                <p className="text-xs text-muted">{o.branch} · {o.city}</p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded bg-accent px-1.5 py-0.5 font-semibold text-primary">okno {o.window}</span>
                  <span className="rounded bg-border/50 px-1.5 py-0.5">{Math.round(o.weight_kg)} kg · {o.crates} skrz{o.pallets ? ` · ${o.pallets} pal` : ""}</span>
                  {o.priority > 0 && <span className="rounded bg-danger/10 px-1.5 py-0.5 font-semibold text-danger">priorytet</span>}
                </div>
                {editable && routeOptions.length > 0 && (
                  <form action={assignOrder.bind(null, o.id)}>
                    <AutoSubmitSelect name="route_id" label={`Przypisz ${o.ref ?? "zamówienie"} do trasy`} placeholder="Przypisz do trasy…" options={routeOptions} className="w-full" />
                  </form>
                )}
              </div>
            ))}
          </section>

          <div className="grid min-w-0 flex-[999_1_640px] grid-cols-1 gap-4 min-[1800px]:grid-cols-2">
            {routes.map((r) => (
              <RouteCard key={r.id} route={r} day={day} editable={editable} routeOptions={routeOptions} vehicles={plan.vehicles} drivers={plan.drivers} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function RouteCard({
  route: r,
  day,
  editable,
  routeOptions,
  vehicles,
  drivers,
}: {
  route: PlanRoute;
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
    <article className={cn("flex min-w-0 flex-col gap-3 rounded-lg border bg-surface p-4", r.status === "planned" ? "border-primary" : "border-border")}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{r.name}</h3>
          <p className="text-xs text-muted">
            {ROUTE_KIND_LABELS[r.kind] ?? r.kind}
            {r.courseNo > 1 && ` · kurs ${r.courseNo}`}
            {r.plannedStart && ` · start ${r.plannedStart}`}
            {r.extraReason && ` · ${r.extraReason}`}
          </p>
        </div>
        <span className={cn("whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold", r.status === "planned" ? "bg-accent text-primary" : "bg-border/60 text-muted")}>
          {ROUTE_STATUS_LABELS[r.status] ?? r.status}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        {canChange ? (
          <>
            <form action={setRouteResource.bind(null, r.id, "vehicle_id")}>
              <AutoSubmitSelect name="vehicle_id" label={`Pojazd trasy ${r.name}`} defaultValue={r.vehicleId} placeholder="— pojazd —" options={vehicles.map((v) => ({ value: v.id, label: v.label }))} className={cn(!r.vehicleId && "border-danger")} />
            </form>
            <form action={setRouteResource.bind(null, r.id, "driver_id")}>
              <AutoSubmitSelect name="driver_id" label={`Kierowca trasy ${r.name}`} defaultValue={r.driverId} placeholder="— kierowca —" options={drivers.map((d) => ({ value: d.id, label: d.label }))} className={cn(!r.driverId && "border-danger")} />
            </form>
          </>
        ) : (
          <p className="text-sm"><span className="font-mono">{r.vehicleLabel ?? "—"}</span> · {r.driverLabel ?? "—"}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DIMS.map((d) => {
          const pct = r.load.pct[d];
          const over = r.load.overloaded.includes(d);
          const near = r.load.nearFull.includes(d);
          const color = over ? "bg-danger" : near ? "bg-warning" : "bg-primary";
          const value = d === "kg" ? `${totals.kg} kg` : d === "m3" ? `${totals.m3} m³` : String(totals[d]);
          return (
            <div key={d} className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-muted">
                <span>{DIM_LABELS[d]}</span>
                <span className={cn("font-semibold tabular-nums", over ? "text-danger" : near ? "text-warning" : "")}>{pct === null ? value : `${pct}%`}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
                {pct !== null && <div className={cn("h-1.5 rounded-full", color)} style={{ width: `${Math.min(pct, 100)}%` }} />}
              </div>
              <span className="text-[11px] text-muted tabular-nums">{value}{r.load.capacity && r.load.capacity[d] > 0 ? ` / ${r.load.capacity[d]}` : ""}</span>
            </div>
          );
        })}
      </div>

      {r.issues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.issues.map((i) => (
            <span key={i.code} className={cn("rounded px-2 py-0.5 text-xs font-semibold", i.severity === "info" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger")}>{i.label}</span>
          ))}
        </div>
      )}

      <ol className="flex flex-col border-t border-border">
        {r.stops.length === 0 && <li className="py-4 text-center text-sm text-muted">Pusta trasa — przypisz zamówienia z listy po lewej.</li>}
        {r.stops.map((s, idx) => {
          const kg = Math.round(s.orders.reduce((a, o) => a + o.weight_kg, 0));
          const crates = s.orders.reduce((a, o) => a + o.crates, 0);
          const awaiting = s.orders.some((o) => o.readiness === "awaiting_warehouse");
          const orderIds = s.orders.map((o) => o.id);
          return (
            <li key={s.id} className="grid grid-cols-[24px_96px_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-border py-1.5 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-primary">{s.sequence}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-center text-xs tabular-nums", s.closed ? "bg-danger/10 font-semibold text-danger" : "bg-accent text-primary")} title={s.closed ? "Oddział zamknięty tego dnia" : "Okno przyjęć"}>
                {s.window}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium" title={s.customer}>
                  {s.customer}
                  {awaiting && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-warning align-middle" title="Zamówienie jeszcze w magazynie (Do realizacji)" />}
                </span>
                <span className="block truncate text-xs text-muted">
                  {s.branch}, {s.city} · <span className="tabular-nums">{kg} kg · {crates} skrz{s.orders.length > 1 ? ` · ${s.orders.length} zam.` : ""}</span>
                </span>
              </span>
              {canChange ? (
                <span className="flex items-center gap-1">
                  <form action={moveStop.bind(null, s.id, -1)}><IconSubmit label="W górę" className={idx === 0 ? "invisible" : ""}>↑</IconSubmit></form>
                  <form action={moveStop.bind(null, s.id, 1)}><IconSubmit label="W dół" className={idx === r.stops.length - 1 ? "invisible" : ""}>↓</IconSubmit></form>
                  <form action={moveStopToRoute.bind(null, orderIds)}>
                    <AutoSubmitSelect name="route_id" label={`Przenieś ${s.customer} na inną trasę`} placeholder="Przenieś…" options={others} className="w-28" />
                  </form>
                  <form action={unassignStop.bind(null, orderIds)}><IconSubmit label="Zdejmij z trasy">✕</IconSubmit></form>
                </span>
              ) : <span />}
            </li>
          );
        })}
      </ol>

      <footer className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="tabular-nums">{r.stops.length} punktów · {totals.kg} kg · {totals.crates} skrz · {totals.pallets} pal</span>
        <span className="flex-1" />
        {canChange && r.stops.length > 1 && (
          <form action={sortByWindow.bind(null, r.id)}>
            <button className={buttonVariants({ variant: "outline", size: "sm" })} title="Ustawia kolejność według początku okien przyjęć">Sortuj wg okien</button>
          </form>
        )}
        {canChange && r.status === "draft" && r.stops.length === 0 && r.kind !== "regular" && (
          <form action={deleteEmptyRoute.bind(null, r.id)}>
            <button className="text-xs text-muted hover:text-danger hover:underline">Usuń kurs</button>
          </form>
        )}
        {canChange && r.status === "draft" && (
          decision.ok ? (
            <form action={markReady.bind(null, r.id, day, false)}>
              <button className={buttonVariants({ size: "sm" })}>Gotowa do załadunku</button>
            </form>
          ) : decision.needsConfirm ? (
            <form action={markReady.bind(null, r.id, day, true)}>
              <button className={cn(buttonVariants({ size: "sm" }), "bg-danger hover:bg-danger/90")} title={decision.reasons.join(", ")}>
                Gotowa mimo przeciążenia
              </button>
            </form>
          ) : (
            <button disabled className={buttonVariants({ size: "sm", variant: "outline" })} title={`Najpierw: ${decision.reasons.join(", ")}`}>
              Gotowa do załadunku
            </button>
          )
        )}
        {canChange && r.status === "planned" && (
          <form action={backToDraft.bind(null, r.id)}>
            <button className={buttonVariants({ variant: "outline", size: "sm" })}>Cofnij do szkicu</button>
          </form>
        )}
      </footer>
    </article>
  );
}
