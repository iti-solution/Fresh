import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel, Segmented } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Plate } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { usageSummary } from "@/modules/planning/domain/assignments";
import { getAssignments } from "@/modules/planning/server/history";
import { AssignmentTable } from "@/modules/planning/ui/assignment-history";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Dziennik przydziałów" };

const RANGES = { "7": 7, "14": 14, "30": 30, "90": 90 } as const;

export default async function FleetLogPage({ searchParams }: PageProps<"/kartoteki/pojazdy/dziennik">) {
  const ctx = await requireAccess("/kartoteki/pojazdy");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const range = typeof sp.dni === "string" && sp.dni in RANGES ? (sp.dni as keyof typeof RANGES) : "14";
  const vehicleId = typeof sp.auto === "string" && sp.auto ? sp.auto : null;
  const driverId = typeof sp.kierowca === "string" && sp.kierowca ? sp.kierowca : null;
  const from = shiftDay(today, -(RANGES[range] - 1));

  const supabase = await createClient();
  const [rows, vehicles, drivers] = await Promise.all([
    getAssignments(ctx.tenantId, { from, to: shiftDay(today, 1), vehicleId, driverId }),
    supabase.from("vehicles").select("id, registration").eq("tenant_id", ctx.tenantId).order("registration"),
    supabase.from("drivers").select("id, first_name, last_name").eq("tenant_id", ctx.tenantId).order("last_name"),
  ]);
  const byVehicle = usageSummary(rows, "vehicle");
  const byDriver = usageSummary(rows, "driver");
  const vehicleLabel = vehicles.data?.find((v) => v.id === vehicleId)?.registration;
  const driverRow = drivers.data?.find((d) => d.id === driverId);
  const driverLabel = driverRow ? `${driverRow.first_name} ${driverRow.last_name}` : null;

  const href = (p: { dni?: string; auto?: string | null; kierowca?: string | null }) => {
    const u = new URLSearchParams();
    const d = p.dni ?? range;
    if (d !== "14") u.set("dni", d);
    const a = p.auto === undefined ? vehicleId : p.auto;
    const k = p.kierowca === undefined ? driverId : p.kierowca;
    if (a) u.set("auto", a);
    if (k) u.set("kierowca", k);
    const s = u.toString();
    return `/kartoteki/pojazdy/dziennik${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Dziennik przydziałów"
        description="Kto, którym autem i z jakimi zamówieniami jechał danego dnia. Auto i kierowcę przydziela dyspozytor do trasy na konkretny dzień; kierowca może zmienić auto przy starcie trasy."
        actions={
          <Segmented
            items={[
              { href: "/kartoteki/pojazdy", label: "Pojazdy", active: false },
              { href: "/kartoteki/pojazdy/dziennik", label: "Dziennik przydziałów", active: true },
            ]}
          />
        }
      />

      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-[var(--shadow-panel)]">
        <input type="hidden" name="dni" value={range} />
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Pojazd
          <select
            name="auto"
            defaultValue={vehicleId ?? ""}
            className="h-9 min-w-44 rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground"
          >
            <option value="">wszystkie</option>
            {(vehicles.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.registration}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Kierowca
          <select
            name="kierowca"
            defaultValue={driverId ?? ""}
            className="h-9 min-w-52 rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground"
          >
            <option value="">wszyscy</option>
            {(drivers.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.first_name} {d.last_name}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonVariants({ size: "sm", variant: "outline" })}>Pokaż</button>
        {(vehicleId || driverId) && (
          <Link href={href({ auto: null, kierowca: null })} className="pb-2 text-sm text-muted hover:text-foreground">
            Wyczyść
          </Link>
        )}
        <span className="flex-1" />
        <Segmented items={Object.keys(RANGES).map((k) => ({ href: href({ dni: k }), label: `${k} dni`, active: k === range }))} />
      </form>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Panel
          title={driverLabel ? `Auta, którymi jeździł ${driverLabel}` : "Wykorzystanie aut"}
          description={`Ostatnie ${RANGES[range]} dni`}
          flush
        >
          <SummaryList rows={byVehicle} unit="auto" partnersLabel="kierowcy" />
        </Panel>
        <Panel
          title={vehicleLabel ? `Kierowcy auta ${vehicleLabel}` : "Kierowcy"}
          description={`Ostatnie ${RANGES[range]} dni`}
          flush
        >
          <SummaryList rows={byDriver} unit="kierowca" partnersLabel="auta" />
        </Panel>
      </div>

      <Panel
        title="Dzień po dniu"
        description={`${rows.length} tras${vehicleLabel ? `, auto ${vehicleLabel}` : ""}${driverLabel ? `, kierowca ${driverLabel}` : ""}`}
        actions={<CalendarDays className="size-4 text-subtle" />}
        flush
      >
        <AssignmentTable rows={rows} />
      </Panel>
    </>
  );
}

function SummaryList({
  rows,
  unit,
  partnersLabel,
}: {
  rows: ReturnType<typeof usageSummary>;
  unit: "auto" | "kierowca";
  partnersLabel: string;
}) {
  if (rows.length === 0) return <p className="px-5 py-6 text-sm text-muted">Brak danych.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex items-start gap-3 px-5 py-2.5">
          <span className="w-36 shrink-0">
            {unit === "auto" ? <Plate>{r.label}</Plate> : <span className="font-medium">{r.label}</span>}
          </span>
          <span className="min-w-0 flex-1 text-[13px] text-muted">
            <span className="text-foreground">{partnersLabel}:</span> {r.partners.join(", ") || "—"}
          </span>
          <span className="text-right text-xs whitespace-nowrap text-muted tabular-nums">
            <b className="font-semibold text-foreground">{r.days}</b> dni · {r.km.toLocaleString("pl-PL")} km · {r.orders} zam.
          </span>
        </li>
      ))}
    </ul>
  );
}
