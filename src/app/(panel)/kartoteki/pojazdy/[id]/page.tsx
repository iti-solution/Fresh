import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader } from "@/components/panel/module-placeholder";
import { Panel } from "@/components/panel/page";
import { createClient } from "@/lib/supabase/server";
import { saveVehicle } from "@/modules/masterdata/server/actions";
import { vehicleSections } from "@/modules/masterdata/ui/field-defs";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";
import { shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { getAssignments } from "@/modules/planning/server/history";
import { AssignmentTable } from "@/modules/planning/ui/assignment-history";

export const metadata: Metadata = { title: "Pojazd" };

export default async function VehiclePage({ params }: PageProps<"/kartoteki/pojazdy/[id]">) {
  const ctx = await requireAccess("/kartoteki/pojazdy");
  if (!canEdit(ctx.role)) redirect("/kartoteki/pojazdy");
  const { id } = await params;
  const isNew = id === "nowy";
  const supabase = await createClient();

  const today = todayInWarsaw();
  const [vehicle, carriers, history] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : supabase.from("vehicles").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle(),
    supabase.from("carriers").select("id, name").eq("tenant_id", ctx.tenantId).eq("is_active", true).order("name"),
    isNew
      ? Promise.resolve([])
      : getAssignments(ctx.tenantId, { from: shiftDay(today, -29), to: shiftDay(today, 1), vehicleId: id }),
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
        )}
        submitLabel={isNew ? "Dodaj pojazd" : "Zapisz pojazd"}
        cancelHref="/kartoteki/pojazdy"
      />
      {!isNew && (
        <Panel
          className="mt-8"
          title="Historia przydziałów"
          description="Ostatnie 30 dni: kto jeździł tym autem, na jakiej trasie i z jakimi zamówieniami"
          actions={
            <Link
              href={`/kartoteki/pojazdy/dziennik?auto=${id}&dni=90`}
              className="text-sm font-medium text-primary-strong hover:underline"
            >
              Pełny dziennik
            </Link>
          }
          flush
        >
          <AssignmentTable rows={history} hide="vehicle" />
        </Panel>
      )}
    </>
  );
}
