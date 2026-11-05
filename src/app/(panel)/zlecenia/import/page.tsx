import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImportWizard } from "@/components/forms/import-wizard";
import { PageHeader, Panel } from "@/components/panel/page";
import { createClient } from "@/lib/supabase/server";
import { ORDER_FIELDS } from "@/modules/orders/domain/import";
import { nextWorkingDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { importOrdersWizard } from "@/modules/orders/server/actions";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Import zamówień" };

export default async function OrderImportPage() {
  const ctx = await requireAccess("/zlecenia");
  if (!canEdit(ctx.role)) redirect("/zlecenia");
  const supabase = await createClient();
  const [{ data: saved }, { data: recent }] = await Promise.all([
    supabase.from("import_mappings").select("mapping").eq("tenant_id", ctx.tenantId).eq("kind", "orders").maybeSingle(),
    supabase
      .from("order_imports")
      .select("id, created_at, file_name, source, rows_total, rows_ok, rows_unmatched, rows_updated")
      .eq("tenant_id", ctx.tenantId)
      .eq("kind", "orders")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const day = nextWorkingDay(todayInWarsaw());

  return (
    <>
      <PageHeader
        title="Import zamówień z pliku"
        description="Eksport z ERP/WMS (Excel albo CSV). Zamówienia same przypną się do adresów dostaw po kodzie adresu, kodzie klienta albo adresie. Ponowny import tego samego pliku zaktualizuje zamówienia (np. gotowość z magazynu)."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <ImportWizard
            fields={ORDER_FIELDS}
            savedMapping={(saved?.mapping as Record<string, string> | null) ?? null}
            action={importOrdersWizard}
            defaultDate={day}
            unmatchedHref="/zlecenia/dopasuj"
            doneHref={`/zlecenia?dzien=${day}`}
            doneLabel="Przejdź do zamówień"
          />
        </Panel>
        <Panel title="Ostatnie importy" flush>
          <ul className="divide-y divide-border text-sm">
            {(recent ?? []).length === 0 && <li className="px-4 py-3 text-muted">Jeszcze nic nie importowano.</li>}
            {(recent ?? []).map((r) => (
              <li key={r.id} className="px-4 py-2.5">
                <p className="truncate font-medium">{r.file_name ?? (r.source === "api" ? "API" : "plik")}</p>
                <p className="text-xs text-muted tabular-nums">
                  {new Date(r.created_at).toLocaleString("pl-PL", {
                    timeZone: "Europe/Warsaw",
                    dateStyle: "short",
                    timeStyle: "short",
                  })}{" "}
                  · {r.rows_total ?? 0} wierszy · {r.rows_unmatched ?? 0} do dopasowania · {r.rows_updated ?? 0} aktualizacji
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
