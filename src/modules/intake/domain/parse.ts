// Rozpoznawanie zamówienia z wiadomości (SMS, e-mail, WhatsApp, transkrypcja) — wersja słownikowa, bez AI.
// Czyste funkcje: dzielą tekst na fragmenty, wyłapują ilość, jednostkę i produkt (najpierw słownik klienta,
// potem nazwy z katalogu), dzień dostawy i uwagi. Wynik ZAWSZE trafia do sprawdzenia przez człowieka.

export type CatalogEntry = { id: string; name: string; code?: string | null; unit: string; category?: string | null };
export type AliasEntry = { alias_key: string; product_id: string; customerSpecific: boolean };

export type ParsedLine = {
  phrase: string; // fragment wiadomości, np. „10 skrzynek awokado”
  aliasKey: string; // znormalizowana nazwa produktu z frazy → słownik
  spanStart: number; // pozycja fragmentu w treści (podświetlenie)
  spanEnd: number;
  productId: string | null;
  qty: number | null;
  unit: string | null; // jednostka z wiadomości (kg, skrz, szt, opak, pecz)
  confidence: number; // 0–1
};

export type ParsedOrder = { lines: ParsedLine[]; dateHint: string | null; note: string | null };

// =========================================================
// NORMALIZACJA (ta sama długość tekstu → pozycje podświetleń pasują do oryginału)
// =========================================================
const PL_MAP: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

/** Małe litery bez polskich znaków, znak w znak (ta sama długość co oryginał). */
export function fold(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) {
    const m = PL_MAP[ch];
    out += m ?? (ch.length === 1 ? ch : " ".repeat(ch.length)); // znaki spoza BMP (emoji) zajmują 2 pozycje
  }
  return out;
}

/** Rdzeń słowa do porównań odmian: „bananów”, „banany” → „bana”; „bazylii”, „bazylia” → „bazy”. */
export function stem(word: string): string {
  return word.length <= 4 ? word : word.slice(0, Math.max(4, word.length - 3));
}

