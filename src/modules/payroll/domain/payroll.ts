// Silnik reguł wynagrodzeń kierowców (M5.3) — czyste funkcje, kwoty w groszach (integer).
// Każda pozycja rozliczenia ma „skąd się wzięła”: ilość × stawka i opis z danych trasy.
import { z } from "zod";
import { parseGrosze } from "@/lib/forms";

export const PAY_MODELS = { employee: "Etatowy (dniówka + premia)", delivery: "Dowózkowy (od obrotu / punktów)" } as const;
export type PayModel = keyof typeof PAY_MODELS;

/** Składniki reguły (driver_pay_rules.components). Kwoty w groszach, procenty w punktach bazowych (1% = 100). */
export type PayComponents = {
  name: string;
  model: PayModel;
  daily_rate: number; // za dzień pracy (raz dziennie, niezależnie od liczby kursów)
  per_km: number; // za każdy km powyżej progu
  km_threshold: number; // km w dniu wliczone w dniówkę
  per_stop: number; // za zrealizowany punkt (dostarczono / częściowo)
  per_pallet: number; // za dostarczoną paletę
  per_extra_route: number; // za kurs dodatkowy (drugi kurs, dowózka, ekspres, weekend…)
  turnover_bp: number; // % od obrotu trasy (wartość wszystkich zamówień na trasie)
  delivered_value_bp: number; // % od wartości dostarczonych zamówień
  on_time_bonus: number; // premia za dzień z terminowością ≥ progu
  on_time_threshold_pct: number; // próg terminowości premii (np. 95)
};

export const EMPTY_COMPONENTS: PayComponents = {
  name: "",
  model: "employee",
  daily_rate: 0,
  per_km: 0,
  km_threshold: 0,
  per_stop: 0,
  per_pallet: 0,
  per_extra_route: 0,
  turnover_bp: 0,
  delivered_value_bp: 0,
  on_time_bonus: 0,
  on_time_threshold_pct: 95,
};

/** Odczyt składników z bazy (stare/niepełne JSON-y uzupełniamy zerami). */
export function readComponents(raw: unknown): PayComponents {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const int = (k: keyof PayComponents, max = 100_000_000) => {
    const v = Number(o[k]);
    return Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : (EMPTY_COMPONENTS[k] as number);
  };
  return {
    name: typeof o.name === "string" ? o.name.slice(0, 80) : "",
    model: o.model === "delivery" ? "delivery" : "employee",
    daily_rate: int("daily_rate"),
    per_km: int("per_km"),
    km_threshold: int("km_threshold", 5000),
    per_stop: int("per_stop"),
    per_pallet: int("per_pallet"),
    per_extra_route: int("per_extra_route"),
    turnover_bp: int("turnover_bp", 10000),
    delivered_value_bp: int("delivered_value_bp", 10000),
    on_time_bonus: int("on_time_bonus"),
    on_time_threshold_pct: int("on_time_threshold_pct", 100),
  };
}

const money = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return 0;
    const g = parseGrosze(v);
    if (g === null || g > 100_000_000) {
      ctx.addIssue({ code: "custom", message: "Kwota 0–1 000 000 zł, maks. 2 miejsca po przecinku" });
      return z.NEVER;
    }
    return g;
  });
const pct = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return 0;
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: "custom", message: "Procent 0–100" });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });
const whole = (max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return 0;
      const n = Number(String(v).replace(/\s/g, ""));
      if (!Number.isInteger(n) || n < 0 || n > max) {
        ctx.addIssue({ code: "custom", message: `Liczba całkowita 0–${max}` });
        return z.NEVER;
      }
      return n;
    });

/** Formularz reguły (zł i % jak wpisuje kierownik) → składniki w groszach / punktach bazowych. */
export const ruleFormSchema = z
  .object({
    name: z.string().trim().min(2, "Nazwij regułę, np. „Etat — trasy stałe”").max(80),
    model: z.enum(["employee", "delivery"]),
    driver_id: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
    valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Podaj datę początku"),
    daily_rate: money,
    per_km: money,
    km_threshold: whole(5000),
    per_stop: money,
    per_pallet: money,
    per_extra_route: money,
    turnover_pct: pct,
    delivered_value_pct: pct,
    on_time_bonus: money,
    on_time_threshold_pct: whole(100),
  })
  .transform((v) => ({
    driver_id: v.driver_id,
    valid_from: v.valid_from,
    components: {
      name: v.name,
      model: v.model,
      daily_rate: v.daily_rate,
      per_km: v.per_km,
      km_threshold: v.km_threshold,
      per_stop: v.per_stop,
      per_pallet: v.per_pallet,
      per_extra_route: v.per_extra_route,
      turnover_bp: v.turnover_pct,
      delivered_value_bp: v.delivered_value_pct,
      on_time_bonus: v.on_time_bonus,
      on_time_threshold_pct: v.on_time_threshold_pct || 95,
    } satisfies PayComponents,
  }));

