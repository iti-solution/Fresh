import { describe, expect, it } from "vitest";
import { assignmentConflicts, usageSummary, type AssignableRoute } from "./assignments";

const r = (o: Partial<AssignableRoute>): AssignableRoute => ({
  id: "r",
  name: "Trasa",
  courseNo: 1,
  vehicleId: null,
  vehicleLabel: null,
  driverId: null,
  driverLabel: null,
  ...o,
});

describe("assignmentConflicts", () => {
  it("to samo auto lub kierowca na dwóch trasach w tym samym kursie", () => {
    const c = assignmentConflicts([
      r({ id: "a", name: "Tarnów", vehicleId: "v1", vehicleLabel: "KR 1", driverId: "d1", driverLabel: "Jan Nowak" }),
      r({ id: "b", name: "Zakopane", vehicleId: "v1", vehicleLabel: "KR 1", driverId: "d2", driverLabel: "Piotr" }),
      r({
        id: "c",
        name: "Dowózka",
        courseNo: 2,
        vehicleId: "v1",
        vehicleLabel: "KR 1",
        driverId: "d1",
        driverLabel: "Jan Nowak",
      }),
    ]);
    expect(c.get("a")).toEqual(["auto KR 1 także na trasie Zakopane"]);
    expect(c.get("b")).toEqual(["auto KR 1 także na trasie Tarnów"]);
    expect(c.has("c")).toBe(false); // drugi kurs tym samym autem jest w porządku
  });
  it("brak przydziału to nie konflikt", () => {
    expect(assignmentConflicts([r({ id: "a" }), r({ id: "b" })]).size).toBe(0);
  });
});

describe("usageSummary", () => {
  const rows = [
    { date: "2026-10-20", vehicleId: "v1", vehicle: "KR 1", driverId: "d1", driver: "Nowak", km: 80, orders: 7 },
    { date: "2026-10-20", vehicleId: "v1", vehicle: "KR 1", driverId: "d1", driver: "Nowak", km: 20, orders: 1 },
    { date: "2026-10-21", vehicleId: "v1", vehicle: "KR 1", driverId: "d2", driver: "Kowalski", km: 90, orders: 6 },
    { date: "2026-10-21", vehicleId: "v2", vehicle: "KR 2", driverId: "d1", driver: "Nowak", km: null, orders: 3 },
  ];
  it("po aucie: dni, kursy, km i kierowcy", () => {
    expect(usageSummary(rows, "vehicle")[0]).toEqual({
      key: "v1",
      label: "KR 1",
      days: 2,
      routes: 3,
      km: 190,
      orders: 14,
      partners: ["Kowalski", "Nowak"],
    });
  });
  it("po kierowcy: auta, którymi jeździł", () => {
    expect(usageSummary(rows, "driver").find((s) => s.key === "d1")?.partners).toEqual(["KR 1", "KR 2"]);
  });
});
