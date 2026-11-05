// Wspólne narzędzia importu z plików CSV/XLSX (czyste funkcje — działają w przeglądarce i na serwerze).

export type Cell = string | number | boolean | Date | null | undefined;
export type RawRow = Record<string, string>;

export type ImportField<K extends string = string> = {
  key: K;
  label: string;
  required?: boolean;
  hint?: string;
  /** Nagłówki, po których zgadujemy kolumnę (małe litery, bez polskich znaków). */
  synonyms: string[];
};

/** „Ilość Palet ” → „ilosc palet” (porównywanie nagłówków i adresów). */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[_\-./\\:;,()[\]"'#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Komórka arkusza → tekst. Daty jako YYYY-MM-DD (godzina, gdy to sama godzina z Excela). */
export function cellToString(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return "";
    // read-excel-file zwraca daty w UTC; czysta godzina z Excela to 1899-12-30/31
    if (c.getUTCFullYear() < 1901) return `${pad(c.getUTCHours())}:${pad(c.getUTCMinutes())}`;
    return `${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(c.getUTCDate())}`;
  }
  if (typeof c === "boolean") return c ? "tak" : "nie";
  return String(c).trim();
}

/** Tablica wierszy (pierwszy = nagłówki) → obiekty { nagłówek: wartość }. Puste wiersze pomijane; powtórzone nagłówki numerowane. */
export function rowsToObjects(rows: Cell[][]): { headers: string[]; rows: RawRow[] } {
  const headerRowIdx = rows.findIndex((r) => r.some((c) => cellToString(c) !== ""));
  if (headerRowIdx < 0) return { headers: [], rows: [] };
  const seen = new Map<string, number>();
  const headers = rows[headerRowIdx].map((c, i) => {
    const base = cellToString(c) || `Kolumna ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  const out: RawRow[] = [];
  for (const r of rows.slice(headerRowIdx + 1)) {
    const values = headers.map((_, i) => cellToString(r[i]));
    if (values.every((v) => v === "")) continue;
    out.push(Object.fromEntries(headers.map((h, i) => [h, values[i]])));
  }
  return { headers, rows: out };
}

/** Zgadywanie mapowania: zapamiętane (jeśli kolumna nadal jest w pliku), potem synonimy. */
export function guessMapping<K extends string>(
  fields: ImportField<K>[],
  headers: string[],
  saved?: Partial<Record<K, string>> | null,
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  const used = new Set<string>();
  for (const f of fields) {
    const s = saved?.[f.key];
    if (s && headers.includes(s)) {
      out[f.key] = s;
      used.add(s);
    }
  }
  const folded = headers.map((h) => ({ h, f: fold(h) }));
  for (const f of fields) {
    if (out[f.key]) continue;
    const syn = f.synonyms.map(fold);
    const exact = folded.find((x) => !used.has(x.h) && syn.includes(x.f));
    const partial = exact ?? folded.find((x) => !used.has(x.h) && syn.some((s) => s.length > 3 && x.f.includes(s)));
    if (partial) {
      out[f.key] = partial.h;
      used.add(partial.h);
    }
  }
  return out;
}

/** Wartości pól systemu z wiersza wg mapowania. */
export function pick<K extends string>(row: RawRow, mapping: Partial<Record<K, string>>, key: K): string {
  const h = mapping[key];
  return h ? (row[h] ?? "").trim() : "";
}

/** „1 234,50 zł” → 1234.5; puste → null; śmieci → NaN. */
export function parseDecimal(raw: string): number | null {
  const s = raw.replace(/\s| /g, "").replace(/zł|pln|kg|szt\.?/gi, "");
  if (s === "") return null;
  let t = s;
  if (/,\d{1,3}$/.test(t) && t.includes("."))
    t = t.replace(/\./g, ""); // 1.234,50
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); // 1.250 = 1250 (polski separator tysięcy)
  t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Data: 2026-11-06 · 06.11.2026 · 6.11.26 · 06/11/2026 · numer seryjny Excela. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[2], +m[1]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return valid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Godzina: 6 · 6:00 · 06.30 · 0630 · ułamek doby z Excela (0,25). → "HH:MM" albo null. */
export function parseTime(raw: string): string | null {
  const s = raw.trim().replace(/\s/g, "");
  if (s === "") return null;
  let m = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?$/.exec(s);
  if (!m) m = /^(\d{2})(\d{2})$/.exec(s);
  if (m) {
    const h = +m[1];
    const min = m[2] ? +m[2] : 0;
    return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
  }
  const frac = Number(s.replace(",", "."));
  if (Number.isFinite(frac) && frac > 0 && frac < 1) {
    const total = Math.round(frac * 24 * 60);
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }
  return null;
}

/** Okno w jednej komórce: „6-8”, „06:00–08:00”. */
export function parseTimeRange(raw: string): [string, string] | null {
  const parts = raw.split(/\s*[-–—]\s*|\s+do\s+/i).filter(Boolean);
  if (parts.length !== 2) return null;
  const a = parseTime(parts[0].replace(/^od\s*/i, ""));
  const b = parseTime(parts[1]);
  return a && b && b > a ? [a, b] : null;
}

/** Tak/nie z ERP: tak, t, 1, x, true, yes. */
export function parseBool(raw: string): boolean | null {
  const f = fold(raw);
  if (f === "") return null;
  if (["tak", "t", "1", "x", "true", "yes", "y", "prawda"].includes(f)) return true;
  if (["nie", "n", "0", "false", "no", "falsz"].includes(f)) return false;
  return null;
}

/** Adres do porównań: bez „ul.”, interpunkcji i polskich znaków. */
export function addressKey(address: string, city?: string | null): string {
  const a = fold(address)
    .replace(/^(ul|ulica|al|aleja|aleje|os|osiedle|pl|plac)\s+/, "")
    .replace(/\b(ul|al|os|pl)\s+/g, "")
    .replace(/\s+/g, " ");
  return `${a}|${fold(city ?? "")}`;
}
