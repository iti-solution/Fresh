import { describe, expect, it } from "vitest";
import { monthLabel, shiftMonth } from "./month";

describe("miesiące", () => {
  it("przesuwa przez przełom roku i nazywa", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-11")).toBe("listopad 2026");
  });
});
