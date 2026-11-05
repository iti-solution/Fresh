// Ustawienia kartotek: typy adresów dostawy i dni zamknięte (czyste funkcje).
import { z } from "zod";
import { checkbox, DATE_RE, optionalText, requiredText } from "@/lib/forms";

export const pointTypeSchema = z.object({
  name: requiredText("nazwa typu", 2, 60),
  is_temporary: checkbox,
  is_active: checkbox,
});

export const closureSchema = z.object({
  date: z.string().regex(DATE_RE, "Wybierz datę"),
  reason: optionalText(120).transform((v) => v ?? "Zamknięte"),
});
