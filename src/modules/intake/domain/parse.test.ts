import { describe, expect, it } from "vitest";
import {
  accuracy,
  fold,
  highlight,
  parseDateHint,
  parseOrderText,
  segments,
  stem,
  toParsedOrder,
  type CatalogEntry,
} from "./parse";

const CATALOG: CatalogEntry[] = [
  { id: "awo", name: "Awokado Hass", unit: "skrz" },
  { id: "ban", name: "Banany", unit: "kg" },
  { id: "baz", name: "Bazylia (doniczka)", unit: "szt" },
  { id: "pie", name: "Natka pietruszki", unit: "pecz" },
  { id: "pom-mal", name: "Pomidor malinowy", unit: "kg" },
  { id: "pom-skrz", name: "Pomidor gałązkowy (skrzynka 6 kg)", unit: "skrz" },
  { id: "ceb", name: "Cebula żółta", unit: "kg" },
  { id: "ceb-cz", name: "Cebula czerwona", unit: "kg" },
  { id: "ziem", name: "Ziemniaki (worek 15 kg)", unit: "opak" },
  { id: "ruk", name: "Rukola (opak. 1 kg)", unit: "opak" },
];
const TODAY = "2026-11-02"; // poniedziałek

describe("normalizacja", () => {
  it("usuwa polskie znaki bez zmiany długości", () => {
    const t = "Pęczek łódzkiej bazylii 😀!";
    expect(fold(t)).toHaveLength(t.length);
    expect(fold("Żółć")).toBe("zolc");
  });
  it("rdzeń łączy odmiany", () => {
    expect(stem("bananow")).toBe(stem("banany"));
    expect(stem("bazylii").startsWith(stem("bazylia")) || stem("bazylia").startsWith(stem("bazylii"))).toBe(true);
  });
});

describe("dzielenie wiadomości", () => {
  it("przecinki, nowe linie, „i” i wypunktowania", () => {
    const s = segments("Dzień dobry, 10 skrzynek awokado i 5 kg bananów\n- 6 pęczków pietruszki.");
    expect(s.map((x) => x.text)).toEqual(["Dzień dobry", "10 skrzynek awokado", "5 kg bananów", "6 pęczków pietruszki"]);
  });
});

describe("rozpoznawanie zamówienia", () => {
  it("SMS jak u Fresho: ilości, jednostki, produkty, dzień i uwaga", () => {
    const text =
      "Dzień dobry, tu Ania z Bistro Kazimierz. Na jutro poproszę 10 skrzynek awokado, 5 kg bananów, " +
      "6... a nie, 10 pęczków natki pietruszki. Zostawcie w chłodni od zaplecza";
    const r = parseOrderText(text, CATALOG, [], TODAY);
    expect(r.dateHint).toBe("2026-11-03");
    expect(r.lines.map((l) => [l.productId, l.qty])).toEqual([
      ["awo", 10],
      ["ban", 5],
      ["pie", 10],
    ]);
    expect(r.lines.every((l) => l.confidence >= 0.6)).toBe(true);
    expect(r.note).toBe("Zostawcie w chłodni od zaplecza");
    expect(r.lines[0].phrase).toBe("10 skrzynek awokado"); // bez „Na jutro poproszę”
    // pozycje w tekście pasują do oryginału (podświetlenie)
    for (const l of r.lines) expect(text.slice(l.spanStart, l.spanEnd)).toBe(l.phrase);
  });

  it("słownik klienta wygrywa z katalogiem i podnosi pewność", () => {
    const aliases = [{ alias_key: "pomido", product_id: "pom-skrz", customerSpecific: true }];
    const r = parseOrderText("pomidorki 2", CATALOG, aliases, TODAY);
    expect(r.lines[0]).toMatchObject({ productId: "pom-skrz", qty: 2, confidence: 0.95, aliasKey: "pomido" });
  });

  it("niejednoznaczna nazwa = niska pewność; jednostka rozstrzyga", () => {
    const amb = parseOrderText("cebula 3", CATALOG, [], TODAY).lines[0];
    expect(amb.confidence).toBeLessThan(0.6);
    const skrz = parseOrderText("2 skrzynki pomidorów", CATALOG, [], TODAY).lines[0];
    expect(skrz.productId).toBe("pom-skrz");
  });

  it("słowa liczebników i brak ilości", () => {
    const r = parseOrderText("dwie rukole, ziemniaki", CATALOG, [], TODAY);
    expect(r.lines[0]).toMatchObject({ productId: "ruk", qty: 2 });
    expect(r.lines[1]).toMatchObject({ productId: "ziem", qty: 1 });
    expect(r.lines[1].confidence).toBeLessThanOrEqual(0.4);
  });

  it("nieznany produkt z ilością zostaje do wyboru przez człowieka", () => {
    const r = parseOrderText("4 kg kalarepy", CATALOG, [], TODAY);
    expect(r.lines[0]).toMatchObject({ productId: null, qty: 4, unit: "kg", confidence: 0 });
  });

  it("ułamek dla sztuk zaokrąglony w górę, pół kilo bananów zostaje", () => {
    const r = parseOrderText("półtora skrzynki awokado, pół kilo bananów", CATALOG, [], TODAY);
    expect(r.lines.map((l) => [l.productId, l.qty])).toEqual([
      ["awo", 2],
      ["ban", 0.5],
    ]);
  });
});

