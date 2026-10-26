import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/panel/module-placeholder";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { isNoteActive } from "@/modules/masterdata/domain/schemas";
import { todayInWarsaw } from "@/modules/orders/domain/orders";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Klienci i oddziały" };

export default async function CustomersPage({ searchParams }: PageProps<"/kartoteki/klienci">) {
  const ctx = await requireAccess("/kartoteki/klienci");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const onlyNotes = params.uwagi === "1";
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select(
      "id, external_code, name, category, sales_rep_name, is_active, delivery_points(id, city, is_active, delivery_point_notes(valid_from, valid_to))",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("external_code", { nullsFirst: false })
    .order("name");
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,external_code.ilike.%${safe}%,sales_rep_name.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) throw error;

  const today = todayInWarsaw();
  const rows = (data ?? [])
    .map((c) => {
      const points = c.delivery_points ?? [];
      const activeNotes = points.flatMap((p) => p.delivery_point_notes ?? []).filter((n) => isNoteActive(n, today)).length;
      const cities = [...new Set(points.map((p) => p.city).filter(Boolean))].join(", ");
      return { ...c, branchCount: points.length, activeNotes, cities };
    })
    .filter((c) => !onlyNotes || c.activeNotes > 0);
  const notesTotal = rows.reduce((a, r) => a + (r.activeNotes > 0 ? 1 : 0), 0);

  return (
    <>
      <PageHeader
        title="Klienci i oddziały"
        description={`${rows.length} klientów · każdy może mieć kilka oddziałów (kuchnia, bar, magazyn).`}
        actions={
          <>
            {canEdit(ctx.role) && (
              <Link href="/kartoteki/klienci/nowy" className={buttonVariants()}>
                <Plus /> Nowy klient
              </Link>
            )}
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Szukaj: nazwa, kod klienta, opiekun…"
          aria-label="Szukaj klienta"
          className="h-10 w-full max-w-sm rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none placeholder:text-subtle focus:border-primary focus:ring-[3px] focus:ring-primary/15"
        />
        <button className={buttonVariants({ variant: "outline" })}>Szukaj</button>
        <Link
          href={onlyNotes ? "/kartoteki/klienci" : "/kartoteki/klienci?uwagi=1"}
          className={buttonVariants({ variant: onlyNotes ? "primary" : "outline" })}
          aria-pressed={onlyNotes}
        >
          Z aktualnymi uwagami {onlyNotes ? "" : `(${notesTotal})`}
        </Link>
        {(q || onlyNotes) && (
          <Link href="/kartoteki/klienci" className="text-sm text-muted hover:underline">
            Wyczyść
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">Brak klientów{q ? ` dla „${q}”` : ""}.</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Kod</th>
                <th className="px-3 py-2 font-medium">Klient</th>
                <th className="px-3 py-2 font-medium">Oddziały</th>
                <th className="px-3 py-2 font-medium">Opiekun</th>
                <th className="px-3 py-2 font-medium">Uwagi</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2 font-mono text-xs">{c.external_code ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/kartoteki/klienci/${c.id}`}
                      className="font-medium text-foreground hover:text-primary-strong hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.category && <p className="text-xs text-muted">{c.category}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="tabular-nums">{c.branchCount}</span>
                    {c.cities && <span className="text-xs text-muted"> · {c.cities}</span>}
                  </td>
                  <td className="px-3 py-2">{c.sales_rep_name ?? <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2">
                    {c.activeNotes > 0 ? (
                      <Badge className="bg-warning/10 text-warning">{c.activeNotes} aktualna</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{c.is_active ? "aktywny" : <span className="text-muted">nieaktywny</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
