import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/panel/data-table";
import { PageHeader } from "@/components/panel/module-placeholder";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Kierowcy" };

export default async function DriversPage({ searchParams }: PageProps<"/kartoteki/kierowcy">) {
  const ctx = await requireAccess("/kartoteki/kierowcy");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("id, first_name, last_name, phone, employment_type, is_active, user_id, pin_hash, vehicles!drivers_default_vehicle_id_fkey(registration)")
    .eq("tenant_id", ctx.tenantId)
    .order("last_name");
  if (error) throw error;
  const rows = data ?? [];
  const editable = canEdit(ctx.role);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Kierowcy" description={`${rows.length} kierowców · PIN do terminala i stawki dochodzą w etapach M4 i M5.`} />
        {editable && <Link href="/kartoteki/kierowcy/nowy" className={buttonVariants()}>+ Nowy kierowca</Link>}
      </div>
      {sp.zapisano && <p role="status" className="mb-4 rounded-md bg-accent px-4 py-3 text-sm text-primary">Zapisano kierowcę.</p>}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Brak kierowców."
        columns={[
          {
            header: "Kierowca",
            cell: (r) =>
              editable ? (
                <Link href={`/kartoteki/kierowcy/${r.id}`} className="font-medium text-foreground hover:text-primary hover:underline">{`${r.first_name} ${r.last_name}`}</Link>
              ) : (
                <span className="font-medium">{`${r.first_name} ${r.last_name}`}</span>
              ),
          },
          { header: "Telefon", cell: (r) => (r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : "—") },
          { header: "Forma współpracy", cell: (r) => r.employment_type ?? "—" },
          { header: "Pojazd", cell: (r) => (r.vehicles ? <span className="font-mono">{r.vehicles.registration}</span> : "—") },
          { header: "Terminal", cell: (r) => (r.pin_hash ? "PIN ustawiony" : <span className="text-muted">bez PIN-u</span>) },
          { header: "Status", cell: (r) => (r.is_active ? "aktywny" : <span className="text-muted">nieaktywny</span>) },
        ]}
      />
    </>
  );
}
