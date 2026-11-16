import type { Metadata } from "next";
import { PrintButton } from "@/components/print/print-button";
import { BRAND } from "@/lib/brand";
import { formatPln, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { todayInWarsaw } from "@/modules/orders/domain/orders";
import { monthLabel, MONTH_RE } from "@/modules/payroll/domain/month";
import { activeCodes, LINE_LABELS, monthRange, summarizeLines } from "@/modules/payroll/domain/payroll";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Rozliczenie kierowców" };

const STATUS = { draft: "robocze", approved: "zatwierdzone", exported: "wyeksportowane" } as const;
const d = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const cell = "border border-black px-2 py-1";

export default async function SettlementPrintPage({ searchParams }: PageProps<"/druk/rozliczenia">) {
  const ctx = await requireAccess("/rozliczenia");
  const sp = await searchParams;
  const month = typeof sp.miesiac === "string" && MONTH_RE.test(sp.miesiac) ? sp.miesiac : todayInWarsaw().slice(0, 7);
  const only = typeof sp.kierowca === "string" ? sp.kierowca : null;
  const { from, to } = monthRange(month);
  const db = await createClient();
  let q = db
    .from("driver_settlements")
    .select(
      "id, driver_id, status, total_amount, drivers(first_name, last_name, employment_type), driver_settlement_lines(work_date, code, label, quantity, rate, amount, note, is_manual, routes(name))",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("period_start", from)
    .eq("period_end", to);
  if (only) q = q.eq("driver_id", only);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? [])
    .map((s) => ({
      s,
      name: `${s.drivers?.last_name ?? ""} ${s.drivers?.first_name ?? ""}`.trim(),
      sum: summarizeLines(s.driver_settlement_lines ?? []),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  const codes = activeCodes(rows.map((r) => r.sum));
  const total = rows.reduce((a, r) => a + toGrosze(r.s.total_amount), 0);
  const money = (g: number) => (g === 0 ? "" : formatPln(g));
  const single = only ? rows[0] : null;
  const manualLines = rows
    .flatMap((r) =>
      (r.s.driver_settlement_lines ?? [])
        .filter((l) => l.is_manual)
        .map((l) => ({
          name: r.name,
          date: l.work_date,
          label: l.label ?? "Dodatek ręczny",
          amount: toGrosze(l.amount),
          note: l.note ?? "",
        })),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pl") || a.date.localeCompare(b.date));

  return (
    <div className="mx-auto max-w-[1100px] text-[12px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm">{single ? "Rozliczenie kierowcy" : "Zestawienie zbiorcze"}</p>
        <PrintButton />
      </div>
      <header className="mb-4 border-b-2 border-black pb-2">
        <p className="text-[11px] uppercase tracking-wide">
          {single ? "Rozliczenie wynagrodzenia kierowcy" : "Zestawienie wynagrodzeń kierowców"} · {BRAND.full}
        </p>
        <h1 className="text-xl font-bold capitalize">
          {single ? single.name : ctx.tenantName} — {monthLabel(month)}
        </h1>
        {single && <p>{single.s.drivers?.employment_type ?? ""}</p>}
        <p className="text-[11px]">Wydrukowano: {d(todayInWarsaw())}</p>
      </header>

      {rows.length === 0 && <p>Brak rozliczeń w tym miesiącu. Użyj „Przelicz miesiąc” w panelu.</p>}

      {!single && rows.length > 0 && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className={cell}>Kierowca</th>
              <th className={cell}>Forma</th>
              <th className={cell}>Status</th>
              <th className={`${cell} text-right`}>Dni</th>
              {codes.map((c) => (
                <th key={c} className={`${cell} text-right`}>
                  {LINE_LABELS[c]}
                </th>
              ))}
              <th className={`${cell} text-right`}>Razem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s.id}>
                <td className={`${cell} font-medium`}>{r.name}</td>
                <td className={cell}>{r.s.drivers?.employment_type ?? ""}</td>
                <td className={cell}>{STATUS[r.s.status as keyof typeof STATUS] ?? r.s.status}</td>
                <td className={`${cell} text-right tabular-nums`}>{r.sum.days}</td>
                {codes.map((c) => (
                  <td key={c} className={`${cell} text-right tabular-nums`}>
                    {money(r.sum.byCode[c])}
                  </td>
                ))}
                <td className={`${cell} text-right font-bold tabular-nums`}>{formatPln(toGrosze(r.s.total_amount))}</td>
              </tr>
            ))}
            <tr className="bg-neutral-100 font-bold">
              <td className={cell} colSpan={4}>
                Razem ({rows.length} kierowców)
              </td>
              {codes.map((c) => (
                <td key={c} className={`${cell} text-right tabular-nums`}>
                  {money(rows.reduce((a, r) => a + r.sum.byCode[c], 0))}
                </td>
              ))}
              <td className={`${cell} text-right tabular-nums`}>{formatPln(total)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {single && (
        <>
          <table className="mb-5 w-full max-w-md border-collapse">
            <tbody>
              <tr>
                <td className={cell}>Dni pracy</td>
                <td className={`${cell} text-right tabular-nums`}>{single.sum.days}</td>
              </tr>
              {codes.map((c) => (
                <tr key={c}>
                  <td className={cell}>{LINE_LABELS[c]}</td>
                  <td className={`${cell} text-right tabular-nums`}>{formatPln(single.sum.byCode[c])}</td>
                </tr>
              ))}
              <tr className="bg-neutral-100 font-bold">
                <td className={cell}>Razem ({STATUS[single.s.status as keyof typeof STATUS] ?? single.s.status})</td>
                <td className={`${cell} text-right tabular-nums`}>{formatPln(toGrosze(single.s.total_amount))}</td>
              </tr>
            </tbody>
          </table>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className={cell}>Dzień</th>
                <th className={cell}>Trasa</th>
                <th className={cell}>Składnik</th>
                <th className={`${cell} text-right`}>Ilość</th>
                <th className={`${cell} text-right`}>Stawka</th>
                <th className={`${cell} text-right`}>Kwota</th>
                <th className={cell}>Skąd się wzięła</th>
              </tr>
            </thead>
            <tbody>
              {[...(single.s.driver_settlement_lines ?? [])]
                .sort((a, b) => a.work_date.localeCompare(b.work_date) || Number(a.is_manual) - Number(b.is_manual))
                .map((l, i) => (
                  <tr key={i} className="break-inside-avoid">
                    <td className={`${cell} whitespace-nowrap`}>{d(l.work_date)}</td>
                    <td className={cell}>{l.routes?.name ?? ""}</td>
                    <td className={cell}>{l.label ?? l.code ?? ""}</td>
                    <td className={`${cell} text-right tabular-nums`}>{Number(l.quantity).toLocaleString("pl-PL")}</td>
                    <td className={`${cell} text-right tabular-nums`}>{Number(l.rate).toLocaleString("pl-PL")}</td>
                    <td className={`${cell} text-right font-medium tabular-nums`}>{formatPln(toGrosze(l.amount))}</td>
                    <td className={cell}>{l.note ?? ""}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}

      {!single && manualLines.length > 0 && (
        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-1 font-bold">Pozycje wpisane ręcznie</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className={cell}>Kierowca</th>
                <th className={cell}>Dzień</th>
                <th className={cell}>Rodzaj</th>
                <th className={`${cell} text-right`}>Kwota</th>
                <th className={cell}>Opis</th>
              </tr>
            </thead>
            <tbody>
              {manualLines.map((m, i) => (
                <tr key={i}>
                  <td className={cell}>{m.name}</td>
                  <td className={`${cell} whitespace-nowrap`}>{d(m.date)}</td>
                  <td className={cell}>{m.label}</td>
                  <td className={`${cell} text-right tabular-nums`}>{formatPln(m.amount)}</td>
                  <td className={cell}>{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="mt-12 flex justify-between gap-10 text-[11px]">
        <p className="w-64 border-t border-black pt-1">{single ? "Podpis kierowcy" : "Sporządził(a)"}</p>
        <p className="w-64 border-t border-black pt-1">{single ? "Zatwierdził(a)" : "Zatwierdził(a) / księgowość"}</p>
      </div>
    </div>
  );
}
