import "server-only";
import type { PayPreview } from "@/modules/execution/domain/offline";
import type { DriverCtx } from "@/modules/execution/server/driver-context";
import { computeDayPay, computePeriodPay, ruleFor, sumLines } from "../domain/payroll";
import { loadRouteFacts, loadRules } from "./facts";

/**
 * Wynagrodzenie do raportu zmiany kierowcy (D17): kwota za dzień trasy i suma od początku miesiąca.
 * Kierowca widzi tylko nazwy składników i kwoty — bez obrotu i wartości zamówień.
 */
export async function getDriverPayPreview(c: DriverCtx, routeId: string): Promise<PayPreview | null> {
  const { data: route } = await c.admin
    .from("routes")
    .select("route_date")
    .eq("id", routeId)
    .eq("tenant_id", c.tenantId)
    .eq("driver_id", c.driverId)
    .maybeSingle();
  if (!route) return null;
  const day = route.route_date;
  const rules = await loadRules(c.admin, c.tenantId);
  const rule = ruleFor(rules, c.driverId, day);
  if (!rule) return null;
  const monthStart = `${day.slice(0, 7)}-01`;
  const [today, month] = await Promise.all([
    loadRouteFacts(c.admin, c.tenantId, day, day, { driverId: c.driverId, statuses: ["in_progress", "completed", "closed"] }),
    loadRouteFacts(c.admin, c.tenantId, monthStart, day, { driverId: c.driverId }),
  ]);
  const lines = computeDayPay(rule.components, day, today);
  const monthLines = computePeriodPay(rules, c.driverId, [...month.filter((r) => r.date < day), ...today]).lines;
  // składniki zsumowane po nazwie — bez szczegółów obrotu
  const byLabel = new Map<string, number>();
  for (const l of lines) byLabel.set(l.label, (byLabel.get(l.label) ?? 0) + l.amountGrosze);
  return {
    todayGrosze: sumLines(lines),
    monthGrosze: sumLines(monthLines),
    lines: [...byLabel.entries()].map(([label, amountGrosze]) => ({ label, amountGrosze })),
    ruleName: rule.components.name || null,
  };
}
