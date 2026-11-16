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

/* ───────── Widok „Dzień / Tydzień / Miesiąc” (Rentowność) ───────── */

export const VIEW_KEYS = ["dzien", "tydzien", "miesiac"] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];
export const VIEW_LABELS: Record<ViewKey, string> = { dzien: "Dzień", tydzien: "Tydzień", miesiac: "Miesiąc" };

export type ResolvedView = {
  view: ViewKey;
  anchor: string;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  /** Kotwice sąsiednich okresów (do strzałek ‹ ›). */
  prevAnchor: string;
  nextAnchor: string;
  compare: string;
};

export function parseView(value: unknown): ViewKey {
  return typeof value === "string" && (VIEW_KEYS as readonly string[]).includes(value) ? (value as ViewKey) : "dzien";
}

/** Poniedziałek tygodnia, w którym leży `day`. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = niedziela
  return addDays(day, -((dow + 6) % 7));
}

/** Okno raportu dla widoku wokół wybranego dnia; miesiąc i tydzień są pełne (kalendarzowe). */
export function resolveView(view: ViewKey, anchor: string): ResolvedView {
  if (view === "dzien") {
    const prev = addDays(anchor, -7);
    return {
      view,
      anchor,
      start: anchor,
      end: anchor,
      prevStart: prev,
      prevEnd: prev,
      prevAnchor: addDays(anchor, -1),
      nextAnchor: addDays(anchor, 1),
      compare: "ten sam dzień tydzień wcześniej",
    };
  }
  if (view === "tydzien") {
    const start = weekStart(anchor);
    return {
      view,
      anchor,
      start,
      end: addDays(start, 6),
      prevStart: addDays(start, -7),
      prevEnd: addDays(start, -1),
      prevAnchor: addDays(anchor, -7),
      nextAnchor: addDays(anchor, 7),
      compare: "poprzedni tydzień",
    };
  }
  const month = anchor.slice(0, 7);
  const prevMonth = shiftMonth(month, -1);
  return {
    view,
    anchor,
    start: `${month}-01`,
    end: lastDayOfMonth(month),
    prevStart: `${prevMonth}-01`,
    prevEnd: lastDayOfMonth(prevMonth),
    prevAnchor: `${prevMonth}-01`,
    nextAnchor: `${shiftMonth(month, 1)}-01`,
    compare: "poprzedni miesiąc",
  };
}

/** Wszystkie dni od `start` do `end` włącznie (do paska dni w widoku tygodnia i miesiąca). */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
