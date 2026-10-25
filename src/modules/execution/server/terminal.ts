import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Terminal (np. Zebra) przypisany do firmy: podpisane ciasteczko z identyfikatorem firmy.
// Dzięki temu ekran logowania PIN-em wie, czyich kierowców pokazać — bez logowania e-mailem.
export const TERMINAL_COOKIE = "fresh_terminal";

function secret() {
  const s = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Brak klucza serwerowego");
  return s;
}

function sign(tenantId: string) {
  return createHmac("sha256", secret()).update(`terminal:${tenantId}`).digest("base64url");
}

export async function setTerminalTenant(tenantId: string) {
  (await cookies()).set(TERMINAL_COOKIE, `${tenantId}.${sign(tenantId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 2,
  });
}

export async function getTerminalTenant(): Promise<string | null> {
  const raw = (await cookies()).get(TERMINAL_COOKIE)?.value;
  if (!raw) return null;
  const [tenantId, sig] = raw.split(".");
  if (!tenantId || !sig) return null;
  try {
    const expected = Buffer.from(sign(tenantId));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given) ? tenantId : null;
  } catch {
    return null;
  }
}

export async function clearTerminal() {
  (await cookies()).delete(TERMINAL_COOKIE);
}
