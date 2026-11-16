import { describe, expect, it } from "vitest";
import { parsePeriod, resolvePeriod } from "./period";

describe("resolvePeriod", () => {
  it("dziś porównuje z tym samym dniem tydzień wcześniej", () => {
    expect(resolvePeriod("dzis", "2026-11-16")).toMatchObject({
      start: "2026-11-16",
      end: "2026-11-16",
      prevStart: "2026-11-09",
      prevEnd: "2026-11-09",
    });
  });
  it("7 i 14 dni kończą się dziś, porównanie to poprzednie tyle samo dni", () => {
    expect(resolvePeriod("7", "2026-11-16")).toMatchObject({
      start: "2026-11-10",
      end: "2026-11-16",
      prevStart: "2026-11-03",
      prevEnd: "2026-11-09",
    });
    expect(resolvePeriod("14", "2026-11-16")).toMatchObject({ start: "2026-11-03", prevStart: "2026-10-20", prevEnd: "2026-11-02" });
  });
  it("bieżący miesiąc: od 1. do dziś, porównanie z tym samym fragmentem poprzedniego", () => {
    expect(resolvePeriod("miesiac", "2026-11-16")).toMatchObject({
      start: "2026-11-01",
      end: "2026-11-16",
      prevStart: "2026-10-01",
      prevEnd: "2026-10-16",
    });
  });
  it("bieżący miesiąc: krótszy poprzedni miesiąc nie wychodzi poza swój koniec", () => {
    expect(resolvePeriod("miesiac", "2026-03-31")).toMatchObject({ prevStart: "2026-02-01", prevEnd: "2026-02-28" });
  });
  it("poprzedni miesiąc: cały miesiąc, porównanie z miesiącem wcześniej (także przez styczeń)", () => {
    expect(resolvePeriod("poprzedni", "2026-11-16")).toMatchObject({
      start: "2026-10-01",
      end: "2026-10-31",
      prevStart: "2026-09-01",
      prevEnd: "2026-09-30",
    });
    expect(resolvePeriod("poprzedni", "2026-01-10")).toMatchObject({ start: "2025-12-01", end: "2025-12-31", prevStart: "2025-11-01" });
  });
  it("nieznany klucz wraca do 7 dni", () => {
    expect(parsePeriod("x")).toBe("7");
    expect(parsePeriod(undefined)).toBe("7");
    expect(parsePeriod("miesiac")).toBe("miesiac");
  });
});

import { daysBetween, resolveView, weekStart } from "./period";

describe("resolveView", () => {
  it("tydzień zaczyna się w poniedziałek (także dla niedzieli)", () => {
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(weekStart("2026-11-18")).toBe("2026-11-16");
  });
  it("dzień: porównanie z tym samym dniem tydzień wcześniej, strzałki o 1 dzień", () => {
    expect(resolveView("dzien", "2026-11-16")).toMatchObject({
      start: "2026-11-16",
      end: "2026-11-16",
      prevStart: "2026-11-09",
      prevAnchor: "2026-11-15",
      nextAnchor: "2026-11-17",
    });
  });
  it("tydzień: pn–nd, porównanie z poprzednim tygodniem", () => {
    expect(resolveView("tydzien", "2026-11-18")).toMatchObject({
      start: "2026-11-16",
      end: "2026-11-22",
      prevStart: "2026-11-09",
      prevEnd: "2026-11-15",
      nextAnchor: "2026-11-25",
    });
  });
  it("miesiąc: cały miesiąc kalendarzowy, porównanie z poprzednim (także lut. i przez styczeń)", () => {
    expect(resolveView("miesiac", "2026-03-15")).toMatchObject({ start: "2026-03-01", end: "2026-03-31", prevStart: "2026-02-01", prevEnd: "2026-02-28" });
    expect(resolveView("miesiac", "2026-01-10")).toMatchObject({ prevStart: "2025-12-01", prevEnd: "2025-12-31", prevAnchor: "2025-12-01" });
  });
  it("daysBetween zwraca wszystkie dni włącznie", () => {
    expect(daysBetween("2026-11-28", "2026-12-02")).toEqual(["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });
});
