import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader } from "@/components/panel/module-placeholder";
import { createClient } from "@/lib/supabase/server";
import { saveDriver } from "@/modules/masterdata/server/actions";
import { driverSections } from "@/modules/masterdata/ui/field-defs";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Kierowca" };

export default async function DriverPage({ params }: PageProps<"/kartoteki/kierowcy/[id]">) {
  const ctx = await requireAccess("/kartoteki/kierowcy");
  if (!canEdit(ctx.role)) redirect("/kartoteki/kierowcy");
  const { id } = await params;
  const isNew = id === "nowy";
  const supabase = await createClient();
  const [driver, vehicles] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : supabase.from("drivers").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle(),
    supabase.from("vehicles").select("id, registration").eq("tenant_id", ctx.tenantId).order("registration"),
  ]);
  if (!isNew && !driver.data) notFound();

  return (
    <>
      <nav className="mb-3 text-sm"><Link href="/kartoteki/kierowcy" className="text-muted hover:underline">‹ Kierowcy</Link></nav>
      <PageHeader title={isNew ? "Nowy kierowca" : `${driver.data?.first_name} ${driver.data?.last_name}`} />
      <FormRenderer
        action={saveDriver.bind(null, isNew ? null : id)}
        sections={driverSections(driver.data, (vehicles.data ?? []).map((v) => ({ value: v.id, label: v.registration })))}
        submitLabel={isNew ? "Dodaj kierowcę" : "Zapisz"}
        cancelHref="/kartoteki/kierowcy"
      />
    </>
  );
}
