"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { adminKeyProblem, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { generatePassword, normalizedUnitWeight, portalAccessSchema, productSchema, SAMPLE_PRODUCTS } from "../domain/portal";

// =========================================================
// KATALOG PRODUKTÓW (panel hurtowni)
// =========================================================
export async function saveProduct(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień do zmiany katalogu." };
  const parsed = productSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    tenant_id: ctx.tenantId,
    name: v.name,
    code: v.code,
    category: v.category,
    unit: v.unit,
    unit_weight_kg: normalizedUnitWeight(v.unit, v.unit_weight_kg),
    price: v.price,
  });
  if (error?.code === "23505")
    return {
      ok: false,
      fieldErrors: { code: ["Produkt o tym indeksie już jest w katalogu"] },
      message: "Popraw zaznaczone pola.",
    };
  if (error) return { ok: false, message: "Nie udało się zapisać produktu." };
  revalidatePath("/kartoteki/produkty");
  return { ok: true, message: `Dodano: ${v.name}` };
}

export async function setProductActive(productId: string, active: boolean): Promise<void> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return;
  const supabase = await createClient();
  await supabase.from("products").update({ is_active: active }).eq("id", productId).eq("tenant_id", ctx.tenantId);
  revalidatePath("/kartoteki/produkty");
}

/** Szybki start: przykładowy katalog warzyw i owoców (pomija indeksy, które już są). */
export async function addSampleProducts(): Promise<void> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return;
  const supabase = await createClient();
  await supabase.from("products").upsert(
    SAMPLE_PRODUCTS.map((p, i) => ({ ...p, tenant_id: ctx.tenantId, sort: i })),
    { onConflict: "tenant_id,code", ignoreDuplicates: true },
  );
  revalidatePath("/kartoteki/produkty");
}

// =========================================================
// DOSTĘP KLIENTA DO PORTALU (karta klienta)
// =========================================================
export type PortalAccessState = FormState & { email?: string; password?: string };

const newPassword = () => generatePassword((n) => randomBytes(n));

async function assertCustomer(tenantId: string, customerId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("id").eq("tenant_id", tenantId).eq("id", customerId).maybeSingle();
  return Boolean(data);
}

/** Zakłada klientowi konto do portalu: e-mail + hasło startowe (pokazane raz, do przekazania klientowi). */
export async function createPortalAccess(customerId: string, _prev: PortalAccessState, fd: FormData): Promise<PortalAccessState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  const keyProblem = adminKeyProblem();
  if (keyProblem) return { ok: false, message: `Nie da się założyć konta: ${keyProblem}` };
  const parsed = portalAccessSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const email = parsed.data.email;
  if (!(await assertCustomer(ctx.tenantId, customerId))) return { ok: false, message: "Nie znaleziono klienta." };

  const admin = createAdminClient();
  const password = newPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { portal_customer_id: customerId, tenant_id: ctx.tenantId },
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || /already/i.test(error?.message ?? "");
    return {
      ok: false,
      fieldErrors: exists ? { email: ["Ten e-mail ma już konto w Fresh TMS — użyj innego adresu klienta."] } : undefined,
      message: exists ? "Popraw adres e-mail." : "Nie udało się założyć konta. Spróbuj ponownie.",
    };
  }
  const userId = data.user.id;
  const { error: mErr } = await admin.from("memberships").insert({ tenant_id: ctx.tenantId, user_id: userId, role: "customer" });
  const { error: cErr } = await admin.from("customer_portal_users").insert({
    tenant_id: ctx.tenantId,
    user_id: userId,
    customer_id: customerId,
    login_email: email,
    created_by: ctx.userId,
  });
  if (mErr || cErr) {
    await admin.auth.admin.deleteUser(userId); // nie zostawiamy konta bez dostępu
    return { ok: false, message: "Nie udało się nadać dostępu do portalu." };
  }
  revalidatePath(`/kartoteki/klienci/${customerId}`);
  return { ok: true, email, password, message: "Konto założone. Przekaż klientowi login i hasło — hasło widać tylko teraz." };
}

/** Nowe hasło (zgubione albo pierwsze przekazanie) — przy okazji włącza dostęp z powrotem. */
export async function resetPortalPassword(customerId: string, userId: string): Promise<PortalAccessState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  const keyProblem = adminKeyProblem();
  if (keyProblem) return { ok: false, message: keyProblem };
  const supabase = await createClient();
  const { data: link } = await supabase
    .from("customer_portal_users")
    .select("user_id, login_email")
    .eq("tenant_id", ctx.tenantId)
    .eq("customer_id", customerId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!link) return { ok: false, message: "Nie znaleziono dostępu." };

  const admin = createAdminClient();
  const password = newPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, message: "Nie udało się zmienić hasła." };
  await admin
    .from("memberships")
    .upsert(
      { tenant_id: ctx.tenantId, user_id: userId, role: "customer" },
      { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
    );
  await supabase.from("customer_portal_users").update({ is_active: true }).eq("tenant_id", ctx.tenantId).eq("user_id", userId);
  revalidatePath(`/kartoteki/klienci/${customerId}`);
  return { ok: true, email: link.login_email, password, message: "Nowe hasło ustawione. Stare przestało działać." };
}

/** Wyłącza dostęp: klient nie zaloguje się do portalu; historia zamówień zostaje. */
export async function disablePortalAccess(customerId: string, userId: string): Promise<void> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return;
  const supabase = await createClient();
  const { data: link } = await supabase
    .from("customer_portal_users")
    .update({ is_active: false })
    .eq("tenant_id", ctx.tenantId)
    .eq("customer_id", customerId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (link && !adminKeyProblem()) {
    await createAdminClient()
      .from("memberships")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", userId)
      .eq("role", "customer");
  }
  revalidatePath(`/kartoteki/klienci/${customerId}`);
}
