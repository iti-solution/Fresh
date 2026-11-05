import { describe, expect, it } from "vitest";
import { addressKey, cellToString, fold, guessMapping, parseDate, parseDecimal, parseTime, parseTimeRange, rowsToObjects } from "./tabular";

describe("tabular", () => {
  it("fold i adres", () => {
    expect(fold(" Ilość  Palet ")).toBe("ilosc palet");
    expect(fold("Łódź")).toBe("lodz");
    expect(addressKey("ul. Długa 5", "Kraków")).toBe(addressKey("Dluga 5", "KRAKÓW"));
  });
  it("liczby", () => {
    expect(parseDecimal("1 234,50 zł")).toBe(1234.5);
    expect(parseDecimal("1.234,5")).toBe(1234.5);
    expect(parseDecimal("12.5")).toBe(12.5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNaN();
  });
  it("daty", () => {
    expect(parseDate("2026-11-06")).toBe("2026-11-06");
    expect(parseDate("6.11.2026")).toBe("2026-11-06");
    expect(parseDate("06/11/26")).toBe("2026-11-06");
    expect(parseDate("46332")).toBe("2026-11-06");
    expect(parseDate("31.02.2026")).toBeNull();
  });
  it("godziny i okna", () => {
    expect(parseTime("6")).toBe("06:00");
    expect(parseTime("6.30")).toBe("06:30");
    expect(parseTime("0630")).toBe("06:30");
    expect(parseTime("0,25")).toBe("06:00");
    expect(parseTime("25:00")).toBeNull();
    expect(parseTimeRange("6-8")).toEqual(["06:00", "08:00"]);
    expect(parseTimeRange("06:00–08:30")).toEqual(["06:00", "08:30"]);
    expect(parseTimeRange("8-6")).toBeNull();
  });
  it("komórki i wiersze", () => {
    expect(cellToString(new Date(Date.UTC(2026, 10, 6)))).toBe("2026-11-06");
    expect(cellToString(new Date(Date.UTC(1899, 11, 30, 6, 30)))).toBe("06:30");
    const r = rowsToObjects([[], ["Nr", "Nr", null], ["A1", "B", 3], [null, "", ""]]);
    expect(r.headers).toEqual(["Nr", "Nr (2)", "Kolumna 3"]);
    expect(r.rows).toEqual([{ Nr: "A1", "Nr (2)": "B", "Kolumna 3": "3" }]);
  });
  it("zgaduje mapowanie i pamięta zapisane", () => {
    const fields = [
      { key: "ref", label: "", synonyms: ["nr zamowienia", "numer"] },
      { key: "kg", label: "", synonyms: ["masa", "waga"] },
    ];
    expect(guessMapping(fields, ["Nr zamówienia", "Waga [kg]"])).toEqual({ ref: "Nr zamówienia", kg: "Waga [kg]" });
    expect(guessMapping(fields, ["Dokument", "Masa"], { ref: "Dokument" })).toEqual({ ref: "Dokument", kg: "Masa" });
  });
});
