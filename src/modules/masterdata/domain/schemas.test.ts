import { describe, expect, it } from "vitest";
import { formToObject } from "@/lib/forms";
import {
  buildWindows,
  customerSchema,
  isNoteActive,
  noteSchema,
  pointSchema,
  driverSchema,
  missingLicenses,
  vehicleSchema,
  windowsToForm,
  templateSchema,
} from "./schemas";

const point = {
  name: "Kuchnia",
  point_type_id: "8d6f2b1e-3c4a-4f5b-9a7c-1e2d3c4b5a69",
  address_line: "ul. Przykładowa 12",
  postal_code: "30-198",
  city: "Kraków",
  delivery_weekdays: ["1", "3", "5"],
  window1_from: "06:00",
  window1_to: "08:00",
};

describe("customerSchema", () => {
  it("normalizuje NIP i puste pola", () => {
    const r = customerSchema.parse({ name: "Hotel Demo", nip: "123-456-78-90", category: "", is_active: "on" });
    expect(r).toMatchObject({ name: "Hotel Demo", nip: "1234567890", category: null, is_active: true });
  });
  it("odrzuca zły NIP i za krótką nazwę", () => {
    expect(customerSchema.safeParse({ name: "H", nip: "123" }).success).toBe(false);
  });
});

describe("pointSchema + okna", () => {
  it("buduje okna na każdy dzień dostaw", () => {
    const r = pointSchema.parse({ ...point, window2_from: "12:00", window2_to: "14:00" });
    expect(r.delivery_weekdays).toEqual([1, 3, 5]);
    const rows = buildWindows(r);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({ weekday: 1, opens_at: "06:00", closes_at: "08:00" });
    expect(rows[1]).toEqual({ weekday: 1, opens_at: "12:00", closes_at: "14:00" });
  });
  it("wymaga dnia dostaw i poprawnego okna", () => {
    expect(pointSchema.safeParse({ ...point, delivery_weekdays: [] }).success).toBe(false);
    expect(pointSchema.safeParse({ ...point, window1_to: "05:00" }).success).toBe(false);
    expect(pointSchema.safeParse({ ...point, window1_from: "", window1_to: "" }).success).toBe(false);
    expect(pointSchema.safeParse({ ...point, postal_code: "30198" }).success).toBe(false);
  });
  it("drugie okno nie może nachodzić na pierwsze", () => {
    expect(pointSchema.safeParse({ ...point, window2_from: "07:00", window2_to: "09:00" }).success).toBe(false);
  });
  it("odtwarza formularz z zapisanych okien", () => {
    expect(
      windowsToForm([
        { weekday: 3, opens_at: "12:00:00", closes_at: "14:00:00" },
        { weekday: 3, opens_at: "06:00:00", closes_at: "08:00:00" },
      ]),
    ).toEqual({ window1_from: "06:00", window1_to: "08:00", window2_from: "12:00", window2_to: "14:00" });
  });
});

describe("uwagi tymczasowe", () => {
  it("aktywna w zakresie dat, bezterminowa zawsze od startu", () => {
    expect(isNoteActive({ valid_from: "2026-10-20", valid_to: "2026-10-30" }, "2026-10-26")).toBe(true);
    expect(isNoteActive({ valid_from: "2026-10-20", valid_to: "2026-10-22" }, "2026-10-26")).toBe(false);
    expect(isNoteActive({ valid_from: "2026-10-27", valid_to: null }, "2026-10-26")).toBe(false);
    expect(isNoteActive({ valid_from: "2026-10-01", valid_to: null }, "2026-10-26")).toBe(true);
  });
  it("koniec nie może być przed początkiem", () => {
    expect(noteSchema.safeParse({ text: "Remont wjazdu", valid_from: "2026-10-26", valid_to: "2026-10-20" }).success).toBe(false);
  });
});

