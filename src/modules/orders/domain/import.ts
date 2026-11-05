// Import zamówień z pliku i API (M1.5, M1.5a, M1.6) — czyste funkcje: pola, normalizacja wiersza, dopasowanie do adresu.
import {
  addressKey,
  fold,
  parseDate,
  parseDecimal,
  parseTime,
  parseTimeRange,
  pick,
  type ImportField,
  type RawRow,
} from "@/lib/tabular";
import type { Readiness } from "./orders";

export type OrderFieldKey =
  | "external_ref"
  | "delivery_date"
  | "customer_code"
  | "point_code"
  | "customer_name"
  | "address"
  | "postal_code"
  | "city"
  | "weight_kg"
  | "pallets"
  | "volume_m3"
  | "crates"
  | "order_value"
  | "cod_amount"
  | "window"
  | "window_start"
  | "window_end"
  | "readiness"
  | "priority"
  | "type"
  | "notes_sales"
  | "notes_logistics";

export const ORDER_FIELDS: ImportField<OrderFieldKey>[] = [
  {
    key: "external_ref",
    label: "Numer zamówienia / WZ",
    required: true,
    synonyms: [
      "nr zamowienia",
      "numer zamowienia",
      "nr wz",
      "wz",
      "numer dokumentu",
      "nr dokumentu",
      "dokument",
      "zamowienie",
      "order",
      "order no",
      "external ref",
      "numer",
    ],
  },
  {
    key: "delivery_date",
    label: "Data dostawy",
    hint: "puste = dzień wybrany przy imporcie",
    synonyms: ["data dostawy", "termin dostawy", "data realizacji", "dostawa", "data", "delivery date"],
  },
  {
    key: "customer_code",
    label: "Kod klienta",
    synonyms: [
      "kod klienta",
      "kod kontrahenta",
      "kontrahent kod",
      "id klienta",
      "nr klienta",
      "symbol kontrahenta",
      "customer code",
    ],
  },
  {
    key: "point_code",
    label: "Kod adresu dostawy",
    hint: "kod oddziału / miejsca dostawy w ERP",
    synonyms: [
      "kod adresu",
      "kod adresu dostawy",
      "kod oddzialu",
      "kod odbiorcy",
      "kod miejsca dostawy",
      "point code",
      "odbiorca kod",
    ],
  },
  {
    key: "customer_name",
    label: "Nazwa klienta",
    synonyms: ["nazwa klienta", "klient", "kontrahent", "nazwa kontrahenta", "odbiorca", "customer", "nazwa"],
  },
  { key: "address", label: "Adres (ulica i numer)", synonyms: ["adres dostawy", "adres", "ulica", "address"] },
  { key: "postal_code", label: "Kod pocztowy", synonyms: ["kod pocztowy", "kod poczt", "postal code", "zip"] },
  { key: "city", label: "Miejscowość", synonyms: ["miejscowosc", "miasto", "city"] },
  { key: "weight_kg", label: "Masa [kg]", synonyms: ["masa", "waga", "masa kg", "waga kg", "kg", "weight"] },
  { key: "pallets", label: "Palety", synonyms: ["palety", "ilosc palet", "liczba palet", "pal", "pallets"] },
  { key: "volume_m3", label: "Objętość [m³]", synonyms: ["objetosc", "m3", "kubatura", "volume"] },
  {
    key: "crates",
    label: "Skrzynki / opakowania",
    synonyms: ["skrzynki", "ilosc skrzynek", "liczba skrzynek", "opakowania", "crates"],
  },
  {
    key: "order_value",
    label: "Wartość zamówienia [zł]",
    synonyms: ["wartosc", "wartosc netto", "wartosc brutto", "kwota", "wartosc zamowienia", "value"],
  },
  { key: "cod_amount", label: "Pobranie [zł]", synonyms: ["pobranie", "za pobraniem", "do pobrania", "gotowka", "cod"] },
  {
    key: "window",
    label: "Okno dostawy (jedna kolumna)",
    hint: "np. 6-8 albo 06:00–08:00",
    synonyms: ["okno", "okno dostawy", "godziny dostawy", "godziny"],
  },
  { key: "window_start", label: "Okno od", synonyms: ["okno od", "godzina od", "od godziny", "dostawa od"] },
  { key: "window_end", label: "Okno do", synonyms: ["okno do", "godzina do", "do godziny", "dostawa do"] },
  {
    key: "readiness",
    label: "Gotowość z magazynu (WMS)",
    hint: "skompletowane / do realizacji",
    synonyms: ["gotowosc", "status wms", "skompletowane", "status magazynu", "kompletacja", "readiness"],
  },
  { key: "priority", label: "Priorytet", synonyms: ["priorytet", "pilne", "ekspres", "priority"] },
  { key: "type", label: "Rodzaj (dostawa / odbiór)", synonyms: ["rodzaj", "typ", "typ zlecenia", "rodzaj zlecenia"] },
  {
    key: "notes_sales",
    label: "Uwagi handlowe",
    synonyms: ["uwagi handlowe", "uwagi handlowca", "uwagi do zamowienia", "uwagi"],
  },
  {
    key: "notes_logistics",
    label: "Uwagi logistyczne",
    synonyms: ["uwagi logistyczne", "uwagi dla kierowcy", "uwagi magazynu", "uwagi transport"],
  },
];

