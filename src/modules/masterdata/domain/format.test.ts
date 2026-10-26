import { describe, expect, it } from "vitest";
import { formatSeason, formatWeekdays, formatWindows, vehicleMake, vehicleOptionLabel } from "./format";

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

describe("vehicleOptionLabel", () => {
  it("rejestracja + marka + typ", () => {
    expect(
      vehicleOptionLabel({
        registration: "KR 2B118",
        name: "Iveco Daily",
        vehicle_type: "dostawczy 3,5 t",
        body_type: "chłodnia",
      }),
    ).toBe("KR 2B118 — Iveco Daily (dostawczy 3,5 t, chłodnia)");
  });
  it("robocza nazwa „Auto 3” nie jest marką", () => {
    expect(vehicleMake({ registration: "X", name: "Auto 3" })).toBeNull();
    expect(vehicleOptionLabel({ registration: "KR 1", name: "Auto 3" })).toBe("KR 1");
  });
});
