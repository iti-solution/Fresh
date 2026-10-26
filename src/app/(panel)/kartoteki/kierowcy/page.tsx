import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/panel/data-table";
import { PageHeader } from "@/components/panel/module-placeholder";
import { Plate } from "@/components/ui/status";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { getLastAssignments } from "@/modules/planning/server/history";
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
    .select("id, first_name, last_name, phone, employment_type, is_active, user_id, pin_hash")
    .eq("tenant_id", ctx.tenantId)
    .order("last_name");
  if (error) throw error;
  const rows = data ?? [];
  const editable = canEdit(ctx.role);
  const today = todayInWarsaw();
  const { byDriver } = await getLastAssignments(ctx.tenantId, shiftDay(today, -30), shiftDay(today, 1));

  return (
    <>
      <PageHeader
        title="Kierowcy"
        description={`${rows.length} kierowców. Kierowca nie ma stałego auta — przydział robi dyspozytor na każdą trasę, a historia jest w dzienniku przydziałów.`}
        actions={
          <>
            {editable && (
              <Link href="/kartoteki/kierowcy/nowy" className={buttonVariants({ size: "sm" })}>
                <Plus /> Nowy kierowca
              </Link>
            )}
          </>
        }
      />
      {sp.zapisano && (
        <p role="status" className="mb-4 rounded-lg border border-success/20 bg-success-soft px-4 py-2.5 text-sm text-success">
          Zapisano kierowcę.
        </p>
      )}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Brak kierowców."
        columns={[
          {
            header: "Kierowca",
            cell: (r) =>
              editable ? (
                <Link
                  href={`/kartoteki/kierowcy/${r.id}`}
                  className="font-medium text-foreground hover:text-primary-strong hover:underline"
                >{`${r.first_name} ${r.last_name}`}</Link>
              ) : (
                <span className="font-medium">{`${r.first_name} ${r.last_name}`}</span>
              ),
          },
          { header: "Telefon", cell: (r) => (r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : "—") },
          { header: "Forma współpracy", cell: (r) => r.employment_type ?? "—" },
          {
            header: "Ostatni przydział",
            cell: (r) => {
              const a = byDriver.get(r.id);
              return a ? (
                <Link href={`/kartoteki/pojazdy/dziennik?kierowca=${r.id}`} className="group flex items-center gap-2">
                  <Plate>{a.vehicle}</Plate>
                  <span className="text-xs text-muted group-hover:text-primary-strong">
                    {a.date === today ? "dziś" : formatDayLabel(a.date)}, {a.routeName}
                  </span>
                </Link>
              ) : (
                <span className="text-subtle">brak tras w 30 dni</span>
              );
            },
          },
          { header: "Terminal", cell: (r) => (r.pin_hash ? "PIN ustawiony" : <span className="text-muted">bez PIN-u</span>) },
          { header: "Status", cell: (r) => (r.is_active ? "aktywny" : <span className="text-muted">nieaktywny</span>) },
        ]}
      />
    </>
  );
}