describe("dzień dostawy", () => {
  it("jutro, pojutrze, dzień tygodnia", () => {
    expect(parseDateHint("na jutro", TODAY)).toBe("2026-11-03");
    expect(parseDateHint("pojutrze rano", TODAY)).toBe("2026-11-04");
    expect(parseDateHint("na piątek", TODAY)).toBe("2026-11-06");
    expect(parseDateHint("na poniedziałek", TODAY)).toBe("2026-11-09");
    expect(parseDateHint("10 kg bananów", TODAY)).toBe(null);
  });
});

describe("skuteczność", () => {
  it("liczy zamówienia bez poprawek i trafione pozycje", () => {
    const a = accuracy([
      { draftId: "a", outcome: "accepted" },
      { draftId: "a", outcome: "accepted" },
      { draftId: "b", outcome: "accepted" },
      { draftId: "b", outcome: "corrected" },
      { draftId: "b", outcome: "added" },
      { draftId: "b", outcome: "removed" },
    ]);
    expect(a).toMatchObject({ orders: 2, ordersExact: 1, orderRate: 50, linesAccepted: 3, lineRate: 50 });
  });
  it("pusto = brak wskaźnika", () => {
    expect(accuracy([]).orderRate).toBe(null);
  });
});

describe("podświetlenie", () => {
  it("dzieli tekst na zwykłe i rozpoznane kawałki", () => {
    expect(highlight("ab cd ef", [{ start: 3, end: 5, key: "x" }])).toEqual([
      { text: "ab " },
      { text: "cd", key: "x" },
      { text: " ef" },
    ]);
  });
});

describe("wynik modelu AI", () => {
  it("odrzuca produkty spoza katalogu, znajduje frazy w treści, zaokrągla sztuki", () => {
    const text = "Poproszę 10 skrzynek awokado i 2,5 kg bananów oraz 3 kawiory";
    const r = toParsedOrder(
      {
        lines: [
          { phrase: "10 skrzynek awokado", product_id: "awo", qty: 10, unit: "skrz", confidence: 0.92 },
          { phrase: "2,5 kg bananów", product_id: "ban", qty: 2.5, unit: "kg", confidence: 0.9 },
          { phrase: "3 kawiory", product_id: "wymyslony", qty: 3, unit: null, confidence: 0.8 },
        ],
        delivery_date: "2026-11-03",
        note: "  ",
      },
      text,
      CATALOG,
    );
    expect(r.lines.map((l) => [l.productId, l.qty, l.confidence])).toEqual([
      ["awo", 10, 0.92],
      ["ban", 2.5, 0.9],
      [null, 3, 0],
    ]);
    expect(text.slice(r.lines[1].spanStart, r.lines[1].spanEnd)).toBe("2,5 kg bananów");
    expect(r.lines[0].aliasKey).toBe(stem("awokado"));
    expect(r.note).toBe(null);
    expect(r.dateHint).toBe("2026-11-03");
  });
});
