// Portal zamówień klienta: terminy dostaw, koszyk, statusy, katalog (czyste funkcje — bez Next/Supabase).
// Terminy liczy też baza (portal_earliest_date / portal_date_allowed w migracji 0012) — logika musi być zgodna.
import { z } from "zod";
import { numberField, optionalText, requiredText, toGrosze } from "@/lib/forms";

// =========================================================
// USTAWIENIA HURTOWNI (tenants.settings)
// =========================================================
export type PortalSettings = { cutoff: string; leadDays: number; horizonDays: number };

export const PORTAL_DEFAULTS: PortalSettings = { cutoff: "20:00", leadDays: 1, horizonDays: 14 };

export function portalSettings(settings: unknown): PortalSettings {
  const s = (settings && typeof settings === "object" ? settings : {}) as Record<string, unknown>;
  const cutoff =
    typeof s.portal_cutoff === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.portal_cutoff)
      ? s.portal_cutoff
      : PORTAL_DEFAULTS.cutoff;
  const int = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    cutoff,
    leadDays: int(s.portal_lead_days, PORTAL_DEFAULTS.leadDays, 0, 7),
    horizonDays: int(s.portal_horizon_days, PORTAL_DEFAULTS.horizonDays, 1, 60),
  };
}

// =========================================================
// TERMINY DOSTAW
// =========================================================
function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Dzień tygodnia ISO: 1 = poniedziałek … 7 = niedziela. */
export function isoWeekday(day: string): number {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Bieżąca data i godzina w Warszawie: { date: "2026-11-01", time: "21:15" }. */
export function warsawNow(now: Date = new Date()): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(now);
  const time = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return { date, time };
}

/** Najwcześniejsza data dostawy: jutro (lead), a po godzinie granicznej — dzień później. */
export function earliestDeliveryDate(now: { date: string; time: string }, settings: PortalSettings): string {
  const base = addDays(now.date, settings.leadDays);
  return now.time >= settings.cutoff ? addDays(base, 1) : base;
}

export type PointCalendar = {
  weekdays: number[];
  activeFrom?: string | null;
  activeTo?: string | null;
  closedDates?: string[]; // święta i zamknięcia oddziału / całej hurtowni
};

/** Daty, na które klient może zamówić dostawę do oddziału (rosnąco). */
export function availableDeliveryDates(
  now: { date: string; time: string },
  settings: PortalSettings,
  point: PointCalendar,
): string[] {
  const first = earliestDeliveryDate(now, settings);
  const last = addDays(now.date, settings.horizonDays);
  const closed = new Set(point.closedDates ?? []);
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (!point.weekdays.includes(isoWeekday(d))) continue;
    if (point.activeFrom && d < point.activeFrom) continue;
    if (point.activeTo && d > point.activeTo) continue;
    if (closed.has(d)) continue;
    out.push(d);
  }
  return out;
}

/** Do kiedy można złożyć (albo anulować) zamówienie na daną dostawę: { date, time } w Warszawie. */
export function orderDeadline(deliveryDate: string, settings: PortalSettings): { date: string; time: string } {
  // ostatni moment: godzina graniczna w dniu (dostawa − lead), np. dostawa wt → zamów do pn 20:00
  return { date: addDays(deliveryDate, -settings.leadDays), time: settings.cutoff };
}

/** Klient może anulować tylko nowe, nieprzypisane do trasy zamówienie, przed godziną graniczną. */
export function canCustomerCancel(
  order: { status: string; delivery_date: string; onRoute: boolean },
  now: { date: string; time: string },
  settings: PortalSettings,
): boolean {
  if (order.status !== "new" || order.onRoute) return false;
  return order.delivery_date >= earliestDeliveryDate(now, settings);
}

// =========================================================
// KATALOG
// =========================================================
export const UNITS = ["kg", "szt", "skrz", "opak", "pecz"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  kg: "kg",
  szt: "szt.",
  skrz: "skrz.",
  opak: "opak.",
  pecz: "pęcz.",
};

export const UNIT_NAMES: Record<Unit, string> = {
  kg: "kilogram",
  szt: "sztuka",
  skrz: "skrzynka",
  opak: "opakowanie",
  pecz: "pęczek",
};

export function unitLabel(unit: string): string {
  return (UNIT_LABELS as Record<string, string>)[unit] ?? unit;
}

/** Tylko kilogramy mogą być ułamkowe (np. 2,5 kg); reszta w całych sztukach. */
export function isFractionalUnit(unit: string): boolean {
  return unit === "kg";
}

export const productSchema = z.object({
  name: requiredText("nazwę produktu", 2, 120),
  code: optionalText(40),
  category: optionalText(60),
  unit: z.enum(UNITS, { message: "Wybierz jednostkę" }),
  unit_weight_kg: numberField({ min: 0, max: 2000, fallback: null }),
  price: numberField({ min: 0, max: 100_000, fallback: null }),
});
export type ProductInput = z.infer<typeof productSchema>;

