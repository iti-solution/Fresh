import type { Metadata } from "next";
import { DataTable } from "@/components/panel/data-table";
import { PageHeader } from "@/components/panel/module-placeholder";
import { createClient } from "@/lib/supabase/server";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Kierowcy" };

export default async function DriversPage() {
  const ctx = await requireAccess("/kartoteki/kierowcy");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select(
      "id, first_name, last_name, phone, employment_type, is_active, user_id, vehicles!drivers_default_vehicle_id_fkey(registration)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("last_name");
  if (error) throw error;
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Kierowcy" description={`${rows.length} kierowców. Zaproszenia do aplikacji i stawki — etapy M1 i M5.`} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Brak kierowców."
        columns={[
          { header: "Kierowca", cell: (r) => <span className="font-medium">{`${r.first_name} ${r.last_name}`}</span> },
          { header: "Telefon", cell: (r) => r.phone ?? "—" },
          { header: "Zatrudnienie", cell: (r) => r.employment_type ?? "—" },
          { header: "Pojazd", cell: (r) => (r.vehicles ? <span className="font-mono">{r.vehicles.registration}</span> : "—") },
          { header: "Konto w aplikacji", cell: (r) => (r.user_id ? "tak" : <span className="text-muted">nie zaproszony</span>) },
          { header: "Status", cell: (r) => (r.is_active ? "aktywny" : "nieaktywny") },
        ]}
      />
    </>
  );
}
