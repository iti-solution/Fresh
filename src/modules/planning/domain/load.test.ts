import { describe, expect, it } from "vitest";
import { canMarkReady, computeLoad, routeIssues, validateExtraRoute } from "./load";

const van = { capacity_kg: 1300, capacity_pallets: 12, capacity_crates: 90, capacity_m3: 20 };

describe("computeLoad", () => {
  it("sumuje ładunek i liczy zajętość", () => {
    const l = computeLoad(
      [
        { weight_kg: "650.4", pallets: 1, crates: 40, volume_m3: "2.5" },
        { weight_kg: 520, pallets: "0", crates: 41, volume_m3: null },
      ],
      van,
    );
    expect(l.totals).toEqual({ kg: 1170, pallets: 1, crates: 81, m3: 2.5 });
    expect(l.pct.kg).toBe(90);
    expect(l.nearFull).toEqual(["kg", "crates"]);
    expect(l.overloaded).toEqual([]);
  });
  it("wykrywa przeciążenie i ignoruje wymiary bez pojemności", () => {
    const l = computeLoad([{ weight_kg: 1400, pallets: 0, crates: 0, volume_m3: 0 }], { ...van, capacity_m3: 0 });
    expect(l.overloaded).toEqual(["kg"]);
    expect(l.pct.m3).toBeNull();
  });
  it("bez auta nie liczy procentów", () => {
    const l = computeLoad([{ weight_kg: 100, pallets: 0, crates: 1, volume_m3: 0 }], null);
    expect(l.capacity).toBeNull();
    expect(l.overloaded).toEqual([]);
  });
});

describe("routeIssues + canMarkReady", () => {
  const ok = computeLoad([{ weight_kg: 100, pallets: 0, crates: 5, volume_m3: 0 }], van);
  const heavy = computeLoad([{ weight_kg: 1500, pallets: 0, crates: 5, volume_m3: 0 }], van);

  it("blokuje bez auta i kierowcy", () => {
    const issues = routeIssues({ vehicleId: null, driverId: null, stopsCount: 3, awaitingCount: 0, load: ok });
    const d = canMarkReady(issues);
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.needsConfirm).toBe(false);
      expect(d.reasons).toEqual(["brak pojazdu", "brak kierowcy"]);
    }
  });
  it("przeciążenie wymaga potwierdzenia", () => {
    const issues = routeIssues({ vehicleId: "v", driverId: "d", stopsCount: 3, awaitingCount: 0, load: heavy });
    expect(issues[0].label).toBe("przeciążenie: masa 115%");
    expect(canMarkReady(issues)).toMatchObject({ ok: false, needsConfirm: true });
    expect(canMarkReady(issues, true)).toEqual({ ok: true });
  });
  it("zamówienia w magazynie tylko ostrzegają", () => {
    const issues = routeIssues({ vehicleId: "v", driverId: "d", stopsCount: 3, awaitingCount: 2, load: ok });
    expect(issues).toEqual([{ code: "awaiting_warehouse", label: "2 do realizacji w magazynie", severity: "info" }]);
    expect(canMarkReady(issues)).toEqual({ ok: true });
  });
  it("pusta trasa blokuje", () => {
    expect(canMarkReady(routeIssues({ vehicleId: "v", driverId: "d", stopsCount: 0, awaitingCount: 0, load: ok })).ok).toBe(false);
  });
});

describe("validateExtraRoute", () => {
  it("wymaga przyczyny dla dowózki", () => {
    expect(validateExtraRoute({ name: "Dowózka Zakopane", kind: "dowozka" })).toMatch(/przyczynę/);
    expect(validateExtraRoute({ name: "Dowózka Zakopane", kind: "dowozka", reason: "reklamacja bananów" })).toBeNull();
    expect(validateExtraRoute({ name: "X", kind: "extra" })).toMatch(/nazwę/);
    expect(validateExtraRoute({ name: "Kurs", kind: "regular" })).toMatch(/rodzaj/);
  });
});