/** Waga jednostki: dla kg zawsze 1; dla innych podana albo 0 (nie liczymy do ładowności). */
export function normalizedUnitWeight(unit: Unit, weight: number | null): number {
  if (unit === "kg") return 1;
  return weight ?? 0;
}

export type SampleProduct = { code: string; name: string; category: string; unit: Unit; unit_weight_kg: number; price: number };

/** Przykładowy katalog hurtowni owocowo-warzywnej (do szybkiego startu i pokazu). */
export const SAMPLE_PRODUCTS: SampleProduct[] = [
  { code: "W-POM-MAL", name: "Pomidor malinowy", category: "Warzywa", unit: "kg", unit_weight_kg: 1, price: 9.9 },
  {
    code: "W-POM-SKRZ",
    name: "Pomidor gałązkowy (skrzynka 6 kg)",
    category: "Warzywa",
    unit: "skrz",
    unit_weight_kg: 6,
    price: 48,
  },
  { code: "W-OGO", name: "Ogórek szklarniowy", category: "Warzywa", unit: "kg", unit_weight_kg: 1, price: 6.5 },
  { code: "W-PAP-CZ", name: "Papryka czerwona", category: "Warzywa", unit: "kg", unit_weight_kg: 1, price: 11.9 },
  { code: "W-CEB", name: "Cebula żółta", category: "Warzywa", unit: "kg", unit_weight_kg: 1, price: 2.4 },
  { code: "W-CEB-CZ", name: "Cebula czerwona", category: "Warzywa", unit: "kg", unit_weight_kg: 1, price: 3.9 },
  { code: "W-ZIEM", name: "Ziemniaki (worek 15 kg)", category: "Warzywa", unit: "opak", unit_weight_kg: 15, price: 27 },
  { code: "W-MAR", name: "Marchew", category: "Warzywa", unit: "kg", unit_weight_kg: 1, price: 2.9 },
  { code: "W-CZOS", name: "Czosnek", category: "Warzywa", unit: "kg", unit_weight_kg: 1, price: 18 },
  { code: "W-SAL-LOD", name: "Sałata lodowa", category: "Sałaty", unit: "szt", unit_weight_kg: 0.5, price: 4.5 },
  { code: "W-RUK", name: "Rukola (opak. 1 kg)", category: "Sałaty", unit: "opak", unit_weight_kg: 1, price: 29 },
  { code: "W-MIX", name: "Mix sałat (opak. 1 kg)", category: "Sałaty", unit: "opak", unit_weight_kg: 1, price: 32 },
  { code: "Z-PIET", name: "Natka pietruszki", category: "Zioła", unit: "pecz", unit_weight_kg: 0.1, price: 2.5 },
  { code: "Z-KOP", name: "Koperek", category: "Zioła", unit: "pecz", unit_weight_kg: 0.1, price: 2.5 },
  { code: "Z-BAZ", name: "Bazylia (doniczka)", category: "Zioła", unit: "szt", unit_weight_kg: 0.2, price: 6 },
  { code: "O-CYT", name: "Cytryny", category: "Owoce", unit: "kg", unit_weight_kg: 1, price: 8.5 },
  { code: "O-LIM", name: "Limonki", category: "Owoce", unit: "kg", unit_weight_kg: 1, price: 14 },
  { code: "O-JAB", name: "Jabłka Ligol", category: "Owoce", unit: "kg", unit_weight_kg: 1, price: 4.2 },
  { code: "O-BAN", name: "Banany", category: "Owoce", unit: "kg", unit_weight_kg: 1, price: 6.9 },
  { code: "O-POM", name: "Pomarańcze (skrzynka 15 kg)", category: "Owoce", unit: "skrz", unit_weight_kg: 15, price: 82 },
  { code: "O-AWO", name: "Awokado Hass", category: "Owoce", unit: "szt", unit_weight_kg: 0.25, price: 4.9 },
  { code: "P-PIECZ", name: "Pieczarki (koszyk 2 kg)", category: "Grzyby", unit: "opak", unit_weight_kg: 2, price: 19 },
];

// =========================================================
// KOSZYK
// =========================================================
export type CartLineInput = { product_id: string; qty: number };

const cartLineSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().positive().max(10000),
});

export const placeOrderSchema = z.object({
  delivery_point_id: z.string().uuid({ message: "Wybierz adres dostawy" }),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Wybierz dzień dostawy"),
  note: optionalText(500),
  lines: z
    .string({ error: "Koszyk jest pusty" })
    .transform((v, ctx) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Koszyk jest pusty" });
        return z.NEVER;
      }
    })
    .pipe(
      z.array(cartLineSchema, { error: "Koszyk jest pusty" }).min(1, "Koszyk jest pusty").max(150, "Maksymalnie 150 pozycji"),
    ),
});

