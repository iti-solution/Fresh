// Zestawienia BOK / dyspozytora / zarządu — czyste funkcje (bez Next/Supabase), testowane jednostkowo.
// Czas: wszystkie godziny jako lokalne „HH:MM” (Europe/Warsaw) — porównanie tekstowe działa poprawnie.
import { isFinished, type StopStatus } from "@/modules/execution/domain/execution";

export type ReportStop = {
  id: string;
  routeId: string;
  sequence: number;
  status: StopStatus;
  customerId: string | null;
  customer: string;
  customerCode: string | null;
  branch: string;
  city: string;
  phone: string | null;
  salesRep: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  orderRefs: string[];
  valueGrosze: number;
  codGrosze: number;
  crates: number;
  kg: number;
  reason: string | null;
  note: string | null;
};

export type ReportRoute = {
  id: string;
  date: string;
  name: string;
  kind: string;
  status: string;
  courseNo: number;
  plannedStart: string | null;
  driver: string | null;
  driverPhone: string | null;
  vehicle: string | null;
  km: number | null;
  costPerKmGrosze: number;
  driverCostPerDayGrosze: number;
  fixedCostPerDayGrosze: number;
  stops: ReportStop[];
};

export type Timeliness = "on_time" | "late" | "overdue" | "at_risk" | "waiting" | "no_window";

export const TIMELINESS_LABELS: Record<Timeliness, string> = {
  on_time: "w oknie",
  late: "po oknie",
  overdue: "spóźniona",
  at_risk: "zagrożona",
  waiting: "w planie",
  no_window: "bez okna",
};

export const EXCEPTION_STATUSES: StopStatus[] = ["complaint", "refused", "absent"];

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Ile minut od a do b (b − a). */
export function minutesBetween(a: string, b: string): number {
  return toMin(b) - toMin(a);
}

/** Bieżący czas do porównań dla danego dnia: dziś → godzina, przeszłość → null (dzień zamknięty), przyszłość → „00:00”. */
export function nowForDay(day: string, today: string, nowHHMM: string): string | null {
  if (day < today) return null;
  if (day > today) return "00:00";
  return nowHHMM;
}

/** Terminowość punktu względem okna przyjęć. `now` = null oznacza dzień miniony. */
export function stopTimeliness(s: Pick<ReportStop, "status" | "windowEnd" | "completedAt">, now: string | null): Timeliness {
  if (isFinished(s.status)) {
    if (!s.windowEnd || !s.completedAt) return "no_window";
    return s.completedAt <= s.windowEnd ? "on_time" : "late";
  }
  if (!s.windowEnd) return "waiting";
  if (now === null || now > s.windowEnd) return "overdue";
  return minutesBetween(now, s.windowEnd) <= 30 ? "at_risk" : "waiting";
}

export type RouteState = "not_started" | "in_progress" | "done" | "closed" | "draft";

export function routeState(status: string): RouteState {
  if (status === "closed") return "closed";
  if (status === "completed") return "done";
  if (status === "in_progress") return "in_progress";
  if (status === "draft") return "draft";
  return "not_started";
}

export const ROUTE_STATE_LABELS: Record<RouteState, string> = {
  draft: "szkic",
  not_started: "nie wyjechała",
  in_progress: "w trasie",
  done: "do zamknięcia",
  closed: "zamknięta",
};

export type RouteProgress = {
  total: number;
  finished: number;
  pct: number;
  delivered: number;
  exceptions: number;
  late: number;
  overdue: number;
  atRisk: number;
  current: ReportStop | null;
  next: ReportStop | null;
  lastCompletedAt: string | null;
  state: RouteState;
  /** Trasa powinna już jechać, a nie ruszyła (dziś, 15 min po planowanym starcie). */
  startOverdue: boolean;
};

export function routeProgress(r: ReportRoute, now: string | null): RouteProgress {
  const stops = [...r.stops].sort((a, b) => a.sequence - b.sequence);
  const t = stops.map((s) => stopTimeliness(s, now));
  const finished = stops.filter((s) => isFinished(s.status));
  const state = routeState(r.status);
  const completedTimes = finished
    .map((s) => s.completedAt)
    .filter((x): x is string => Boolean(x))
    .sort();
  return {
    total: stops.length,
    finished: finished.length,
    pct: stops.length ? Math.round((finished.length / stops.length) * 100) : 0,
    delivered: stops.filter((s) => s.status === "delivered" || s.status === "partial").length,
    exceptions: stops.filter((s) => EXCEPTION_STATUSES.includes(s.status)).length,
    late: t.filter((x) => x === "late").length,
    overdue: t.filter((x) => x === "overdue").length,
    atRisk: t.filter((x) => x === "at_risk").length,
    current: stops.find((s) => s.status === "in_progress" || s.status === "arrived") ?? null,
    next: stops.find((s) => !isFinished(s.status)) ?? null,
    lastCompletedAt: completedTimes.at(-1) ?? null,
    state,
    startOverdue:
      (state === "not_started" || state === "draft") &&
      now !== null &&
      now !== "00:00" &&
      r.plannedStart !== null &&
      minutesBetween(r.plannedStart, now) > 15,
  };
}

