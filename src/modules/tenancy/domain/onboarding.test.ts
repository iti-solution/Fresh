import { describe, expect, it } from "vitest";
import { onboardingProgress, onboardingSteps } from "./onboarding";

const zero = {
  customers: 0,
  points: 0,
  vehicles: 0,
  drivers: 0,
  driversWithPin: 0,
  packagingTypes: 0,
  templates: 0,
  templatePoints: 0,
  payRules: 0,
  orders: 0,
  routes: 0,
};

describe("kreator uruchomienia", () => {
  it("pusta firma zaczyna od importu klientów", () => {
    const p = onboardingProgress(onboardingSteps(zero));
    expect(p).toMatchObject({ done: 0, total: 7, pct: 0 });
    expect(p.next?.key).toBe("customers");
  });
  it("kierowcy bez PIN-u nie są gotowi; opakowania opcjonalne", () => {
    const s = onboardingSteps({ ...zero, customers: 3, points: 5, vehicles: 2, drivers: 2, driversWithPin: 1 });
    expect(s.find((x) => x.key === "drivers")?.done).toBe(false);
    expect(onboardingProgress(s).next?.key).toBe("drivers");
    const all = onboardingSteps({
      customers: 1,
      points: 1,
      vehicles: 1,
      drivers: 1,
      driversWithPin: 1,
      packagingTypes: 0,
      templates: 1,
      templatePoints: 1,
      payRules: 1,
      orders: 1,
      routes: 1,
    });
    expect(onboardingProgress(all).pct).toBe(100);
  });
});
