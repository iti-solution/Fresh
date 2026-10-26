import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader } from "@/components/panel/module-placeholder";
import { createClient } from "@/lib/supabase/server";
import { saveVehicle } from "@/modules/masterdata/server/actions";
import { vehicleSections } from "@/modules/masterdata/ui/field-defs";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Pojazd" };

export default async function VehiclePage({ params }: PageProps<"/kartoteki/pojazdy/[id]">) {
  const ctx = await requireAccess("/kartoteki/pojazdy");
  if (!canEdit(ctx.role)) redirect("/kartoteki/pojazdy");
  const { id } = await params;
  const isNew = id === "nowy";
  const supabase = await createClient();

  const [vehicle, carriers, drivers] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : supabase.from("vehicles").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle(),
    supabase.from("carriers").select("id, name").eq("tenant_id", ctx.tenantId).eq("is_active", true).order("name"),
    supabase
      .from("drivers")
      .select("id, first_name, last_name")
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true)
      .order("last_name"),
  ]);
  if (!isNew && !vehicle.data) notFound();

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href="/kartoteki/pojazdy" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
          ‹ Pojazdy
        </Link>
      </nav>
      <PageHeader title={isNew ? "Nowy pojazd" : `Pojazd ${vehicle.data?.registration}`} />
      <FormRenderer
        action={saveVehicle.bind(null, isNew ? null : id)}
        sections={vehicleSections(
          vehicle.data,
          (carriers.data ?? []).map((c) => ({ value: c.id, label: c.name })),
          (drivers.data ?? []).map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` })),
        )}
        submitLabel={isNew ? "Dodaj pojazd" : "Zapisz pojazd"}
        cancelHref="/kartoteki/pojazdy"
      />
    </>
  );
}
