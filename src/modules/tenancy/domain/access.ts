// Czysta logika dostępu: role, ścieżki publiczne, menu panelu.
// Bez importów z Next.js / Supabase — testowane jednostkowo.

export type Role = "admin" | "dispatcher" | "driver" | "viewer" | "customer_service" | "management";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  dispatcher: "Dyspozytor",
  driver: "Kierowca",
  viewer: "Podgląd",
  customer_service: "Obsługa klienta (BOK)",
  management: "Zarząd",
};

const PUBLIC_PREFIXES = ["/login", "/auth/"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

export type NavItem = {
  href: string;
  label: string;
  group: "Operacje" | "Kartoteki" | "Rozliczenia" | "Wzrost" | "System";
  milestone: string; // kamień milowy, w którym moduł powstaje
  built?: boolean; // moduł już działa — bez oznaczenia etapu w menu
  roles: Role[];
};

// Odczyt panelu: wszyscy poza kierowcą. Zapis kontroluje RLS (tylko admin i dyspozytor).
const STAFF: Role[] = ["admin", "dispatcher", "viewer", "customer_service", "management"];

export const NAV_ITEMS: NavItem[] = [
  { href: "/pulpit", label: "Pulpit", group: "Operacje", milestone: "M0", built: true, roles: STAFF },
  { href: "/planowanie", label: "Planowanie tras", group: "Operacje", milestone: "M3", roles: STAFF },
  { href: "/zlecenia", label: "Zamówienia", group: "Operacje", milestone: "M1", built: true, roles: STAFF },
  { href: "/centrum", label: "Centrum operacyjne", group: "Operacje", milestone: "M6", roles: STAFF },
  { href: "/kartoteki/klienci", label: "Klienci i oddziały", group: "Kartoteki", milestone: "M1", built: true, roles: STAFF },
  { href: "/kartoteki/pojazdy", label: "Pojazdy", group: "Kartoteki", milestone: "M1", built: true, roles: STAFF },
  { href: "/kartoteki/kierowcy", label: "Kierowcy", group: "Kartoteki", milestone: "M1", built: true, roles: STAFF },
  { href: "/kartoteki/przewoznicy", label: "Przewoźnicy", group: "Kartoteki", milestone: "M1", built: true, roles: STAFF },
  { href: "/kartoteki/szablony", label: "Szablony tras", group: "Kartoteki", milestone: "M3", built: true, roles: STAFF },
  { href: "/opakowania", label: "Opakowania", group: "Rozliczenia", milestone: "M5", roles: STAFF },
  { href: "/rozliczenia", label: "Rozliczenia kierowców", group: "Rozliczenia", milestone: "M5", roles: STAFF },
  { href: "/audyt", label: "Audyt tras", group: "Wzrost", milestone: "M2", roles: ["admin", "dispatcher"] },
  { href: "/ustawienia", label: "Ustawienia", group: "System", milestone: "M1", roles: ["admin"] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Czy rola może wejść na ścieżkę panelu / aplikacji kierowcy. */
export function canAccess(role: Role, pathname: string): boolean {
  if (pathname === "/driver" || pathname.startsWith("/driver/")) {
    return role === "driver" || role === "admin";
  }
  if (role === "driver") return false;
  const item = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return item ? item.roles.includes(role) : true;
}

export function homePathForRole(role: Role): string {
  if (role === "driver") return "/driver";
  return "/pulpit";
}

/** Bezpieczny cel przekierowania po logowaniu: tylko ścieżki wewnętrzne. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (isPublicPath(next)) return null;
  return next;
}

/** Kto może zmieniać kartoteki i zamówienia (zgodnie z RLS: admin i dyspozytor). */
export function canEdit(role: Role): boolean {
  return role === "admin" || role === "dispatcher";
}
