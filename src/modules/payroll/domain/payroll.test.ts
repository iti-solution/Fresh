import { describe, expect, it } from "vitest";
import {
  closePreviousVersion,
  computeDayPay,
  computePeriodPay,
  EMPTY_COMPONENTS,
  monthRange,
  readComponents,
  ruleFor,
  ruleFormSchema,
  sumLines,
  type RouteFacts,
  type RuleRow,
} from "./payroll";

const route = (o: Partial<RouteFacts>): RouteFacts => ({
  routeId: "r1",
  date: "2026-11-06",
  name: "Kraków Zachód",
  kind: "regular",
  courseNo: 1,
  km: 120,
  stopsDone: 14,
  stopsWithWindow: 14,
  stopsOnTime: 14,
  palletsDelivered: 6,
  turnoverGrosze: 2_000_000,
  deliveredValueGrosze: 1_900_000,
  ...o,
});

describe("etatowy", () => {
  const rule = {
    ...EMPTY_COMPONENTS,
    name: "Etat",
    daily_rate: 25000,
    per_km: 50,
    km_threshold: 100,
    on_time_bonus: 3000,
    on_time_threshold_pct: 95,
  };
  it("dniówka raz na dzień, km ponad próg z obu kursów, premia", () => {
    const lines = computeDayPay(rule, "2026-11-06", [
      route({}),
      route({ routeId: "r2", courseNo: 2, km: 40, stopsWithWindow: 4, stopsOnTime: 3 }),
    ]);
    // 160 km − próg 100 = 60 × 0,50 zł; terminowość 17/18 = 94% < 95% → bez premii
    expect(lines.map((l) => [l.code, l.amountGrosze])).toEqual([
      ["daily_rate", 25000],
      ["per_km", 3000],
    ]);
  });
  it("premia tylko powyżej progu", () => {
    expect(computeDayPay(rule, "2026-11-06", [route({})]).some((l) => l.code === "on_time_bonus")).toBe(true);
    expect(computeDayPay(rule, "2026-11-06", [route({ stopsOnTime: 12 })]).some((l) => l.code === "on_time_bonus")).toBe(false);
  });
  it("brak tras = brak pozycji", () => {
    expect(computeDayPay(rule, "2026-11-07", [route({})])).toEqual([]);
  });
});

describe("dowózkowy", () => {
  const rule = {
    ...EMPTY_COMPONENTS,
    model: "delivery" as const,
    per_stop: 800,
    turnover_bp: 150,
    delivered_value_bp: 0,
    per_pallet: 250,
    per_extra_route: 5000,
  };
  it("punkty, palety, % obrotu, kurs dodatkowy z opisem", () => {
    const lines = computeDayPay(rule, "2026-11-06", [
      route({}),
      route({ routeId: "r2", kind: "dowozka", name: "Dowózka", stopsDone: 1, palletsDelivered: 0.5, turnoverGrosze: 30000 }),
    ]);
    const by = (c: string, r: string) => lines.find((l) => l.code === c && l.routeId === r)!;
    expect(by("per_stop", "r1").amountGrosze).toBe(11200);
    expect(by("turnover", "r1").amountGrosze).toBe(30000); // 1,5% od 20 000 zł
    expect(by("per_pallet", "r2").amountGrosze).toBe(125);
    expect(by("per_extra_route", "r2").amountGrosze).toBe(5000);
    expect(by("turnover", "r1").note).toContain("1,5%");
    expect(sumLines(lines)).toBe(11200 + 1500 + 30000 + 800 + 125 + 5000 + 450);
  });
});

describe("wersje reguł", () => {
  const rules: RuleRow[] = [
    {
      id: "def",
      driver_id: null,
      valid_from: "2026-01-01",
      valid_to: null,
      components: { ...EMPTY_COMPONENTS, daily_rate: 20000 },
    },
    {
      id: "d1-old",
      driver_id: "d1",
      valid_from: "2026-01-01",
      valid_to: "2026-11-14",
      components: { ...EMPTY_COMPONENTS, daily_rate: 22000 },
    },
    {
      id: "d1-new",
      driver_id: "d1",
      valid_from: "2026-11-15",
      valid_to: null,
      components: { ...EMPTY_COMPONENTS, daily_rate: 24000 },
    },
  ];
  it("własna przed domyślną, wersja wg dnia", () => {
    expect(ruleFor(rules, "d1", "2026-11-10")?.id).toBe("d1-old");
    expect(ruleFor(rules, "d1", "2026-11-20")?.id).toBe("d1-new");
    expect(ruleFor(rules, "d2", "2026-11-20")?.id).toBe("def");
    expect(ruleFor(rules, "d2", "2025-12-31")).toBeNull();
  });
  it("okres: każdy dzień swoją regułą, dni bez reguły zgłoszone", () => {
    const r = computePeriodPay(rules, "d1", [route({ date: "2026-11-10" }), route({ date: "2026-11-20" })]);
    expect(r.lines.map((l) => [l.date, l.amountGrosze, l.ruleId])).toEqual([
      ["2026-11-10", 22000, "d1-old"],
      ["2026-11-20", 24000, "d1-new"],
    ]);
    expect(computePeriodPay(rules, "d2", [route({ date: "2025-12-01" })]).missingRuleDays).toEqual(["2025-12-01"]);
  });
  it("nowa wersja zamyka poprzednią", () => {
    expect(closePreviousVersion(rules.slice(0, 1), null, "2026-12-01")).toEqual([{ id: "def", valid_to: "2026-11-30" }]);
  });
});

describe("formularz i odczyt", () => {
  it("zł i % → grosze i punkty bazowe", () => {
    const r = ruleFormSchema.parse({
      name: "Dowóz",
      model: "delivery",
      valid_from: "2026-11-01",
      per_stop: "8,50",
      turnover_pct: "1,5",
      km_threshold: "100",
    });
    expect(r.components).toMatchObject({ per_stop: 850, turnover_bp: 150, km_threshold: 100, on_time_threshold_pct: 95 });
    expect(r.driver_id).toBeNull();
    expect(ruleFormSchema.safeParse({ name: "x", model: "employee", valid_from: "" }).success).toBe(false);
  });
  it("odczyt niepełnych danych", () => {
    expect(readComponents({ daily_rate: "25000", bogus: 1 })).toMatchObject({ daily_rate: 25000, per_km: 0, model: "employee" });
  });
  it("zakres miesiąca", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