/** Łączy powtórzone produkty i usuwa zera — tak, żeby do bazy szła jedna linia na produkt. */
export function mergeCart(lines: CartLineInput[]): CartLineInput[] {
  const byId = new Map<string, number>();
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    byId.set(l.product_id, (byId.get(l.product_id) ?? 0) + l.qty);
  }
  return [...byId.entries()].map(([product_id, qty]) => ({ product_id, qty: Math.round(qty * 1000) / 1000 }));
}

/** Krok przycisku +/−: 1 dla wszystkiego (kg można wpisać z przecinkiem). */
export function stepQty(current: number, delta: number, unit: string): number {
  const next = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
  return isFractionalUnit(unit) ? Math.round(next * 1000) / 1000 : Math.round(next);
}

/** Wpisana ilość → liczba (przecinek dozwolony); ułamki tylko dla kg. Nieprawidłowe → 0. */
export function parseQty(raw: string, unit: string): number {
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 10000) return 10000;
  return isFractionalUnit(unit) ? Math.round(n * 1000) / 1000 : Math.round(n);
}

export type CatalogItem = { id: string; unit: string; unit_weight_kg: number | string | null; price: number | string | null };

export type CartSummary = { items: number; weightKg: number; valueGrosze: number; hasUnpriced: boolean };

/** Podsumowanie koszyka: liczba pozycji, szacowana waga i wartość netto (w groszach). */
export function summarizeCart(lines: CartLineInput[], catalog: Map<string, CatalogItem>): CartSummary {
  let items = 0;
  let weight = 0;
  let value = 0;
  let hasUnpriced = false;
  for (const l of mergeCart(lines)) {
    const p = catalog.get(l.product_id);
    if (!p) continue;
    items += 1;
    weight += l.qty * Number(p.unit_weight_kg ?? 0);
    if (p.price === null || p.price === undefined || p.price === "") hasUnpriced = true;
    else value += Math.round(l.qty * toGrosze(p.price));
  }
  return { items, weightKg: Math.round(weight * 10) / 10, valueGrosze: value, hasUnpriced };
}

/** Komunikaty błędów zwracanych przez funkcje portal_* w bazie. */
export const PORTAL_ERRORS: Record<string, string> = {
  PORTAL_NO_ACCESS: "Nie masz dostępu do tego oddziału. Zaloguj się ponownie albo skontaktuj się z hurtownią.",
  PORTAL_POINT_INACTIVE: "Ten adres dostawy jest nieaktywny. Skontaktuj się z hurtownią.",
  PORTAL_DATE_NOT_ALLOWED: "Na ten dzień nie można już zamówić dostawy. Wybierz inny termin.",
  PORTAL_EMPTY: "Koszyk jest pusty.",
  PORTAL_BAD_PRODUCT: "Któryś produkt został wycofany z oferty. Odśwież stronę i sprawdź koszyk.",
  PORTAL_BAD_QTY: "Niepoprawna ilość — sztuki, skrzynki i opakowania zamawiasz w całych liczbach.",
  PORTAL_CANNOT_CANCEL: "Tego zamówienia nie można już anulować — hurtownia je realizuje. Zadzwoń do opiekuna.",
};

export function portalErrorMessage(dbMessage: string | undefined | null): string {
  const code = Object.keys(PORTAL_ERRORS).find((k) => dbMessage?.includes(k));
  return code ? PORTAL_ERRORS[code] : "Nie udało się zapisać zamówienia. Spróbuj ponownie.";
}

// =========================================================
// STATUSY DLA KLIENTA
// =========================================================
export type PortalTone = "neutral" | "info" | "primary" | "success" | "warning" | "danger";

export function portalOrderStatus(status: string): { label: string; tone: PortalTone } {
  switch (status) {
    case "new":
    case "unmatched":
      return { label: "Przyjęte", tone: "info" };
    case "planned":
      return { label: "Zaplanowane", tone: "primary" };
    case "in_progress":
      return { label: "W drodze", tone: "warning" };
    case "delivered":
      return { label: "Dostarczone", tone: "success" };
    case "partial":
      return { label: "Dostarczone częściowo", tone: "warning" };
    case "failed":
      return { label: "Niedostarczone", tone: "danger" };
    case "cancelled":
      return { label: "Anulowane", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

// =========================================================
// DOSTĘP: hasło startowe nadawane przez hurtownię
// =========================================================
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bez 0/O, 1/l/I

/** Czytelne hasło do przekazania klientowi (np. „Kt7m-q9Rx-4bWz”). `random` zwraca bajty (crypto). */
export function generatePassword(random: (n: number) => Uint8Array, groups = 3, size = 4): string {
  const bytes = random(groups * size);
  const chars = [...bytes].map((b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]);
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) parts.push(chars.slice(g * size, g * size + size).join(""));
  return parts.join("-");
}

export const portalAccessSchema = z.object({
  email: z
    .string({ error: "Podaj e-mail" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: "Podaj poprawny adres e-mail" })),
});
