// Realizacja trasy przez kierowcę: statusy, opakowania, gotówka, raport zmiany (czyste funkcje).
import { toGrosze } from "@/lib/forms";

export const PIN_RE = /^\d{4,6}$/;

/** Szybkie statusy z listy trasy (D10a) i ich znaczenie w bazie. */
export const QUICK_STATUSES = {
  none: { label: "Nie rozpoczęto", stop: "pending", order: "planned" },
  now: { label: "Teraz realizuję", stop: "in_progress", order: "in_progress" },
  partial: { label: "Częściowo", stop: "partial", order: "partial" },
  done: { label: "Dostarczono", stop: "delivered", order: "delivered" },
} as const;
export type QuickStatus = keyof typeof QUICK_STATUSES;

/** Wyjątki z ekranu punktu. */
export const EXCEPTION_STATUSES = {
  absent: { label: "Brak odbioru", stop: "absent", order: "failed", needsReason: false },
  refused: { label: "Odmowa przyjęcia", stop: "refused", order: "failed", needsReason: true },
  complaint: { label: "Reklamacja", stop: "complaint", order: "partial", needsReason: true },
} as const;
export type ExceptionStatus = keyof typeof EXCEPTION_STATUSES;

export type StopStatus = "pending" | "arrived" | "in_progress" | "delivered" | "partial" | "refused" | "absent" | "skipped" | "complaint";

export function quickStatusOf(stop: StopStatus): QuickStatus | null {
  if (stop === "pending" || stop === "arrived") return "none";
  if (stop === "in_progress") return "now";
  if (stop === "partial") return "partial";
  if (stop === "delivered") return "done";
  return null; // wyjątek — pokazywany osobno
}

export function isFinished(stop: StopStatus): boolean {
  return ["delivered", "partial", "refused", "absent", "skipped", "complaint"].includes(stop);
}

export const STOP_STATUS_LABELS: Record<StopStatus, string> = {
  pending: "nie rozpoczęto",
  arrived: "na miejscu",
  in_progress: "w realizacji",
  delivered: "dostarczono",
  partial: "częściowo",
  refused: "odmowa",
  absent: "brak odbioru",
  skipped: "pominięty",
  complaint: "reklamacja",
};

/** Licznik: liczba całkowita km, koniec ≥ start. */
export function parseOdometer(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/\s/g, "");
  if (!/^\d{1,7}$/.test(s)) return null;
  return Number(s);
}

export function validateOdometerEnd(start: number | null, end: number | null): string | null {
  if (end === null) return "Wpisz stan licznika (same cyfry).";
  if (start !== null && end < start) return `Stan końcowy nie może być mniejszy niż startowy (${start}).`;
  if (start !== null && end - start > 2000) return "Przebieg ponad 2000 km — sprawdź stan licznika.";
  return null;
}

/** Opakowania z formularza punktu: pola out_<typeId> / back_<typeId>, liczby całkowite ≥ 0. */
export function parsePackaging(entries: Record<string, unknown>, typeIds: string[]): { typeId: string; out: number; back: number }[] {
  const n = (v: unknown) => {
    const x = Number(String(v ?? "0").replace(/\s/g, "") || 0);
    return Number.isInteger(x) && x >= 0 && x <= 10000 ? x : 0;
  };
  return typeIds
    .map((typeId) => ({ typeId, out: n(entries[`out_${typeId}`]), back: n(entries[`back_${typeId}`]) }))
    .filter((p) => p.out > 0 || p.back > 0);
}

/** Kwota gotówki (zł, przecinek dozwolony) → grosze; null gdy puste/niepoprawne. */
export function parseCash(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return toGrosze(s);
}

export type ReportStop = { status: StopStatus; windowEnd?: string | null; completedAtLocal?: string | null };
export type ReportInput = {
  stops: ReportStop[];
  odometerStart: number | null;
  odometerEnd: number | null;
  packaging: { code: string; name: string; out: number; back: number }[];
  cashGrosze: number;
  startedAt: string | null;
  finishedAt: string | null;
};

export function shiftReport(r: ReportInput) {
  const total = r.stops.length;
  const finished = r.stops.filter((s) => isFinished(s.status)).length;
  const byStatus = r.stops.reduce<Record<string, number>>((acc, s) => ((acc[s.status] = (acc[s.status] ?? 0) + 1), acc), {});
  const onTime = r.stops.filter((s) => s.completedAtLocal && s.windowEnd && s.completedAtLocal <= s.windowEnd).length;
  const withWindow = r.stops.filter((s) => s.completedAtLocal && s.windowEnd).length;
  const km = r.odometerStart !== null && r.odometerEnd !== null ? r.odometerEnd - r.odometerStart : null;
  return {
    total,
    finished,
    delivered: byStatus.delivered ?? 0,
    partial: byStatus.partial ?? 0,
    exceptions: (byStatus.absent ?? 0) + (byStatus.refused ?? 0) + (byStatus.complaint ?? 0),
    onTime,
    withWindow,
    km,
    packaging: r.packaging.map((p) => ({ ...p, toHandOver: p.back })),
    cashGrosze: r.cashGrosze,
  };
}
