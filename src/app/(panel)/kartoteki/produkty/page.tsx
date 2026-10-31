import { PackageOpen } from "lucide-react";
import type { Metadata } from "next";
import { FormRenderer } from "@/components/forms/form-renderer";
import { DataTable } from "@/components/panel/data-table";
import { EmptyState, PageHeader } from "@/components/panel/page";
import { Button } from "@/components/ui/button";
import { DocRef, Pill } from "@/components/ui/status";
import { formatPln, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { UNIT_NAMES, UNITS, unitLabel } from "@/modules/portal/domain/portal";
import { addSampleProducts, saveProduct, setProductActive } from "@/modules/portal/server/staff-actions";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Katalog produktów" };

export default async function ProductsPage() {
  const ctx = await requireAccess("/kartoteki/produkty");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, code, name, category, unit, unit_weight_kg, price, is_active")
    .eq("tenant_id", ctx.tenantId)
    .order("is_active", { ascending: false })
    .order("category", { nullsFirst: false })
    .order("sort")
    .order("name");
  if (error) throw error;
  const rows = data ?? [];
  const editable = canEdit(ctx.role);
  const active = rows.filter((r) => r.is_active).length;

  return (
    <>
      <PageHeader
        title="Katalog produktów"
        description={`To, co klienci widzą i zamawiają w portalu zamówień. Aktywnych: ${active} z ${rows.length}. Waga jednostki liczy ładowność trasy; cena jest orientacyjna (fakturuje ERP).`}
      />
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_560px]">
          {rows.length === 0 ? (
            <div className="rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]">
              <EmptyState
                icon={<PackageOpen />}
                title="Katalog jest pusty"
                action={
                  editable && (
                    <form action={addSampleProducts}>
                      <Button type="submit" variant="soft">
                        Wczytaj przykładowy katalog (22 produkty)
                      </Button>
                    </form>
                  )
                }
              >
                Dodaj produkty po prawej albo zacznij od przykładowych warzyw i owoców — potem je poprawisz. Import z ERP (WF-Mag)
                przyjdzie w kolejnym kroku.
              </EmptyState>
            </div>
          ) : (
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              empty="Brak produktów."
              rowClassName={(r) => (r.is_active ? undefined : "opacity-55")}
              columns={[
                { header: "Indeks", cell: (r) => <DocRef>{r.code ?? "—"}</DocRef> },
                { header: "Produkt", cell: (r) => <span className="font-medium">{r.name}</span> },
                { header: "Kategoria", cell: (r) => r.category ?? "—" },
                { header: "Jedn.", cell: (r) => unitLabel(r.unit) },
                {
                  header: "Waga jedn.",
                  className: "text-right tabular-nums",
                  headClassName: "text-right",
                  cell: (r) => (Number(r.unit_weight_kg) > 0 ? `${Number(r.unit_weight_kg).toLocaleString("pl-PL")} kg` : "—"),
                },
                {
                  header: "Cena netto",
                  className: "text-right tabular-nums",
                  headClassName: "text-right",
                  cell: (r) => (r.price !== null ? formatPln(toGrosze(r.price)) : "—"),
                },
                {
                  header: "W portalu",
                  cell: (r) =>
                    editable ? (
                      <form action={setProductActive.bind(null, r.id, !r.is_active)}>
                        <button title="Kliknij, aby zmienić">
                          <Pill tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "widoczny" : "ukryty"}</Pill>
                        </button>
                      </form>
                    ) : (
                      <Pill tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "widoczny" : "ukryty"}</Pill>
                    ),
                },
              ]}
            />
          )}
        </div>
        {editable && (
          <div className="min-w-0 flex-[1_1_340px]">
            <FormRenderer
              action={saveProduct}
              submitLabel="Dodaj produkt"
              sections={[
                {
                  title: "Nowy produkt",
                  fields: [
                    { kind: "text", name: "name", label: "Nazwa", span: 3, required: true, placeholder: "Pomidor malinowy" },
                    { kind: "text", name: "code", label: "Indeks (ERP)", span: 1 },
                    { kind: "text", name: "category", label: "Kategoria", span: 2, placeholder: "Warzywa" },
                    {
                      kind: "select",
                      name: "unit",
                      label: "Jednostka",
                      span: 1,
                      defaultValue: "kg",
                      options: UNITS.map((u) => ({ value: u, label: UNIT_NAMES[u] })),
                    },
                    {
                      kind: "number",
                      name: "unit_weight_kg",
                      label: "Waga jednostki",
                      span: 1,
                      step: "0.001",
                      suffix: "kg",
                      hint: "Dla kg zawsze 1",
                    },
                    { kind: "number", name: "price", label: "Cena netto", span: 1, step: "0.01", suffix: "zł" },
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
