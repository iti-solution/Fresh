import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader } from "@/components/panel/module-placeholder";
import { DATE_RE } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { BRANCH_LABELS } from "@/modules/masterdata/domain/format";
import { nextWorkingDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { createOrder } from "@/modules/orders/server/actions";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Nowe zamówienie" };

export default async function NewOrderPage({ searchParams }: PageProps<"/zlecenia/nowe">) {
  const ctx = await requireAccess("/zlecenia");
  if (!canEdit(ctx.role)) redirect("/zlecenia");
  const sp = await searchParams;
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : nextWorkingDay(todayInWarsaw());
  const supabase = await createClient();
  const { data: points } = await supabase
    .from("delivery_points")
    .select("id, name, branch_type, city, customers(name, external_code)")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true);

  const options = (points ?? [])
    .map((p) => ({
      value: p.id,
      label: `${p.customers?.external_code ? p.customers.external_code + " · " : ""}${p.customers?.name ?? ""} — ${p.name} (${BRANCH_LABELS[p.branch_type] ?? p.branch_type}), ${p.city}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pl"));

  return (
    <>
      <nav className="mb-3 text-sm"><Link href={`/zlecenia?dzien=${day}`} className="text-muted hover:underline">‹ Zamówienia</Link></nav>
      <PageHeader title="Nowe zamówienie" description="Ręczne dodanie zamówienia, np. dowózki albo zamówienia telefonicznego. Import z ERP — w kolejnym kroku." />
      <FormRenderer
        action={createOrder}
        submitLabel="Dodaj zamówienie"
        cancelHref={`/zlecenia?dzien=${day}`}
        sections={[
          {
            title: "Dla kogo i kiedy",
            fields: [
              { kind: "select", name: "delivery_point_id", label: "Klient i oddział", options, emptyLabel: "— wybierz oddział —", span: 3 },
              { kind: "date", name: "delivery_date", label: "Data dostawy", defaultValue: day },
              { kind: "text", name: "external_ref", label: "Numer zamówienia", placeholder: "np. ZK/10/4600" },
              { kind: "select", name: "readiness", label: "Magazyn", defaultValue: "ready", options: [
                { value: "ready", label: "Skompletowane" }, { value: "awaiting_warehouse", label: "Do realizacji" }] },
              { kind: "timerange", name: "window_start", nameTo: "window_end", label: "Inne okno niż zwykle (opcjonalnie)", span: 2, hint: "puste = okno oddziału" },
            ],
          },
          {
            title: "Ładunek i wartość",
            fields: [
              { kind: "number", name: "weight_kg", label: "Masa", suffix: "kg" },
              { kind: "number", name: "pallets", label: "Palety", suffix: "szt." },
              { kind: "number", name: "crates", label: "Skrzynki", suffix: "szt." },
              { kind: "number", name: "order_value", label: "Wartość zamówienia", suffix: "zł" },
            ],
          },
          {
            title: "Uwagi",
            fields: [
              { kind: "textarea", name: "notes_sales", label: "Uwaga handlowa", span: 3, placeholder: "np. banany mniej dojrzałe" },
              { kind: "textarea", name: "notes_logistics", label: "Uwaga logistyczna", span: 3, placeholder: "np. dostawa do 7:30" },
            ],
          },
        ]}
      />
    </>
  );
}
