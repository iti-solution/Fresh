import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { computePeriodPay, monthRange } from "../domain/payroll";
import { loadRouteFacts, loadRules } from "./facts";

type Db = SupabaseClient<Database>;

export type RecomputeResult = { driverId: string; status: "updated" | "approved_skipped"; totalGrosze: number; missingRuleDays: string[] };

/**
 * Przelicza rozliczenie miesiąca kierowcy (M5.4) z tras zakończonych i zamkniętych.
 * Pozycje automatyczne są liczone od nowa, dodatki ręczne zostają. Zatwierdzonego rozliczenia nie zmieniamy.
 */
export async function recomputeSettlement(db: Db, tenantId: string, driverId: string, month: string): Promise<RecomputeResult> {
  const { from, to } = monthRange(month);
  const { data: existing } = await db
    .from("driver_settlements")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("driver_id", driverId)
    .eq("period_start", from)
    .eq("period_end", to)
    .maybeSingle();
  if (existing && existing.status !== "draft") return { driverId, status: "approved_skipped", totalGrosze: 0, missingRuleDays: [] };

  let settlementId = existing?.id;
  if (!settlementId) {
    const { data, error } = await db
      .from("driver_settlements")
      .insert({ tenant_id: tenantId, driver_id: driverId, period_start: from, period_end: to, status: "draft" })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("settlement insert");
    settlementId = data.id;
  }

  const [rules, facts] = await Promise.all([loadRules(db, tenantId), loadRouteFacts(db, tenantId, from, to, { driverId })]);
  const { lines, missingRuleDays } = computePeriodPay(rules, driverId, facts);

  await db.from("driver_settlement_lines").delete().eq("settlement_id", settlementId).eq("is_manual", false);
  if (lines.length) {
    const { error } = await db.from("driver_settlement_lines").insert(
      lines.map((l) => ({
        tenant_id: tenantId,
        settlement_id: settlementId!,
        route_id: l.routeId,
        work_date: l.date,
        component: l.code,
        code: l.code,
        label: l.label,
        quantity: l.quantity,
        rate: l.rateGrosze / 100,
        amount: l.amountGrosze / 100,
        rule_id: l.ruleId,
        note: l.note,
        is_manual: false,
      })),
    );
    if (error) throw error;
  }
  const total = await refreshTotal(db, settlementId);
  return { driverId, status: "updated", totalGrosze: total, missingRuleDays };
}

/** Suma rozliczenia = wszystkie pozycje (automatyczne + ręczne). */
export async function refreshTotal(db: Db, settlementId: string): Promise<number> {
  const { data } = await db.from("driver_settlement_lines").select("amount").eq("settlement_id", settlementId);
  const total = Math.round((data ?? []).reduce((a, l) => a + Number(l.amount) * 100, 0));
  await db.from("driver_settlements").update({ total_amount: total / 100 }).eq("id", settlementId);
  return total;
}

/** Kierowcy z trasami w miesiącu (do przeliczenia całego miesiąca). */
export async function driversWithRoutes(db: Db, tenantId: string, month: string): Promise<string[]> {
  const { from, to } = monthRange(month);
  const { data } = await db
    .from("routes")
    .select("driver_id")
    .eq("tenant_id", tenantId)
    .gte("route_date", from)
    .lte("route_date", to)
    .in("status", ["completed", "closed"])
    .not("driver_id", "is", null);
  return [...new Set((data ?? []).map((r) => r.driver_id!))];
}
