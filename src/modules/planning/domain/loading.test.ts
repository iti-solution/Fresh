import { describe, expect, it } from "vitest";
import { buildLoadingList } from "./loading";

const o = (x: Partial<{ pallets: number; crates: number; weightKg: number; codGrosze: number; ready: boolean }>) => ({
  ref: "A",
  pallets: 0,
  crates: 0,
  weightKg: 0,
  codGrosze: 0,
  ready: true,
  notes: null,
  lines: [],
  ...x,
});

describe("lista załadunkowa", () => {
  it("odwraca kolejność i sumuje", () => {
    const { rows, totals } = buildLoadingList([
      { sequence: 1, customer: "Pierwszy", place: "", address: "", window: "", orders: [o({ pallets: 0.5, crates: 3, weightKg: 10.4 })] },
      { sequence: 2, customer: "Drugi", place: "", address: "", window: "", orders: [o({ pallets: 1, codGrosze: 12050, ready: false }), o({ crates: 2 })] },
    ]);
    expect(rows.map((r) => [r.loadNo, r.customer])).toEqual([
      [1, "Drugi"],
      [2, "Pierwszy"],
    ]);
    expect(rows[0]).toMatchObject({ pallets: 1, crates: 2, codGrosze: 12050, notReady: 1 });
    expect(totals).toEqual({ stops: 2, orders: 3, pallets: 1.5, crates: 5, weightKg: 10, codGrosze: 12050, notReady: 1 });
  });
});
