import { describe, expect, it } from "vitest";
import { formatSeason, formatWeekdays, formatWindows } from "./format";

describe("formatWeekdays", () => {
  it("zakres ciągły", () => expect(formatWeekdays([1, 2, 3, 4, 5, 6])).toBe("pn–sb"));
  it("dni pojedyncze", () => expect(formatWeekdays([5, 1, 3])).toBe("pn, śr, pt"));
  it("cały tydzień", () => expect(formatWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe("codziennie"));
  it("brak", () => expect(formatWeekdays([])).toBe("—"));
});

describe("formatWindows", () => {
  it("dwa okna w poniedziałek, posortowane", () => {
    const w = [
      { weekday: 1, opens_at: "14:00:00", closes_at: "16:00:00" },
      { weekday: 1, opens_at: "06:00:00", closes_at: "09:00:00" },
      { weekday: 2, opens_at: "07:00:00", closes_at: "10:00:00" },
    ];
    expect(formatWindows(w)).toBe("06:00–09:00, 14:00–16:00");
    expect(formatWindows(w, 2)).toBe("07:00–10:00");
    expect(formatWindows(w, 7)).toBe("—");
  });
});

describe("formatSeason", () => {
  it("sezon i cały rok", () => {
    expect(formatSeason("2026-05-01", "2026-09-30")).toBe("01.05–30.09");
    expect(formatSeason(null, null)).toBe("cały rok");
  });
});
