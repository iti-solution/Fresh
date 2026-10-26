import { Plus, Waypoints } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Pill, VehicleTag } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { formatTime, formatWeekdays, vehicleMake } from "@/modules/masterdata/domain/format";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Szablony tras" };

const name = (d: { first_name: string; last_name: string } | null) => (d ? `${d.first_name} ${d.last_name}` : null);

export default async function TemplatesPage() {
  const ctx = await requireAccess("/kartoteki/szablony");
  const supabase = await createClient();
  const editable = canEdit(ctx.role);
  const base =
    "id, name, weekdays, planned_start, is_active, vehicles(registration, name, vehicle_type, body_type), route_template_points(count)";
  const full = await supabase
    .from("route_templates")
    .select(
      `${base}, main:drivers!route_templates_default_driver_id_fkey(first_name, last_name), alt:drivers!route_templates_alt_driver_id_fkey(first_name, last_name)`,
    )
    .eq("tenant_id", ctx.tenantId)
    .order("is_active", { ascending: false })
    .order("name");
  // baza bez migracji 0010 (brak kierowcy zastępczego) — lista działa dalej, tylko bez tej kolumny
  const needsMigration = Boolean(full.error);
  const fallback = needsMigration
    ? await supabase
        .from("route_templates")
        .select(`${base}, main:drivers(first_name, last_name)`)
        .eq("tenant_id", ctx.tenantId)
        .order("name")
    : null;
  if (fallback?.error) throw fallback.error;
  const rows: {
    id: string;
    name: string;
    weekdays: number[];
    planned_start: string | null;
    is_active: boolean;
    vehicles: { registration: string; name: string | null; vehicle_type: string | null; body_type: string | null } | null;
    route_template_points: { count: number }[];
    main: { first_name: string; last_name: string } | null;
    alt?: { first_name: string; last_name: string } | null;
  }[] = (full.data ?? fallback?.data ?? []) as never;

  return (
    <>
      <PageHeader
        title="Szablony tras"
        description="Trasy stałe: jakie oddziały klientów obsługują, w które dni i o której wyjeżdżają. Auto i kierowcy są tylko sugestią — przydział na dany dzień robi dyspozytor."
        actions={
          editable ? (
            <Link href="/kartoteki/szablony/nowy" className={buttonVariants({ size: "sm" })}>
              <Plus /> Nowy szablon
            </Link>
          ) : undefined
        }
      />
      {needsMigration && (
        <Notice tone="warning">
          Baza nie ma jeszcze kolumny kierowcy zastępczego. Zastosuj migrację 0010_template_alt_driver.sql w Supabase.
        </Notice>
      )}
      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Waypoints />}
            title="Nie ma jeszcze szablonów tras"
            action={
              editable ? (
                <Link href="/kartoteki/szablony/nowy" className={buttonVariants()}>
                  Utwórz pierwszy szablon
                </Link>
              ) : undefined
            }
          >
            Szablon to trasa stała, np. „Kraków Zachód” — z listą oddziałów klientów, dniami i godziną wyjazdu.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                  <th className="py-2.5 pr-3 pl-5 font-medium">Trasa</th>
                  <th className="px-3 py-2.5 font-medium">Dni</th>
                  <th className="px-3 py-2.5 font-medium">Wyjazd</th>
                  <th className="px-3 py-2.5 text-right font-medium">Punkty</th>
                  <th className="px-3 py-2.5 font-medium">Sugerowane auto</th>
                  <th className="px-3 py-2.5 font-medium">Kierowca wstępny</th>
                  <th className="py-2.5 pr-5 pl-3 font-medium">Kierowca zastępczy</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="py-3 pr-3 pl-5">
                      <Link href={`/kartoteki/szablony/${r.id}`} className="font-medium hover:text-primary-strong">
                        {r.name}
                      </Link>
                      {!r.is_active && (
                        <Pill tone="neutral" className="ml-2">
                          nieaktywna
                        </Pill>
                      )}
                    </td>
                    <td className="px-3 py-3">{formatWeekdays(r.weekdays)}</td>
                    <td className="px-3 py-3 tabular-nums">{formatTime(r.planned_start) || "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.route_template_points[0]?.count ?? 0}</td>
                    <td className="px-3 py-3">
                      {r.vehicles ? (
                        <VehicleTag
                          registration={r.vehicles.registration}
                          make={vehicleMake(r.vehicles)}
                          kind={[r.vehicles.vehicle_type, r.vehicles.body_type].filter(Boolean).join(", ")}
                        />
                      ) : (
                        <span className="text-subtle">bez sugestii</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{name(r.main) ?? <span className="text-subtle">—</span>}</td>
                    <td className="py-3 pr-5 pl-3">{name(r.alt ?? null) ?? <span className="text-subtle">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
