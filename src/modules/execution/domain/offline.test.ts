import { describe, expect, it } from "vitest";
import { applyEvent, derivedUuid, parseIncomingEvent, progress, replay, UUID_RE, validateEvent, type DriverEvent, type EventInput, type RouteSnapshot, type SnapshotStop } from "./offline";

const stop = (id: string, seq: number, o: Partial<SnapshotStop> = {}): SnapshotStop => ({
  id,
  sequence: seq,
  status: "pending",
  customer: `K${seq}`,
  customerCode: null,
  salesRep: null,
  salesRepPhone: null,
  branch: "",
  pointType: null,
  temporary: false,
  address: "",
  phone: null,
  siteManager: null,
  siteManagerPhone: null,
  window: "06:00–08:00",
  windowEnd: "08:00",
  call: null,
  access: null,
  floor: null,
  unloading: null,
  other: null,
  notes: [],
  orders: [],
  completedAt: null,
  packaging: {},
  cashGrosze: 0,
  photos: 0,
  signed: false,
  ...o,
});

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const R = "33333333-3333-4333-8333-333333333333";
const T = "44444444-4444-4444-8444-444444444444";

const snap: RouteSnapshot = {
  id: R,
  name: "Trasa",
  date: "2026-11-06",
  status: "planned",
  vehicleId: null,
  vehicle: null,
  odometerStart: null,
  odometerEnd: null,
  stops: [stop(S1, 1), stop(S2, 2)],
  packagingTypes: [{ id: T, code: "E", name: "EUR" }],
  vehicles: [{ id: "v1", registration: "KR 1" }],
  pay: null,
  fetchedAt: "2026-11-06T04:00:00Z",
};

let n = 0;
const ev = (e: EventInput): DriverEvent =>
  ({ client_event_id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, route_id: R, occurred_at: `2026-11-06T05:${String(10 + n).padStart(2, "0")}:00Z`, ...e }) as DriverEvent;

describe("zdarzenia offline", () => {
  it("pełna zmiana: start, statusy, punkt, koniec", () => {
    const events: DriverEvent[] = [
      ev({ type: "route_started", odometer_start: 1000, vehicle_id: "v1" }),
      ev({ type: "stop_quick", stop_id: S1, status: "now" }),
      ev({ type: "stop_quick", stop_id: S2, status: "now" }),
      ev({
        type: "stop_saved",
        stop_id: S1,
        outcome: "delivered",
        reason: "",
        comment: "",
        return_text: "",
        packaging: [{ typeId: T, out: 3, back: 2 }],
        cash_grosze: 12000,
        photos: 1,
        signature: true,
      }),
      ev({ type: "route_finished", odometer_end: 1120 }),
    ];
    const s = replay(snap, events);
    expect(s.status).toBe("completed");
    expect(s.vehicle).toBe("KR 1");
    expect(s.odometerEnd).toBe(1120);
    expect(s.stops[0]).toMatchObject({ status: "delivered", cashGrosze: 12000, photos: 1, signed: true, packaging: { [T]: { out: 3, back: 2 } } });
    expect(s.stops[1].status).toBe("in_progress"); // jedyny „teraz realizuję”
    expect(progress(s)).toEqual({ finished: 1, total: 2, pct: 50 });
  });
  it("odrzuca zdarzenia, które nie pasują do stanu", () => {
    expect(validateEvent(snap, ev({ type: "stop_quick", stop_id: S1, status: "done" }))).toMatch(/rozpocznij/);
    const started = applyEvent(snap, ev({ type: "route_started", odometer_start: 1000, vehicle_id: null }));
    expect(validateEvent(started, ev({ type: "route_finished", odometer_end: 900 }))).toMatch(/mniejszy/);
    expect(
      validateEvent(started, ev({ type: "stop_saved", stop_id: S1, outcome: "complaint", reason: "", comment: "", return_text: "", packaging: [], cash_grosze: null, photos: 0, signature: false })),
    ).toMatch(/przyczynę/);
    expect(validateEvent(started, ev({ type: "stop_quick", stop_id: "55555555-5555-4555-8555-555555555555", status: "done" }))).toMatch(/przeniesiony/);
    // niepoprawne zdarzenie nie zmienia stanu
    expect(applyEvent(started, ev({ type: "route_finished", odometer_end: 1 }))).toBe(started);
  });
});

describe("serwer nie ufa telefonowi", () => {
  it("parsuje i odrzuca", () => {
    const ok = parseIncomingEvent({ type: "stop_quick", client_event_id: S1, route_id: R, stop_id: S2, status: "done", occurred_at: "2026-11-06T05:00:00Z", location: { lat: 50, lng: 19.9, accuracy: 12 } });
    expect(typeof ok).toBe("object");
    expect(parseIncomingEvent({ type: "stop_quick", client_event_id: "x", route_id: R })).toBe("brak client_event_id");
    expect(parseIncomingEvent({ type: "hack", client_event_id: S1, route_id: R, occurred_at: "2026-11-06T05:00:00Z" })).toBe("nieznany typ zdarzenia");
    const saved = parseIncomingEvent({ type: "stop_saved", client_event_id: S1, route_id: R, stop_id: S2, outcome: "delivered", occurred_at: "2026-11-06T05:00:00Z", packaging: [{ typeId: T, out: 2, back: 1 }, { typeId: "zly" }], photos: 99 });
    expect(typeof saved === "object" && saved.type === "stop_saved" && saved.packaging).toHaveLength(1);
    expect(typeof saved === "object" && saved.type === "stop_saved" && saved.photos).toBe(20);
  });
  it("pochodne UUID są stałe i poprawne", () => {
    expect(derivedUuid(S1, "comment")).toBe(derivedUuid(S1, "comment"));
    expect(derivedUuid(S1, "comment")).not.toBe(derivedUuid(S1, "return"));
    expect(derivedUuid(S1, "comment")).toMatch(UUID_RE);
  });
});
