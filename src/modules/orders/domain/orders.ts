// Zamówienia: walidacja ręcznego zamówienia, statusy z magazynu, podsumowanie dnia (czyste funkcje).
import { z } from "zod";
import { DATE_RE, numberField, optionalText, optionalTime, toGrosze } from "@/lib/forms";

export const READINESS = ["ready", "awaiting_warehouse"] as const;
export type Readiness = (typeof READINESS)[number];

export const READINESS_LABELS: Record<Readiness, string> = {
  ready: "Skompletowane",
  awaiting_warehouse: "Do realizacji",
};

/** Status realizacji widoczny dla biura: zaplanowane → w dostawie → dostarczone (magazyn nas tu nie obchodzi). */
export type Fulfilment = "unplanned" | "planned" | "in_delivery" | "delivered" | "failed";

export const FULFILMENT_LABELS: Record<Fulfilment, string> = {
  unplanned: "Niezaplanowane",
  planned: "Zaplanowane",
  in_delivery: "W dostawie",
  delivered: "Dostarczone",
  failed: "Nie dostarczono",
};

export function deriveFulfilment(o: {
  orderStatus: string;
  onRoute: boolean;
  routeStatus: string | null;
  stopStatus: string | null;
}): Fulfilment {
  if (o.orderStatus === "delivered" || o.orderStatus === "partial") return "delivered";
  const st = o.stopStatus;
  if (st === "delivered" || st === "partial") return "delivered";
  if (st === "refused" || st === "absent" || st === "skipped" || o.orderStatus === "failed") return "failed";
  if (!o.onRoute) return "unplanned";
  if (o.routeStatus === "dispatched" || o.routeStatus === "in_progress" || st === "arrived") return "in_delivery";
  return "planned";
}

export const orderSchema = z
  .object({
    delivery_point_id: z.string().uuid({ message: "Wybierz adres dostawy klienta" }),
    delivery_date: z.string().regex(DATE_RE, "Wybierz datę dostawy"),
    external_ref: optionalText(40),
    order_value: numberField({ min: 0, max: 10_000_000 }),
    weight_kg: numberField({ min: 0, max: 40000, fallback: 0 }),
    pallets: numberField({ min: 0, max: 40, fallback: 0 }),
    crates: numberField({ min: 0, max: 2000, int: true, fallback: 0 }),
    window_start: optionalTime,
    window_end: optionalTime,
    readiness: z.enum(READINESS).default("ready"),
    priority: z.enum(["0", "1"]).default("0"),
    notes_sales: optionalText(500),
    notes_logistics: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.window_start) !== Boolean(v.window_end)) {
      ctx.addIssue({ code: "custom", path: ["window_start"], message: "Podaj godzinę od i do albo zostaw oba puste" });
    } else if (v.window_start && v.window_end && v.window_end <= v.window_start) {
      ctx.addIssue({ code: "custom", path: ["window_start"], message: "Godzina „do” musi być po „od”" });
    }
  });
export type OrderInput = z.infer<typeof orderSchema>;

export type OrderForSummary = {
  readiness: Readiness;
  order_value: number | string | null;
  weight_kg: number | string | null;
  pallets: number | string | null;
  crates: number | null;
  status?: string;
};

export type DaySummary = {
  count: number;
  ready: number;
  awaiting: number;
  valueGrosze: number;
  weightKg: number;
  pallets: number;
  crates: number;
};

/** Sumy dnia; anulowane zamówienia pomijane. Kwoty liczone w groszach. */
export function summarizeOrders(orders: OrderForSummary[]): DaySummary {
  const s: DaySummary = { count: 0, ready: 0, awaiting: 0, valueGrosze: 0, weightKg: 0, pallets: 0, crates: 0 };
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    s.count += 1;
    if (o.readiness === "ready") s.ready += 1;
    else s.awaiting += 1;
    s.valueGrosze += toGrosze(o.order_value);
    s.weightKg += Number(o.weight_kg ?? 0);
    s.pallets += Number(o.pallets ?? 0);
    s.crates += o.crates ?? 0;
  }
  s.weightKg = Math.round(s.weightKg);
  s.pallets = Math.round(s.pallets * 100) / 100;
  return s;
}

/** Najbliższy dzień roboczy po dacie (pomija niedzielę). Daty jako YYYY-MM-DD, bez stref czasowych. */
export function nextWorkingDay(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Dzisiejsza data w strefie Europe/Warsaw (YYYY-MM-DD). */
export function todayInWarsaw(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(now);
}

const DAY_NAMES = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

/** "2026-10-26" → "poniedziałek, 26.10" */
export function formatDayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]}, ${day.slice(8, 10)}.${day.slice(5, 7)}`;
}
