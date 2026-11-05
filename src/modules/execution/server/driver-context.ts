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
  const { data } = await admin.from("drivers").select("id, is_active").eq("user_id", user.userId).eq("tenant_id", m.tenantId).maybeSingle();
  if (!data || !data.is_active) return null;
  return { tenantId: m.tenantId, driverId: data.id, userId: user.userId, admin };
}
