// Walidacja kartotek (czyste funkcje — bez Next/Supabase).
import { z } from "zod";
import { checkbox, numberField, optionalDate, optionalText, optionalTime, requiredText } from "@/lib/forms";

export const BRANCH_TYPES = ["restaurant", "kitchen", "bar", "warehouse", "hotel", "other"] as const;
export type BranchType = (typeof BRANCH_TYPES)[number];

const nip = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const digits = (v ?? "").replace(/[\s-]/g, "");
    if (digits === "") return null;
    if (!/^\d{10}$/.test(digits)) {
      ctx.addIssue({ code: "custom", message: "NIP to 10 cyfr" });
      return z.NEVER;
    }
    return digits;
  });

const phone = optionalText(30);

export const customerSchema = z.object({
  external_code: optionalText(40),
  name: requiredText("nazwa klienta", 2),
  nip,
  category: optionalText(60),
  sales_rep_name: optionalText(100),
  sales_rep_phone: phone,
  notes: optionalText(1000),
  is_active: checkbox,
});
export type CustomerInput = z.infer<typeof customerSchema>;

const weekdays = z
  .array(z.string())
  .optional()
  .transform((v, ctx) => {
    const days = [...new Set((v ?? []).map(Number))].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
    if (days.length === 0) {
      ctx.addIssue({ code: "custom", message: "Zaznacz co najmniej jeden dzień dostaw" });
      return z.NEVER;
    }
    return days;
  });

export const pointSchema = z
  .object({
    name: requiredText("nazwa oddziału"),
    branch_type: z.enum(BRANCH_TYPES).default("other"),
    external_code: optionalText(40),
    address_line: requiredText("adres (ulica i numer)", 3),
    postal_code: z
      .string()
      .trim()
      .optional()
      .transform((v, ctx) => {
        if (!v) return null;
        if (!/^\d{2}-\d{3}$/.test(v)) {
          ctx.addIssue({ code: "custom", message: "Kod w formacie 00-000" });
          return z.NEVER;
        }
        return v;
      }),
    city: requiredText("miejscowość"),
    contact_phone: phone,
    delivery_weekdays: weekdays,
    window1_from: optionalTime,
    window1_to: optionalTime,
    window2_from: optionalTime,
    window2_to: optionalTime,
    service_minutes: numberField({ min: 1, max: 180, int: true, fallback: 10 }),
    call_instructions: optionalText(300),
    access_instructions: optionalText(300),
    floor: optionalText(60),
    unloading_zone: optionalText(120),
    driver_instructions: optionalText(500),
    active_from: optionalDate,
    active_to: optionalDate,
    is_active: checkbox,
  })
  .superRefine((v, ctx) => {
    const pair = (from: string | null, to: string | null, key: string, required: boolean) => {
      if (!from && !to) {
        if (required) ctx.addIssue({ code: "custom", path: [key], message: "Podaj okno przyjęć" });
        return;
      }
      if (!from || !to) ctx.addIssue({ code: "custom", path: [key], message: "Podaj godzinę od i do" });
      else if (to <= from) ctx.addIssue({ code: "custom", path: [key], message: "Godzina „do” musi być po „od”" });
    };
    pair(v.window1_from, v.window1_to, "window1_from", true);
    pair(v.window2_from, v.window2_to, "window2_from", false);
    if (v.window1_to && v.window2_from && v.window2_from < v.window1_to) {
      ctx.addIssue({ code: "custom", path: ["window2_from"], message: "Drugie okno musi zaczynać się po pierwszym" });
    }
    if (v.active_from && v.active_to && v.active_to < v.active_from) {
      ctx.addIssue({ code: "custom", path: ["active_to"], message: "Koniec sezonu przed początkiem" });
    }
  });
export type PointInput = z.infer<typeof pointSchema>;

export type WindowRow = { weekday: number; opens_at: string; closes_at: string };

