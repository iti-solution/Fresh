import { describe, expect, it } from "vitest";
import { parseCash, parseOdometer, parsePackaging, PIN_RE, quickStatusOf, shiftReport, validateOdometerEnd } from "./execution";

describe("PIN i licznik", () => {
  it("PIN 4–6 cyfr", () => {
    expect(PIN_RE.test("1234")).toBe(true);
    expect(PIN_RE.test("123456")).toBe(true);
    expect(PIN_RE.test("12a4")).toBe(false);
    expect(PIN_RE.test("123")).toBe(false);
  });
  it("licznik: cyfry, koniec ≥ start, rozsądny przebieg", () => {
    expect(parseOdometer("128 455")).toBe(128455);
    expect(parseOdometer("12,5")).toBeNull();
    expect(validateOdometerEnd(1000, 999)).toMatch(/mniejszy/);
    expect(validateOdometerEnd(1000, 4000)).toMatch(/2000/);
    expect(validateOdometerEnd(1000, 1092)).toBeNull();
    expect(validateOdometerEnd(1000, null)).toMatch(/Wpisz/);
  });
});

describe("opakowania i gotówka", () => {
  it("bierze tylko niezerowe, poprawne liczby", () => {
    expect(parsePackaging({ out_a: "2", back_a: "1", out_b: "0", back_b: "", out_c: "-3", back_c: "1.5" }, ["a", "b", "c"])).toEqual([
      { typeId: "a", out: 2, back: 1 },
    ]);
  });
  it("gotówka w groszach", () => {
    expect(parseCash("640,50")).toBe(64050);
    expect(parseCash("")).toBeNull();
    expect(parseCash("12,345")).toBeNull();
  });
});

describe("statusy i raport", () => {
  it("mapuje status punktu na szybki status", () => {
    expect(quickStatusOf("in_progress")).toBe("now");
    expect(quickStatusOf("complaint")).toBeNull();
  });
  it("liczy raport zmiany", () => {
    const r = shiftReport({
      stops: [
        { status: "delivered", windowEnd: "08:00", completedAtLocal: "07:40" },
        { status: "partial", windowEnd: "10:00", completedAtLocal: "10:12" },
        { status: "absent" },
        { status: "pending" },
      ],
      odometerStart: 128455,
      odometerEnd: 128547,
      packaging: [{ code: "SKRZ-PL", name: "Skrzynki", out: 20, back: 14 }],
      cashGrosze: 64050,
      startedAt: null,
      finishedAt: null,
    });
    expect(r).toMatchObject({ total: 4, finished: 3, delivered: 1, partial: 1, exceptions: 1, onTime: 1, withWindow: 2, km: 92, cashGrosze: 64050 });
    expect(r.packaging[0].toHandOver).toBe(14);
  });
});
