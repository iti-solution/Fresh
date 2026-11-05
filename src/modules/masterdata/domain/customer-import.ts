// Import kartoteki klientów i adresów dostaw z Excela/CSV (M1.7) — czyste funkcje.
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

export type CustomerFieldKey =
  | "customer_code"
  | "customer_name"
  | "nip"
  | "category"
  | "sales_rep_name"
  | "sales_rep_phone"
  | "point_code"
  | "point_name"
  | "point_type"
  | "address"
  | "postal_code"
  | "city"
  | "contact_phone"
  | "weekdays"
  | "window"
  | "window_start"
  | "window_end"
  | "window2"
  | "service_minutes"
  | "site_manager_name"
  | "site_manager_phone"
  | "call_instructions"
  | "access_instructions"
  | "driver_instructions"
  | "active_from"
  | "active_to";

export const CUSTOMER_FIELDS: ImportField<CustomerFieldKey>[] = [
  {
    key: "customer_code",
    label: "Kod klienta",
    synonyms: ["kod klienta", "kod kontrahenta", "symbol", "symbol kontrahenta", "id klienta"],
  },
  {
    key: "customer_name",
    label: "Nazwa klienta",
    required: true,
    synonyms: ["nazwa klienta", "nazwa kontrahenta", "kontrahent", "klient", "nazwa", "firma"],
  },
  { key: "nip", label: "NIP", synonyms: ["nip", "vat id"] },
  { key: "category", label: "Kategoria klienta", synonyms: ["kategoria", "grupa", "segment", "branza"] },
  { key: "sales_rep_name", label: "Opiekun handlowy", synonyms: ["opiekun", "handlowiec", "przedstawiciel", "opiekun handlowy"] },
  { key: "sales_rep_phone", label: "Telefon opiekuna", synonyms: ["telefon opiekuna", "tel handlowca", "telefon handlowca"] },
  {
    key: "point_code",
    label: "Kod adresu dostawy",
    synonyms: ["kod adresu", "kod adresu dostawy", "kod oddzialu", "kod odbiorcy", "kod miejsca dostawy"],
  },
  {
    key: "point_name",
    label: "Nazwa adresu",
    hint: "puste = „Adres główny”",
    synonyms: ["nazwa adresu", "nazwa oddzialu", "oddzial", "miejsce dostawy", "nazwa odbiorcy"],
  },
  {
    key: "point_type",
    label: "Typ adresu",
    hint: "np. sklep, budowa, magazyn",
    synonyms: ["typ adresu", "typ", "rodzaj adresu", "typ odbiorcy"],
  },
  { key: "address", label: "Ulica i numer", required: true, synonyms: ["adres dostawy", "adres", "ulica", "ulica i numer"] },
  { key: "postal_code", label: "Kod pocztowy", synonyms: ["kod pocztowy", "kod poczt", "zip"] },
  { key: "city", label: "Miejscowość", required: true, synonyms: ["miejscowosc", "miasto", "poczta"] },
  {
    key: "contact_phone",
    label: "Telefon odbiorcy",
    synonyms: ["telefon", "tel", "telefon odbiorcy", "telefon kontaktowy", "kontakt"],
  },
  { key: "weekdays", label: "Dni dostaw", hint: "np. pn-pt, pn,śr,pt, 1-6", synonyms: ["dni dostaw", "dni", "dni dostawy"] },
  {
    key: "window",
    label: "Okno przyjęć (jedna kolumna)",
    hint: "np. 6-8",
    synonyms: ["okno", "okno przyjec", "godziny przyjec", "godziny dostaw"],
  },
  { key: "window_start", label: "Okno od", synonyms: ["okno od", "przyjecia od", "godzina od"] },
  { key: "window_end", label: "Okno do", synonyms: ["okno do", "przyjecia do", "godzina do"] },
  { key: "window2", label: "Drugie okno", hint: "np. 12-14", synonyms: ["okno 2", "drugie okno"] },
  { key: "service_minutes", label: "Czas rozładunku [min]", synonyms: ["czas rozladunku", "rozladunek", "czas obslugi"] },
  {
    key: "site_manager_name",
    label: "Osoba na miejscu",
    synonyms: ["osoba na miejscu", "kierownik budowy", "osoba kontaktowa", "przyjmujacy"],
  },
  {
    key: "site_manager_phone",
    label: "Telefon osoby na miejscu",
    synonyms: ["telefon kierownika", "telefon osoby kontaktowej", "tel kierownika"],
  },
  { key: "call_instructions", label: "Gdzie dzwonić", synonyms: ["gdzie dzwonic", "dzwonic", "uwagi telefon"] },
  { key: "access_instructions", label: "Jak wjechać", synonyms: ["wjazd", "jak wjechac", "dojazd"] },
  { key: "driver_instructions", label: "Uwagi dla kierowcy", synonyms: ["uwagi dla kierowcy", "uwagi", "instrukcje"] },
  { key: "active_from", label: "Czynny od", synonyms: ["czynny od", "aktywny od", "sezon od", "budowa od"] },
  { key: "active_to", label: "Czynny do", synonyms: ["czynny do", "aktywny do", "sezon do", "budowa do"] },
];

