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
  await seedDemoHistory(supabase, data);
  await setTenantCookie(data);
  redirect("/pulpit");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(TENANT_COOKIE);
  redirect("/login");
}

/** Usuwa firmę demo użytkownika i zakłada ją od nowa (świeże zamówienia na najbliższy dzień roboczy). */
export async function resetDemoTenant(): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reset_demo_tenant");
  if (error || !data) throw new Error("Nie udało się odświeżyć firmy demo.");
  await seedDemoHistory(supabase, data);
  await setTenantCookie(data);
  redirect("/pulpit?demo=odswiezone");
}

/** Historia demo (~4 tygodnie tras) pod zestawienia. Brak migracji 0008 nie blokuje założenia firmy demo. */
async function seedDemoHistory(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string) {
  const { error } = await supabase.rpc("seed_demo_history", { p_tenant: tenantId });
  if (error) console.warn("seed_demo_history:", error.message);

  // Pobrania na nadchodzące dni: co piąty klient płaci gotówką przy dostawie (jak w historii demo).
  const { data: future } = await supabase
    .from("orders")
    .select("id, order_value, delivery_points(customer_id)")
    .eq("tenant_id", tenantId)
    .gt("delivery_date", new Date().toISOString().slice(0, 10))
    .is("cod_amount", null);
  const paysCash = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 5 === 0;
  for (const o of future ?? []) {
    const customer = o.delivery_points?.customer_id;
    if (customer && paysCash(customer) && o.order_value !== null) {
      await supabase.from("orders").update({ cod_amount: o.order_value }).eq("id", o.id).eq("tenant_id", tenantId);
    }
  }
}
