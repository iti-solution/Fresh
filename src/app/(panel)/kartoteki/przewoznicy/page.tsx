import type { Metadata } from "next";
import { FormRenderer } from "@/components/forms/form-renderer";
import { DataTable } from "@/components/panel/data-table";
import { PageHeader } from "@/components/panel/module-placeholder";
import { createClient } from "@/lib/supabase/server";
import { saveCarrier } from "@/modules/masterdata/server/actions";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Przewoźnicy" };

export default async function CarriersPage() {
  const ctx = await requireAccess("/kartoteki/przewoznicy");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("carriers")
    .select("id, name, nip, phone, is_active, vehicles(registration)")
    .eq("tenant_id", ctx.tenantId)
    .order("name");
  if (error) throw error;
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Przewoźnicy" description="Firmy zewnętrzne, których auta jeżdżą na Twoich trasach. Rozliczenia przewoźników — po pilocie (P1)." />
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_480px]">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty="Brak przewoźników."
            columns={[
              { header: "Przewoźnik", cell: (r) => <span className="font-medium">{r.name}</span> },
              { header: "NIP", cell: (r) => r.nip ?? "—" },
              { header: "Telefon", cell: (r) => (r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : "—") },
              { header: "Pojazdy", cell: (r) => (r.vehicles.length ? r.vehicles.map((v) => v.registration).join(", ") : "—") },
            ]}
          />
        </div>
        {canEdit(ctx.role) && (
          <div className="min-w-0 flex-[1_1_320px]">
            <FormRenderer
              action={saveCarrier}
              submitLabel="Dodaj przewoźnika"
              sections={[
                {
                  title: "Nowy przewoźnik",
                  fields: [
                    { kind: "text", name: "name", label: "Nazwa", span: 3, required: true },
                    { kind: "text", name: "nip", label: "NIP", span: 3 },
                    { kind: "tel", name: "phone", label: "Telefon", span: 3 },
                  ],
                },
              ]}
            />
          </div>
        )}
      </div>
    </>
  );
}
