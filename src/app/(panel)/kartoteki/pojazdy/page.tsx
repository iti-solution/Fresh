import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/panel/data-table";
import { PageHeader } from "@/components/panel/module-placeholder";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { VEHICLE_STATUS_LABELS } from "@/modules/masterdata/domain/format";
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
      "id, registration, name, vehicle_type, body_type, capacity_pallets, capacity_kg, capacity_m3, capacity_crates, is_own, status, cost_per_km, carriers(name), drivers!vehicles_default_driver_fk(first_name, last_name)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("registration");
  if (error) throw error;
  const rows = data ?? [];
  const editable = canEdit(ctx.role);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Pojazdy" description={`${rows.length} pojazdów · ładowność służy do kontroli przeciążenia na tablicy planowania.`} />
        {editable && <Link href="/kartoteki/pojazdy/nowy" className={buttonVariants()}>+ Nowy pojazd</Link>}
      </div>
      {sp.zapisano && <p role="status" className="mb-4 rounded-md bg-accent px-4 py-3 text-sm text-primary">Zapisano pojazd.</p>}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Brak pojazdów."
        columns={[
          {
            header: "Rejestracja",
            cell: (r) =>
              editable ? (
                <Link href={`/kartoteki/pojazdy/${r.id}`} className="font-mono font-medium text-foreground hover:text-primary hover:underline">{r.registration}</Link>
              ) : (
                <span className="font-mono">{r.registration}</span>
              ),
          },
          { header: "Typ", cell: (r) => <span>{r.vehicle_type ?? "—"}<span className="block text-xs text-muted">{r.body_type}</span></span> },
          { header: "Masa", cell: (r) => <span className="tabular-nums">{num(r.capacity_kg)} kg</span> },
          { header: "Palety", cell: (r) => <span className="tabular-nums">{num(r.capacity_pallets)}</span> },
          { header: "Skrzynki", cell: (r) => <span className="tabular-nums">{num(r.capacity_crates)}</span> },
          { header: "m³", cell: (r) => <span className="tabular-nums">{num(r.capacity_m3)}</span> },
          { header: "Własność", cell: (r) => (r.is_own ? "własny" : <Badge className="bg-warning/10 text-warning">{r.carriers?.name ?? "obcy"}</Badge>) },
          { header: "Kierowca", cell: (r) => (r.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : "—") },
          { header: "Koszt km", cell: (r) => (r.cost_per_km ? <span className="tabular-nums">{Number(r.cost_per_km).toFixed(2).replace(".", ",")} zł</span> : "—") },
          { header: "Status", cell: (r) => VEHICLE_STATUS_LABELS[r.status] ?? r.status },
        ]}
      />
    </>
  );
}
