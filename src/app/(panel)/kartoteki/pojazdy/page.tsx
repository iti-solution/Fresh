import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/panel/data-table";
import { PageHeader, Segmented } from "@/components/panel/page";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { getLastAssignments } from "@/modules/planning/server/history";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { VehicleTag } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { VEHICLE_STATUS_LABELS, vehicleMake } from "@/modules/masterdata/domain/format";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Pojazdy" };

const num = (v: number | string | null) => Number(v ?? 0).toLocaleString("pl-PL");

export default async function VehiclesPage({ searchParams }: PageProps<"/kartoteki/pojazdy">) {
  const ctx = await requireAccess("/kartoteki/pojazdy");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select(
      "id, registration, name, vehicle_type, body_type, capacity_pallets, capacity_kg, capacity_m3, capacity_crates, is_own, status, cost_per_km, carriers(name)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("registration");
  if (error) throw error;
  const rows = data ?? [];
  const editable = canEdit(ctx.role);
  const today = todayInWarsaw();
  const { byVehicle } = await getLastAssignments(ctx.tenantId, shiftDay(today, -30), shiftDay(today, 1));

  return (
    <>
      <PageHeader
        title="Pojazdy"
        description={`${rows.length} pojazdów. Ładowność służy do kontroli przeciążenia; auto i kierowcę przydziela dyspozytor do trasy na dany dzień.`}
        actions={
          <>
            <Segmented
              items={[
                { href: "/kartoteki/pojazdy", label: "Pojazdy", active: true },
                { href: "/kartoteki/pojazdy/dziennik", label: "Dziennik przydziałów", active: false },
              ]}
            />
            {editable && (
              <Link href="/kartoteki/pojazdy/nowy" className={buttonVariants({ size: "sm" })}>
                <Plus /> Nowy pojazd
              </Link>
            )}
          </>
        }
      />
      {sp.zapisano && (
        <p role="status" className="mb-4 rounded-lg border border-success/20 bg-success-soft px-4 py-2.5 text-sm text-success">
          Zapisano pojazd.
        </p>
      )}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Brak pojazdów."
        columns={[
          {
            header: "Pojazd",
            cell: (r) => {
              const tag = (
                <VehicleTag
                  registration={r.registration}
                  make={vehicleMake(r)}
                  kind={[r.vehicle_type, r.body_type].filter(Boolean).join(", ")}
                />
              );
              return editable ? (
                <Link href={`/kartoteki/pojazdy/${r.id}`} className="inline-flex rounded-md hover:opacity-80">
                  {tag}
                </Link>
              ) : (
                tag
              );
            },
          },
          { header: "Masa", cell: (r) => <span className="tabular-nums">{num(r.capacity_kg)} kg</span> },
          { header: "Palety", cell: (r) => <span className="tabular-nums">{num(r.capacity_pallets)}</span> },
          { header: "Skrzynki", cell: (r) => <span className="tabular-nums">{num(r.capacity_crates)}</span> },
          { header: "m³", cell: (r) => <span className="tabular-nums">{num(r.capacity_m3)}</span> },
          {
            header: "Własność",
            cell: (r) =>
              r.is_own ? "własny" : <Badge className="bg-warning/10 text-warning">{r.carriers?.name ?? "obcy"}</Badge>,
          },
          {
            header: "Ostatni przydział",
            cell: (r) => {
              const a = byVehicle.get(r.id);
              return a ? (
                <Link href={`/kartoteki/pojazdy/dziennik?auto=${r.id}`} className="group block">
                  <span className="group-hover:text-primary-strong">{a.driver ?? "bez kierowcy"}</span>
                  <span className="block text-xs text-muted">
                    {a.date === today ? "dziś" : formatDayLabel(a.date)}, {a.routeName}
                  </span>
                </Link>
              ) : (
                <span className="text-subtle">brak tras w 30 dni</span>
              );
            },
          },
          {
            header: "Koszt km",
            cell: (r) =>
              r.cost_per_km ? <span className="tabular-nums">{Number(r.cost_per_km).toFixed(2).replace(".", ",")} zł</span> : "—",
          },
          { header: "Status", cell: (r) => VEHICLE_STATUS_LABELS[r.status] ?? r.status },
        ]}
      />
    </>
  );
}