export type RuleRow = {
  id: string;
  driver_id: string | null;
  valid_from: string;
  valid_to: string | null;
  components: PayComponents;
};

/** Reguła obowiązująca kierowcę w dniu: najpierw jego własna, potem domyślna firmy; najnowsza wersja wygrywa. */
export function ruleFor(rules: RuleRow[], driverId: string, day: string): RuleRow | null {
  const active = (r: RuleRow) => r.valid_from <= day && (r.valid_to === null || r.valid_to >= day);
  const pick = (list: RuleRow[]) => list.filter(active).sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0] ?? null;
  return pick(rules.filter((r) => r.driver_id === driverId)) ?? pick(rules.filter((r) => r.driver_id === null));
}

/** Nowa wersja reguły zamyka poprzednią (dzień przed startem nowej) — historia rozliczeń się nie zmienia. */
export function closePreviousVersion(
  rules: RuleRow[],
  driverId: string | null,
  validFrom: string,
): { id: string; valid_to: string }[] {
  const d = new Date(`${validFrom}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const dayBefore = d.toISOString().slice(0, 10);
  return rules
    .filter((r) => r.driver_id === driverId && r.valid_from < validFrom && (r.valid_to === null || r.valid_to >= validFrom))
    .map((r) => ({ id: r.id, valid_to: dayBefore }));
}

/** Fakty z jednej trasy potrzebne do wynagrodzenia. */
export type RouteFacts = {
  routeId: string;
  date: string;
  name: string;
  kind: string; // regular | second | extra | emergency | weekend | express | dowozka
  courseNo: number;
  km: number | null;
  stopsDone: number; // dostarczono + częściowo
  stopsWithWindow: number;
  stopsOnTime: number;
  palletsDelivered: number;
  turnoverGrosze: number; // wartość wszystkich zamówień trasy
  deliveredValueGrosze: number; // wartość zamówień dostarczonych (także częściowo)
};

export type PayLineCode =
  | "daily_rate"
  | "per_km"
  | "per_stop"
  | "per_pallet"
  | "per_extra_route"
  | "turnover"
  | "delivered_value"
  | "on_time_bonus"
  | "manual";

export type ComputedLine = {
  code: PayLineCode;
  label: string;
  routeId: string | null;
  date: string;
  quantity: number;
  rateGrosze: number; // dla procentów: punkty bazowe
  amountGrosze: number;
  note: string;
};

export const LINE_LABELS: Record<PayLineCode, string> = {
  daily_rate: "Dniówka",
  per_km: "Kilometrówka",
  per_stop: "Za punkty",
  per_pallet: "Za palety",
  per_extra_route: "Kurs dodatkowy",
  turnover: "Od obrotu trasy",
  delivered_value: "Od wartości dostaw",
  on_time_bonus: "Premia za terminowość",
  manual: "Dodatek ręczny",
};

const isExtra = (r: RouteFacts) => r.kind !== "regular" || r.courseNo > 1;
const plnRate = (g: number) => `${(g / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł`;
const bpRate = (bp: number) => `${(bp / 100).toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%`;

/**
 * Wynagrodzenie kierowcy za jeden dzień (wszystkie jego trasy tego dnia).
 * Dniówka i próg km liczone raz na dzień; punkty, palety, obrót — z każdej trasy; premia za terminowość — za dzień.
 */
export function computeDayPay(rule: PayComponents, day: string, routes: RouteFacts[]): ComputedLine[] {
  const lines: ComputedLine[] = [];
  const mine = routes.filter((r) => r.date === day);
  if (!mine.length) return lines;
  const push = (l: Omit<ComputedLine, "label" | "date">) => {
    if (l.amountGrosze !== 0) lines.push({ ...l, label: LINE_LABELS[l.code], date: day });
  };

  if (rule.daily_rate)
    push({
      code: "daily_rate",
      routeId: null,
      quantity: 1,
      rateGrosze: rule.daily_rate,
      amountGrosze: rule.daily_rate,
      note: `dzień pracy (${mine.map((r) => r.name).join(", ")})`,
    });

  const km = mine.reduce((a, r) => a + (r.km ?? 0), 0);
  if (rule.per_km) {
    const paid = Math.max(0, km - rule.km_threshold);
    push({
      code: "per_km",
      routeId: null,
      quantity: paid,
      rateGrosze: rule.per_km,
      amountGrosze: paid * rule.per_km,
      note: `${km} km w dniu${rule.km_threshold ? `, próg ${rule.km_threshold} km` : ""} × ${plnRate(rule.per_km)}`,
    });
  }

  for (const r of mine) {
    if (rule.per_stop && r.stopsDone)
      push({
        code: "per_stop",
        routeId: r.routeId,
        quantity: r.stopsDone,
        rateGrosze: rule.per_stop,
        amountGrosze: r.stopsDone * rule.per_stop,
        note: `${r.name}: ${r.stopsDone} zrealizowanych punktów × ${plnRate(rule.per_stop)}`,
      });
    if (rule.per_pallet && r.palletsDelivered) {
      const amount = Math.round(r.palletsDelivered * rule.per_pallet);
      push({
        code: "per_pallet",
        routeId: r.routeId,
        quantity: r.palletsDelivered,
        rateGrosze: rule.per_pallet,
        amountGrosze: amount,
        note: `${r.name}: ${r.palletsDelivered} palet × ${plnRate(rule.per_pallet)}`,
      });
    }
    if (rule.per_extra_route && isExtra(r))
      push({
        code: "per_extra_route",
        routeId: r.routeId,
        quantity: 1,
        rateGrosze: rule.per_extra_route,
        amountGrosze: rule.per_extra_route,
        note: `${r.name} (${r.courseNo > 1 ? `kurs ${r.courseNo}` : r.kind})`,
      });
    if (rule.turnover_bp && r.turnoverGrosze)
      push({
        code: "turnover",
        routeId: r.routeId,
        quantity: r.turnoverGrosze / 100,
        rateGrosze: rule.turnover_bp,
        amountGrosze: Math.round((r.turnoverGrosze * rule.turnover_bp) / 10000),
        note: `${r.name}: ${bpRate(rule.turnover_bp)} od obrotu ${plnRate(r.turnoverGrosze)}`,
      });
    if (rule.delivered_value_bp && r.deliveredValueGrosze)
      push({
        code: "delivered_value",
        routeId: r.routeId,
        quantity: r.deliveredValueGrosze / 100,
        rateGrosze: rule.delivered_value_bp,
        amountGrosze: Math.round((r.deliveredValueGrosze * rule.delivered_value_bp) / 10000),
        note: `${r.name}: ${bpRate(rule.delivered_value_bp)} od dostaw ${plnRate(r.deliveredValueGrosze)}`,
      });
  }

  if (rule.on_time_bonus) {
    const withWindow = mine.reduce((a, r) => a + r.stopsWithWindow, 0);
    const onTime = mine.reduce((a, r) => a + r.stopsOnTime, 0);
    const pctOnTime = withWindow ? Math.round((onTime / withWindow) * 100) : null;
    if (pctOnTime !== null && pctOnTime >= rule.on_time_threshold_pct)
      push({
        code: "on_time_bonus",
        routeId: null,
        quantity: 1,
        rateGrosze: rule.on_time_bonus,
        amountGrosze: rule.on_time_bonus,
        note: `terminowość ${pctOnTime}% (${onTime}/${withWindow}), próg ${rule.on_time_threshold_pct}%`,
      });
  }
  return lines;
}

/** Rozliczenie okresu: dzień po dniu, każdy dzień z regułą obowiązującą w tym dniu. */
export function computePeriodPay(
  rules: RuleRow[],
  driverId: string,
  routes: RouteFacts[],
): { lines: (ComputedLine & { ruleId: string | null })[]; missingRuleDays: string[] } {
  const days = [...new Set(routes.map((r) => r.date))].sort();
  const lines: (ComputedLine & { ruleId: string | null })[] = [];
  const missingRuleDays: string[] = [];
  for (const day of days) {
    const rule = ruleFor(rules, driverId, day);
    if (!rule) {
      missingRuleDays.push(day);
      continue;
    }
    lines.push(...computeDayPay(rule.components, day, routes).map((l) => ({ ...l, ruleId: rule.id })));
  }
  return { lines, missingRuleDays };
}

export const sumLines = (lines: { amountGrosze: number }[]) => lines.reduce((a, l) => a + l.amountGrosze, 0);

/** Pierwszy i ostatni dzień miesiąca „YYYY-MM”. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
