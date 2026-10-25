import type { Metadata } from "next";
import { DataTable } from "@/components/panel/data-table";
import { PageHeader } from "@/components/panel/module-placeholder";
import { Badge } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { formatSeason, formatWeekdays, formatWindows } from "@/modules/masterdata/domain/format";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Klienci i punkty" };

export default async function CustomersPage() {
  const ctx = await requireAccess("/kartoteki/klienci");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_points")
    .select(
      "id, external_code, name, address_line, postal_code, city, geocode_status, delivery_weekdays, active_from, active_to, is_active, customers(external_code, name, category), delivery_point_windows(weekday, opens_at, closes_at)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("external_code");
  if (error) throw error;
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Klienci i punkty dostaw"
        description={`${rows.length} punktów. Edycja, import z Excela i geokodowanie — etap M1.`}
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Brak punktów dostaw."
        columns={[
          { header: "Kod", cell: (r) => <span className="font-mono text-xs">{r.customers?.external_code ?? "—"}</span> },
          {
            header: "Klient",
            cell: (r) => (
              <div>
                <p className="font-medium">{r.customers?.name}</p>
                <p className="text-xs text-muted">{r.customers?.category}</p>
              </div>
            ),
          },
          {
            header: "Punkt dostawy",
            cell: (r) => (
              <div>
                <p>{r.name}</p>
                <p className="text-xs text-muted">
                  {r.address_line}, {r.postal_code} {r.city}
                </p>
              </div>
            ),
          },
          { header: "Dni dostaw", cell: (r) => formatWeekdays(r.delivery_weekdays) },
          { header: "Okna (pn)", cell: (r) => <span className="tabular-nums">{formatWindows(r.delivery_point_windows)}</span> },
          {
            header: "Sezon",
            cell: (r) =>
              r.active_from || r.active_to ? (
                <Badge className="bg-warning/10 text-warning">{formatSeason(r.active_from, r.active_to)}</Badge>
              ) : (
                <span className="text-muted">cały rok</span>
              ),
          },
          {
            header: "Lokalizacja",
            cell: (r) =>
              r.geocode_status === "ok" || r.geocode_status === "manual" ? "✓" : <span className="text-danger">do poprawy</span>,
          },
        ]}
      />
    </>
  );
}
