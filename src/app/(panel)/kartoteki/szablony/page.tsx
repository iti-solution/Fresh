import type { Metadata } from "next";
import { DataTable } from "@/components/panel/data-table";
import { PageHeader } from "@/components/panel/module-placeholder";
import { createClient } from "@/lib/supabase/server";
import { formatTime, formatWeekdays } from "@/modules/masterdata/domain/format";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Szablony tras" };

export default async function TemplatesPage() {
  const ctx = await requireAccess("/kartoteki/szablony");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_templates")
    .select(
      "id, name, weekdays, planned_start, vehicles(registration), drivers(first_name, last_name), route_template_points(count)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("name");
  if (error) throw error;
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Szablony tras"
        description="Stałe trasy, z których powstaje plan dnia. Edycja i przypisywanie punktów — etap M3."
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Brak szablonów tras."
        columns={[
          { header: "Trasa", cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: "Dni", cell: (r) => formatWeekdays(r.weekdays) },
          { header: "Start", cell: (r) => <span className="tabular-nums">{formatTime(r.planned_start)}</span> },
          { header: "Punkty", cell: (r) => <span className="tabular-nums">{r.route_template_points[0]?.count ?? 0}</span> },
          { header: "Pojazd", cell: (r) => (r.vehicles ? <span className="font-mono">{r.vehicles.registration}</span> : "—") },
          { header: "Kierowca", cell: (r) => (r.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : "—") },
        ]}
      />
    </>
  );
}
