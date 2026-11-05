import { describe, expect, it } from "vitest";
import { closeChecklist, closeDifferences, overdueAtCustomer } from "./ledger";

describe("zalegające opakowania (FIFO)", () => {
  it("zwroty rozliczają najstarsze wydania", () => {
    const r = overdueAtCustomer(
      [
        { qty: 10, created_at: "2026-09-01T08:00:00Z", reason: "issue" },
        { qty: -6, created_at: "2026-09-20T08:00:00Z", reason: "return" },
        { qty: 5, created_at: "2026-10-30T08:00:00Z", reason: "issue" },
      ],
      "2026-11-05",
    );
    expect(r).toEqual({ overdue: 4, oldest: "2026-09-01", balance: 9 });
  });
  it("wszystko zwrócone", () => {
    expect(
      overdueAtCustomer(
        [
          { qty: 3, created_at: "2026-01-01T00:00:00Z", reason: "issue" },
          { qty: -3, created_at: "2026-01-02T00:00:00Z", reason: "return" },
        ],
        "2026-11-05",
      ),
    ).toEqual({ overdue: 0, oldest: null, balance: 0 });
  });
});

describe("zamknięcie trasy", () => {
  const input = {
    status: "completed",
    openStops: 0,
    odometerStart: 1000,
    odometerEnd: 1145,
    packaging: [{ typeId: "e", name: "EUR", issued: 4, collected: 6 }],
    cashCollectedGrosze: 64050,
  };
  it("checklista", () => {
    const c = closeChecklist(input);
    expect(c.every((x) => x.ok)).toBe(true);
    expect(c.find((x) => x.key === "km")?.detail).toContain("145 km");
    expect(
      closeChecklist({ ...input, status: "in_progress", openStops: 2 })
        .filter((x) => !x.ok)
        .map((x) => x.key),
    ).toEqual(["finished", "stops"]);
  });
  it("różnice opakowań i gotówki", () => {
    expect(closeDifferences(input, [{ typeId: "e", qty: 5 }], 60000)).toEqual({
      packaging: [{ typeId: "e", name: "EUR", expected: 6, received: 5, diff: -1 }],
      cashDiffGrosze: -4050,
    });
    expect(closeDifferences(input, [{ typeId: "e", qty: 6 }], 64050)).toEqual({ packaging: [], cashDiffGrosze: 0 });
  });
});
