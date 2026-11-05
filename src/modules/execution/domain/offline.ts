// Aplikacja kierowcy offline (M4.2): migawka trasy w telefonie + zdarzenia z client_event_id.
// Te same funkcje liczą stan na telefonie (bez sieci) i są podstawą walidacji na serwerze.
import {
  EXCEPTION_STATUSES,
  isFinished,
  parseOdometer,
  QUICK_STATUSES,
  validateOdometerEnd,
  type ExceptionStatus,
  type QuickStatus,
  type StopStatus,
} from "./execution";

export type SnapshotOrder = {
  id: string;
  ref: string | null;
  crates: number;
  pallets: number;
  weight_kg: number;
  cod: number | null; // zł
  notes_sales: string | null;
  notes_logistics: string | null;
};

export type SnapshotStop = {
  id: string;
  sequence: number;
  status: StopStatus;
  customer: string;
  customerCode: string | null;
  salesRep: string | null;
  salesRepPhone: string | null;
  branch: string;
  pointType: string | null;
  temporary: boolean;
  address: string;
  phone: string | null;
  siteManager: string | null;
  siteManagerPhone: string | null;
  window: string;
  windowEnd: string | null;
  call: string | null;
  access: string | null;
  floor: string | null;
  unloading: string | null;
  other: string | null;
  notes: string[];
  orders: SnapshotOrder[];
  completedAt: string | null; // HH:MM czasu lokalnego
  /** Zapisane opakowania (absolutne wartości dla punktu): typ → wydano/zwrot. */
  packaging: Record<string, { out: number; back: number }>;
  cashGrosze: number;
  photos: number;
  signed: boolean;
  /** Saldo opakowań u klienta przed tą wizytą (podpowiedź, ile odebrać): typ → ilość. */
  customerBalance?: Record<string, number>;
};

export type PayLine = { label: string; amountGrosze: number };
export type PayPreview = { todayGrosze: number; monthGrosze: number; lines: PayLine[]; ruleName: string | null };

export type RouteSnapshot = {
  id: string;
  name: string;
  date: string;
  status: string; // planned | dispatched | in_progress | completed | closed
  vehicleId: string | null;
  vehicle: string | null;
  odometerStart: number | null;
  odometerEnd: number | null;
  stops: SnapshotStop[];
  packagingTypes: { id: string; code: string; name: string }[];
  vehicles: { id: string; registration: string }[];
  pay: PayPreview | null;
  fetchedAt: string; // ISO — kiedy migawka przyszła z serwera
};

export type GeoPoint = { lat: number; lng: number; accuracy: number | null };

type Base = { client_event_id: string; route_id: string; occurred_at: string; location?: GeoPoint | null };

export type DriverEvent =
  | (Base & { type: "route_started"; odometer_start: number; vehicle_id: string | null })
  | (Base & { type: "stop_quick"; stop_id: string; status: QuickStatus })
  | (Base & {
      type: "stop_saved";
      stop_id: string;
      outcome: "keep" | "delivered" | "partial" | ExceptionStatus;
      reason: string;
      comment: string;
      return_text: string;
      packaging: { typeId: string; out: number; back: number }[];
      cash_grosze: number | null; // null = bez zmiany
      photos: number;
      signature: boolean;
    })
  | (Base & { type: "problem_reported"; stop_id: string | null; kind: "problem" | "delay"; text: string; photos: number })
  | (Base & { type: "route_finished"; odometer_end: number });

export type DriverEventType = DriverEvent["type"];

/** Treść zdarzenia bez pól technicznych (rozdzielnie dla każdego typu). */
export type EventInput = DriverEvent extends infer E
  ? E extends DriverEvent
    ? Omit<E, "client_event_id" | "route_id" | "occurred_at" | "location">
    : never
  : never;

/** Status punktu po wyniku z ekranu punktu (null = bez zmiany). */
export function outcomeStopStatus(outcome: string): StopStatus | null {
  if (outcome === "delivered") return QUICK_STATUSES.done.stop;
  if (outcome === "partial") return QUICK_STATUSES.partial.stop;
  if (outcome in EXCEPTION_STATUSES) return EXCEPTION_STATUSES[outcome as ExceptionStatus].stop;
  return null;
}

