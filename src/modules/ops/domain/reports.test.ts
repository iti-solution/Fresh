import { describe, expect, it } from "vitest";
import {
  dayKpis,
  dispatcherAlerts,
  matchesQuery,
  normalizeSearch,
  nowForDay,
  packagingSummary,
  pctChange,
  routeCostGrosze,
  routeProgress,
  stopTimeliness,
  sumKpis,
  topCustomers,
  type ReportRoute,
  type ReportStop,
} from "./reports";

const stop = (over: Partial<ReportStop> = {}): ReportStop => ({
  id: "s1",
  routeId: "r1",
  sequence: 1,
  status: "pending",
  customerId: "c1",
  customer: "Bistro Łąka",
  customerCode: "K0101",
  branch: "Kuchnia",
  city: "Kraków",
  phone: "+48 600 111 222",
  salesRep: null,
  windowStart: "08:00",
  windowEnd: "10:00",
  arrivedAt: null,
  completedAt: null,
  orderRefs: ["ZK/1027/001"],
  valueGrosze: 100_000,
  codGrosze: 0,
  crates: 5,
  kg: 50,
  reason: null,
  note: null,
  ...over,
});

const route = (over: Partial<ReportRoute> = {}): ReportRoute => ({
  id: "r1",
  date: "2026-10-26",
  name: "Kraków Zachód",
  kind: "regular",
  status: "in_progress",
  courseNo: 1,
  plannedStart: "05:30",
  driver: "Jan Nowak",
  driverPhone: "+48 600 000 001",
  vehicle: "KR 4F201",
  km: 100,
  costPerKmGrosze: 140,
  driverCostPerDayGrosze: 32_000,
  fixedCostPerDayGrosze: 9_000,
  stops: [stop()],
  ...over,
});

describe("stopTimeliness", () => {
  it("rozróżnia dostawę w oknie i po oknie", () => {
    expect(stopTimeliness(stop({ status: "delivered", completedAt: "09:59" }), null)).toBe("on_time");
    expect(stopTimeliness(stop({ status: "delivered", completedAt: "10:00" }), null)).toBe("on_time");
    expect(stopTimeliness(stop({ status: "delivered", completedAt: "10:01" }), null)).toBe("late");
  });
  it("niezrealizowany punkt: w planie, zagrożony (≤30 min), spóźniony", () => {
    expect(stopTimeliness(stop(), "08:00")).toBe("waiting");
    expect(stopTimeliness(stop(), "09:30")).toBe("at_risk");
    expect(stopTimeliness(stop(), "10:05")).toBe("overdue");
    expect(stopTimeliness(stop(), null)).toBe("overdue");
  });
  it("bez okna", () => {
    expect(stopTimeliness(stop({ windowEnd: null }), "12:00")).toBe("waiting");
    expect(stopTimeliness(stop({ windowEnd: null, status: "delivered", completedAt: "12:00" }), null)).toBe("no_window");
  });
});

describe("nowForDay", () => {
  it("dziś → godzina, wczoraj → null, jutro → początek dnia", () => {
    expect(nowForDay("2026-10-26", "2026-10-26", "11:20")).toBe("11:20");
    expect(nowForDay("2026-10-25", "2026-10-26", "11:20")).toBeNull();
    expect(nowForDay("2026-10-27", "2026-10-26", "11:20")).toBe("00:00");
  });
});

describe("routeProgress i alerty", () => {
  it("liczy postęp, spóźnienia i bieżący punkt", () => {
    const r = route({
      stops: [
        stop({ id: "a", sequence: 1, status: "delivered", completedAt: "07:40", windowEnd: "08:00" }),
        stop({ id: "b", sequence: 2, status: "in_progress", windowEnd: "09:00" }),
        stop({ id: "c", sequence: 3, status: "pending", windowEnd: "10:00" }),
      ],
    });
    const p = routeProgress(r, "09:10");
    expect(p).toMatchObject({ total: 3, finished: 1, pct: 33, overdue: 1, atRisk: 0, state: "in_progress" });
    expect(p.current?.id).toBe("b");
    expect(p.next?.id).toBe("b");
  });

  it("trasa, która nie wyjechała 15 min po starcie, to alarm", () => {
    const r = route({ status: "planned", plannedStart: "05:30" });
    expect(routeProgress(r, "05:40").startOverdue).toBe(false);
    expect(routeProgress(r, "05:50").startOverdue).toBe(true);
    const alerts = dispatcherAlerts([r], "05:50");
    expect(alerts[0]).toMatchObject({ severity: "danger", title: "Kraków Zachód: trasa nie wyjechała" });
    // punkty trasy, która nie wyjechała, nie dublują alarmu „po oknie”
    expect(dispatcherAlerts([r], "11:00").filter((a) => a.stopId)).toHaveLength(0);
  });

  it("wyjątki i trasy do zamknięcia; kolejność od najpilniejszych", () => {
    const r1 = route({
      id: "r1",
      status: "completed",
      stops: [stop({ status: "complaint", completedAt: "08:30", reason: "Zgniłe pomidory" })],
    });
    const r2 = route({ id: "r2", stops: [stop({ id: "x", status: "pending", windowEnd: "09:00" })] });
    const a = dispatcherAlerts([r1, r2], "09:30");
    expect(a.map((x) => x.severity)).toEqual(["danger", "warn", "info"]);
    expect(a[1].detail).toContain("Zgniłe pomidory");
  });
});