export type Alert = {
  severity: "danger" | "warn" | "info";
  title: string;
  detail: string;
  routeId: string;
  stopId?: string;
};

/** Alerty centrum operacyjnego, od najpilniejszych. */
export function dispatcherAlerts(routes: ReportRoute[], now: string | null): Alert[] {
  const out: Alert[] = [];
  for (const r of routes) {
    const p = routeProgress(r, now);
    const who = [r.driver, r.vehicle].filter(Boolean).join(" · ");
    if (p.startOverdue) {
      out.push({
        severity: "danger",
        title: `${r.name}: trasa nie wyjechała`,
        detail: `Planowany start ${r.plannedStart}${who ? ` · ${who}` : ""}`,
        routeId: r.id,
      });
    }
    for (const s of r.stops) {
      const tl = stopTimeliness(s, now);
      if (tl === "overdue" && p.state !== "not_started" && p.state !== "draft") {
        out.push({
          severity: "danger",
          title: `${s.customer}: minęło okno ${s.windowStart ?? ""}–${s.windowEnd}`,
          detail: `${r.name} · punkt ${s.sequence} z ${p.total}${r.driverPhone ? ` · kierowca ${r.driverPhone}` : ""}`,
          routeId: r.id,
          stopId: s.id,
        });
      } else if (tl === "at_risk") {
        out.push({
          severity: "warn",
          title: `${s.customer}: okno kończy się o ${s.windowEnd}`,
          detail: `${r.name} · punkt ${s.sequence} z ${p.total}`,
          routeId: r.id,
          stopId: s.id,
        });
      }
      if (EXCEPTION_STATUSES.includes(s.status)) {
        const label = s.status === "complaint" ? "reklamacja" : s.status === "refused" ? "odmowa przyjęcia" : "brak odbioru";
        out.push({
          severity: "warn",
          title: `${s.customer}: ${label}`,
          detail: `${r.name}${s.completedAt ? ` · ${s.completedAt}` : ""}${s.reason ? ` · ${s.reason}` : ""}`,
          routeId: r.id,
          stopId: s.id,
        });
      }
    }
    if (p.state === "done") {
      out.push({
        severity: "info",
        title: `${r.name}: wróciła — do zamknięcia`,
        detail: `Przyjmij gotówkę i opakowania${who ? ` · ${who}` : ""}`,
        routeId: r.id,
      });
    }
  }
  const rank = { danger: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export type DayKpis = {
  routes: number;
  extraCourses: number;
  stops: number;
  finished: number;
  delivered: number;
  partial: number;
  complaints: number;
  refused: number;
  absent: number;
  exceptions: number;
  onTime: number;
  withWindow: number;
  /** Terminowość w % zrealizowanych punktów z oknem; null gdy brak danych. */
  onTimePct: number | null;
  plannedValueGrosze: number;
  deliveredValueGrosze: number;
  km: number;
  costGrosze: number;
};

const DELIVERED: StopStatus[] = ["delivered", "partial", "complaint"];

/** Koszt trasy w groszach: km × stawka + dzień kierowcy + koszt stały auta. */
export function routeCostGrosze(
  r: Pick<ReportRoute, "km" | "costPerKmGrosze" | "driverCostPerDayGrosze" | "fixedCostPerDayGrosze">,
): number {
  return Math.round((r.km ?? 0) * r.costPerKmGrosze) + r.driverCostPerDayGrosze + r.fixedCostPerDayGrosze;
}

export function dayKpis(routes: ReportRoute[]): DayKpis {
  const k: DayKpis = {
    routes: routes.length,
    extraCourses: routes.filter((r) => r.kind !== "regular").length,
    stops: 0,
    finished: 0,
    delivered: 0,
    partial: 0,
    complaints: 0,
    refused: 0,
    absent: 0,
    exceptions: 0,
    onTime: 0,
    withWindow: 0,
    onTimePct: null,
    plannedValueGrosze: 0,
    deliveredValueGrosze: 0,
    km: 0,
    costGrosze: 0,
  };
  for (const r of routes) {
    k.km += r.km ?? 0;
    if (r.km !== null) k.costGrosze += routeCostGrosze(r);
    for (const s of r.stops) {
      k.stops += 1;
      k.plannedValueGrosze += s.valueGrosze;
      if (!isFinished(s.status)) continue;
      k.finished += 1;
      if (s.status === "delivered") k.delivered += 1;
      if (s.status === "partial") k.partial += 1;
      if (s.status === "complaint") k.complaints += 1;
      if (s.status === "refused") k.refused += 1;
      if (s.status === "absent") k.absent += 1;
      if (DELIVERED.includes(s.status)) k.deliveredValueGrosze += s.valueGrosze;
      const tl = stopTimeliness(s, null);
      if (tl === "on_time" || tl === "late") {
        k.withWindow += 1;
        if (tl === "on_time") k.onTime += 1;
      }
    }
  }
  k.exceptions = k.complaints + k.refused + k.absent;
  k.onTimePct = k.withWindow ? Math.round((k.onTime / k.withWindow) * 1000) / 10 : null;
  return k;
}

/** Zmiana procentowa (zaokrąglona do 0,1). null gdy brak bazy porównania. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Suma KPI z wielu dni (terminowość liczona ważona punktami, nie średnia z procentów). */
export function sumKpis(days: DayKpis[]): DayKpis {
  const total = dayKpis([]);
  for (const d of days) {
    for (const key of Object.keys(total) as (keyof DayKpis)[]) {
      if (key === "onTimePct") continue;
      (total[key] as number) += d[key] as number;
    }
  }
  total.onTimePct = total.withWindow ? Math.round((total.onTime / total.withWindow) * 1000) / 10 : null;
  return total;
}

export type CustomerRank = { customerId: string; customer: string; valueGrosze: number; stops: number; exceptions: number };

export function topCustomers(routes: ReportRoute[], limit = 5): CustomerRank[] {
  const map = new Map<string, CustomerRank>();
  for (const s of routes.flatMap((r) => r.stops)) {
    if (!s.customerId || !isFinished(s.status)) continue;
    const row = map.get(s.customerId) ?? {
      customerId: s.customerId,
      customer: s.customer,
      valueGrosze: 0,
      stops: 0,
      exceptions: 0,
    };
    row.stops += 1;
    if (DELIVERED.includes(s.status)) row.valueGrosze += s.valueGrosze;
    if (EXCEPTION_STATUSES.includes(s.status)) row.exceptions += 1;
    map.set(s.customerId, row);
  }
  return [...map.values()].sort((a, b) => b.valueGrosze - a.valueGrosze).slice(0, limit);
}

/** Tekst do wyszukiwania BOK: małe litery, bez polskich znaków. */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Czy punkt pasuje do zapytania BOK (klient, kod, oddział, miasto, telefon, nr zamówienia, kierowca, trasa). */
export function matchesQuery(s: ReportStop, r: Pick<ReportRoute, "name" | "driver" | "vehicle">, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const hay = normalizeSearch(
    [s.customer, s.customerCode, s.branch, s.city, s.orderRefs.join(" "), r.name, r.driver, r.vehicle].filter(Boolean).join(" "),
  );
  if (q.split(" ").every((part) => hay.includes(part))) return true;
  return digits.length >= 6 && (s.phone ?? "").replace(/\D/g, "").includes(digits);
}

export type BalanceRow = {
  partyType: "customer" | "driver" | "depot" | "carrier";
  partyId: string;
  typeCode: string;
  balance: number;
  depositGrosze: number;
};

export type PackagingSummary = {
  /** Saldo opakowań u klientów (dodatnie = klient ma nasze opakowania). */
  atCustomers: { typeCode: string; qty: number; depositGrosze: number }[];
  customersOwing: { partyId: string; byType: Record<string, number>; depositGrosze: number }[];
  /** Kierowcy z niezerowym saldem: dodatnie = ma do zdania, ujemne = brak (różnica). */
  drivers: { partyId: string; byType: Record<string, number> }[];
};

export function packagingSummary(rows: BalanceRow[]): PackagingSummary {
  const types = new Map<string, { qty: number; depositGrosze: number }>();
  const customers = new Map<string, { partyId: string; byType: Record<string, number>; depositGrosze: number }>();
  const drivers = new Map<string, { partyId: string; byType: Record<string, number> }>();
  for (const r of rows) {
    if (r.balance === 0) continue;
    if (r.partyType === "customer" && r.balance > 0) {
      const t = types.get(r.typeCode) ?? { qty: 0, depositGrosze: 0 };
      t.qty += r.balance;
      t.depositGrosze += r.balance * r.depositGrosze;
      types.set(r.typeCode, t);
      const c = customers.get(r.partyId) ?? { partyId: r.partyId, byType: {}, depositGrosze: 0 };
      c.byType[r.typeCode] = (c.byType[r.typeCode] ?? 0) + r.balance;
      c.depositGrosze += r.balance * r.depositGrosze;
      customers.set(r.partyId, c);
    }
    if (r.partyType === "driver") {
      const d = drivers.get(r.partyId) ?? { partyId: r.partyId, byType: {} };
      d.byType[r.typeCode] = (d.byType[r.typeCode] ?? 0) + r.balance;
      drivers.set(r.partyId, d);
    }
  }
  return {
    atCustomers: [...types.entries()]
      .map(([typeCode, v]) => ({ typeCode, ...v }))
      .sort((a, b) => b.depositGrosze - a.depositGrosze),
    customersOwing: [...customers.values()].sort((a, b) => b.depositGrosze - a.depositGrosze),
    drivers: [...drivers.values()].filter((d) => Object.values(d.byType).some((x) => x !== 0)),
  };
}