/** Walidacja zdarzenia względem stanu trasy (telefon przed zapisem, serwer przed przyjęciem). null = OK. */
export function validateEvent(s: Pick<RouteSnapshot, "status" | "odometerStart" | "stops">, e: DriverEvent): string | null {
  const stopExists = (id: string | null) => id === null || s.stops.some((x) => x.id === id);
  switch (e.type) {
    case "route_started":
      if (!["planned", "dispatched"].includes(s.status)) return "Tej trasy nie można teraz rozpocząć.";
      if (parseOdometer(e.odometer_start) === null) return "Wpisz stan licznika (same cyfry).";
      return null;
    case "stop_quick":
      if (s.status !== "in_progress") return "Najpierw rozpocznij trasę.";
      if (!(e.status in QUICK_STATUSES)) return "Nieznany status.";
      return stopExists(e.stop_id) ? null : "Ten punkt został przeniesiony przez dyspozytora.";
    case "stop_saved": {
      if (s.status !== "in_progress") return "Najpierw rozpocznij trasę.";
      if (!stopExists(e.stop_id)) return "Ten punkt został przeniesiony przez dyspozytora.";
      const ex = EXCEPTION_STATUSES[e.outcome as ExceptionStatus];
      if (ex?.needsReason && e.reason.trim().length < 3) return "Dla reklamacji i odmowy podaj przyczynę.";
      if (
        e.packaging.some(
          (p) =>
            !Number.isInteger(p.out) || !Number.isInteger(p.back) || p.out < 0 || p.back < 0 || p.out > 10000 || p.back > 10000,
        )
      )
        return "Popraw liczby opakowań.";
      if (e.cash_grosze !== null && (!Number.isInteger(e.cash_grosze) || e.cash_grosze < 0 || e.cash_grosze > 100_000_000))
        return "Popraw kwotę.";
      return null;
    }
    case "problem_reported":
      if (e.text.trim().length < 3 && e.photos === 0) return "Opisz problem albo dodaj zdjęcie.";
      return stopExists(e.stop_id) ? null : "Ten punkt został przeniesiony przez dyspozytora.";
    case "route_finished":
      if (s.status !== "in_progress") return "Trasa nie jest w realizacji.";
      return validateOdometerEnd(s.odometerStart, parseOdometer(e.odometer_end));
  }
}

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );

function setStopStatus(stops: SnapshotStop[], stopId: string, status: StopStatus, at: string): SnapshotStop[] {
  return stops.map((x) => {
    if (x.id === stopId) return { ...x, status, completedAt: isFinished(status) ? hhmm(at) : null };
    // „Teraz realizuję” tylko na jednym punkcie naraz
    if (status === "in_progress" && x.status === "in_progress") return { ...x, status: "pending" };
    return x;
  });
}

/** Stan trasy po zdarzeniu — ta sama logika co na serwerze (bez sieci). Zdarzenie niepoprawne nie zmienia stanu. */
export function applyEvent(s: RouteSnapshot, e: DriverEvent): RouteSnapshot {
  if (validateEvent(s, e)) return s;
  switch (e.type) {
    case "route_started":
      return {
        ...s,
        status: "in_progress",
        odometerStart: e.odometer_start,
        vehicleId: e.vehicle_id ?? s.vehicleId,
        vehicle: s.vehicles.find((v) => v.id === e.vehicle_id)?.registration ?? s.vehicle,
      };
    case "stop_quick":
      return { ...s, stops: setStopStatus(s.stops, e.stop_id, QUICK_STATUSES[e.status].stop, e.occurred_at) };
    case "stop_saved": {
      const next = outcomeStopStatus(e.outcome);
      let stops = next ? setStopStatus(s.stops, e.stop_id, next, e.occurred_at) : s.stops;
      stops = stops.map((x) =>
        x.id === e.stop_id
          ? {
              ...x,
              packaging: Object.fromEntries(
                s.packagingTypes.map((t) => {
                  const p = e.packaging.find((q) => q.typeId === t.id);
                  return [t.id, { out: p?.out ?? 0, back: p?.back ?? 0 }];
                }),
              ),
              cashGrosze: e.cash_grosze ?? x.cashGrosze,
              photos: x.photos + e.photos,
              signed: x.signed || e.signature,
            }
          : x,
      );
      return { ...s, stops };
    }
    case "problem_reported":
      return e.stop_id
        ? { ...s, stops: s.stops.map((x) => (x.id === e.stop_id ? { ...x, photos: x.photos + e.photos } : x)) }
        : s;
    case "route_finished":
      return { ...s, status: "completed", odometerEnd: e.odometer_end };
  }
}

/** Migawka z serwera + zdarzenia jeszcze niewysłane = to, co widzi kierowca. */
export function replay(s: RouteSnapshot, pending: DriverEvent[]): RouteSnapshot {
  return [...pending].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).reduce(applyEvent, s);
}

