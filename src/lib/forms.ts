// Wspólne narzędzia formularzy (czyste funkcje — bez Next/Supabase).
import { z } from "zod";

export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

/** FormData → zwykły obiekt. Pola powtarzalne (checkboxy `name[]`) stają się tablicami. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    if (rawKey.endsWith("[]")) {
      const key = rawKey.slice(0, -2);
      const arr = (out[key] as string[] | undefined) ?? [];
      arr.push(value);
      out[key] = arr;
    } else {
      out[rawKey] = value;
    }
  }
  return out;
}

/** Puste pole tekstowe → null, reszta przycięta. */
export const optionalText = (max = 500) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = (v ?? "").trim();
      if (t.length > max) {
        ctx.addIssue({ code: "custom", message: `Maksymalnie ${max} znaków` });
        return z.NEVER;
      }
      return t === "" ? null : t;
    });

export const requiredText = (label: string, min = 1, max = 200) =>
  z
    .string({ error: `Podaj: ${label}` })
    .trim()
    .superRefine((v, ctx) => {
      if (v.length === 0) ctx.addIssue({ code: "custom", message: `Podaj: ${label}` });
      else if (v.length < min) ctx.addIssue({ code: "custom", message: `${label}: minimum ${min} znaki` });
      else if (v.length > max) ctx.addIssue({ code: "custom", message: `Maksymalnie ${max} znaków` });
    });

/** Liczba z pola formularza (przecinek dziesiętny dozwolony). Puste → wartość domyślna. */
export const numberField = (opts: { min?: number; max?: number; int?: boolean; fallback?: number | null } = {}) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return opts.fallback ?? null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: "Wpisz liczbę" });
        return z.NEVER;
      }
      if (opts.int && !Number.isInteger(n)) {
        ctx.addIssue({ code: "custom", message: "Wpisz liczbę całkowitą" });
        return z.NEVER;
      }
      if (opts.min !== undefined && n < opts.min) {
        ctx.addIssue({ code: "custom", message: `Minimum ${opts.min}` });
        return z.NEVER;
      }
      if (opts.max !== undefined && n > opts.max) {
        ctx.addIssue({ code: "custom", message: `Maksimum ${opts.max}` });
        return z.NEVER;
      }
      return n;
    });

export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.string()])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const optionalDate = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!DATE_RE.test(v)) {
      ctx.addIssue({ code: "custom", message: "Niepoprawna data" });
      return z.NEVER;
    }
    return v;
  });

export const optionalTime = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const t = v.slice(0, 5);
    if (!TIME_RE.test(t)) {
      ctx.addIssue({ code: "custom", message: "Godzina w formacie GG:MM" });
      return z.NEVER;
    }
    return t;
  });

/** Wynik walidacji zod → FormState z błędami przy polach. */
export function toFormErrors(error: z.ZodError, message = "Popraw zaznaczone pola."): FormState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, message, fieldErrors };
}

/** Kwota w zł → grosze (integer), żeby sumować bez błędów zaokrągleń. */
export function toGrosze(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return Math.round(Number(value) * 100);
}

export function formatPln(grosze: number): string {
  return (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}
