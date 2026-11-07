// Tablica tras: prognoza dojazdu na planie, punkty poza oknem, problemy tras, sortowanie i ustawienia widoku.
// Czyste funkcje — bez Next/Supabase. Godziny lokalne „HH:MM”.

/** Domyślny wyjazd, gdy trasa nie ma godziny startu. */
export const DEFAULT_DEPARTURE = "06:00";

export type BoardEtaOptions = { firstLegMinutes: number; minutesPerStop: number; earlyMinutes: number };
export const BOARD_ETA: BoardEtaOptions = { firstLegMinutes: 35, minutesPerStop: 24, earlyMinutes: 15 };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (m: number) => {
  const x = Math.max(0, Math.min(Math.round(m), 24 * 60 - 1));
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

export type EtaStop = {
  id: string;
  sequence: number;
  status: string;
  windowStart: string | null;
  windowEnd: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
};

/** Punkt zakończony (dostarczony albo z wyjątkiem) — nie ma już prognozy. */
export function isStopDone(status: string): boolean {
  return ["delivered", "partial", "complaint", "refused", "absent", "skipped"].includes(status);
}

/**
 * Prognoza dojazdu do punktów trasy (bez map: stały czas pierwszego odcinka i „dojazd + rozładunek” na punkt).
 * Kierowca nie jest wcześniej niż kwadrans przed oknem. Po zrealizowanym punkcie liczymy od jego godziny.
 * `now` (dzisiaj) przesuwa prognozę, gdy trasa jest opóźniona; dla innych dni null.
 */
export function planEtas(
  departure: string | null,
  stops: EtaStop[],
  now: string | null = null,
  opts: BoardEtaOptions = BOARD_ETA,
): Map<string, string> {
  const etas = new Map<string, string>();
  const sorted = [...stops].sort((a, b) => a.sequence - b.sequence);
  let next = toMin(departure ?? DEFAULT_DEPARTURE) + opts.firstLegMinutes;
  if (now && !sorted.some((s) => isStopDone(s.status) || s.arrivedAt)) next = Math.max(next, toMin(now) + opts.firstLegMinutes);
  for (const s of sorted) {
    if (isStopDone(s.status)) {
      const at = s.completedAt ?? s.arrivedAt;
      if (at) {
        etas.set(s.id, at);
        next = toMin(at) + opts.minutesPerStop;
      } else {
        next += opts.minutesPerStop;
      }
      continue;
    }
    let eta = now ? Math.max(next, toMin(now)) : next;
    if (s.windowStart) eta = Math.max(eta, toMin(s.windowStart) - opts.earlyMinutes);
    etas.set(s.id, toHHMM(eta));
    next = eta + opts.minutesPerStop;
  }
  return etas;
}

/** Czy dojazd wypada po zamknięciu okna (dla zrealizowanych — czy zrealizowano po oknie). */
export function outsideWindow(windowEnd: string | null, eta: string | undefined): boolean {
  return Boolean(windowEnd && eta && eta > windowEnd);
}

export type BoardRouteLike = {
  name: string;
  status: string;
  plannedStart: string | null;
  stopsCount: number;
  outOfWindow: number;
  overloaded: boolean;
  missingResource: boolean;
  maxLoadPct: number;
};

/** Trasa „z problemami”: przeciążenie, brak auta / kierowcy albo punkty poza oknem. */
export function hasProblems(r: Pick<BoardRouteLike, "outOfWindow" | "overloaded" | "missingResource">): boolean {
  return r.overloaded || r.missingResource || r.outOfWindow > 0;
}

export type RouteSort = "name" | "stops" | "load" | "departure" | "problems";
export const ROUTE_SORT_LABELS: Record<RouteSort, string> = {
  name: "Nazwa trasy",
  stops: "Liczba punktów",
  load: "Obciążenie",
  departure: "Godzina wyjazdu",
  problems: "Najpierw problemy",
};

export function sortRoutes<T extends BoardRouteLike>(routes: T[], by: RouteSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "pl", { numeric: true });
  const cmp: Record<RouteSort, (a: T, b: T) => number> = {
    name: byName,
    stops: (a, b) => b.stopsCount - a.stopsCount || byName(a, b),
    load: (a, b) => b.maxLoadPct - a.maxLoadPct || byName(a, b),
    departure: (a, b) => (a.plannedStart ?? "99").localeCompare(b.plannedStart ?? "99") || byName(a, b),
    problems: (a, b) => Number(hasProblems(b)) - Number(hasProblems(a)) || b.outOfWindow - a.outOfWindow || byName(a, b),
  };
  return [...routes].sort(cmp[by]);
}

export type RouteFilter = "all" | "problems" | "draft" | "ready" | "on_road" | "done";
export const ROUTE_FILTER_LABELS: Record<RouteFilter, string> = {
  all: "Wszystkie trasy",
  problems: "Tylko z problemami",
  draft: "Szkice",
  ready: "Gotowe do załadunku",
  on_road: "W realizacji",
  done: "Zakończone",
};

export function matchesFilter(r: BoardRouteLike, f: RouteFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "problems":
      return hasProblems(r);
    case "draft":
      return r.status === "draft";
    case "ready":
      return r.status === "planned";
    case "on_road":
      return r.status === "in_progress" || r.status === "dispatched";
    case "done":
      return r.status === "completed" || r.status === "closed";
  }
}

/** Ustawienia widoku tablicy — zapamiętywane w przeglądarce dyspozytora. */
export type BoardView = {
  layout: "panels" | "columns";
  panels: "auto" | 2 | 3 | 4;
  density: "comfortable" | "compact";
  show: {
    seq: boolean;
    address: boolean;
    window: boolean;
    eta: boolean;
    load: boolean;
    phone: boolean;
    driverPhone: boolean;
  };
};

export const DEFAULT_BOARD_VIEW: BoardView = {
  layout: "panels",
  panels: "auto",
  density: "comfortable",
  show: { seq: true, address: true, window: true, eta: true, load: false, phone: true, driverPhone: true },
};

/** Odczyt zapisanych ustawień z tolerancją na stare / uszkodzone dane. */
export function parseBoardView(raw: unknown): BoardView {
  if (!raw || typeof raw !== "object") return DEFAULT_BOARD_VIEW;
  const r = raw as Partial<BoardView>;
  const show = { ...DEFAULT_BOARD_VIEW.show };
  if (r.show && typeof r.show === "object") {
    for (const k of Object.keys(show) as (keyof BoardView["show"])[]) {
      const v = (r.show as Record<string, unknown>)[k];
      if (typeof v === "boolean") show[k] = v;
    }
  }
  return {
    layout: r.layout === "columns" ? "columns" : "panels",
    panels: r.panels === 2 || r.panels === 3 || r.panels === 4 ? r.panels : "auto",
    density: r.density === "compact" ? "compact" : "comfortable",
    show,
  };
}

/** Liczba paneli „auto” wg szerokości ekranu (px). */
export function autoPanels(width: number): number {
  if (width >= 2300) return 4;
  if (width >= 1700) return 3;
  if (width >= 1100) return 2;
  return 1;
}

/** Podział tras na panele po kolei (pierwszy panel dostaje pierwsze trasy). */
export function splitIntoPanels<T>(items: T[], panels: number): T[][] {
  const n = Math.max(1, panels);
  const size = Math.ceil(items.length / n) || 1;
  return Array.from({ length: n }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/** Docelowe miejsce punktu po upuszczeniu: ile kroków w górę (−) / w dół (+). */
export function moveDelta(fromIndex: number, toIndex: number): number {
  return toIndex - fromIndex;
}
