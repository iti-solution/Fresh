import { describe, expect, it } from "vitest";
import { closedDatesFor, easterSunday, firmDay, holidaysBetween, pointClosed, polishHolidays } from "./holidays";

describe("święta ustawowe", () => {
  it("liczy Wielkanoc", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2024)).toBe("2024-03-31");
  });
  it("ruchome święta 2026 i Wigilia od 2025", () => {
    const d = polishHolidays(2026).map((h) => h.date);
    expect(d).toContain("2026-04-06"); // Poniedziałek Wielkanocny
    expect(d).toContain("2026-06-04"); // Boże Ciało
    expect(d).toContain("2026-05-24"); // Zielone Świątki
    expect(d).toContain("2026-12-24");
    expect(polishHolidays(2024).map((h) => h.date)).not.toContain("2024-12-24");
    expect(d).toHaveLength(14);
  });
  it("przedział przez przełom roku", () => {
    expect(holidaysBetween("2026-12-20", "2027-01-07").map((h) => h.date)).toEqual([
      "2026-12-24",
      "2026-12-25",
      "2026-12-26",
      "2027-01-01",
      "2027-01-06",
    ]);
  });
});

describe("dni zamknięte", () => {
  const ex = [
    { delivery_point_id: null, date: "2026-11-11", is_closed: false, reason: "pracujemy" },
    { delivery_point_id: null, date: "2026-11-20", is_closed: true, reason: "Inwentaryzacja" },
    { delivery_point_id: "p1", date: "2026-11-18", is_closed: true, reason: "remont" },
  ];
  it("firma może pracować w święto", () => {
    expect(firmDay("2026-11-11", ex).closed).toBe(false);
    expect(firmDay("2026-11-01", ex)).toEqual({ closed: true, reason: "Wszystkich Świętych", source: "holiday" });
    expect(firmDay("2026-11-20", ex)).toEqual({ closed: true, reason: "Inwentaryzacja", source: "company" });
  });
  it("zamknięcie adresu dotyczy tylko jego", () => {
    expect(pointClosed("2026-11-18", "p1", ex)).toBe(true);
    expect(pointClosed("2026-11-18", "p2", ex)).toBe(false);
    expect(pointClosed("2026-11-20", "p2", ex)).toBe(true);
  });
  it("lista zamkniętych dni dla portalu", () => {
    expect(closedDatesFor("p1", "2026-11-01", "2026-11-30", ex)).toEqual(["2026-11-01", "2026-11-18", "2026-11-20"]);
  });
});