export type OrderMapping = Partial<Record<OrderFieldKey, string>>;

export type NormalizedOrder = {
  line: number; // nr wiersza w pliku (od 2 — 1 to nagłówki)
  external_ref: string;
  delivery_date: string;
  customer_code: string | null;
  point_code: string | null;
  customer_name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  weight_kg: number;
  pallets: number;
  volume_m3: number;
  crates: number;
  order_value: number | null;
  cod_amount: number | null;
  window_start: string | null;
  window_end: string | null;
  readiness: Readiness | null; // null = plik nie mówi (nie zmieniamy przy aktualizacji)
  priority: number;
  type: "delivery" | "pickup";
  notes_sales: string | null;
  notes_logistics: string | null;
};

export type RowResult = { ok: true; order: NormalizedOrder } | { ok: false; line: number; ref: string; errors: string[] };

export function parseReadiness(raw: string): Readiness | null {
  const f = fold(raw);
  if (f === "") return null;
  if (/^(tak|t|1|x|true|ready|gotowe|gotowy|skompletowane|skompletowany|spakowane|zakonczone|kompletne)$/.test(f)) return "ready";
  if (/^(nie|n|0|false|do realizacji|w realizacji|w kompletacji|oczekuje|niegotowe|nowe|awaiting warehouse|awaiting)$/.test(f))
    return "awaiting_warehouse";
  return null;
}

function parsePriority(raw: string): number | null {
  const f = fold(raw);
  if (f === "") return 0;
  if (/^(tak|t|1|x|pilne|ekspres|wysoki|high)$/.test(f)) return 1;
  if (/^(nie|n|0|normalny|normal|niski)$/.test(f)) return 0;
  const n = Number(f);
  return Number.isInteger(n) && n >= 0 && n <= 9 ? n : null;
}

function parseType(raw: string): "delivery" | "pickup" | null {
  const f = fold(raw);
  if (f === "" || /^(dostawa|wz|delivery|wydanie|d)$/.test(f)) return "delivery";
  if (/^(odbior|zwrot|pickup|pz|o)$/.test(f)) return "pickup";
  return null;
}

const text = (v: string, max: number) => (v ? v.slice(0, max) : null);

