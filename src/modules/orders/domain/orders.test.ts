import { describe, expect, it } from "vitest";
import { formatDayLabel, nextWorkingDay, orderSchema, shiftDay, summarizeOrders, todayInWarsaw } from "./orders";

const POINT = "11111111-1111-4111-8111-111111111111";

describe("orderSchema", () => {
  it("przyjmuje poprawne zamówienie z przecinkiem dziesiętnym", () => {
    const r = orderSchema.safeParse({ delivery_point_id: POINT, delivery_date: "2026-10-26", order_value: "1 250,50", crates: "12" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.order_value).toBe(1250.5);
      expect(r.data.crates).toBe(12);
      expect(r.data.readiness).toBe("ready");
    }
  });
  it("wymaga obu godzin okna", () => {
    const r = orderSchema.safeParse({ delivery_point_id: POINT, delivery_date: "2026-10-26", window_start: "08:00" });
    expect(r.success).toBe(false);
  });
  it("odrzuca skrzynki ułamkowe i brak oddziału", () => {
    expect(orderSchema.safeParse({ delivery_point_id: POINT, delivery_date: "2026-10-26", crates: "2,5" }).success).toBe(false);
    expect(orderSchema.safeParse({ delivery_point_id: "", delivery_date: "2026-10-26" }).success).toBe(false);
  });
});

describe("summarizeOrders", () => {
  it("sumuje w groszach i pomija anulowane", () => {
    const s = summarizeOrders([
      { readiness: "ready", order_value: "0.10", weight_kg: 10, pallets: 1, crates: 2 },
      { readiness: "ready", order_value: "0.20", weight_kg: "5.5", pallets: 0, crates: 3 },
      { readiness: "awaiting_warehouse", order_value: null, weight_kg: null, pallets: null, crates: null },
      { readiness: "ready", order_value: 999, weight_kg: 1, pallets: 1, crates: 1, status: "cancelled" },
    ]);
    expect(s).toEqual({ count: 3, ready: 2, awaiting: 1, valueGrosze: 30, weightKg: 16, pallets: 1, crates: 5 });
  });
});

describe("daty", () => {
  it("najbliższy dzień roboczy pomija niedzielę", () => {
    expect(nextWorkingDay("2026-10-24")).toBe("2026-10-26"); // sobota → poniedziałek
    expect(nextWorkingDay("2026-10-26")).toBe("2026-10-27");
  });
  it("przesuwa dni i formatuje etykietę", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(formatDayLabel("2026-10-26")).toBe("poniedziałek, 26.10");
  });
  it("liczy dzisiejszą datę w strefie Warszawy", () => {
    expect(todayInWarsaw(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
  });
});
