// Prognoza dnia: szacowane godziny dojazdu do kolejnych punktów i obraz końca dnia „jeśli wszystko pójdzie wg planu”.
// Czyste funkcje — godziny lokalne „HH:MM”, minuty od północy liczone wewnętrznie.
import { isFinished } from "@/modules/execution/domain/execution";
import { EXCEPTION_STATUSES, routeState, type ReportRoute, type ReportStop } from "./reports";

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (m: number) => {
  const x = Math.max(0, Math.min(m, 24 * 60 - 1));
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(Math.round(x % 60)).padStart(2, "0")}`;
};

export type EtaOptions = {
  /** Domyślny czas „dojazd + rozładunek” na punkt, gdy trasa nie ma jeszcze własnego tempa. */
  minutesPerStop: number;
  /** Od wyjazdu z magazynu do pierwszego punktu. */
  firstLegMinutes: number;
  /** Od ostatniego punktu do powrotu na magazyn. */
  returnMinutes: number;
  /** Ile minut przed otwarciem okna kierowca może już być (dalej czeka). */
  earlyMinutes: number;
};

export const DEFAULT_ETA: EtaOptions = { minutesPerStop: 24, firstLegMinutes: 35, returnMinutes: 40, earlyMinutes: 15 };

export type RouteEta = {
  /** Szacowana godzina dojazdu do każdego niezrealizowanego punktu. */
  etas: Map<string, string>;
  /** Szacowany koniec ostatniego punktu i powrót na magazyn (null gdy nie da się policzyć). */
  lastStopAt: string | null;
  backAt: string | null;
  /** Tempo trasy w minutach na punkt (z dotychczasowej realizacji albo domyślne). */
  pace: number;
};

/**
 * Szacuje dojazdy na trasie. Tempo bierzemy z realizacji (średni odstęp między kolejnymi potwierdzeniami),
 * a gdy jest za mało danych — wartość domyślną. Kierowca nie dojeżdża wcześniej niż kwadrans przed oknem.
 * `now` = null oznacza dzień miniony (brak prognozy dla niezrealizowanych punktów).
 */
export function estimateRoute(route: ReportRoute, now: string | null, opts: EtaOptions = DEFAULT_ETA): RouteEta {
  const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const done = stops.filter((s) => isFinished(s.status) && s.completedAt).map((s) => toMin(s.completedAt!));
  const sortedDone = [...done].sort((a, b) => a - b);
  let pace = opts.minutesPerStop;
  if (sortedDone.length >= 3) {
    const gaps = sortedDone.slice(1).map((t, i) => t - sortedDone[i]);
    pace = Math.max(10, Math.min(60, gaps.reduce((a, g) => a + g, 0) / gaps.length));
  }
  const etas = new Map<string, string>();
  const pending = stops.filter((s) => !isFinished(s.status));
  if (now === null) {
    const last = sortedDone.at(-1);
    return { etas, lastStopAt: pending.length === 0 && last !== undefined ? toHHMM(last) : null, backAt: null, pace };
  }
  const nowMin = toMin(now);
  const state = routeState(route.status);
  const start = route.plannedStart ? toMin(route.plannedStart) : nowMin;
  const lastDone = sortedDone.at(-1);
  // „next” = najwcześniejszy moment dojazdu do kolejnego punktu
  let next =
    state === "not_started" || state === "draft"
      ? Math.max(start, nowMin) + opts.firstLegMinutes
      : Math.max((lastDone ?? start + opts.firstLegMinutes - pace) + pace, nowMin);
  let lastEta: number | undefined;
  for (const s of pending) {
    if (s.status === "in_progress" || s.status === "arrived") {
      etas.set(s.id, toHHMM(s.arrivedAt ? Math.min(toMin(s.arrivedAt), nowMin) : nowMin));
      lastEta = nowMin;
      next = nowMin + 8 + pace; // kończy rozładunek i jedzie dalej
      continue;
    }
    let eta = next;
    if (s.windowStart) eta = Math.max(eta, toMin(s.windowStart) - opts.earlyMinutes);
    etas.set(s.id, toHHMM(eta));
    lastEta = eta;
    next = eta + pace;
  }
  const lastStop = pending.length ? lastEta : lastDone;
  return {
    etas,
    lastStopAt: lastStop !== undefined ? toHHMM(lastStop) : null,
    backAt: lastStop !== undefined ? toHHMM(lastStop + opts.returnMinutes) : null,
    pace: Math.round(pace),
  };
}

/** Czy prognozowany dojazd zmieści się w oknie punktu. */
export function etaFitsWindow(s: Pick<ReportStop, "windowEnd">, eta: string | undefined): boolean | null {
  if (!eta || !s.windowEnd) return null;
  return eta <= s.windowEnd;
}

export type RouteForecast = {
  routeId: string;
  plannedStops: number;
  doneStops: number;
  remainingStops: number;
  plannedValueGrosze: number;
  deliveredValueGrosze: number;
  remainingValueGrosze: number;
  lostValueGrosze: number;
  onTimeSoFar: number;
  lateSoFar: number;
  forecastLate: number;
  lastStopAt: string | null;
  backAt: string | null;
};

export type DayForecast = {
  routes: RouteForecast[];
  plannedStops: number;
  doneStops: number;
  remainingStops: number;
  plannedValueGrosze: number;
  deliveredValueGrosze: number;
  remainingValueGrosze: number;
  /** Wartość, która nie dojedzie: odmowy i brak odbioru (już zarejestrowane). */
  lostValueGrosze: number;
  /** Sprzedaż na koniec dnia, jeśli pozostałe punkty zostaną dostarczone. */
  forecastValueGrosze: number;
  /** Terminowość na koniec dnia: dotychczasowa + prognoza dla pozostałych punktów. */
  forecastOnTimePct: number | null;
  currentOnTimePct: number | null;
  forecastLate: number;
  /** Ostatni powrót na magazyn. */
  lastBackAt: string | null;
  routesNotStarted: number;
  routesOnRoad: number;
  routesDone: number;
};

const DELIVERED = new Set(["delivered", "partial", "complaint"]);

export function dayForecast(routes: ReportRoute[], now: string | null, opts: EtaOptions = DEFAULT_ETA): DayForecast {
  const per: RouteForecast[] = routes.map((r) => {
    const eta = estimateRoute(r, now, opts);
    let onTime = 0;
    let late = 0;
    let forecastLate = 0;
    let delivered = 0;
    let remaining = 0;
    let lost = 0;
    for (const s of r.stops) {
      if (isFinished(s.status)) {
        if (DELIVERED.has(s.status)) delivered += s.valueGrosze;
        else lost += s.valueGrosze;
        if (s.windowEnd && s.completedAt) {
          if (s.completedAt <= s.windowEnd) onTime += 1;
          else late += 1;
        }
      } else {
        remaining += s.valueGrosze;
        if (etaFitsWindow(s, eta.etas.get(s.id)) === false) forecastLate += 1;
      }
    }
    const done = r.stops.filter((s) => isFinished(s.status)).length;
    return {
      routeId: r.id,
      plannedStops: r.stops.length,
      doneStops: done,
      remainingStops: r.stops.length - done,
      plannedValueGrosze: r.stops.reduce((a, s) => a + s.valueGrosze, 0),
      deliveredValueGrosze: delivered,
      remainingValueGrosze: remaining,
      lostValueGrosze: lost,
      onTimeSoFar: onTime,
      lateSoFar: late,
      forecastLate,
      lastStopAt: eta.lastStopAt,
      backAt: eta.backAt,
    };
  });
  const sum = (k: keyof RouteForecast) => per.reduce((a, r) => a + (r[k] as number), 0);
  const withWindowPending = routes.flatMap((r) => r.stops).filter((s) => !isFinished(s.status) && s.windowEnd).length;
  const onTime = sum("onTimeSoFar");
  const late = sum("lateSoFar");
  const fLate = sum("forecastLate");
  const finishedWithWindow = onTime + late;
  const backs = per
    .map((r) => r.backAt)
    .filter((x): x is string => Boolean(x))
    .sort();
  const states = routes.map((r) => routeState(r.status));
  return {
    routes: per,
    plannedStops: sum("plannedStops"),
    doneStops: sum("doneStops"),
    remainingStops: sum("remainingStops"),
    plannedValueGrosze: sum("plannedValueGrosze"),
    deliveredValueGrosze: sum("deliveredValueGrosze"),
    remainingValueGrosze: sum("remainingValueGrosze"),
    lostValueGrosze: sum("lostValueGrosze"),
    forecastValueGrosze: sum("deliveredValueGrosze") + sum("remainingValueGrosze"),
    currentOnTimePct: finishedWithWindow ? Math.round((onTime / finishedWithWindow) * 1000) / 10 : null,
    forecastOnTimePct:
      finishedWithWindow + withWindowPending
        ? Math.round(((onTime + withWindowPending - fLate) / (finishedWithWindow + withWindowPending)) * 1000) / 10
        : null,
    forecastLate: fLate,
    lastBackAt: backs.at(-1) ?? null,
    routesNotStarted: states.filter((s) => s === "not_started" || s === "draft").length,
    routesOnRoad: states.filter((s) => s === "in_progress").length,
    routesDone: states.filter((s) => s === "done" || s === "closed").length,
  };
}

/** Pozycja kierowcy na trasie w zdaniu dla BOK: gdzie jest i ile punktów przed danym klientem. */
export function driverPosition(route: ReportRoute): {
  at: ReportStop | null;
  lastDone: ReportStop | null;
  remaining: ReportStop[];
} {
  const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const at = stops.find((s) => s.status === "in_progress" || s.status === "arrived") ?? null;
  const done = stops
    .filter((s) => isFinished(s.status) && s.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? -1 : 1));
  return { at, lastDone: done.at(-1) ?? null, remaining: stops.filter((s) => !isFinished(s.status)) };
}

export const isException = (s: Pick<ReportStop, "status">) => EXCEPTION_STATUSES.includes(s.status);
