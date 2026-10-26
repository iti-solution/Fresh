import { describe, expect, it } from "vitest";
import { dayForecast, driverPosition, estimateRoute } from "./forecast";
import type { ReportRoute, ReportStop } from "./reports";

const stop = (id: string, seq: number, over: Partial<ReportStop> = {}): ReportStop => ({
  id,
  routeId: "r1",
  sequence: seq,
  status: "pending",
  customerId: `c${seq}`,
  customer: `Klient ${seq}`,
  customerCode: null,
  branch: "Lokal",
  city: "Kraków",
  phone: null,
  salesRep: null,
  windowStart: null,
  windowEnd: null,
  arrivedAt: null,
  completedAt: null,
  orderRefs: [],
  valueGrosze: 100_00,
  codGrosze: 0,
  crates: 1,
  kg: 10,
  reason: null,
  note: null,
  ...over,
});

const route = (stops: ReportStop[], over: Partial<ReportRoute> = {}): ReportRoute => ({
  id: "r1",
  date: "2026-10-26",
  name: "Trasa",
  kind: "regular",
  status: "in_progress",
  courseNo: 1,
  plannedStart: "06:00",
  driver: "Jan",
  driverPhone: null,
  vehicle: "KR 1",
  km: null,
  costPerKmGrosze: 0,
  driverCostPerDayGrosze: 0,
  fixedCostPerDayGrosze: 0,
  stops,
  ...over,
});

const opts = { minutesPerStop: 20, firstLegMinutes: 30, returnMinutes: 40, earlyMinutes: 15 };

describe("estimateRoute", () => {
  it("trasa nierozpoczęta: od planowanego startu + dojazd, potem tempo domyślne", () => {
    const e = estimateRoute(route([stop("a", 1), stop("b", 2)], { status: "planned" }), "05:00", opts);
    expect(e.etas.get("a")).toBe("06:30");
    expect(e.etas.get("b")).toBe("06:50");
    expect(e.backAt).toBe("07:30");
  });
  it("spóźniony wyjazd liczy od teraz", () => {
    const e = estimateRoute(route([stop("a", 1)], { status: "planned" }), "07:00", opts);
    expect(e.etas.get("a")).toBe("07:30");
  });
  it("w trasie: tempo z realizacji, nie wcześniej niż teraz, czekanie na okno", () => {
    const r = route([
      stop("a", 1, { status: "delivered", completedAt: "06:30" }),
      stop("b", 2, { status: "delivered", completedAt: "07:00" }),
      stop("c", 3, { status: "delivered", completedAt: "07:30" }),
      stop("d", 4),
      stop("e", 5, { windowStart: "10:00", windowEnd: "12:00" }),
    ]);
    const e = estimateRoute(r, "07:40", opts);
    expect(e.pace).toBe(30);
    expect(e.etas.get("d")).toBe("08:00");
    expect(e.etas.get("e")).toBe("09:45"); // 08:30 → czeka do 15 min przed oknem
  });
  it("kierowca na punkcie: ETA = teraz", () => {
    const e = estimateRoute(route([stop("a", 1, { status: "in_progress", arrivedAt: "08:05" }), stop("b", 2)]), "08:10", opts);
    expect(e.etas.get("a")).toBe("08:05");
    expect(e.etas.get("b")).toBe("08:38");
  });
  it("dzień miniony: brak prognozy", () => {
    expect(estimateRoute(route([stop("a", 1)]), null, opts).etas.size).toBe(0);
  });
});

describe("dayForecast", () => {
  it("plan, realizacja i prognoza końca dnia", () => {
    const r = route([
      stop("a", 1, { status: "delivered", completedAt: "06:30", windowEnd: "08:00", valueGrosze: 300_00 }),
      stop("b", 2, { status: "refused", completedAt: "07:00", valueGrosze: 50_00 }),
      stop("c", 3, { windowEnd: "07:30", valueGrosze: 200_00 }),
      stop("d", 4, { windowEnd: "12:00", valueGrosze: 100_00 }),
    ]);
    const f = dayForecast([r, route([stop("x", 1, { windowEnd: "09:00" })], { id: "r2", status: "planned" })], "07:35", opts);
    expect(f.plannedValueGrosze).toBe(750_00);
    expect(f.deliveredValueGrosze).toBe(300_00);
    expect(f.lostValueGrosze).toBe(50_00);
    expect(f.remainingValueGrosze).toBe(400_00);
    expect(f.forecastValueGrosze).toBe(700_00);
    expect(f.forecastLate).toBe(1); // c: dojazd najwcześniej teraz (07:35) > 07:30
    expect(f.currentOnTimePct).toBe(100);
    expect(f.forecastOnTimePct).toBe(75);
    expect(f.routesNotStarted).toBe(1);
    expect(f.routesOnRoad).toBe(1);
  });
});

describe("driverPosition", () => {
  it("gdzie jest kierowca i co mu zostało", () => {
    const p = driverPosition(
      route([stop("a", 1, { status: "delivered", completedAt: "06:30" }), stop("b", 2, { status: "in_progress" }), stop("c", 3)]),
    );
    expect(p.at?.id).toBe("b");
    expect(p.lastDone?.id).toBe("a");
    expect(p.remaining.map((s) => s.id)).toEqual(["b", "c"]);
  });
});
