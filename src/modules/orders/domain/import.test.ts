import { describe, expect, it } from "vitest";
import {
  apiOrderToRow,
  buildPointIndex,
  dedupeOrders,
  IDENTITY_MAPPING,
  matchOrderToPoint,
  normalizeOrderRow,
  parseReadiness,
  suggestPoints,
  type PointForMatch,
} from "./import";

const mapping = {
  external_ref: "Nr",
  delivery_date: "Data",
  customer_code: "Kontrahent",
  point_code: "Odbiorca",
  address: "Adres",
  city: "Miasto",
  weight_kg: "Waga",
  crates: "Skrzynki",
  order_value: "Wartość",
  window: "Okno",
  readiness: "Status WMS",
};

const row = (o: Record<string, string>) => ({
  Nr: "WZ/1",
  Data: "06.11.2026",
  Kontrahent: "K1",
  Odbiorca: "",
  Adres: "",
  Miasto: "",
  Waga: "120,5",
  Skrzynki: "12",
  Wartość: "1 840,50",
  Okno: "6-8",
  "Status WMS": "Do realizacji",
  ...o,
});

describe("normalizeOrderRow", () => {
  it("parsuje polskie formaty", () => {
    const r = normalizeOrderRow(row({}), mapping, { date: "2026-11-05" }, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order).toMatchObject({
      external_ref: "WZ/1",
      delivery_date: "2026-11-06",
      weight_kg: 120.5,
      crates: 12,
      order_value: 1840.5,
      window_start: "06:00",
      window_end: "08:00",
      readiness: "awaiting_warehouse",
      type: "delivery",
    });
  });
  it("brak daty w pliku = dzień domyślny; błędy po polsku", () => {
    const ok = normalizeOrderRow(row({ Data: "" }), mapping, { date: "2026-11-05" }, 2);
    expect(ok.ok && ok.order.delivery_date).toBe("2026-11-05");
    const bad = normalizeOrderRow(
      row({ Nr: "", Skrzynki: "1,5", Okno: "8-6", Kontrahent: "" }),
      mapping,
      { date: "2026-11-05" },
      7,
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.line).toBe(7);
    expect(bad.errors).toEqual(
      expect.arrayContaining([
        "brak numeru zamówienia",
        "skrzynki: „1,5”",
        "okno „8-6”",
        "brak kodu klienta, kodu adresu i adresu",
      ]),
    );
  });
  it("gotowość", () => {
    expect(parseReadiness("Skompletowane")).toBe("ready");
    expect(parseReadiness("TAK")).toBe("ready");
    expect(parseReadiness("w kompletacji")).toBe("awaiting_warehouse");
    expect(parseReadiness("")).toBeNull();
  });
});

const P = (o: Partial<PointForMatch>): PointForMatch => ({
  id: "x",
  external_code: null,
  address_line: "Długa 1",
  city: "Kraków",
  is_active: true,
  customer_id: "c",
  customer_code: null,
  customer_name: "C",
  ...o,
});

describe("matchOrderToPoint", () => {
  const idx = buildPointIndex([
    P({ id: "p1", external_code: "K1-01", customer_code: "K1", address_line: "ul. Długa 1" }),
    P({ id: "p2", customer_code: "K2", address_line: "Krótka 2" }),
    P({ id: "p3", customer_code: "K2", address_line: "Budowa Lipowa 12" }),
    P({ id: "p4", customer_code: "K3", address_line: "Polna 3", city: "Skawina" }),
  ]);
  const o = (x: Partial<{ point_code: string; customer_code: string; address: string; city: string }>) => ({
    point_code: null,
    customer_code: null,
    address: null,
    city: null,
    ...x,
  });
  it("kod adresu, kod klienta, adres", () => {
    expect(matchOrderToPoint(o({ point_code: "k1-01" }), idx)).toEqual({ pointId: "p1", how: "point_code" });
    expect(matchOrderToPoint(o({ customer_code: "K3" }), idx)).toEqual({ pointId: "p4", how: "customer_code" });
    expect(matchOrderToPoint(o({ customer_code: "K2", address: "Budowa Lipowa 12", city: "Kraków" }), idx)).toEqual({
      pointId: "p3",
      how: "customer_address",
    });
    expect(matchOrderToPoint(o({ address: "ul. Polna 3", city: "skawina" }), idx)).toEqual({ pointId: "p4", how: "address" });
  });
  it("niejednoznaczne i nieznane", () => {
    const m = matchOrderToPoint(o({ customer_code: "K2" }), idx);
    expect(m.pointId).toBeNull();
    expect(matchOrderToPoint(o({ point_code: "ZZZ" }), idx)).toEqual({ pointId: null, reason: "nieznany kod adresu ZZZ" });
  });
});

describe("API i duplikaty", () => {
  it("wiersz z JSON przez mapowanie 1:1", () => {
    const r = normalizeOrderRow(
      apiOrderToRow({ external_ref: "A", customer_code: "K1", weight_kg: 10, readiness: "ready", delivery_date: "2026-11-06" }),
      IDENTITY_MAPPING,
      { date: "2026-11-05" },
      1,
    );
    expect(r.ok && r.order.weight_kg).toBe(10);
    expect(r.ok && r.order.readiness).toBe("ready");
  });
  it("ostatni wiersz wygrywa", () => {
    const base = normalizeOrderRow(row({}), mapping, { date: "2026-11-05" }, 2);
    const later = normalizeOrderRow(row({ Waga: "200" }), mapping, { date: "2026-11-05" }, 3);
    if (!base.ok || !later.ok) throw new Error();
    const d = dedupeOrders([base.order, later.order]);
    expect(d.duplicates).toBe(1);
    expect(d.orders[0].weight_kg).toBe(200);
  });
});

describe("suggestPoints", () => {
  it("podpowiada po nazwie i adresie", () => {
    const points = [
      P({ id: "a", customer_name: "Budimex Kraków", address_line: "Lipowa 12" }),
      P({ id: "b", customer_name: "Sklep Społem", address_line: "Długa 5" }),
    ];
    const s = suggestPoints(
      { raw_customer_code: null, raw_point_code: null, raw_customer_name: "BUDIMEX S.A.", raw_address: "ul. Lipowa 12, Kraków" },
      points,
    );
    expect(s[0].id).toBe("a");
  });
});
