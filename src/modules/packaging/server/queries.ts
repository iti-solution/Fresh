import "server-only";
import { toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { overdueAtCustomer } from "../domain/ledger";

export type CustomerPackaging = {
  customerId: string;
  customer: string;
  code: string | null;
  byType: Record<string, { balance: number; overdue: number; oldest: string | null }>;
  depositGrosze: number;
  overdueTotal: number;
};

/** Salda opakowań u klientów z zalegającymi > `days` dni (FIFO) i wartością kaucji (M5.2b). */
export async function getCustomerPackaging(tenantId: string, today: string, days = 30) {
  const db = await createClient();
  const [types, cust] = await Promise.all([
    db.from("packaging_types").select("id, code, name, deposit_value").eq("tenant_id", tenantId).order("code"),
    db.from("customers").select("id, name, external_code").eq("tenant_id", tenantId),
  ]);
  const movements: { party_id: string; packaging_type_id: string; qty: number; created_at: string; reason: string }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db
      .from("packaging_movements")
      .select("party_id, packaging_type_id, qty, created_at, reason")
      .eq("tenant_id", tenantId)
      .eq("party_type", "customer")
      .order("created_at")
      .range(off, off + 999);
    if (error) throw error;
    movements.push(...(data ?? []));
    if (!data || data.length < 1000 || off > 100_000) break;
  }
  const name = new Map((cust.data ?? []).map((c) => [c.id, c]));
  const deposit = new Map((types.data ?? []).map((t) => [t.id, toGrosze(t.deposit_value)]));
  const grouped = new Map<string, Map<string, typeof movements>>();
  for (const m of movements) {
    const byType = grouped.get(m.party_id) ?? new Map();
    byType.set(m.packaging_type_id, [...(byType.get(m.packaging_type_id) ?? []), m]);
    grouped.set(m.party_id, byType);
  }
  const rows: CustomerPackaging[] = [];
  for (const [customerId, byType] of grouped) {
    const out: CustomerPackaging["byType"] = {};
    let dep = 0;
    let overdueTotal = 0;
    for (const [typeId, list] of byType) {
      const r = overdueAtCustomer(list, today, days);
      out[typeId] = r;
      dep += Math.max(0, r.balance) * (deposit.get(typeId) ?? 0);
      overdueTotal += r.overdue;
    }
    if (Object.values(out).every((x) => x.balance === 0)) continue;
    const c = name.get(customerId);
    rows.push({ customerId, customer: c?.name ?? "—", code: c?.external_code ?? null, byType: out, depositGrosze: dep, overdueTotal });
  }
  rows.sort((a, b) => b.overdueTotal - a.overdueTotal || b.depositGrosze - a.depositGrosze);
  return { types: types.data ?? [], rows };
}

/** Salda kierowców: opakowania i gotówka, które powinny być zdane (różnice po zamknięciu tras). */
export async function getDriverBalances(tenantId: string) {
  const db = await createClient();
  const [pb, cb, drv, types] = await Promise.all([
    db.from("packaging_balances").select("party_id, packaging_type_id, balance").eq("tenant_id", tenantId).eq("party_type", "driver"),
    db.from("cash_balances").select("party_id, balance").eq("tenant_id", tenantId).eq("party_type", "driver"),
    db.from("drivers").select("id, first_name, last_name").eq("tenant_id", tenantId).order("last_name"),
    db.from("packaging_types").select("id, name").eq("tenant_id", tenantId).order("code"),
  ]);
  return (drv.data ?? [])
    .map((d) => ({
      driverId: d.id,
      name: `${d.first_name} ${d.last_name}`,
      packaging: (types.data ?? []).map((t) => ({
        typeId: t.id,
        name: t.name,
        balance: Number((pb.data ?? []).find((b) => b.party_id === d.id && b.packaging_type_id === t.id)?.balance ?? 0),
      })),
      cashGrosze: toGrosze((cb.data ?? []).find((b) => b.party_id === d.id)?.balance ?? 0),
    }))
    .filter((d) => d.cashGrosze !== 0 || d.packaging.some((p) => p.balance !== 0));
}

/** Historia ruchów opakowań klienta (najnowsze). */
export async function getCustomerHistory(tenantId: string, customerId: string) {
  const db = await createClient();
  const { data, error } = await db
    .from("packaging_movements")
    .select("id, qty, reason, note, created_at, packaging_types(name), route_stops(routes(name, route_date))")
    .eq("tenant_id", tenantId)
    .eq("party_type", "customer")
    .eq("party_id", customerId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data ?? [];
}
