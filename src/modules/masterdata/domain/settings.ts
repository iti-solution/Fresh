// Ustawienia kartotek: typy adresów dostawy i dni zamknięte (czyste funkcje).
import { z } from "zod";
import { checkbox, DATE_RE, numberField, optionalText, requiredText } from "@/lib/forms";

export const pointTypeSchema = z.object({
  name: requiredText("nazwa typu", 2, 60),
  is_temporary: checkbox,
  is_active: checkbox,
});

export const closureSchema = z.object({
  date: z.string().regex(DATE_RE, "Wybierz datę"),
  reason: optionalText(120).transform((v) => v ?? "Zamknięte"),
});

/** Typ opakowania zwrotnego (paleta, skrzynka, keg…) z kaucją w zł. */
export const packagingTypeSchema = z.object({
  code: requiredText("kod", 1, 20).transform((v) => v.toUpperCase().replace(/\s+/g, "-")),
  name: requiredText("nazwa", 2, 60),
  deposit_value: numberField({ min: 0, max: 100000 }),
  is_active: checkbox,
});
