import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader } from "@/components/panel/module-placeholder";
import { createClient } from "@/lib/supabase/server";
import { windowsToForm } from "@/modules/masterdata/domain/schemas";
import { savePoint } from "@/modules/masterdata/server/actions";
import { pointSections } from "@/modules/masterdata/ui/field-defs";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Oddział" };

// Obsługuje zarówno /oddzialy/nowy, jak i /oddzialy/<id>
export default async function PointPage({ params }: PageProps<"/kartoteki/klienci/[id]/oddzialy/[pointId]">) {
  const ctx = await requireAccess("/kartoteki/klienci");
  const { id, pointId } = await params;
  if (!canEdit(ctx.role)) redirect(`/kartoteki/klienci/${id}`);
  const isNew = pointId === "nowy";
  const supabase = await createClient();

  const { data: customer } = await supabase.from("customers").select("id, name").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
  if (!customer) notFound();

  let point: Record<string, unknown> | null = null;
  let windows = { window1_from: "", window1_to: "", window2_from: "", window2_to: "" };
  if (!isNew) {
    const { data } = await supabase
      .from("delivery_points")
      .select("*, delivery_point_windows(weekday, opens_at, closes_at)")
      .eq("tenant_id", ctx.tenantId)
      .eq("customer_id", id)
      .eq("id", pointId)
      .maybeSingle();
    if (!data) notFound();
    point = data;
    windows = windowsToForm(data.delivery_point_windows ?? []);
  }

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href={`/kartoteki/klienci/${id}`} className="text-muted hover:underline">‹ {customer.name}</Link>
      </nav>
      <PageHeader title={isNew ? "Nowy oddział" : `Oddział: ${String(point?.name ?? "")}`} description={customer.name} />
      <FormRenderer
        action={savePoint.bind(null, id, isNew ? null : pointId)}
        sections={pointSections(point, windows)}
        submitLabel={isNew ? "Dodaj oddział" : "Zapisz oddział"}
        cancelHref={`/kartoteki/klienci/${id}`}
      />
    </>
  );
}
