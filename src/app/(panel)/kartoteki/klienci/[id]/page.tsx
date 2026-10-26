import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormRenderer } from "@/components/forms/form-renderer";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { BRANCH_LABELS, formatSeason, formatWeekdays, formatWindows } from "@/modules/masterdata/domain/format";
import { isNoteActive } from "@/modules/masterdata/domain/schemas";
import { addNote, endNote, saveCustomer } from "@/modules/masterdata/server/actions";
import { AddNoteForm } from "@/modules/masterdata/ui/add-note-form";
import { customerSections } from "@/modules/masterdata/ui/field-defs";
import { todayInWarsaw } from "@/modules/orders/domain/orders";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Karta klienta" };

export default async function CustomerCardPage({ params, searchParams }: PageProps<"/kartoteki/klienci/[id]">) {
  const ctx = await requireAccess("/kartoteki/klienci");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("customers")
    .select(
      "*, delivery_points(*, delivery_point_windows(weekday, opens_at, closes_at), delivery_point_notes(id, text, valid_from, valid_to))",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!c) notFound();

  const editable = canEdit(ctx.role);
  const today = todayInWarsaw();
  const points = [...(c.delivery_points ?? [])].sort((a, b) => (a.external_code ?? "").localeCompare(b.external_code ?? ""));
  const flash =
    sp.nowy === "1"
      ? "Klient zapisany. Dodaj teraz pierwszy oddział (adres dostawy)."
      : sp.zapisano === "nowy-oddzial"
        ? "Dodano oddział."
        : sp.zapisano === "oddzial"
          ? "Zapisano oddział."
          : null;

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href="/kartoteki/klienci" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
          ‹ Klienci
        </Link>
      </nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-xs text-muted">{c.external_code ?? "bez kodu"}</p>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">{c.name}</h1>
          <p className="text-sm text-muted">
            {[c.category, c.nip && `NIP ${c.nip}`, c.is_active ? null : "nieaktywny"].filter(Boolean).join(" · ") || "—"}
          </p>
          {c.sales_rep_name && (
            <p className="text-sm">
              Opiekun: <strong>{c.sales_rep_name}</strong>
              {c.sales_rep_phone && (
                <>
                  {" "}
                  · <a href={`tel:${c.sales_rep_phone}`}>{c.sales_rep_phone}</a>
                </>
              )}
            </p>
          )}
        </div>
        {editable && (
          <Link href={`/kartoteki/klienci/${c.id}/oddzialy/nowy`} className={buttonVariants()}>
            <Plus /> Dodaj oddział
          </Link>
        )}
      </div>

      {flash && (
        <p role="status" className="mb-4 rounded-lg border border-primary/20 bg-accent px-4 py-2.5 text-sm text-primary-strong">
          {flash}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Oddziały" className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <h2 className="text-lg font-semibold">Oddziały ({points.length})</h2>
          {points.length === 0 && <Card className="text-sm text-muted">Ten klient nie ma jeszcze oddziałów.</Card>}
          {points.map((p) => {
            const notes = (p.delivery_point_notes ?? []).sort((a, b) => a.valid_from.localeCompare(b.valid_from));
            const active = notes.filter((n) => isNoteActive(n, today));
            const upcoming = notes.filter((n) => n.valid_from > today);
            const fixed = [
              ["Dzwonić", p.call_instructions],
              ["Wjazd", p.access_instructions],
              ["Piętro", p.floor],
              ["Rozładunek", p.unloading_zone],
              ["Inne", p.driver_instructions],
            ].filter(([, v]) => v);
            return (
              <Card key={p.id} id={`oddzial-${p.id}`} className="flex scroll-mt-20 flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{p.name}</h3>
                      <Badge>{BRANCH_LABELS[p.branch_type] ?? p.branch_type}</Badge>
                      {!p.is_active && <Badge className="bg-border text-muted">nieaktywny</Badge>}
                      {(p.active_from || p.active_to) && (
                        <Badge className="bg-warning/10 text-warning">sezon {formatSeason(p.active_from, p.active_to)}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted">
                      {p.address_line}, {p.postal_code} {p.city}
                      {p.contact_phone && (
                        <>
                          {" "}
                          · <a href={`tel:${p.contact_phone}`}>{p.contact_phone}</a>
                        </>
                      )}
                    </p>
                  </div>
                  {editable && (
                    <Link
                      href={`/kartoteki/klienci/${c.id}/oddzialy/${p.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Edytuj
                    </Link>
                  )}
                </div>

                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
                  <dt className="text-muted">Dni dostaw</dt>
                  <dd>{formatWeekdays(p.delivery_weekdays)}</dd>
                  <dt className="text-muted">Okno przyjęć</dt>
                  <dd className="tabular-nums">{formatWindows(p.delivery_point_windows, p.delivery_weekdays?.[0] ?? 1)}</dd>
                  <dt className="text-muted">Rozładunek</dt>
                  <dd>{p.service_minutes} min</dd>
                  {fixed.map(([k, v]) => (
                    <div key={k as string} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted">Uwagi tymczasowe</p>
                  {active.length === 0 && upcoming.length === 0 && <p className="text-sm text-muted">Brak aktualnych uwag.</p>}
                  {[...active, ...upcoming].map((n) => (
                    <div
                      key={n.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm"
                    >
                      <span>
                        <strong className="text-warning">
                          {n.valid_from > today ? "od " + n.valid_from.slice(8, 10) + "." + n.valid_from.slice(5, 7) : "teraz"}
                        </strong>{" "}
                        {n.text}
                        <span className="text-xs text-muted">
                          {" "}
                          · {n.valid_to ? `do ${n.valid_to.slice(8, 10)}.${n.valid_to.slice(5, 7)}` : "bez końca"}
                        </span>
                      </span>
                      {editable && (
                        <form action={endNote.bind(null, c.id, n.id)}>
                          <button className="text-xs text-muted hover:text-foreground hover:underline">Zakończ</button>
                        </form>
                      )}
                    </div>
                  ))}
                  {editable && <AddNoteForm action={addNote.bind(null, c.id, p.id)} today={today} />}
                </div>
              </Card>
            );
          })}
        </section>

        <aside aria-label="Dane klienta" className="flex min-w-0 flex-[1_1_360px] flex-col gap-3">
          <h2 className="text-lg font-semibold">Dane klienta</h2>
          {editable ? (
            <FormRenderer action={saveCustomer.bind(null, c.id)} sections={customerSections(c)} />
          ) : (
            <Card className="text-sm text-muted">Masz dostęp tylko do podglądu.</Card>
          )}
        </aside>
      </div>
    </>
  );
}
