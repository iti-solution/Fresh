import { describe, expect, it } from "vitest";
import { deriveFulfilment } from "./orders";

const base = { orderStatus: "new", onRoute: false, routeStatus: null, stopStatus: null };

describe("deriveFulfilment", () => {
  it("bez trasy = niezaplanowane", () => expect(deriveFulfilment(base)).toBe("unplanned"));
  it("na trasie w szkicu lub zaplanowanej = zaplanowane", () => {
    expect(deriveFulfilment({ ...base, onRoute: true, routeStatus: "draft", stopStatus: "pending" })).toBe("planned");
    expect(deriveFulfilment({ ...base, onRoute: true, routeStatus: "planned", stopStatus: "pending" })).toBe("planned");
  });
  it("trasa wydana lub w toku = w dostawie", () => {
    expect(deriveFulfilment({ ...base, onRoute: true, routeStatus: "in_progress", stopStatus: "pending" })).toBe("in_delivery");
    expect(deriveFulfilment({ ...base, onRoute: true, routeStatus: "dispatched", stopStatus: "pending" })).toBe("in_delivery");
  });
  it("punkt dostarczony lub częściowo = dostarczone", () => {
    expect(deriveFulfilment({ ...base, onRoute: true, routeStatus: "in_progress", stopStatus: "delivered" })).toBe("delivered");
    expect(deriveFulfilment({ ...base, orderStatus: "partial" })).toBe("delivered");
  });
  it("odmowa lub brak klienta = nie dostarczono", () => {
    expect(deriveFulfilment({ ...base, onRoute: true, routeStatus: "in_progress", stopStatus: "refused" })).toBe("failed");
  });
});
