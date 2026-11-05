import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, RefreshCw, Settings2 } from "lucide-react";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { formatPln, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { monthLabel, MONTH_RE, shiftMonth } from "@/modules/payroll/domain/month";
import { monthRange } from "@/modules/payroll/domain/payroll";
import { recomputeMonth } from "@/modules/payroll/server/actions";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Rozliczenia kierowców" };

const STATUS = { draft: ["robocze", "warning"], approved: ["zatwierdzone", "success"], exported: ["wyeksportowane", "info"] } as const;

export default async function SettlementsPage({ searchParams }: PageProps<"/rozliczenia">) {
  const ctx = await requireAccess("/rozliczenia");
  const sp = await searchParams;
  const today = todayInWarsaw();
  const month = typeof sp.miesiac === "string" && MONTH_RE.test(sp.miesiac) ? sp.miesiac : today.slice(0, 7);
  const { from, to } = monthRange(month);
  const db = await createClient();
  const [drivers, settlements, routes, toClose, rules] = await Promise.all([
    db.from("drivers").select("id, first_name, last_name, employment_type, is_active").eq("tenant_id", ctx.tenantId).order("last_name"),
    db
      .from("driver_settlements")
      .select("id, driver_id, total_amount, status, approved_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("period_start", from)
      .eq("period_end", to),
    db
      .from("routes")
      .select("driver_id, route_date, status")
      .eq("tenant_id", ctx.tenantId)
      .gte("route_date", from)
      .lte("route_date", to)
      .in("status", ["completed", "closed"]),
    db
      .from("routes")
      .select("id, name, route_date, status, drivers(first_name, last_name)")
      .eq("tenant_id", ctx.tenantId)
      .in("status", ["completed", "in_progress"])
      .lt("route_date", shiftDay(today, 1))
      .order("route_date")
      .limit(50),
    db.from("driver_pay_rules").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId),
  ]);
  const byDriver = new Map((settlements.data ?? []).map((s) => [s.driver_id, s]));
  const days = new Map<string, Set<string>>();
  const routeCount = new Map<string, number>();
  for (const r of routes.data ?? []) {
    if (!r.driver_id) continue;
    days.set(r.driver_id, (days.get(r.driver_id) ?? new Set()).add(r.route_date));
    routeCount.set(r.driver_id, (routeCount.get(r.driver_id) ?? 0) + 1);
  }
  const rows = (drivers.data ?? []).filter((d) => d.is_active || routeCount.has(d.id) || byDriver.has(d.id));
  const total = rows.reduce((a, d) => a + toGrosze(byDriver.get(d.id)?.total_amount), 0);
  const editable = canEdit(ctx.role);
  const href = (m: string) => `/rozliczenia?miesiac=${m}`;

  return (
    <>
      <PageHeader
        title="Rozliczenia kierowców"
        description="Wynagrodzenia liczone z tras według stawek. Każda pozycja ma opis, skąd się wzięła. Kierownik zatwierdza miesiąc i eksportuje go dla kadr."
        actions={
          <>
            <Link href="/rozliczenia/stawki" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Settings2 /> Stawki
            </Link>
            <a href={`/api/rozliczenia/eksport?miesiac=${month}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download /> Eksport XLSX
            </a>
            {editable && (
              <form action={recomputeMonth.bind(null, month)}>
                <button className={buttonVariants({ size: "sm" })} title="Liczy od nowa pozycje automatyczne; dodatki ręczne i zatwierdzone rozliczenia zostają">
                  <RefreshCw /> Przelicz miesiąc
                </button>
              </form>
            )}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={href(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ChevronLeft />
        </Link>
        <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none min-w-40 capitalize")}>{monthLabel(month)}</span>
        <Link href={href(shiftMonth(month, 1))} aria-label="Następny miesiąc" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ChevronRight />
        </Link>
      </div>
      {(rules.count ?? 0) === 0 && (
        <Notice tone="warning">
          Nie ma jeszcze stawek. <Link href="/rozliczenia/stawki" className="font-medium underline">Ustaw stawki</Link> — dniówkę, kilometrówkę, stawki za punkty albo % od obrotu.
        </Notice>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title={`Miesiąc: ${formatPln(total)}`} description={`${rows.length} kierowców`} flush>
          {rows.length === 0 ? (
            <EmptyState title="Brak kierowców">Dodaj kierowców w kartotece.</EmptyState>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Kierowca</th>
                  <th className="px-4 py-2 font-medium">Dni / trasy</th>
                  <th className="px-4 py-2 text-right font-medium">Kwota</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const s = byDriver.get(d.id);
                  const st = s ? STATUS[s.status as keyof typeof STATUS] : null;
                  return (
                    <tr key={d.id} className="border-t border-border hover:bg-surface-2">
                      <td className="px-4 py-2.5">
                        <Link href={`/rozliczenia/${d.id}?miesiac=${month}`} className="font-medium hover:text-primary-strong hover:underline">
                          {d.first_name} {d.last_name}
                        </Link>
                        {d.employment_type && <span className="ml-2 text-xs text-muted">{d.employment_type}</span>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {days.get(d.id)?.size ?? 0} / {routeCount.get(d.id) ?? 0}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{s ? formatPln(toGrosze(s.total_amount)) : "—"}</td>
                      <td className="px-4 py-2.5">{st ? <Pill tone={st[1]}>{st[0]}</Pill> : <span className="text-xs text-muted">nie przeliczono</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Trasy do zamknięcia" description="Przyjęcie gotówki i opakowań, potem wynagrodzenie dnia" flush>
          <ul className="divide-y divide-border text-sm">
            {(toClose.data ?? []).length === 0 && <li className="px-4 py-3 text-muted">Wszystkie trasy zamknięte.</li>}
            {(toClose.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0">
                  <Link href={`/rozliczenia/zamkniecie/${r.id}`} className="font-medium hover:text-primary-strong hover:underline">
                    {r.name}
                  </Link>
                  <span className="block text-xs capitalize text-muted">
                    {formatDayLabel(r.route_date)} · {r.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : "—"}
                  </span>
                </span>
                <Pill tone={r.status === "completed" ? "info" : "warning"}>{r.status === "completed" ? "wróciła" : "w trasie"}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
