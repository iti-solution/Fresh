import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImportWizard } from "@/components/forms/import-wizard";
import { PageHeader, Panel } from "@/components/panel/page";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_FIELDS } from "@/modules/masterdata/domain/customer-import";
import { importCustomersWizard } from "@/modules/masterdata/server/customer-import";
import { todayInWarsaw } from "@/modules/orders/domain/orders";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Import klientów" };

export default async function CustomerImportPage() {
  const ctx = await requireAccess("/kartoteki/klienci");
  if (!canEdit(ctx.role)) redirect("/kartoteki/klienci");
  const supabase = await createClient();
  const { data: saved } = await supabase
    .from("import_mappings")
    .select("mapping")
    .eq("tenant_id", ctx.tenantId)
    .eq("kind", "customers")
    .maybeSingle();
  return (
    <>
      <PageHeader
        title="Import klientów i adresów dostaw"
        description="Jeden wiersz = jeden adres dostawy. Wiersze z tym samym kodem (albo nazwą) klienta trafią do jednego klienta. Ponowny import uzupełni i zaktualizuje dane — nic nie zostanie zdublowane."
      />
      <Panel>
        <ImportWizard
          fields={CUSTOMER_FIELDS}
          savedMapping={(saved?.mapping as Record<string, string> | null) ?? null}
          action={importCustomersWizard}
          defaultDate={todayInWarsaw()}
          askDate={false}
          doneHref="/kartoteki/klienci"
          doneLabel="Przejdź do klientów"
        />
      </Panel>
    </>
  );
}
