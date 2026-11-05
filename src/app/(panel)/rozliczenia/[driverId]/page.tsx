import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InlineForm } from "@/components/forms/inline-form";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Pill } from "@/components/ui/status";
import { formatPln, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { formatDayLabel, todayInWarsaw } from "@/modules/orders/domain/orders";
import { monthLabel, MONTH_RE } from "@/modules/payroll/domain/month";
import { monthRange } from "@/modules/payroll/domain/payroll";
import { addManualLine, approveSettlement, deleteManualLine, recomputeDriver } from "@/modules/payroll/server/actions";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Rozliczenie kierowcy" };

export default async function DriverSettlementPage({ params, searchParams }: PageProps<"/rozliczenia/[driverId]">) {
  const ctx = await requireAccess("/rozliczenia");
  const { driverId } = await params;
  const sp = await searchParams;
  const month = typeof sp.miesiac === "string" && MONTH_RE.test(sp.miesiac) ? sp.miesiac : todayInWarsaw().slice(0, 7);
  const { from, to } = monthRange(month);
  const db = await createClient();
  const [{ data: driver }, { data: s }] = await Promise.all([
    db.from("drivers").select("id, first_name, last_name, employment_type").eq("id", driverId).eq("tenant_id", ctx.tenantId).maybeSingle(),
    db
      .from("driver_settlements")
      .select("id, status, total_amount, approved_at, driver_settlement_lines(id, work_date, code, label, quantity, rate, amount, note, is_manual, routes(name))")
      .eq("tenant_id", ctx.tenantId)
      .eq("driver_id", driverId)
      .eq("period_start", from)
      .eq("period_end", to)
      .maybeSingle(),
  ]);
  if (!driver) notFound();
  const lines = [...(s?.driver_settlement_lines ?? [])].sort((a, b) => a.work_date.localeCompare(b.work_date) || Number(a.is_manual) - Number(b.is_manual));
  const byDay = new Map<string, typeof lines>();
  for (const l of lines) byDay.set(l.work_date, [...(byDay.get(l.work_date) ?? []), l]);
  const byCode = new Map<string, number>();
  for (const l of lines) byCode.set(l.label ?? l.code ?? "—", (byCode.get(l.label ?? l.code ?? "—") ?? 0) + toGrosze(l.amount));
  const draft = s?.status === "draft";
  const editable = canEdit(ctx.role) && (!s || draft);

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href={`/rozliczenia?miesiac=${month}`} className="text-muted hover:text-foreground">
          ‹ Rozliczenia — {monthLabel(month)}
        </Link>
      </nav>
      <PageHeader
        title={`${driver.first_name} ${driver.last_name}`}
        description={<span className="capitalize">{monthLabel(month)}{driver.employment_type ? ` · ${driver.employment_type}` : ""}</span>}
        actions={
          <>
            {editable && (
              <form action={recomputeDriver.bind(null, driverId, month)}>
                <button className={buttonVariants({ variant: "outline", size: "sm" })}>Przelicz</button>
              </form>
            )}
            {s && ctx.role === "admin" && (
              <form action={approveSettlement.bind(null, s.id, draft)}>
                <button className={buttonVariants({ size: "sm", variant: draft ? "primary" : "outline" })}>{draft ? "Zatwierdź rozliczenie" : "Cofnij zatwierdzenie"}</button>
              </form>
            )}
          </>
        }
      />
      {s && !draft && (
        <Notice tone="info">
          Rozliczenie zatwierdzone {s.approved_at ? new Date(s.approved_at).toLocaleDateString("pl-PL") : ""} — tylko do odczytu i eksportu.
        </Notice>
      )}
      {!s ? (
        <Panel>
          <EmptyState title="Brak rozliczenia za ten miesiąc">Kliknij „Przelicz”, gdy kierowca ma zakończone trasy.</EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title={`Pozycje — razem ${formatPln(toGrosze(s.total_amount))}`} flush>
            {lines.length === 0 && <p className="px-5 py-4 text-sm text-muted">Brak pozycji — sprawdź stawki i zamknięte trasy.</p>}
            {[...byDay.entries()].map(([day, ls]) => (
              <section key={day} className="border-t border-border first:border-t-0">
                <h3 className="flex justify-between bg-surface-2 px-5 py-1.5 text-xs font-semibold capitalize text-muted">
                  <span>{formatDayLabel(day)}</span>
                  <span className="tabular-nums">{formatPln(ls.reduce((a, l) => a + toGrosze(l.amount), 0))}</span>
                </h3>
                <ul className="divide-y divide-border text-sm">
                  {ls.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 px-5 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{l.label ?? l.code}</span> {l.is_manual && <Pill tone="plum">ręczny</Pill>}
                        <span className="block text-xs text-muted">{l.note}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatPln(toGrosze(l.amount))}</span>
                      {l.is_manual && editable && (
                        <form action={deleteManualLine.bind(null, l.id, s.id)}>
                          <button className="text-xs text-muted hover:text-danger hover:underline">usuń</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Panel>
          <div className="flex flex-col gap-6">
            <Panel title="Składniki">
              <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                {[...byCode.entries()].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right tabular-nums">{formatPln(v)}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            {editable && draft && (
              <Panel title="Dodatek albo potrącenie" description="Kwota ujemna = potrącenie. Zawsze z opisem.">
                <InlineForm action={addManualLine.bind(null, s.id)} submitLabel="Dodaj">
                  <Input name="amount" placeholder="np. 150 albo -50" aria-label="Kwota (zł)" className="w-36" />
                  <Input type="date" name="date" min={from} max={to} aria-label="Dzień" className="w-40" />
                  <Input name="note" placeholder="za co (np. premia za sobotę)" aria-label="Opis" className="min-w-56 flex-1" />
                </InlineForm>
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );
}