/** Jeden wiersz pliku/API → zamówienie albo lista błędów (po polsku, do raportu). */
export function normalizeOrderRow(row: RawRow, mapping: OrderMapping, defaults: { date: string }, line: number): RowResult {
  const g = (k: OrderFieldKey) => pick(row, mapping, k);
  const errors: string[] = [];
  const ref = g("external_ref").slice(0, 60);
  if (!ref) errors.push("brak numeru zamówienia");

  const rawDate = g("delivery_date");
  const date = rawDate ? parseDate(rawDate) : defaults.date;
  if (!date) errors.push(`niepoprawna data „${rawDate}”`);

  const num = (k: OrderFieldKey, label: string, opts: { int?: boolean; max: number }) => {
    const raw = g(k);
    const n = parseDecimal(raw);
    if (n === null) return null;
    if (Number.isNaN(n) || n < 0 || n > opts.max || (opts.int && !Number.isInteger(n))) {
      errors.push(`${label}: „${raw}”`);
      return null;
    }
    return n;
  };
  const weight = num("weight_kg", "masa", { max: 40000 });
  const pallets = num("pallets", "palety", { max: 40 });
  const volume = num("volume_m3", "objętość", { max: 120 });
  const crates = num("crates", "skrzynki", { int: true, max: 5000 });
  const value = num("order_value", "wartość", { max: 10_000_000 });
  const cod = num("cod_amount", "pobranie", { max: 1_000_000 });

  let ws: string | null = null;
  let we: string | null = null;
  if (g("window")) {
    const r = parseTimeRange(g("window"));
    if (r) [ws, we] = r;
    else errors.push(`okno „${g("window")}”`);
  }
  if (g("window_start") || g("window_end")) {
    ws = parseTime(g("window_start"));
    we = parseTime(g("window_end"));
    if (!ws || !we || we <= ws) {
      errors.push(`okno „${g("window_start")}–${g("window_end")}”`);
      ws = we = null;
    }
  }

  const readinessRaw = g("readiness");
  const readiness = parseReadiness(readinessRaw);
  if (readinessRaw && !readiness) errors.push(`gotowość „${readinessRaw}”`);
  const priority = parsePriority(g("priority"));
  if (priority === null) errors.push(`priorytet „${g("priority")}”`);
  const type = parseType(g("type"));
  if (type === null) errors.push(`rodzaj „${g("type")}”`);

  const order = {
    customer_code: text(g("customer_code"), 40),
    point_code: text(g("point_code"), 40),
    customer_name: text(g("customer_name"), 200),
    address: text(g("address"), 200),
    postal_code: text(g("postal_code"), 10),
    city: text(g("city"), 80),
  };
  if (!order.customer_code && !order.point_code && !order.address) errors.push("brak kodu klienta, kodu adresu i adresu");

  if (errors.length || !date) return { ok: false, line, ref, errors };
  return {
    ok: true,
    order: {
      line,
      external_ref: ref,
      delivery_date: date,
      ...order,
      weight_kg: weight ?? 0,
      pallets: pallets ?? 0,
      volume_m3: volume ?? 0,
      crates: crates ?? 0,
      order_value: value,
      cod_amount: cod,
      window_start: ws,
      window_end: we,
      readiness,
      priority: priority ?? 0,
      type: type ?? "delivery",
      notes_sales: text(g("notes_sales"), 500),
      notes_logistics: text(g("notes_logistics"), 500),
    },
  };
}

// ---------- DOPASOWANIE DO ADRESU DOSTAWY ----------

export type PointForMatch = {
  id: string;
  external_code: string | null;
  address_line: string;
  city: string | null;
  is_active: boolean;
  customer_id: string;
  customer_code: string | null;
  customer_name: string;
};

export type MatchHow = "point_code" | "customer_code" | "customer_address" | "address";
export type Match = { pointId: string; how: MatchHow } | { pointId: null; reason: string };

export type PointIndex = {
  byPointCode: Map<string, PointForMatch>;
  byCustomerCode: Map<string, PointForMatch[]>;
  byAddress: Map<string, PointForMatch[]>;
};

const codeKey = (s: string) => s.trim().toUpperCase();

export function buildPointIndex(points: PointForMatch[]): PointIndex {
  const idx: PointIndex = { byPointCode: new Map(), byCustomerCode: new Map(), byAddress: new Map() };
  for (const p of points) {
    if (p.external_code) idx.byPointCode.set(codeKey(p.external_code), p);
    if (p.customer_code) {
      const k = codeKey(p.customer_code);
      idx.byCustomerCode.set(k, [...(idx.byCustomerCode.get(k) ?? []), p]);
    }
    const a = addressKey(p.address_line, p.city);
    idx.byAddress.set(a, [...(idx.byAddress.get(a) ?? []), p]);
  }
  return idx;
}