/** Okna przyjęć z formularza → wiersze delivery_point_windows (te same okna na każdy dzień dostaw). */
export function buildWindows(
  input: Pick<PointInput, "delivery_weekdays" | "window1_from" | "window1_to" | "window2_from" | "window2_to">,
): WindowRow[] {
  const slots: [string, string][] = [];
  if (input.window1_from && input.window1_to) slots.push([input.window1_from, input.window1_to]);
  if (input.window2_from && input.window2_to) slots.push([input.window2_from, input.window2_to]);
  return input.delivery_weekdays.flatMap((weekday) => slots.map(([opens_at, closes_at]) => ({ weekday, opens_at, closes_at })));
}

/** Odwrotnie: zapisane okna → wartości formularza (z pierwszego dnia, który ma okna). */
export function windowsToForm(windows: { weekday: number; opens_at: string; closes_at: string }[]) {
  const sorted = [...windows].sort((a, b) => a.weekday - b.weekday || a.opens_at.localeCompare(b.opens_at));
  const firstDay = sorted[0]?.weekday;
  const day = sorted.filter((w) => w.weekday === firstDay);
  const t = (s?: string) => (s ? s.slice(0, 5) : "");
  return {
    window1_from: t(day[0]?.opens_at),
    window1_to: t(day[0]?.closes_at),
    window2_from: t(day[1]?.opens_at),
    window2_to: t(day[1]?.closes_at),
  };
}

export const noteSchema = z
  .object({
    text: requiredText("treść uwagi", 3, 300),
    valid_from: optionalDate,
    valid_to: optionalDate,
  })
  .superRefine((v, ctx) => {
    if (v.valid_from && v.valid_to && v.valid_to < v.valid_from) {
      ctx.addIssue({ code: "custom", path: ["valid_to"], message: "Data końca przed datą początku" });
    }
  });

/** Czy uwaga tymczasowa obowiązuje w danym dniu (YYYY-MM-DD). */
export function isNoteActive(note: { valid_from: string; valid_to: string | null }, day: string): boolean {
  return note.valid_from <= day && (note.valid_to === null || note.valid_to >= day);
}

export const vehicleSchema = z.object({
  registration: requiredText("numer rejestracyjny", 4, 15).transform((v) => v.toUpperCase().replace(/\s+/g, " ")),
  name: optionalText(60),
  vehicle_type: optionalText(60),
  body_type: optionalText(60),
  capacity_kg: numberField({ min: 0, max: 40000, fallback: 0 }),
  capacity_pallets: numberField({ min: 0, max: 40, fallback: 0 }),
  capacity_crates: numberField({ min: 0, max: 2000, int: true, fallback: 0 }),
  capacity_m3: numberField({ min: 0, max: 120, fallback: 0 }),
  is_own: checkbox,
  carrier_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  status: z.enum(["active", "service", "inactive"]).default("active"),
  cost_per_km: numberField({ min: 0, max: 100 }),
  driver_cost_per_day: numberField({ min: 0, max: 10000 }),
  fixed_cost_per_day: numberField({ min: 0, max: 10000 }),
});

export const driverSchema = z.object({
  first_name: requiredText("imię"),
  last_name: requiredText("nazwisko"),
  phone,
  employment_type: optionalText(60),
  is_active: checkbox,
});

export const carrierSchema = z.object({
  name: requiredText("nazwa przewoźnika", 2),
  nip,
  phone,
});

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));

/** Szablon trasy (trasa stała): kierowca wstępny i zastępczy są opcjonalne i muszą się różnić. */
export const templateSchema = z
  .object({
    name: requiredText("nazwa trasy", 2, 120),
    weekdays,
    planned_start: optionalTime,
    default_vehicle_id: optionalId,
    default_driver_id: optionalId,
    alt_driver_id: optionalId,
    is_active: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.alt_driver_id && v.alt_driver_id === v.default_driver_id) {
      ctx.addIssue({ code: "custom", path: ["alt_driver_id"], message: "Kierowca zastępczy musi być inną osobą niż wstępny" });
    }
  });
export type TemplateInput = z.infer<typeof templateSchema>;
