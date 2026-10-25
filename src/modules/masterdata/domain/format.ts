// Formatowanie danych kartotek do wyświetlenia (czyste funkcje).

const WEEKDAY_SHORT = ["", "pn", "wt", "śr", "cz", "pt", "sb", "nd"];

/** {1,2,3,4,5} → "pn–pt"; {1,3,5} → "pn, śr, pt" */
export function formatWeekdays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return "—";
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 7) return "codziennie";
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length >= 3) return `${WEEKDAY_SHORT[sorted[0]]}–${WEEKDAY_SHORT[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

/** "06:00:00" → "06:00" */
export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "—";
}

export type Window = { weekday: number; opens_at: string; closes_at: string };

/** Okna z jednego dnia (domyślnie poniedziałek) jako "06:00–09:00, 14:00–16:00". */
export function formatWindows(windows: Window[], weekday = 1): string {
  const day = windows.filter((w) => w.weekday === weekday).sort((a, b) => a.opens_at.localeCompare(b.opens_at));
  if (day.length === 0) return "—";
  return day.map((w) => `${formatTime(w.opens_at)}–${formatTime(w.closes_at)}`).join(", ");
}

/** Sezon: "01.05–30.09" albo "cały rok" */
export function formatSeason(from: string | null, to: string | null): string {
  if (!from && !to) return "cały rok";
  const f = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : "…");
  return `${f(from)}–${f(to)}`;
}
