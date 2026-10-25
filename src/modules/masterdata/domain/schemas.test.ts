import { describe, expect, it } from "vitest";
import { formToObject } from "@/lib/forms";
import { buildWindows, customerSchema, isNoteActive, noteSchema, pointSchema, vehicleSchema, windowsToForm } from "./schemas";

const point = {
  name: "Kuchnia",
  branch_type: "kitchen",
  address_line: "ul. Przykładowa 12",
  postal_code: "30-198",
  city: "Kraków",
  "delivery_weekdays": ["1", "3", "5"],
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
    expect(pointSchema.safeParse({ ...point, window1_from: "" , window1_to: ""}).success).toBe(false);
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