/** Kolejność: kod adresu → kod klienta (jedyny aktywny adres albo zgodny adres) → sam adres (jednoznaczny). */
export function matchOrderToPoint(
  o: Pick<NormalizedOrder, "point_code" | "customer_code" | "address" | "city">,
  idx: PointIndex,
): Match {
  if (o.point_code) {
    const p = idx.byPointCode.get(codeKey(o.point_code));
    if (p) return { pointId: p.id, how: "point_code" };
  }
  const addr = o.address ? addressKey(o.address, o.city) : null;
  if (o.customer_code) {
    const list = idx.byCustomerCode.get(codeKey(o.customer_code)) ?? [];
    const active = list.filter((p) => p.is_active);
    if (addr) {
      const same = list.filter((p) => addressKey(p.address_line, p.city) === addr);
      if (same.length === 1) return { pointId: same[0].id, how: "customer_address" };
    }
    if (active.length === 1) return { pointId: active[0].id, how: "customer_code" };
    if (active.length > 1)
      return { pointId: null, reason: `klient ${o.customer_code} ma ${active.length} adresy — podaj kod adresu albo adres` };
  }
  if (addr) {
    const list = (idx.byAddress.get(addr) ?? []).filter((p) => p.is_active);
    if (list.length === 1) return { pointId: list[0].id, how: "address" };
    if (list.length > 1) return { pointId: null, reason: "ten adres ma kilku klientów" };
  }
  if (o.point_code) return { pointId: null, reason: `nieznany kod adresu ${o.point_code}` };
  if (o.customer_code) return { pointId: null, reason: `nieznany kod klienta ${o.customer_code}` };
  return { pointId: null, reason: "nie znaleziono adresu w kartotece" };
}

/** Statusy, przy których import nie zmienia już zamówienia (jest w drodze albo zakończone). */
export const LOCKED_ORDER_STATUSES = ["in_progress", "delivered", "partial", "failed", "cancelled"] as const;

export type ImportSummary = {
  total: number;
  created: number;
  updated: number;
  unmatched: number;
  skipped: number;
  errors: number;
};

/** Duplikaty numeru i dnia w jednym pliku: zostaje ostatni wiersz (jak w ERP — późniejsza korekta). */
export function dedupeOrders(orders: NormalizedOrder[]): { orders: NormalizedOrder[]; duplicates: number } {
  const map = new Map<string, NormalizedOrder>();
  for (const o of orders) map.set(`${o.external_ref}|${o.delivery_date}`, o);
  return { orders: [...map.values()], duplicates: orders.length - map.size };
}

/** Wiersz z API (JSON) → RawRow z kluczami pól systemu (mapowanie 1:1). */
export function apiOrderToRow(o: Record<string, unknown>): RawRow {
  const out: RawRow = {};
  for (const f of ORDER_FIELDS) {
    const v = o[f.key];
    if (v === null || v === undefined) continue;
    out[f.key] = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
  }
  return out;
}

export const IDENTITY_MAPPING: OrderMapping = Object.fromEntries(ORDER_FIELDS.map((f) => [f.key, f.key])) as OrderMapping;

// ---------- PODPOWIEDZI DO RĘCZNEGO DOPASOWANIA ----------
export type UnmatchedRaw = {
  raw_customer_code: string | null;
  raw_point_code: string | null;
  raw_customer_name: string | null;
  raw_address: string | null;
};

const tokens = (s: string | null | undefined) =>
  new Set(
    fold(s ?? "")
      .split(" ")
      .filter((t) => t.length > 2),
  );

/** Najbardziej prawdopodobne adresy dla niedopasowanego zamówienia (nazwa klienta, adres, kody). */
export function suggestPoints(o: UnmatchedRaw, points: PointForMatch[], n = 6): PointForMatch[] {
  const nameT = tokens(o.raw_customer_name);
  const addrT = tokens(o.raw_address);
  const code = (o.raw_customer_code ?? "").trim().toUpperCase();
  const scored = points
    .map((p) => {
      let score = 0;
      if (code && p.customer_code?.toUpperCase() === code) score += 10;
      if (code && p.customer_code && p.customer_code.toUpperCase().includes(code)) score += 2;
      const pn = tokens(p.customer_name);
      for (const t of nameT) if (pn.has(t)) score += 3;
      const pa = tokens(`${p.address_line} ${p.city ?? ""}`);
      for (const t of addrT) if (pa.has(t)) score += 2;
      if (!p.is_active) score -= 1;
      return { p, score };
    })
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((x) => x.p);
}
