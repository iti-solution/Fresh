import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithMemberships } from "@/modules/tenancy/server/context";

export type DriverCtx = { tenantId: string; driverId: string; userId: string; admin: ReturnType<typeof createAdminClient> };

/** Zalogowany kierowca (sesja z PIN-u na terminalu) bez przekierowań — do API aplikacji offline. */
export async function getDriverCtx(): Promise<DriverCtx | null> {
  const user = await getUserWithMemberships();
  const m = user?.memberships.find((x) => x.role === "driver");
  if (!user || !m) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("drivers")
    .select("id, is_active")
    .eq("user_id", user.userId)
    .eq("tenant_id", m.tenantId)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return { tenantId: m.tenantId, driverId: data.id, userId: user.userId, admin };
}

/** Saldo opakowań klientów z trasy (M4.5 — podpowiedź dla kierowcy). Klucz serwerowy po sprawdzeniu właściciela trasy. */
export async function customerBalancesForRoute(c: DriverCtx, routeId: string): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  const { data: route } = await c.admin
    .from("routes")
    .select("id, route_stops(id, delivery_points(customer_id))")
    .eq("id", routeId)
    .eq("tenant_id", c.tenantId)
    .eq("driver_id", c.driverId)
    .maybeSingle();
  if (!route) return out;
  const custByStop = new Map(route.route_stops.map((s) => [s.id, s.delivery_points?.customer_id ?? null]));
  const customers = [...new Set([...custByStop.values()].filter((x): x is string => Boolean(x)))];
  if (!customers.length) return out;
  const { data } = await c.admin
    .from("packaging_balances")
    .select("party_id, packaging_type_id, balance")
    .eq("tenant_id", c.tenantId)
    .eq("party_type", "customer")
    .in("party_id", customers);
  for (const [stopId, cust] of custByStop) {
    const rec: Record<string, number> = {};
    for (const b of data ?? []) if (b.party_id === cust && b.packaging_type_id) rec[b.packaging_type_id] = Number(b.balance ?? 0);
    out.set(stopId, rec);
  }
  return out;
}