function stemsMatch(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

// =========================================================
// SŁOWA KLUCZOWE
// =========================================================
const NUMBER_WORDS: Record<string, number> = {
  pol: 0.5,
  poltora: 1.5,
  jeden: 1,
  jedna: 1,
  jedno: 1,
  dwa: 2,
  dwie: 2,
  trzy: 3,
  cztery: 4,
  piec: 5,
  szesc: 6,
  siedem: 7,
  osiem: 8,
  dziewiec: 9,
  dziesiec: 10,
  jedenascie: 11,
  dwanascie: 12,
  pietnascie: 15,
  dwadziescia: 20,
  trzydziesci: 30,
};

/** Słowo → jednostka katalogu. Porównanie po początku słowa (odmiany). */
const UNIT_PREFIXES: [string, string][] = [
  ["kilogram", "kg"],
  ["kilo", "kg"],
  ["kg", "kg"],
  ["skrz", "skrz"],
  ["box", "skrz"],
  ["karton", "skrz"],
  ["sztuk", "szt"],
  ["szt", "szt"],
  ["opak", "opak"],
  ["worek", "opak"],
  ["worki", "opak"],
  ["workow", "opak"],
  ["paczk", "opak"],
  ["pecz", "pecz"],
];

const STOPWORDS = new Set(
  (
    "dzien dobry czesc witam hej prosze poprosze prosimy poprosimy chcialbym chcialabym chcemy zamawiam zamowienie zamowic " +
    "na jutro pojutrze dzis dzisiaj rano i oraz a do z ze w we po tez jeszcze takze x razy dla nas mi mnie by bym sie " +
    "moze mozna mozemy moge mam ok okolo ten ta to te tego tej tych jak co czy dziekuje dzieki pozdrawiam " +
    "poniedzialek wtorek sroda srode czwartek piatek sobota sobote niedziela niedziele tydzien " +
    "jednak nie tak raczej zamiast albo lub dokladnie jakies jakis"
  ).split(" "),
);

/** Fragment bez towaru, który jest wskazówką dla dostawy (nie powitaniem ani podpisem). */
const NOTE_CUE =
  /\b(zostaw|zostawc|dzwon|zadzwon|wjazd|wjecha|bram|chlodni|lodow|zaplecz|kod|pietr|tyln|wejsci|godz|przed|rano|wieczor|kierowc|faktur|paragon|uwag|twardsz|dojrzal|niedojrzal|mniejsz|wieksz)/;

const WEEKDAY_STEMS: [string, number][] = [
  ["poniedzial", 1],
  ["wtor", 2],
  ["srod", 3],
  ["czwart", 4],
  ["piat", 5],
  ["sobot", 6],
  ["niedziel", 7],
];

function unitOf(word: string): string | null {
  for (const [p, u] of UNIT_PREFIXES) if (word.startsWith(p)) return u;
  return null;
}

function numberOf(word: string): number | null {
  if (/^\d+([.,]\d+)?$/.test(word)) return Number(word.replace(",", "."));
  return NUMBER_WORDS[word] ?? null;
}

// =========================================================
// DATA DOSTAWY
// =========================================================
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoWeekday(day: string): number {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** „jutro”, „pojutrze”, „na wtorek” → data (YYYY-MM-DD); brak wskazówki → null. */
export function parseDateHint(text: string, today: string): string | null {
  const t = fold(text);
  if (/\bpojutrze\b/.test(t)) return addDays(today, 2);
  if (/\bjutr/.test(t)) return addDays(today, 1);
  for (const [s, wd] of WEEKDAY_STEMS) {
    if (new RegExp(`\\b${s}`).test(t)) {
      const diff = (wd - isoWeekday(today) + 7) % 7 || 7;
      return addDays(today, diff);
    }
  }
  return null;
}

// =========================================================
// PODZIAŁ NA FRAGMENTY
// =========================================================
type Segment = { start: number; end: number; text: string };

/** Dzieli wiadomość na fragmenty: przecinki, średniki, nowe linie, kropki, „i”, „oraz”, myślniki wypunktowań. */
export function segments(text: string): Segment[] {
  const folded = fold(text);
  const sep = /[,;\n\r]|\.(?=\s|$)|\s+i\s+|\s+oraz\s+|\s+-\s+|^\s*-\s+|\s+a\s+(?=\d)/g;
  const out: Segment[] = [];
  let last = 0;
  for (const m of folded.matchAll(sep)) {
    out.push({ start: last, end: m.index!, text: "" });
    last = m.index! + m[0].length;
  }
  out.push({ start: last, end: text.length, text: "" });
  return out
    .map((s) => {
      let { start, end } = s;
      while (start < end && /[\s\-•*]/.test(text[start])) start++; // spacje i znaki wypunktowania
      while (end > start && /[\s!?.…]/.test(text[end - 1])) end--;
      return { start, end, text: text.slice(start, end) };
    })
    .filter((s) => s.end > s.start);
}

type Token = { word: string; start: number; end: number };

function tokens(seg: Segment, folded: string): Token[] {
  const out: Token[] = [];
  const re = /[a-z]+|\d+(?:[.,]\d+)?/g;
  const part = folded.slice(seg.start, seg.end);
  for (const m of part.matchAll(re))
    out.push({ word: m[0], start: seg.start + m.index!, end: seg.start + m.index! + m[0].length });
  return out;
}

// =========================================================
// DOPASOWANIE PRODUKTU
// =========================================================
type ProductKey = { id: string; unit: string; stems: string[] };

/** Nazwa produktu bez dopisków w nawiasach („(skrzynka 6 kg)”) → rdzenie słów. */
export function productStems(name: string): string[] {
  return fold(name.replace(/\(.*?\)/g, " "))
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map(stem);
}

function matchProduct(
  wordStems: string[],
  unit: string | null,
  catalog: ProductKey[],
): { id: string | null; confidence: number } {
  if (wordStems.length === 0) return { id: null, confidence: 0 };
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const p of catalog) {
    if (p.stems.length === 0) continue;
    const hits = p.stems.filter((s) => wordStems.some((w) => stemsMatch(w, s))).length;
    if (hits === 0) continue;
    // ułamek nazwy produktu znaleziony we fragmencie + premia za zgodną jednostkę
    let score = hits / p.stems.length;
    if (!wordStems.some((w) => stemsMatch(w, p.stems[0]))) score *= 0.6; // pierwsze słowo nazwy jest najważniejsze
    if (unit && unit === p.unit) score += 0.15;
    if (!best || score > best.score + 1e-9) {
      best = { id: p.id, score };
      tie = false;
    } else if (Math.abs(score - best.score) < 1e-9) {
      tie = true;
    }
  }
  if (!best || best.score < 0.5) return { id: null, confidence: 0 };
  const confidence = Math.min(0.85, 0.45 + 0.4 * Math.min(1, best.score)) - (tie ? 0.25 : 0);
  return { id: best.id, confidence: Math.max(0.2, confidence) };
}

/** Słowa fragmentu → ilość, jednostka, słowa nazwy produktu i klucz do słownika. */
function analyzePhrase(words: string[]) {
  let qty: number | null = null;
  let unit: string | null = null;
  const productWords: string[] = [];
  for (const w of words) {
    const n = numberOf(w);
    if (n !== null) {
      qty = n; // przy autokorekcie („6… nie, 10”) wygrywa ostatnia liczba
      continue;
    }
    const u = unitOf(w);
    if (u) {
      unit = u;
      continue;
    }
    if (STOPWORDS.has(w) || w.length < 3) continue;
    productWords.push(w);
  }
  return { qty, unit, productWords, aliasKey: productWords.map(stem).join(" ") };
}

/** Klucz słownika z dowolnej frazy (np. zwróconej przez AI): „10 skrzynek awokado” → „awok”. */
export function aliasKeyOf(phrase: string): string {
  return analyzePhrase(fold(phrase).match(/[a-z]+|\d+(?:[.,]\d+)?/g) ?? []).aliasKey;
}

// =========================================================
// GŁÓWNA FUNKCJA
// =========================================================
export function parseOrderText(text: string, catalog: CatalogEntry[], aliases: AliasEntry[], today: string): ParsedOrder {
  const folded = fold(text);
  const keys: ProductKey[] = catalog.map((p) => ({ id: p.id, unit: p.unit, stems: productStems(p.name) }));
  const unitById = new Map(catalog.map((p) => [p.id, p.unit]));
  const aliasMap = new Map<string, AliasEntry>();
  // słownik klienta ma pierwszeństwo przed wspólnym
  for (const a of [...aliases].sort((x, y) => Number(x.customerSpecific) - Number(y.customerSpecific)))
    aliasMap.set(a.alias_key, a);

  const lines: ParsedLine[] = [];
  const notes: string[] = [];

  for (const fullSeg of segments(text)) {
    const toks = tokens(fullSeg, folded);
    const { qty: parsedQty, unit, productWords, aliasKey } = analyzePhrase(toks.map((t) => t.word));
    // fraza zaczyna się od pierwszego ważnego słowa („Na jutro poproszę 2 skrzynki…” → „2 skrzynki…”)
    const first = toks.find((t) => numberOf(t.word) !== null || unitOf(t.word) || (!STOPWORDS.has(t.word) && t.word.length >= 3));
    const seg =
      first && first.start > fullSeg.start
        ? { start: first.start, end: fullSeg.end, text: text.slice(first.start, fullSeg.end) }
        : fullSeg;
    let qty = parsedQty;
    const wordStems = productWords.map(stem);

    let productId: string | null = null;
    let confidence = 0;
    const alias = aliasKey ? aliasMap.get(aliasKey) : undefined;
    if (alias && unitById.has(alias.product_id)) {
      productId = alias.product_id;
      confidence = alias.customerSpecific ? 0.95 : 0.85;
    } else {
      const m = matchProduct(wordStems, unit, keys);
      productId = m.id;
      confidence = m.confidence;
    }

    if (productId) {
      if (qty === null) {
        qty = 1;
        confidence = Math.min(confidence, 0.4); // ilość zgadnięta
      }
      const catalogUnit = unitById.get(productId);
      if (unit && catalogUnit && unit !== catalogUnit) confidence = Math.min(confidence, 0.55); // inna jednostka niż w katalogu
      if (catalogUnit !== "kg" && !Number.isInteger(qty)) qty = Math.ceil(qty);
      lines.push({
        phrase: seg.text,
        aliasKey,
        spanStart: seg.start,
        spanEnd: seg.end,
        productId,
        qty,
        unit,
        confidence: round(confidence),
      });
    } else if (qty !== null && productWords.length > 0) {
      // ilość jest, produktu nie znamy — człowiek wybierze
      lines.push({
        phrase: seg.text,
        aliasKey,
        spanStart: seg.start,
        spanEnd: seg.end,
        productId: null,
        qty,
        unit,
        confidence: 0,
      });
    } else if (qty === null && NOTE_CUE.test(fold(fullSeg.text))) {
      notes.push(fullSeg.text); // np. „zostawcie w lodówce z tyłu” — ale nie „tu Ania z Bistro”
    }
  }

  return { lines, dateHint: parseDateHint(text, today), note: notes.length ? notes.join(". ") : null };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// =========================================================
// SKUTECZNOŚĆ
// =========================================================
export type Outcome = "accepted" | "corrected" | "added" | "removed";

export type AccuracyInput = { draftId: string; outcome: Outcome | null }[];

export type Accuracy = {
  orders: number; // zatwierdzone zamówienia
  ordersExact: number; // bez żadnej poprawki
  lines: number; // pozycje po sprawdzeniu (trafione + poprawione + dodane)
  linesAccepted: number;
  linesCorrected: number;
  linesAdded: number;
  linesRemoved: number;
  orderRate: number | null; // % zamówień bez poprawek
  lineRate: number | null; // % pozycji trafionych
};

/** Skuteczność rozpoznawania: ile zamówień i pozycji człowiek zatwierdził bez zmian. */
export function accuracy(rows: AccuracyInput): Accuracy {
  const byDraft = new Map<string, Outcome[]>();
  for (const r of rows) {
    if (!r.outcome) continue;
    const list = byDraft.get(r.draftId) ?? [];
    list.push(r.outcome);
    byDraft.set(r.draftId, list);
  }
  const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
  const accepted = count("accepted");
  const corrected = count("corrected");
  const added = count("added");
  const removed = count("removed");
  const orders = byDraft.size;
  const ordersExact = [...byDraft.values()].filter((l) => l.every((o) => o === "accepted")).length;
  const lines = accepted + corrected + added;
  return {
    orders,
    ordersExact,
    lines,
    linesAccepted: accepted,
    linesCorrected: corrected,
    linesAdded: added,
    linesRemoved: removed,
    orderRate: orders ? Math.round((ordersExact / orders) * 1000) / 10 : null,
    lineRate: lines + removed ? Math.round((accepted / (lines + removed)) * 1000) / 10 : null,
  };
}

/** Podział treści na kawałki: zwykły tekst i podświetlone frazy rozpoznanych pozycji. */
export function highlight(text: string, spans: { start: number; end: number; key: string }[]): { text: string; key?: string }[] {
  const sorted = [...spans].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: { text: string; key?: string }[] = [];
  let pos = 0;
  for (const s of sorted) {
    if (s.start < pos) continue; // nakładające się — pomijamy
    if (s.start > pos) out.push({ text: text.slice(pos, s.start) });
    out.push({ text: text.slice(s.start, s.end), key: s.key });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

// =========================================================
// WYNIK MODELU JĘZYKOWEGO (adapter claude) → ten sam kształt co parser słownikowy
// =========================================================
export type ModelLine = {
  phrase: string;
  product_id: string | null;
  qty: number | null;
  unit: string | null;
  confidence: number;
};
export type ModelOutput = { lines: ModelLine[]; delivery_date: string | null; note: string | null };

/** Wynik modelu → ParsedOrder: tylko produkty z katalogu, pozycje fraz w treści, klucze słownika. */
export function toParsedOrder(out: ModelOutput, text: string, catalog: CatalogEntry[]): ParsedOrder {
  const known = new Map(catalog.map((p) => [p.id, p]));
  const lower = text.toLowerCase();
  let from = 0;
  const lines = out.lines.map((l) => {
    const phrase = String(l.phrase ?? "").trim();
    let start = phrase ? lower.indexOf(phrase.toLowerCase(), from) : -1;
    if (start < 0 && phrase) start = lower.indexOf(phrase.toLowerCase());
    if (start >= 0) from = start + phrase.length;
    const product = l.product_id ? known.get(l.product_id) : undefined;
    let qty = typeof l.qty === "number" && l.qty > 0 ? l.qty : null;
    if (qty !== null && product && product.unit !== "kg") qty = Math.ceil(qty);
    return {
      phrase,
      aliasKey: aliasKeyOf(phrase),
      spanStart: start >= 0 ? start : 0,
      spanEnd: start >= 0 ? start + phrase.length : 0,
      productId: product ? product.id : null,
      qty,
      unit: l.unit ?? null,
      confidence: product ? Math.max(0, Math.min(1, Number(l.confidence) || 0)) : 0,
    };
  });
  const date = typeof out.delivery_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(out.delivery_date) ? out.delivery_date : null;
  return { lines, dateHint: date, note: out.note?.trim() || null };
}