export type CustomerMapping = Partial<Record<CustomerFieldKey, string>>;

const DAY_WORDS: Record<string, number> = {
  pn: 1,
  pon: 1,
  poniedzialek: 1,
  mon: 1,
  wt: 2,
  wto: 2,
  wtorek: 2,
  tue: 2,
  sr: 3,
  sro: 3,
  sroda: 3,
  wed: 3,
  cz: 4,
  czw: 4,
  czwartek: 4,
  thu: 4,
  pt: 5,
  pia: 5,
  piatek: 5,
  fri: 5,
  sb: 6,
  so: 6,
  sob: 6,
  sobota: 6,
  sat: 6,
  nd: 7,
  nie: 7,
  niedz: 7,
  niedziela: 7,
  sun: 7,
};

/** „pn-pt”, „pn,śr,pt”, „1-6”, „1,3,5”, „codziennie” → [1..7]; null gdy nie da się odczytać. */
export function parseWeekdays(raw: string): number[] | null {
  // fold() zamienia „-” na spację, więc zakresy zaznaczamy wcześniej
  const f = fold(raw.replace(/\s*[-–]\s*/g, " RANGE ")).replace(/ range /g, "-");
  if (f === "") return null;
  if (/^(codziennie|kazdy dzien|caly tydzien)$/.test(f)) return [1, 2, 3, 4, 5, 6, 7];
  if (/^(dni robocze|robocze)$/.test(f)) return [1, 2, 3, 4, 5];
  const day = (t: string) => (/^[1-7]$/.test(t) ? Number(t) : DAY_WORDS[t]);
  const out = new Set<number>();
  for (const part of f.split(/[\s,;+]+/).filter(Boolean)) {
    const range = part.split("-");
    if (range.length === 2) {
      const a = day(range[0]);
      const b = day(range[1]);
      if (!a || !b || b < a) return null;
      for (let d = a; d <= b; d++) out.add(d);
    } else {
      const d = day(part);
      if (!d) return null;
      out.add(d);
    }
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

export type PointTypeRef = { id: string; code: string; name: string };

/** Typ adresu po nazwie albo kodzie (bez wielkości liter i polskich znaków); „restauracja” → gastronomia itd. */
export function resolvePointType(raw: string, types: PointTypeRef[]): PointTypeRef | null {
  const f = fold(raw);
  if (!f) return null;
  const exact = types.find((t) => fold(t.name) === f || fold(t.code) === f);
  if (exact) return exact;
  const ALIASES: Record<string, string> = {
    restauracja: "food_service",
    bar: "food_service",
    kuchnia: "food_service",
    hotel: "food_service",
    gastronomia: "food_service",
    lokal: "food_service",
    sklep: "shop",
    market: "shop",
    hurtownia: "warehouse",
    magazyn: "warehouse",
    budowa: "construction",
    "plac budowy": "construction",
    zaklad: "plant",
    fabryka: "plant",
    produkcja: "plant",
    biuro: "hq",
    siedziba: "hq",
    dom: "private",
    prywatny: "private",
  };
  const code = ALIASES[f];
  if (code) return types.find((t) => t.code === code) ?? null;
  return types.find((t) => fold(t.name).startsWith(f) || f.startsWith(fold(t.name))) ?? null;
}

export type NormalizedCustomerRow = {
  line: number;
  customer: {
    external_code: string | null;
    name: string;
    nip: string | null;
    category: string | null;
    sales_rep_name: string | null;
    sales_rep_phone: string | null;
  };
  point: {
    external_code: string | null;
    name: string;
    point_type_id: string | null;
    address_line: string;
    postal_code: string | null;
    city: string;
    contact_phone: string | null;
    delivery_weekdays: number[] | null; // null = nie zmieniaj / domyślne
    windows: [string, string][] | null; // null = nie zmieniaj
    service_minutes: number | null;
    site_manager_name: string | null;
    site_manager_phone: string | null;
    call_instructions: string | null;
    access_instructions: string | null;
    driver_instructions: string | null;
    active_from: string | null;
    active_to: string | null;
  };
  warnings: string[];
};

export type CustomerRowResult =
  { ok: true; row: NormalizedCustomerRow } | { ok: false; line: number; ref: string; errors: string[] };

const t = (v: string, max: number) => (v ? v.slice(0, max) : null);

export function normalizeCustomerRow(
  row: RawRow,
  mapping: CustomerMapping,
  types: PointTypeRef[],
  line: number,
): CustomerRowResult {
  const g = (k: CustomerFieldKey) => pick(row, mapping, k);
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = g("customer_name");
  const address = g("address");
  const city = g("city");
  if (name.length < 2) errors.push("brak nazwy klienta");
  if (address.length < 3) errors.push("brak adresu");
  if (!city) errors.push("brak miejscowości");

  const nipRaw = g("nip").replace(/[\s-]/g, "").replace(/^PL/i, "");
  let nip: string | null = null;
  if (nipRaw) {
    if (/^\d{10}$/.test(nipRaw)) nip = nipRaw;
    else warnings.push(`pominięto NIP „${g("nip")}”`);
  }
  const postal = g("postal_code");
  let postal_code: string | null = null;
  if (postal) {
    const p = /^(\d{2})-?(\d{3})$/.exec(postal.replace(/\s/g, ""));
    if (p) postal_code = `${p[1]}-${p[2]}`;
    else warnings.push(`pominięto kod pocztowy „${postal}”`);
  }

  let weekdays: number[] | null = null;
  if (g("weekdays")) {
    weekdays = parseWeekdays(g("weekdays"));
    if (!weekdays) errors.push(`dni dostaw „${g("weekdays")}”`);
  }

  const windows: [string, string][] = [];
  if (g("window")) {
    const r = parseTimeRange(g("window"));
    if (r) windows.push(r);
    else errors.push(`okno „${g("window")}”`);
  } else if (g("window_start") || g("window_end")) {
    const a = parseTime(g("window_start"));
    const b = parseTime(g("window_end"));
    if (a && b && b > a) windows.push([a, b]);
    else errors.push(`okno „${g("window_start")}–${g("window_end")}”`);
  }
  if (g("window2")) {
    const r = parseTimeRange(g("window2"));
    if (r && (!windows[0] || r[0] >= windows[0][1])) windows.push(r);
    else errors.push(`drugie okno „${g("window2")}”`);
  }

  let service: number | null = null;
  if (g("service_minutes")) {
    const n = parseDecimal(g("service_minutes"));
    if (n !== null && Number.isFinite(n) && n >= 1 && n <= 180) service = Math.round(n);
    else errors.push(`czas rozładunku „${g("service_minutes")}”`);
  }

  const date = (k: CustomerFieldKey) => {
    const raw = g(k);
    if (!raw) return null;
    const d = parseDate(raw);
    if (!d) errors.push(`data „${raw}”`);
    return d;
  };
  const active_from = date("active_from");
  const active_to = date("active_to");
  if (active_from && active_to && active_to < active_from) errors.push("„czynny do” przed „czynny od”");

  let typeId: string | null = null;
  if (g("point_type")) {
    const ty = resolvePointType(g("point_type"), types);
    if (ty) typeId = ty.id;
    else warnings.push(`nieznany typ adresu „${g("point_type")}” — ustawiono „Inny”`);
  }
  if (!typeId) typeId = types.find((x) => x.code === "other")?.id ?? null;

  if (errors.length) return { ok: false, line, ref: g("customer_code") || name, errors };
  return {
    ok: true,
    row: {
      line,
      customer: {
        external_code: t(g("customer_code"), 40),
        name: name.slice(0, 200),
        nip,
        category: t(g("category"), 60),
        sales_rep_name: t(g("sales_rep_name"), 100),
        sales_rep_phone: t(g("sales_rep_phone"), 30),
      },
      point: {
        external_code: t(g("point_code"), 40),
        name: (g("point_name") || "Adres główny").slice(0, 200),
        point_type_id: typeId,
        address_line: address.slice(0, 200),
        postal_code,
        city: city.slice(0, 80),
        contact_phone: t(g("contact_phone"), 30),
        delivery_weekdays: weekdays,
        windows: windows.length ? windows : null,
        service_minutes: service,
        site_manager_name: t(g("site_manager_name"), 100),
        site_manager_phone: t(g("site_manager_phone"), 30),
        call_instructions: t(g("call_instructions"), 300),
        access_instructions: t(g("access_instructions"), 300),
        driver_instructions: t(g("driver_instructions"), 500),
        active_from,
        active_to,
      },
      warnings,
    },
  };
}

/** Klucz klienta w pliku: kod (gdy jest) albo nazwa. */
export const customerKey = (c: { external_code: string | null; name: string }) =>
  c.external_code ? `code:${c.external_code.trim().toUpperCase()}` : `name:${fold(c.name)}`;

/** Klucz adresu w obrębie klienta: kod adresu albo ulica + miasto. */
export const pointKey = (p: { external_code: string | null; address_line: string; city: string | null }) =>
  p.external_code ? `code:${p.external_code.trim().toUpperCase()}` : `addr:${addressKey(p.address_line, p.city)}`;
