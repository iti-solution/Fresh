import { describe, expect, it } from "vitest";
import {
  availableDeliveryDates,
  canCustomerCancel,
  earliestDeliveryDate,
  generatePassword,
  isoWeekday,
  mergeCart,
  orderDeadline,
  parseQty,
  placeOrderSchema,
  PORTAL_DEFAULTS,
  portalErrorMessage,
  portalOrderStatus,
  portalSettings,
  productSchema,
  stepQty,
  summarizeCart,
  warsawNow,
} from "./portal";

const S = PORTAL_DEFAULTS; // 20:00, jutro, 14 dni
const MON_TO_SAT = [1, 2, 3, 4, 5, 6];

describe("ustawienia portalu", () => {
  it("bierze domyślne, gdy brak lub błędne", () => {
    expect(portalSettings(null)).toEqual(S);
    expect(portalSettings({ portal_cutoff: "25:00", portal_lead_days: "x" })).toEqual(S);
  });
  it("czyta wartości z ustawień firmy", () => {
    expect(portalSettings({ portal_cutoff: "18:30", portal_lead_days: 0, portal_horizon_days: "21" })).toEqual({
      cutoff: "18:30",
      leadDays: 0,
      horizonDays: 21,
    });
  });
});

describe("terminy dostaw", () => {
  it("dzień tygodnia ISO", () => {
    expect(isoWeekday("2026-11-02")).toBe(1); // poniedziałek
    expect(isoWeekday("2026-11-01")).toBe(7); // niedziela
  });

  it("przed godziną graniczną — jutro, po niej — pojutrze", () => {
    expect(earliestDeliveryDate({ date: "2026-11-02", time: "19:59" }, S)).toBe("2026-11-03");
    expect(earliestDeliveryDate({ date: "2026-11-02", time: "20:00" }, S)).toBe("2026-11-04");
    expect(earliestDeliveryDate({ date: "2026-11-02", time: "08:00" }, { ...S, leadDays: 0 })).toBe("2026-11-02");
  });

  it("pomija niedziele, zamknięcia i dni poza sezonem", () => {
    const dates = availableDeliveryDates(
      { date: "2026-11-06", time: "10:00" },
      { ...S, horizonDays: 7 },
      {
        weekdays: MON_TO_SAT,
        closedDates: ["2026-11-11"], // Święto Niepodległości
      },
    );
    // sob 07, (nd 08 pominięta), pn 09, wt 10, (śr 11 święto), czw 12, pt 13
    expect(dates).toEqual(["2026-11-07", "2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13"]);
  });

  it("oddział dostaw tylko wt i pt", () => {
    const dates = availableDeliveryDates({ date: "2026-11-02", time: "21:00" }, { ...S, horizonDays: 10 }, { weekdays: [2, 5] });
    expect(dates).toEqual(["2026-11-06", "2026-11-10"]);
  });

  it("sezon oddziału ogranicza daty", () => {
    const dates = availableDeliveryDates({ date: "2026-11-02", time: "10:00" }, S, {
      weekdays: MON_TO_SAT,
      activeTo: "2026-11-04",
    });
    expect(dates).toEqual(["2026-11-03", "2026-11-04"]);
  });

  it("termin zamówienia: dzień przed dostawą o godzinie granicznej", () => {
    expect(orderDeadline("2026-11-03", S)).toEqual({ date: "2026-11-02", time: "20:00" });
  });

  it("czas warszawski (zima UTC+1, lato UTC+2)", () => {
    expect(warsawNow(new Date("2026-11-02T19:30:00Z"))).toEqual({ date: "2026-11-02", time: "20:30" });
    expect(warsawNow(new Date("2026-07-01T22:30:00Z"))).toEqual({ date: "2026-07-02", time: "00:30" });
  });
});

