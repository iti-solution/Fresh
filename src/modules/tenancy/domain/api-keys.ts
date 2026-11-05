// Klucze API firmy (M1.6). W bazie tylko skrót SHA-256 — jawny klucz widać raz, przy tworzeniu.
import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "drv_";

export function generateApiKey(): { key: string; prefix: string } {
  const key = API_KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 10) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Nagłówek `Authorization: Bearer drv_…` albo `X-Api-Key: drv_…` → klucz (albo null). */
export function apiKeyFromHeaders(get: (name: string) => string | null): string | null {
  const auth = get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  const key = (m?.[1] ?? get("x-api-key") ?? "").trim();
  return key.startsWith(API_KEY_PREFIX) && key.length >= 20 && key.length <= 100 ? key : null;
}

export function apiKeyName(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s.length >= 2 && s.length <= 80 ? s : null;
}
