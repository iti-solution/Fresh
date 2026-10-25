import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader } from "@/components/panel/module-placeholder";
import { saveCustomer } from "@/modules/masterdata/server/actions";
import { customerSections } from "@/modules/masterdata/ui/field-defs";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Nowy klient" };

export default async function NewCustomerPage() {
  const ctx = await requireAccess("/kartoteki/klienci");
  if (!canEdit(ctx.role)) redirect("/kartoteki/klienci");
  return (
    <>
      <PageHeader title="Nowy klient" description="Po zapisaniu dodasz oddziały (adresy dostaw) z godzinami przyjęć." />
      <FormRenderer action={saveCustomer.bind(null, null)} sections={customerSections()} submitLabel="Zapisz i dodaj oddział" cancelHref="/kartoteki/klienci" />
    </>
  );
}
