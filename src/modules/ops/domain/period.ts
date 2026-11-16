// Okresy ekranu „Rentowność” (czyste funkcje): dziś, 7 dni, 14 dni, bieżący i poprzedni miesiąc + okres porównawczy.
import { shiftMonth } from "@/modules/payroll/domain/month";

export const PERIOD_KEYS = ["dzis", "7", "14", "miesiac", "poprzedni"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  dzis: "Dziś",
  "7": "7 dni",
  "14": "14 dni",
  miesiac: "Bieżący miesiąc",
  poprzedni: "Poprzedni miesiąc",
};

export type ResolvedPeriod = {
  key: PeriodKey;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  /** Z czym porównujemy — do podpisów. */
  compare: string;
};

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function parsePeriod(value: unknown): PeriodKey {
  return typeof value === "string" && (PERIOD_KEYS as readonly string[]).includes(value) ? (value as PeriodKey) : "7";
}

export function resolvePeriod(key: PeriodKey, today: string): ResolvedPeriod {
  if (key === "dzis") {
    const prev = addDays(today, -7);
    return { key, start: today, end: today, prevStart: prev, prevEnd: prev, compare: "ten sam dzień tydzień wcześniej" };
  }
  if (key === "7" || key === "14") {
    const n = Number(key);
    const start = addDays(today, -(n - 1));
    return {
      key,
      start,
      end: today,
      prevStart: addDays(start, -n),
      prevEnd: addDays(start, -1),
      compare: `poprzednie ${n} dni`,
    };
  }
  const month = today.slice(0, 7);
  if (key === "miesiac") {
    const start = `${month}-01`;
    const elapsed = Number(today.slice(8, 10));
    const prevMonth = shiftMonth(month, -1);
    const prevStart = `${prevMonth}-01`;
    const prevLast = lastDayOfMonth(prevMonth);
    const prevEnd = addDays(prevStart, elapsed - 1) < prevLast ? addDays(prevStart, elapsed - 1) : prevLast;
    return { key, start, end: today, prevStart, prevEnd, compare: "ten sam fragment poprzedniego miesiąca" };
  }
  const prevMonth = shiftMonth(month, -1);
  const beforeMonth = shiftMonth(month, -2);
  return {
    key,
    start: `${prevMonth}-01`,
    end: lastDayOfMonth(prevMonth),
    prevStart: `${beforeMonth}-01`,
    prevEnd: lastDayOfMonth(beforeMonth),
    compare: "miesiąc wcześniej",
  };
}
