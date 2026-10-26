import Link from "next/link";
import { DocRef, Pill, Plate } from "@/components/ui/status";
import { formatPlnCompact } from "@/lib/forms";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { ROUTE_KIND_LABELS, ROUTE_STATUS_LABELS } from "../domain/load";
import type { AssignmentRow } from "../server/history";

/** Tabela dziennika przydziałów: dzień → trasa → auto → kierowca → zamówienia. */
export function AssignmentTable({ rows, hide }: { rows: AssignmentRow[]; hide?: "vehicle" | "driver" }) {
  if (rows.length === 0) return <p className="px-5 py-10 text-center text-sm text-muted">Brak tras w wybranym okresie.</p>;
  const firstOfDay = rows.map((r, i) => i === 0 || rows[i - 1].date !== r.date);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
            <th className="py-2.5 pr-3 pl-5 font-medium">Dzień</th>
            <th className="px-3 py-2.5 font-medium">Trasa</th>
            {hide !== "vehicle" && <th className="px-3 py-2.5 font-medium">Pojazd</th>}
            {hide !== "driver" && <th className="px-3 py-2.5 font-medium">Kierowca</th>}
            <th className="px-3 py-2.5 font-medium">Zamówienia</th>
            <th className="px-3 py-2.5 text-right font-medium">Punkty</th>
            <th className="px-3 py-2.5 text-right font-medium">Licznik</th>
            <th className="px-3 py-2.5 text-right font-medium">Km</th>
            <th className="py-2.5 pr-5 pl-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const first = firstOfDay[i];
            return (
              <tr key={r.routeId} className={first ? "border-t border-border-strong first:border-t-0" : "border-t border-border"}>
                <td className="py-2.5 pr-3 pl-5 whitespace-nowrap align-top capitalize">
                  {first ? (
                    <Link href={`/centrum?dzien=${r.date}`} className="font-medium hover:text-primary-strong">
                      {formatDayLabel(r.date)}
                    </Link>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span className="font-medium">{r.routeName}</span>
                  {(r.kind !== "regular" || r.courseNo > 1) && (
                    <span className="block text-xs text-muted">
                      {[ROUTE_KIND_LABELS[r.kind] ?? r.kind, r.courseNo > 1 ? `kurs ${r.courseNo}` : null]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  )}
                </td>
                {hide !== "vehicle" && (
                  <td className="px-3 py-2.5 align-top">
                    {r.vehicleId ? (
                      <Link
                        href={`/kartoteki/pojazdy/dziennik?auto=${r.vehicleId}`}
                        className="inline-flex"
                        title="Historia tego auta"
                      >
                        <Plate>{r.vehicle}</Plate>
                      </Link>
                    ) : (
                      <Pill tone="danger">bez auta</Pill>
                    )}
                  </td>
                )}
                {hide !== "driver" && (
                  <td className="px-3 py-2.5 align-top">
                    {r.driverId ? (
                      <Link
                        href={`/kartoteki/pojazdy/dziennik?kierowca=${r.driverId}`}
                        className="hover:text-primary-strong"
                        title="Historia tego kierowcy"
                      >
                        {r.driver}
                      </Link>
                    ) : (
                      <Pill tone="danger">bez kierowcy</Pill>
                    )}
                  </td>
                )}
                <td className="max-w-[260px] px-3 py-2.5 align-top">
                  <span className="font-medium tabular-nums">{r.orders}</span>{" "}
                  <span className="text-muted">za {formatPlnCompact(r.valueGrosze)}</span>
                  {r.orderRefs.length > 0 && (
                    <details className="mt-0.5 text-xs">
                      <summary className="cursor-pointer text-primary-strong hover:underline">numery zamówień</summary>
                      <div className="mt-1 flex flex-wrap gap-x-2">
                        {r.orderRefs.map((x) => (
                          <DocRef key={x}>{x}</DocRef>
                        ))}
                      </div>
                    </details>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right align-top tabular-nums">
                  {r.finished}/{r.stops}
                </td>
                <td className="px-3 py-2.5 text-right align-top text-xs text-muted tabular-nums whitespace-nowrap">
                  {r.odometerStart !== null
                    ? `${r.odometerStart.toLocaleString("pl-PL")} → ${r.odometerEnd?.toLocaleString("pl-PL") ?? "…"}`
                    : "—"}
                </td>
                <td className="px-3 py-2.5 text-right align-top tabular-nums">{r.km ?? "—"}</td>
                <td className="py-2.5 pr-5 pl-3 align-top">
                  <Pill
                    tone={
                      r.status === "closed"
                        ? "success"
                        : r.status === "in_progress"
                          ? "info"
                          : r.status === "completed"
                            ? "warning"
                            : "neutral"
                    }
                  >
                    {ROUTE_STATUS_LABELS[r.status] ?? r.status}
                  </Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