/** Postęp trasy do paska w nagłówku. */
export function progress(s: Pick<RouteSnapshot, "stops">) {
  const finished = s.stops.filter((x) => isFinished(x.status)).length;
  return { finished, total: s.stops.length, pct: s.stops.length ? Math.round((finished / s.stops.length) * 100) : 0 };
}

/** Deterministyczny identyfikator pochodny (np. zapis komentarza z tego samego zdarzenia) — ponowna synchronizacja nie dubluje. */
export function derivedUuid(base: string, suffix: string): string {
  // FNV-1a 128-bit uproszczony do 4 × 32 bit — wystarczy do rozróżnienia pochodnych jednego UUID
  const parts: string[] = [];
  for (let k = 0; k < 4; k++) {
    let h = 0x811c9dc5 ^ (k * 0x9e3779b1);
    for (const ch of `${base}:${suffix}:${k}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    parts.push(h.toString(16).padStart(8, "0"));
  }
  const hex = parts.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kształt zdarzenia z sieci (serwer nie ufa telefonowi). Zwraca zdarzenie albo powód odrzucenia. */
export function parseIncomingEvent(raw: unknown): DriverEvent | string {
  if (!raw || typeof raw !== "object") return "zły format";
  const e = raw as Record<string, unknown>;
  const str = (k: string, max = 500) => (typeof e[k] === "string" ? (e[k] as string).slice(0, max) : "");
  const int = (k: string) => (typeof e[k] === "number" && Number.isInteger(e[k]) ? (e[k] as number) : NaN);
  if (!UUID_RE.test(str("client_event_id"))) return "brak client_event_id";
  if (!UUID_RE.test(str("route_id"))) return "brak trasy";
  const occurred = str("occurred_at", 40);
  if (Number.isNaN(Date.parse(occurred))) return "zła data zdarzenia";
  const loc = e.location as Record<string, unknown> | null | undefined;
  const location =
    loc && typeof loc.lat === "number" && typeof loc.lng === "number" && Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180
      ? { lat: loc.lat, lng: loc.lng, accuracy: typeof loc.accuracy === "number" ? loc.accuracy : null }
      : null;
  const base = {
    client_event_id: str("client_event_id"),
    route_id: str("route_id"),
    occurred_at: new Date(occurred).toISOString(),
    location,
  };
  const stop = str("stop_id");
  switch (e.type) {
    case "route_started":
      return Number.isNaN(int("odometer_start"))
        ? "zły licznik"
        : {
            ...base,
            type: "route_started",
            odometer_start: int("odometer_start"),
            vehicle_id: UUID_RE.test(str("vehicle_id")) ? str("vehicle_id") : null,
          };
    case "stop_quick":
      return UUID_RE.test(stop) && str("status") in QUICK_STATUSES
        ? { ...base, type: "stop_quick", stop_id: stop, status: str("status") as QuickStatus }
        : "zły status";
    case "stop_saved": {
      if (!UUID_RE.test(stop)) return "brak punktu";
      const outcome = str("outcome");
      if (!["keep", "delivered", "partial", ...Object.keys(EXCEPTION_STATUSES)].includes(outcome)) return "zły wynik";
      const pk = Array.isArray(e.packaging) ? e.packaging : [];
      const packaging = pk
        .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
        .map((p) => ({ typeId: String(p.typeId ?? ""), out: Number(p.out ?? 0), back: Number(p.back ?? 0) }))
        .filter((p) => UUID_RE.test(p.typeId));
      const cash = e.cash_grosze === null || e.cash_grosze === undefined ? null : int("cash_grosze");
      return {
        ...base,
        type: "stop_saved",
        stop_id: stop,
        outcome: outcome as "keep",
        reason: str("reason", 300),
        comment: str("comment", 500),
        return_text: str("return_text", 300),
        packaging,
        cash_grosze: cash === null || Number.isNaN(cash) ? null : cash,
        photos: Math.max(0, Math.min(20, int("photos") || 0)),
        signature: e.signature === true,
      };
    }
    case "problem_reported":
      return {
        ...base,
        type: "problem_reported",
        stop_id: UUID_RE.test(stop) ? stop : null,
        kind: e.kind === "delay" ? "delay" : "problem",
        text: str("text", 500),
        photos: Math.max(0, Math.min(20, int("photos") || 0)),
      };
    case "route_finished":
      return Number.isNaN(int("odometer_end"))
        ? "zły licznik"
        : { ...base, type: "route_finished", odometer_end: int("odometer_end") };
    default:
      return "nieznany typ zdarzenia";
  }
}
