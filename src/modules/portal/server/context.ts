import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TENANT_COOKIE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getUserWithMemberships } from "@/modules/tenancy/server/context";
import { portalSettings, type PortalSettings } from "../domain/portal";

export type PortalContext = {
  userId: string;
  email: string | null;
  tenantId: string;
  tenantName: string;
  customerId: string;
  customerName: string;
  salesRepName: string | null;
  salesRepPhone: string | null;
  settings: PortalSettings;
};

/** Zalogowany klient hurtowni + jego firma (kontrahent). Brak dostępu → ekran logowania portalu. */
export const requirePortalContext = cache(async (): Promise<PortalContext> => {
  const user = await getUserWithMemberships();
  if (!user) redirect("/portal/login");
  const customerMemberships = user.memberships.filter((m) => m.role === "customer");
  if (customerMemberships.length === 0) redirect("/");

  const selected = (await cookies()).get(TENANT_COOKIE)?.value;
  const membership = customerMemberships.find((m) => m.tenantId === selected) ?? customerMemberships[0];

  const supabase = await createClient();
  const { data: link } = await supabase
    .from("customer_portal_users")
    .select("customer_id, is_active, customers(name, sales_rep_name, sales_rep_phone), tenants(settings)")
    .eq("tenant_id", membership.tenantId)
    .eq("user_id", user.userId)
    .maybeSingle();
  if (!link || !link.is_active || !link.customers) redirect("/portal/login?blad=dostep");

  return {
    userId: user.userId,
    email: user.email,
    tenantId: membership.tenantId,
    tenantName: membership.tenantName,
    customerId: link.customer_id,
    customerName: link.customers.name,
    salesRepName: link.customers.sales_rep_name,
    salesRepPhone: link.customers.sales_rep_phone,
    settings: portalSettings(link.tenants?.settings),
  };
});
