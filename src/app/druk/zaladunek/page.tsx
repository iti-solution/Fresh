import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/print/print-button";
import { BRAND } from "@/lib/brand";
import { DATE_RE, formatPln, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { vehicleOptionLabel } from "@/modules/masterdata/domain/format";
import { formatDayLabel, nextWorkingDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { buildLoadingList, type LoadStop } from "@/modules/planning/domain/loading";
import { ROUTE_KIND_LABELS } from "@/modules/planning/domain/load";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Lista załadunkowa" };

const t = (s?: string | null) => (s ? s.slice(0, 5) : "");
const num = (n: number) => n.toLocaleString("pl-PL", { maximumFractionDigits: 2 });

export default async function LoadingListPage({ searchParams }: PageProps<"/druk/zaladunek">) {
  const ctx = await requireAccess("/planowanie");
  const sp = await searchParams;
  const day = typeof sp.dzien === "string" && DATE_RE.test(sp.dzien) ? sp.dzien : nextWorkingDay(todayInWarsaw());
  const only = typeof sp.trasa === "string" ? sp.trasa : null;
  const supabase = await createClient();
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7;

  let q = supabase
    .from("routes")
    .select(
      `id, name, kind, course_no, planned_start, status,
       vehicles(registration, name, vehicle_type, body_type),
       drivers(first_name, last_name, phone),
       route_stops(sequence, delivery_points(name, address_line, city, customers(name),
         delivery_point_windows(weekday, opens_at, closes_at)),
         route_stop_orders(orders(external_ref, pallets, crates, weight_kg, cod_amount, readiness, notes_logistics,
           order_lines(line_no, product_code, product_name, qty, unit))))`,
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("route_date", day)
    .neq("status", "cancelled")
    .order("course_no")
    .order("name");
  if (only) q = q.eq("id", only);
  const { data, error } = await q;
  if (error) throw error;

  const routes = (data ?? [])
    .map((r) => {
      const stops: LoadStop[] = (r.route_stops ?? []).map((s) => {
        const p = s.delivery_points;
        const wins = (p?.delivery_point_windows ?? [])
          .filter((w) => w.weekday === weekday)
          .sort((a, b) => a.opens_at.localeCompare(b.opens_at));
        return {
          sequence: s.sequence,
          customer: p?.customers?.name ?? "—",
          place: p?.name ?? "",
          address: [p?.address_line, p?.city].filter(Boolean).join(", "),
          window: wins.map((w) => `${t(w.opens_at)}–${t(w.closes_at)}`).join(", "),
          orders: (s.route_stop_orders ?? [])
            .map((so) => so.orders)
            .filter((o): o is NonNullable<typeof o> => Boolean(o))
            .map((o) => ({
              ref: o.external_ref,
              pallets: Number(o.pallets ?? 0),
              crates: o.crates ?? 0,
              weightKg: Number(o.weight_kg ?? 0),
              codGrosze: toGrosze(o.cod_amount),
              ready: o.readiness === "ready",
              notes: o.notes_logistics,
              lines: [...(o.order_lines ?? [])]
                .sort((a, b) => a.line_no - b.line_no)
                .map((l) => ({ code: l.product_code, name: l.product_name, qty: Number(l.qty), unit: l.unit })),
            })),
        };
      });
      return { r, ...buildLoadingList(stops) };
    })
    .filter((x) => x.rows.length > 0);

  const printedAt = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });

  return (
    <main className="mx-auto max-w-[1000px] text-[12px] leading-snug">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/planowanie?dzien=${day}`} className="text-sm text-primary-strong hover:underline">
          ‹ Wróć do planowania
        </Link>
        <PrintButton />
      </div>
      {routes.length === 0 && <p className="text-sm">Na {formatDayLabel(day)} nie ma tras z zamówieniami.</p>}
      {routes.map(({ r, rows, totals }) => (
        <section key={r.id} className="mb-10 break-after-page last:break-after-auto">
          <header className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b-2 border-black pb-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide">Lista załadunkowa · {BRAND.full}</p>
              <h1 className="text-xl font-bold">
                {r.name}
                {r.kind !== "regular" && ` · ${ROUTE_KIND_LABELS[r.kind as keyof typeof ROUTE_KIND_LABELS] ?? r.kind}`}
                {r.course_no > 1 && ` · kurs ${r.course_no}`}
              </h1>
              <p className="capitalize">
                {formatDayLabel(day)}.{day.slice(0, 4)}
                {r.planned_start &&
                  ` · wyjazd ${new Date(r.planned_start).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" })}`}
              </p>
            </div>
            <div className="text-right">
              <p>
                <strong>Auto:</strong> {r.vehicles ? vehicleOptionLabel(r.vehicles) : "—"}
              </p>
              <p>
                <strong>Kierowca:</strong> {r.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : "—"}
                {r.drivers?.phone && ` · ${r.drivers.phone}`}
              </p>
            </div>
          </header>
          <p className="mb-2">
            Kolejność <strong>odwrotna do dostaw</strong>: ładuj od pozycji 1 (pierwsza na pace = ostatnia u klienta). Razem:{" "}
            <strong>
              {totals.stops} adresów · {totals.orders} zamówień · {num(totals.pallets)} pal. · {totals.crates} skrz. ·{" "}
              {num(totals.weightKg)} kg
            </strong>
            {totals.codGrosze > 0 && <> · pobrania {formatPln(totals.codGrosze)}</>}
            {totals.notReady > 0 && <strong> · UWAGA: {totals.notReady} zamówień jeszcze w kompletacji</strong>}
          </p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-black text-left">
                <th className="w-8 py-1 pr-2">Zał.</th>
                <th className="w-8 py-1 pr-2">Dost.</th>
                <th className="py-1 pr-2">Klient i adres</th>
                <th className="py-1 pr-2">Zamówienia / towar</th>
                <th className="py-1 pr-2 text-right">Pal.</th>
                <th className="py-1 pr-2 text-right">Skrz.</th>
                <th className="py-1 pr-2 text-right">kg</th>
                <th className="w-10 py-1 text-center">✓</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sequence} className="break-inside-avoid border-b border-black/30 align-top">
                  <td className="py-1.5 pr-2 text-base font-bold">{row.loadNo}</td>
                  <td className="py-1.5 pr-2">{row.sequence}</td>
                  <td className="py-1.5 pr-2">
                    <strong>{row.customer}</strong>
                    {row.place && row.place !== row.customer && <> — {row.place}</>}
                    <br />
                    {row.address}
                    {row.window && <> · okno {row.window}</>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {row.orders.map((o, i) => (
                      <div key={i} className="mb-1">
                        <span className="font-mono">{o.ref ?? "—"}</span>
                        {!o.ready && <strong> [w kompletacji]</strong>}
                        {o.codGrosze > 0 && <> · pobranie {formatPln(o.codGrosze)}</>}
                        {o.notes && <em> · {o.notes}</em>}
                        {o.lines.length > 0 && (
                          <ul className="ml-3 list-disc">
                            {o.lines.map((l, j) => (
                              <li key={j}>
                                {num(l.qty)} {l.unit} {l.name}
                                {l.code && <span className="text-black/60"> ({l.code})</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{row.pallets ? num(row.pallets) : ""}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{row.crates || ""}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{row.weightKg || ""}</td>
                  <td className="py-1.5 text-center">☐</td>
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="mt-6 grid grid-cols-2 gap-10">
            <p className="border-t border-black pt-1">Wydał (magazyn) — podpis</p>
            <p className="border-t border-black pt-1">Przyjął (kierowca) — podpis</p>
          </footer>
          <p className="mt-2 text-[10px] text-black/60">Wydrukowano {printedAt}</p>
        </section>
      ))}
    </main>
  );
}