describe("vehicleSchema i formToObject", () => {
  it("normalizuje rejestrację i liczby", () => {
    const r = vehicleSchema.parse({ registration: "kr  4f201", capacity_kg: "3 500", capacity_crates: "90", is_own: "on" });
    expect(r).toMatchObject({ registration: "KR 4F201", capacity_kg: 3500, capacity_crates: 90, is_own: true, carrier_id: null });
  });
  it("zbiera checkboxy name[] do tablicy", () => {
    const fd = new FormData();
    fd.append("delivery_weekdays[]", "1");
    fd.append("delivery_weekdays[]", "2");
    fd.append("name", "X");
    expect(formToObject(fd)).toEqual({ delivery_weekdays: ["1", "2"], name: "X" });
  });
});

describe("templateSchema", () => {
  const base = { name: "Kraków Zachód", weekdays: ["1", "3", "5"], planned_start: "05:30" };
  it("kierowcy opcjonalni", () => {
    const r = templateSchema.safeParse(base);
    expect(r.success && r.data).toMatchObject({
      weekdays: [1, 3, 5],
      planned_start: "05:30",
      default_driver_id: null,
      alt_driver_id: null,
      default_vehicle_id: null,
    });
  });
  it("zastępczy musi być inną osobą niż wstępny", () => {
    const r = templateSchema.safeParse({ ...base, default_driver_id: "d1", alt_driver_id: "d1" });
    expect(r.success).toBe(false);
    expect(templateSchema.safeParse({ ...base, default_driver_id: "d1", alt_driver_id: "d2" }).success).toBe(true);
  });
  it("wymaga nazwy i dni", () => {
    expect(templateSchema.safeParse({ name: "", weekdays: [] }).success).toBe(false);
  });
});

describe("kartoteka pojazdu i kierowcy — pola z etapu „biuro”", () => {
  it("pojazd: przyczepa, gabaryty, licznik, skrzyniopalety i wymagane kategorie", () => {
    const r = vehicleSchema.parse({
      registration: "KR 1AB23",
      trailer_registration: " kr  9zz1 ",
      length_m: "7,2",
      height_m: "",
      odometer_km: "182 450",
      capacity_box_pallets: "6",
      required_licenses: ["C", "nieznana", "B"],
    });
    expect(r.trailer_registration).toBe("KR 9ZZ1");
    expect(r.length_m).toBe(7.2);
    expect(r.height_m).toBeNull();
    expect(r.odometer_km).toBe(182450);
    expect(r.capacity_box_pallets).toBe(6);
    expect(r.required_licenses).toEqual(["B", "C"]);
  });
  it("pojazd bez nowych pól zapisuje puste wartości", () => {
    const r = vehicleSchema.parse({ registration: "KR 1AB23" });
    expect(r.required_licenses).toEqual([]);
    expect(r.trailer_registration).toBeNull();
    expect(r.capacity_box_pallets).toBe(0);
  });
  it("kierowca: e-mail, kategorie i stand-by", () => {
    const r = driverSchema.parse({ first_name: "Jan", last_name: "Testowy", email: " Jan@Example.PL ", license_categories: ["C+E", "B"], standby: "on" });
    expect(r.email).toBe("jan@example.pl");
    expect(r.license_categories).toEqual(["B", "C+E"]);
    expect(r.standby).toBe(true);
    expect(driverSchema.safeParse({ first_name: "Jan", last_name: "Testowy", email: "to-nie-mail" }).success).toBe(false);
    expect(driverSchema.parse({ first_name: "Jan", last_name: "Testowy" }).email).toBeNull();
  });
  it("missingLicenses: brakujące kategorie, a przy pustej kartotece bez alarmu", () => {
    expect(missingLicenses(["C", "C+E"], ["B", "C"])).toEqual(["C+E"]);
    expect(missingLicenses(["C"], ["B", "C"])).toEqual([]);
    expect(missingLicenses([], ["B"])).toEqual([]);
    expect(missingLicenses(["C"], [])).toEqual([]);
    expect(missingLicenses(null, undefined)).toEqual([]);
  });
});
