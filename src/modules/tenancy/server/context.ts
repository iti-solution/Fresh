import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TENANT_COOKIE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { canAccess, homePathForRole, type Role } from "../domain/access";

export type Membership = { tenantId: string; tenantName: string; role: Role; isDemo: boolean };

export type TenantContext = {
  userId: string;
  email: string | null;
  tenantId: string;
  tenantName: string;
  role: Role;
  memberships: Membership[];
};

/** Zalogowany użytkownik + jego firmy. Null gdy brak sesji. */
export const getUserWithMemberships = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select("tenant_id, role, tenants(name, settings)")
    .eq("user_id", auth.user.id);
  if (error) throw error;

  const memberships: Membership[] = (data ?? []).map((m) => {
    const settings = (m.tenants?.settings ?? {}) as Record<string, unknown>;
    return {
      tenantId: m.tenant_id,
      tenantName: m.tenants?.name ?? "—",
      role: m.role,
      isDemo: settings.is_demo === true,
    };
  });
  memberships.sort((a, b) => a.tenantName.localeCompare(b.tenantName, "pl"));

  return { userId: auth.user.id, email: auth.user.email ?? null, memberships };
});

/** Kontekst firmy + sprawdzenie roli dla danej ścieżki. Brak uprawnień → strona startowa roli. */
export async function requireAccess(pathname: string): Promise<TenantContext> {
  const ctx = await requireTenantContext();
  if (!canAccess(ctx.role, pathname)) redirect(homePathForRole(ctx.role));
  return ctx;
}

/** Kontekst bieżącej firmy. Przekierowuje na logowanie albo wybór firmy, gdy go brak. */
export const requireTenantContext = cache(async (): Promise<TenantContext> => {
  const user = await getUserWithMemberships();
  if (!user) redirect("/login");

  const selected = (await cookies()).get(TENANT_COOKIE)?.value;
  const membership =
    user.memberships.find((m) => m.tenantId === selected) ?? (user.memberships.length === 1 ? user.memberships[0] : undefined);
  if (!membership) redirect("/wybierz-firme");

  return {
    userId: user.userId,
    email: user.email,
    tenantId: membership.tenantId,
    tenantName: membership.tenantName,
    role: membership.role,
    memberships: user.memberships,
  };
});