describe("anulowanie przez klienta", () => {
  const now = { date: "2026-11-02", time: "18:00" };
  it("nowe, przed terminem — można", () => {
    expect(canCustomerCancel({ status: "new", delivery_date: "2026-11-03", onRoute: false }, now, S)).toBe(true);
  });
  it("po godzinie granicznej, na trasie albo już zaplanowane — nie", () => {
    expect(canCustomerCancel({ status: "new", delivery_date: "2026-11-03", onRoute: false }, { ...now, time: "20:05" }, S)).toBe(
      false,
    );
    expect(canCustomerCancel({ status: "new", delivery_date: "2026-11-05", onRoute: true }, now, S)).toBe(false);
    expect(canCustomerCancel({ status: "planned", delivery_date: "2026-11-05", onRoute: false }, now, S)).toBe(false);
  });
});

describe("koszyk", () => {
  const P1 = "11111111-1111-4111-8111-111111111111";
  const P2 = "22222222-2222-4222-8222-222222222222";
  const catalog = new Map([
    [P1, { id: P1, unit: "skrz", unit_weight_kg: "6", price: "42.50" }],
    [P2, { id: P2, unit: "kg", unit_weight_kg: 1, price: null }],
  ]);

  it("łączy powtórzenia i usuwa zera", () => {
    expect(
      mergeCart([
        { product_id: P1, qty: 2 },
        { product_id: P2, qty: 0 },
        { product_id: P1, qty: 1 },
      ]),
    ).toEqual([{ product_id: P1, qty: 3 }]);
  });

  it("sumuje wagę i wartość w groszach, zaznacza brak ceny", () => {
    const s = summarizeCart(
      [
        { product_id: P1, qty: 3 },
        { product_id: P2, qty: 2.5 },
      ],
      catalog,
    );
    expect(s).toEqual({ items: 2, weightKg: 20.5, valueGrosze: 12750, hasUnpriced: true });
  });

  it("ilości: ułamki tylko dla kg", () => {
    expect(parseQty("2,5", "kg")).toBe(2.5);
    expect(parseQty("2,5", "skrz")).toBe(3);
    expect(parseQty("abc", "kg")).toBe(0);
    expect(parseQty("-3", "szt")).toBe(0);
    expect(stepQty(0.5, -1, "kg")).toBe(0);
    expect(stepQty(2, 1, "szt")).toBe(3);
  });

  it("walidacja formularza zamówienia", () => {
    const ok = placeOrderSchema.safeParse({
      delivery_point_id: P1,
      delivery_date: "2026-11-03",
      note: "  ",
      lines: JSON.stringify([{ product_id: P2, qty: 1.5 }]),
    });
    expect(ok.success && ok.data.note).toBe(null);
    expect(placeOrderSchema.safeParse({ delivery_point_id: P1, delivery_date: "2026-11-03", lines: "[]" }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ delivery_point_id: P1, delivery_date: "2026-11-03", lines: "nie-json" }).success).toBe(
      false,
    );
  });

  it("tłumaczy błędy bazy", () => {
    expect(portalErrorMessage("PORTAL_DATE_NOT_ALLOWED")).toMatch(/inny termin/);
    expect(portalErrorMessage("coś innego")).toMatch(/Spróbuj ponownie/);
  });
});

describe("statusy i katalog", () => {
  it("status dla klienta", () => {
    expect(portalOrderStatus("new").label).toBe("Przyjęte");
    expect(portalOrderStatus("in_progress").label).toBe("W drodze");
    expect(portalOrderStatus("cancelled").tone).toBe("neutral");
  });
  it("produkt: nazwa i jednostka wymagane, przecinek w cenie", () => {
    const r = productSchema.safeParse({ name: "Rukola", unit: "opak", price: "29,90", unit_weight_kg: "1" });
    expect(r.success && r.data.price).toBe(29.9);
    expect(productSchema.safeParse({ name: "", unit: "kg" }).success).toBe(false);
    expect(productSchema.safeParse({ name: "Cebula", unit: "tona" }).success).toBe(false);
  });
});

describe("hasło startowe", () => {
  it("3 grupy po 4 znaki, bez mylących znaków", () => {
    let i = 0;
    const pwd = generatePassword((n) => Uint8Array.from({ length: n }, () => i++ * 7));
    expect(pwd).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    expect(pwd).not.toMatch(/[0O1lI]/);
  });
});
