import type { Metadata } from "next";
import { InlineForm } from "@/components/forms/inline-form";
import { PageHeader, Panel } from "@/components/panel/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Pill } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { holidaysBetween } from "@/modules/masterdata/domain/holidays";
import { formatDayLabel, shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";
import { addClosure, removeClosure, setHolidayWorking } from "@/modules/tenancy/server/settings-actions";

const d = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export const metadata: Metadata = { title: "Dni wolne i święta" };

export default async function Page() {
  const ctx = await requireAccess("/ustawienia/dni-wolne");
  const editable = canEdit(ctx.role);
  const supabase = await createClient();
  const today = todayInWarsaw();
  const excRes = await supabase
    .from("delivery_point_exceptions")
    .select("id, date, is_closed, reason")
    .eq("tenant_id", ctx.tenantId)
    .is("delivery_point_id", null)
    .gte("date", today)
    .order("date");
  if (excRes.error) throw excRes.error;
  const exceptions = excRes.data ?? [];
  const holidays = holidaysBetween(today, shiftDay(today, 366));
  const holidayDates = new Set(holidays.map((h) => h.date));
  const working = new Set(exceptions.filter((e) => !e.is_closed).map((e) => e.date));
  const companyClosures = exceptions.filter((e) => e.is_closed && !holidayDates.has(e.date));

  return (
    <>
      <PageHeader title="Dni wolne i święta" description="Dni, w które nie wozimy towaru: święta ustawowe i zamknięcia firmy." />
      <Panel
        className="max-w-4xl"
        title="Dni wolne i święta"
        description="Święta ustawowe są wbudowane. W planowaniu dzień zamknięty jest oznaczony alarmem, a portal klienta nie pozwoli na niego zamówić."
        flush
      >
        <ul className="divide-y divide-border text-sm">
          {holidays.map((h) => {
            const isWorking = working.has(h.date);
            return (
              <li key={h.date} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  <span className="tabular-nums text-muted">
                    {formatDayLabel(h.date)}.{h.date.slice(0, 4)}
                  </span>{" "}
                  · {h.name} {isWorking ? <Pill tone="success">pracujemy</Pill> : <Pill tone="danger">nie wozimy</Pill>}
                </span>
                {editable && (
                  <form action={setHolidayWorking.bind(null, h.date, !isWorking)}>
                    <Button size="xs" variant="ghost">
                      {isWorking ? "Jednak wolne" : "Pracujemy w ten dzień"}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
          {companyClosures.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 bg-warning-soft/40 px-4 py-2">
              <span>
                <span className="tabular-nums text-muted">{d(e.date)}</span> · {e.reason} <Pill tone="warning">zamknięte</Pill>
              </span>
              {editable && (
                <form action={removeClosure.bind(null, e.id, "/ustawienia/dni-wolne")}>
                  <Button size="xs" variant="ghost">
                    Usuń
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <div className="border-t border-border p-4">
            <InlineForm action={addClosure.bind(null, null, "/ustawienia/dni-wolne")} submitLabel="Dodaj dzień zamknięty">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Data
                <Input type="date" name="date" min={today} className="w-40" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Powód
                <Input name="reason" placeholder="np. inwentaryzacja" className="w-56" />
              </label>
            </InlineForm>
            <p className="mt-2 text-xs text-muted">
              Zamknięcie pojedynczego adresu (remont, urlop klienta) dodasz na karcie klienta.
            </p>
          </div>
        )}
      </Panel>


    </>
  );
}
