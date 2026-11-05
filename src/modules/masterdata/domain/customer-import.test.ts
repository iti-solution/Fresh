import { describe, expect, it } from "vitest";
import { customerKey, normalizeCustomerRow, parseWeekdays, pointKey, resolvePointType } from "./customer-import";

const types = [
  { id: "t-other", code: "other", name: "Inny" },
  { id: "t-shop", code: "shop", name: "Sklep / punkt sprzedaży" },
  { id: "t-con", code: "construction", name: "Budowa" },
  { id: "t-food", code: "food_service", name: "Lokal gastronomiczny" },
];

describe("dni dostaw", () => {
  it("różne zapisy", () => {
    expect(parseWeekdays("pn-pt")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWeekdays("Pn, Śr, Pt")).toEqual([1, 3, 5]);
    expect(parseWeekdays("1-6")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseWeekdays("codziennie")).toHaveLength(7);
    expect(parseWeekdays("xyz")).toBeNull();
  });
});

describe("typ adresu", () => {
  it("nazwa, kod, synonim", () => {
    expect(resolvePointType("budowa", types)?.id).toBe("t-con");
    expect(resolvePointType("SHOP", types)?.id).toBe("t-shop");
    expect(resolvePointType("Restauracja", types)?.id).toBe("t-food");
    expect(resolvePointType("sklep", types)?.id).toBe("t-shop");
    expect(resolvePointType("kosmos", types)).toBeNull();
  });
});

describe("normalizeCustomerRow", () => {
  const mapping = {
    customer_code: "Kod",
    customer_name: "Nazwa",
    nip: "NIP",
    point_type: "Typ",
    address: "Adres",
    postal_code: "Kod poczt.",
    city: "Miasto",
    weekdays: "Dni",
    window: "Okno",
    active_to: "Do",
    site_manager_name: "Kierownik",
  };
  const base = { Kod: "K1", Nazwa: "Budimex", NIP: "PL 526-025-09-95", Typ: "budowa", Adres: "Lipowa 12", "Kod poczt.": "30702", Miasto: "Kraków", Dni: "pn-pt", Okno: "7-9", Do: "31.03.2027", Kierownik: "Jan Nowak" };
  it("pełny wiersz budowy", () => {
    const r = normalizeCustomerRow(base, mapping, types, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.customer).toMatchObject({ external_code: "K1", name: "Budimex", nip: "5260250995" });
    expect(r.row.point).toMatchObject({
      name: "Adres główny",
      point_type_id: "t-con",
      postal_code: "30-702",
      delivery_weekdays: [1, 2, 3, 4, 5],
      windows: [["07:00", "09:00"]],
      active_to: "2027-03-31",
      site_manager_name: "Jan Nowak",
    });
  });
  it("błędy i ostrzeżenia", () => {
    const r = normalizeCustomerRow({ ...base, Adres: "", Dni: "zawsze", NIP: "123" }, mapping, types, 5);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(expect.arrayContaining(["brak adresu", "dni dostaw „zawsze”"]));
    const w = normalizeCustomerRow({ ...base, NIP: "123", Typ: "kosmos" }, mapping, types, 6);
    expect(w.ok && w.row.warnings.length).toBe(2);
    expect(w.ok && w.row.point.point_type_id).toBe("t-other");
  });
  it("klucze grupowania", () => {
    expect(customerKey({ external_code: " k1 ", name: "x" })).toBe("code:K1");
    expect(customerKey({ external_code: null, name: "Społem  Kraków" })).toBe("name:spolem krakow");
    expect(pointKey({ external_code: null, address_line: "ul. Lipowa 12", city: "Kraków" })).toBe(pointKey({ external_code: null, address_line: "Lipowa 12", city: "krakow" }));
  });
});