describe("dayKpis", () => {
  it("wartość dostarczona, wyjątki, terminowość, koszt", () => {
    const r = route({
      status: "closed",
      kind: "regular",
      stops: [
        stop({ id: "1", status: "delivered", completedAt: "09:00", valueGrosze: 100_00 }),
        stop({ id: "2", status: "partial", completedAt: "10:30", valueGrosze: 50_00 }),
        stop({ id: "3", status: "absent", completedAt: "11:00", valueGrosze: 70_00 }),
        stop({ id: "4", status: "complaint", completedAt: "09:30", valueGrosze: 30_00 }),
      ],
    });
    const k = dayKpis([r, route({ id: "d", kind: "dowozka", stops: [], km: null })]);
    expect(k.extraCourses).toBe(1);
    expect(k.deliveredValueGrosze).toBe(180_00);
    expect(k.plannedValueGrosze).toBe(250_00);
    expect(k.exceptions).toBe(2);
    expect(k.onTime).toBe(2);
    expect(k.withWindow).toBe(4);
    expect(k.onTimePct).toBe(50);
    expect(k.costGrosze).toBe(routeCostGrosze(r));
    expect(routeCostGrosze(r)).toBe(100 * 140 + 32_000 + 9_000);
  });

  it("sumKpis liczy terminowość ważoną punktami", () => {
    const a = dayKpis([route({ stops: [stop({ status: "delivered", completedAt: "09:00" })] })]);
    const b = dayKpis([
      route({
        stops: [
          stop({ status: "delivered", completedAt: "11:00" }),
          stop({ status: "delivered", completedAt: "11:00" }),
          stop({ status: "delivered", completedAt: "11:00" }),
        ],
      }),
    ]);
    expect(sumKpis([a, b]).onTimePct).toBe(25);
    expect(sumKpis([]).onTimePct).toBeNull();
  });

  it("pctChange", () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(90, 120)).toBe(-25);
    expect(pctChange(5, 0)).toBeNull();
  });
});

describe("topCustomers", () => {
  it("sortuje po wartości dostarczonej", () => {
    const r = route({
      stops: [
        stop({ id: "1", customerId: "a", customer: "A", status: "delivered", valueGrosze: 10 }),
        stop({ id: "2", customerId: "b", customer: "B", status: "delivered", valueGrosze: 30 }),
        stop({ id: "3", customerId: "a", customer: "A", status: "refused", valueGrosze: 99 }),
      ],
    });
    expect(topCustomers([r])).toEqual([
      { customerId: "b", customer: "B", valueGrosze: 30, stops: 1, exceptions: 0 },
      { customerId: "a", customer: "A", valueGrosze: 10, stops: 2, exceptions: 1 },
    ]);
  });
});

describe("wyszukiwanie BOK", () => {
  it("bez polskich znaków i wielkości liter", () => {
    expect(normalizeSearch("  Bistro  ŁĄKA ")).toBe("bistro laka");
    expect(matchesQuery(stop(), route(), "laka krakow")).toBe(true);
    expect(matchesQuery(stop(), route(), "zk/1027")).toBe(true);
    expect(matchesQuery(stop(), route(), "nowak")).toBe(true);
    expect(matchesQuery(stop(), route(), "zakopane")).toBe(false);
  });
  it("po numerze telefonu (min. 6 cyfr)", () => {
    expect(matchesQuery(stop(), route(), "600 111 222")).toBe(true);
    expect(matchesQuery(stop(), route(), "111")).toBe(false);
  });
});

describe("packagingSummary", () => {
  it("saldo u klientów z kaucją i kierowcy z różnicą", () => {
    const s = packagingSummary([
      { partyType: "customer", partyId: "c1", typeCode: "SKRZ", balance: 10, depositGrosze: 1200 },
      { partyType: "customer", partyId: "c2", typeCode: "SKRZ", balance: 2, depositGrosze: 1200 },
      { partyType: "customer", partyId: "c3", typeCode: "SKRZ", balance: -1, depositGrosze: 1200 },
      { partyType: "driver", partyId: "d1", typeCode: "SKRZ", balance: -3, depositGrosze: 1200 },
      { partyType: "driver", partyId: "d2", typeCode: "SKRZ", balance: 0, depositGrosze: 1200 },
    ]);
    expect(s.atCustomers).toEqual([{ typeCode: "SKRZ", qty: 12, depositGrosze: 14_400 }]);
    expect(s.customersOwing.map((c) => c.partyId)).toEqual(["c1", "c2"]);
    expect(s.drivers).toEqual([{ partyId: "d1", byType: { SKRZ: -3 } }]);
  });
});
