// Przyjęcie zamówień z wiadomości: kanały, walidacja formularzy, dopasowanie nadawcy (czyste funkcje).
import { z } from "zod";
import { optionalText } from "@/lib/forms";

export const CHANNELS = ["portal", "sms", "email", "whatsapp", "phone", "voice", "photo", "other"] as const;
/** Kanały, które BOK może wkleić ręcznie (portal wpisuje klient). */
export const MANUAL_CHANNELS = ["sms", "email", "whatsapp", "phone", "voice", "photo", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  portal: "Portal klienta",
  sms: "SMS",
  email: "E-mail",
  whatsapp: "WhatsApp",
  phone: "Telefon (notatka)",
  voice: "Nagranie (transkrypcja)",
  photo: "Zdjęcie kartki (przepisane)",
  other: "Inny",
};

export const messageSchema = z.object({
  channel: z.enum(MANUAL_CHANNELS, { message: "Wybierz kanał" }),
  sender: optionalText(120),
  customer_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.string().uuid().nullable()),
  body: z
    .string({ error: "Wklej treść wiadomości" })
    .trim()
    .min(3, "Wklej treść wiadomości")
    .max(5000, "Maksymalnie 5000 znaków"),
});

const approveLine = z.object({
  product_id: z.string().uuid({ message: "Wybierz produkt w każdej pozycji" }),
  qty: z.number().positive("Ilość musi być większa od zera").max(10000),
  draft_line_id: z.string().uuid().nullable().optional(),
});

export const approveSchema = z.object({
  delivery_point_id: z.string().uuid({ message: "Wybierz klienta i oddział" }),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Wybierz dzień dostawy"),
  note: optionalText(500),
  lines: z
    .string()
    .transform((v, ctx) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Dodaj pozycje zamówienia" });
        return z.NEVER;
      }
    })
    .pipe(z.array(approveLine).min(1, "Dodaj co najmniej jedną pozycję").max(150)),
});

export const INTAKE_ERRORS: Record<string, string> = {
  INTAKE_NO_ACCESS: "Nie masz uprawnień do zatwierdzania zamówień.",
  INTAKE_ALREADY_REVIEWED: "Tę wiadomość ktoś już sprawdził.",
  INTAKE_BAD_POINT: "Wybierz oddział klienta.",
  INTAKE_BAD_DATE: "Wybierz dzień dostawy.",
  INTAKE_EMPTY: "Dodaj co najmniej jedną pozycję.",
  INTAKE_BAD_LINE: "Któryś produkt nie istnieje w katalogu.",
  INTAKE_BAD_QTY: "Niepoprawna ilość — skrzynki, sztuki, opakowania i pęczki w całych liczbach.",
};

export function intakeErrorMessage(dbMessage: string | undefined | null): string {
  const code = Object.keys(INTAKE_ERRORS).find((k) => dbMessage?.includes(k));
  return code ? INTAKE_ERRORS[code] : "Nie udało się zapisać zamówienia. Spróbuj ponownie.";
}

/** Ostatnie 9 cyfr numeru — „+48 600 100 200”, „600100200”, „0048600100200” to ten sam telefon. */
export function phoneKey(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

export type SenderCandidate = { customerId: string; pointId: string | null; phone?: string | null; email?: string | null };

/** Kto napisał: najpierw telefon oddziału, potem e-mail konta w portalu. Kilku kandydatów → brak (wybiera człowiek). */
export function matchSender(
  sender: string | null,
  candidates: SenderCandidate[],
): { customerId: string; pointId: string | null } | null {
  if (!sender) return null;
  const phone = phoneKey(sender);
  const email = sender.includes("@") ? sender.trim().toLowerCase() : null;
  const hits = candidates.filter((c) => (phone && phoneKey(c.phone) === phone) || (email && c.email?.toLowerCase() === email));
  const customers = new Set(hits.map((h) => h.customerId));
  if (customers.size !== 1) return null;
  const pointHits = hits.filter((h) => h.pointId);
  return { customerId: hits[0].customerId, pointId: pointHits.length === 1 ? pointHits[0].pointId : null };
}

/** Kolor pewności: zielony — prawie na pewno, bursztyn — sprawdź, czerwony — automat nie wie. */
export function confidenceTone(c: number | null | undefined): "success" | "warning" | "danger" {
  const v = Number(c ?? 0);
  return v >= 0.8 ? "success" : v >= 0.5 ? "warning" : "danger";
}

/** Klient w portalu: adres, dzień i treść (wpisana albo podyktowana); samo nagranie też wystarczy. */
export const portalMessageSchema = z.object({
  delivery_point_id: z.string().uuid({ message: "Wybierz adres dostawy" }),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Wybierz dzień dostawy"),
  body: z.string().trim().max(3000, "Maksymalnie 3000 znaków").optional().default(""),
});

export const AUDIO_MAX_BYTES = 3.5 * 1024 * 1024; // limit żądania w Vercel ~4,5 MB
export const AUDIO_MAX_SECONDS = 120;

/** Czy plik nadaje się jako nagranie zamówienia. Zwraca komunikat błędu albo null. */
export function audioProblem(file: { size: number; type: string } | null): string | null {
  if (!file || file.size === 0) return null;
  if (file.size > AUDIO_MAX_BYTES) return "Nagranie jest za długie — maksymalnie 2 minuty.";
  if (!file.type.startsWith("audio/")) return "To nie jest nagranie dźwiękowe.";
  return null;
}

export function audioExtension(type: string): string {
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("wav")) return "wav";
  return "audio";
}

/** Pozycje bez poprawek / wszystkie pozycje po decyzji BOK — skuteczność jednego zamówienia na żywo. */
export function draftScore(
  lines: { draftLineId: string | null; productId: string; qty: number }[],
  proposals: { id: string; productId: string | null; qty: number | null }[],
): { hit: number; total: number } {
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const kept = new Set<string>();
  let hit = 0;
  for (const l of lines) {
    const p = l.draftLineId ? byId.get(l.draftLineId) : undefined;
    if (!p) continue;
    kept.add(p.id);
    if (p.productId && p.productId === l.productId && p.qty !== null && Math.abs(p.qty - l.qty) < 1e-9) hit++;
  }
  const added = lines.filter((l) => !l.draftLineId || !byId.has(l.draftLineId)).length;
  const removed = proposals.filter((p) => !kept.has(p.id)).length;
  return { hit, total: kept.size + added + removed };
}
