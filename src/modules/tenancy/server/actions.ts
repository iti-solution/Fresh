"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TENANT_COOKIE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { homePathForRole } from "../domain/access";
import { getUserWithMemberships } from "./context";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

async function setTenantCookie(tenantId: string) {
  (await cookies()).set(TENANT_COOKIE, tenantId, COOKIE_OPTS);
}

export async function selectTenant(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const user = await getUserWithMemberships();
  if (!user) redirect("/login");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership) redirect("/wybierz-firme");
  await setTenantCookie(membership.tenantId);
  redirect(homePathForRole(membership.role));
}

export type ActionState = { error?: string };

export async function createTenant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Podaj nazwę firmy (min. 2 znaki)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_tenant", { p_name: name });
  if (error || !data) return { error: "Nie udało się utworzyć firmy. Spróbuj ponownie." };
  await setTenantCookie(data);
  redirect("/pulpit");
}

export async function createDemoTenant(): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_demo_tenant");
  if (error || !data) throw new Error("Nie udało się utworzyć firmy demo.");
  await setTenantCookie(data);
  redirect("/pulpit");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(TENANT_COOKIE);
  redirect("/login");
}
