import type { Metadata } from "next";
import { DataTable } from "@/components/panel/data-table";
import { PageHeader } from "@/components/panel/module-placeholder";
import { createClient } from "@/lib/supabase/server";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Pojazdy" };

const STATUS: Record<string, string> = { active: "aktywny", service: "serwis", inactive: "nieaktywny" };

export default async function VehiclesPage() {
  const ctx = await requireAccess("/kartoteki/pojazdy");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select(
      "id, registration, name, body_type, capacity_pallets, capacity_kg, capacity_m3, is_own, status, drivers!vehicles_default_driver_fk(first_name, last_name)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("registration");
  if (error) throw error;
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Pojazdy" description={`${rows.length} pojazdów. Edycja i historia wykorzystania — etap M1.`} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Brak pojazdów."
        columns={[
          { header: "Rejestracja", cell: (r) => <span className="font-mono">{r.registration}</span> },
          { header: "Nazwa", cell: (r) => r.name ?? "—" },
          { header: "Zabudowa", cell: (r) => r.body_type ?? "—" },
          { header: "Palety", cell: (r) => <span className="tabular-nums">{r.capacity_pallets}</span> },
          {
            header: "Ładowność kg",
            cell: (r) => <span className="tabular-nums">{Number(r.capacity_kg).toLocaleString("pl-PL")}</span>,
          },
          { header: "m³", cell: (r) => <span className="tabular-nums">{r.capacity_m3}</span> },
          { header: "Własny", cell: (r) => (r.is_own ? "własny" : "obcy") },
          { header: "Kierowca", cell: (r) => (r.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : "—") },
          { header: "Status", cell: (r) => STATUS[r.status] ?? r.status },
        ]}
      />
    </>
  );
}
