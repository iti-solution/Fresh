// Kalendarz dni wolnych (M1.3): święta ustawowe w Polsce + zamknięcia całej firmy i pojedynczych adresów.
// Czyste funkcje — daty jako YYYY-MM-DD (dzień kalendarzowy, bez stref czasowych).

export type Holiday = { date: string; name: string };

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Wielkanoc (niedziela) wg algorytmu Gaussa/Meeusa (kalendarz gregoriański). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dni ustawowo wolne od pracy w Polsce w danym roku (od 2025 r. także Wigilia). */
export function polishHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: iso(year, 1, 1), name: "Nowy Rok" },
    { date: iso(year, 1, 6), name: "Trzech Króli" },
    { date: easter, name: "Wielkanoc" },
    { date: addDays(easter, 1), name: "Poniedziałek Wielkanocny" },
    { date: iso(year, 5, 1), name: "Święto Pracy" },
    { date: iso(year, 5, 3), name: "Święto Konstytucji 3 Maja" },
    { date: addDays(easter, 49), name: "Zielone Świątki" },
    { date: addDays(easter, 60), name: "Boże Ciało" },
    { date: iso(year, 8, 15), name: "Wniebowzięcie NMP" },
    { date: iso(year, 11, 1), name: "Wszystkich Świętych" },
    { date: iso(year, 11, 11), name: "Święto Niepodległości" },
    { date: iso(year, 12, 25), name: "Boże Narodzenie" },
    { date: iso(year, 12, 26), name: "Drugi dzień Bożego Narodzenia" },
  ];
  if (year >= 2025) list.push({ date: iso(year, 12, 24), name: "Wigilia" });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Święta w przedziale dat [from, to] (włącznie). */
export function holidaysBetween(from: string, to: string): Holiday[] {
  const out: Holiday[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    out.push(...polishHolidays(y).filter((h) => h.date >= from && h.date <= to));
  }
  return out;
}

export function holidayOn(day: string): Holiday | null {
  return polishHolidays(Number(day.slice(0, 4))).find((h) => h.date === day) ?? null;
}

/** Wpis z delivery_point_exceptions: delivery_point_id = null → dotyczy całej firmy. */
export type DayException = { delivery_point_id: string | null; date: string; is_closed: boolean; reason: string | null };

export type FirmDay = { closed: boolean; reason: string | null; source: "holiday" | "company" | null };

/**
 * Czy firma (hurtownia) nie wozi w ten dzień.
 * Kolejność: wpis firmy „pracujemy” (is_closed = false) wygrywa ze świętem; wpis „zamknięte” — zamknięcie z powodem;
 * dalej wbudowane święto ustawowe.
 */
export function firmDay(day: string, exceptions: DayException[]): FirmDay {
  const own = exceptions.find((e) => e.delivery_point_id === null && e.date === day);
  if (own && !own.is_closed) return { closed: false, reason: null, source: null };
  if (own?.is_closed) return { closed: true, reason: own.reason || "Zamknięte", source: "company" };
  const h = holidayOn(day);
  return h ? { closed: true, reason: h.name, source: "holiday" } : { closed: false, reason: null, source: null };
}

/** Czy konkretny adres przyjmuje dostawę w ten dzień (zamknięcie firmy albo samego adresu). */
export function pointClosed(day: string, pointId: string, exceptions: DayException[]): boolean {
  if (firmDay(day, exceptions).closed) return true;
  return exceptions.some((e) => e.delivery_point_id === pointId && e.date === day && e.is_closed);
}

/** Daty zamknięte dla adresu w przedziale (do list wyboru dnia w portalu). */
export function closedDatesFor(pointId: string | null, from: string, to: string, exceptions: DayException[]): string[] {
  const set = new Set<string>();
  for (const h of holidaysBetween(from, to)) if (firmDay(h.date, exceptions).closed) set.add(h.date);
  for (const e of exceptions) {
    if (e.date < from || e.date > to || !e.is_closed) continue;
    if (e.delivery_point_id === null || e.delivery_point_id === pointId) set.add(e.date);
  }
  return [...set].sort();
}
