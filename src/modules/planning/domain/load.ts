// Planowanie: ładowność trasy, alarmy i reguły przekazania do załadunku (czyste funkcje).

export type Dim = "kg" | "pallets" | "crates" | "m3";
export const DIM_LABELS: Record<Dim, string> = { kg: "masa", pallets: "palety", crates: "skrzynki", m3: "objętość" };

export type VehicleCapacity = {
  capacity_kg: number | string | null;
  capacity_pallets: number | string | null;
  capacity_crates: number | null;
  capacity_m3: number | string | null;
} | null;

export type LoadItem = {
  weight_kg: number | string | null;
  pallets: number | string | null;
  crates: number | null;
  volume_m3: number | string | null;
};

export type RouteLoad = {
  totals: Record<Dim, number>;
  capacity: Record<Dim, number> | null;
  pct: Record<Dim, number | null>;
  overloaded: Dim[];
  nearFull: Dim[];
};

const NEAR_FULL = 90;

/** Suma ładunku trasy i zajętość auta w procentach. Pojemność 0 = wymiar nie jest kontrolowany. */
export function computeLoad(items: LoadItem[], vehicle: VehicleCapacity): RouteLoad {
  const totals: Record<Dim, number> = { kg: 0, pallets: 0, crates: 0, m3: 0 };
  for (const i of items) {
    totals.kg += Number(i.weight_kg ?? 0);
    totals.pallets += Number(i.pallets ?? 0);
    totals.crates += i.crates ?? 0;
    totals.m3 += Number(i.volume_m3 ?? 0);
  }
  totals.kg = Math.round(totals.kg);
  totals.pallets = Math.round(totals.pallets * 100) / 100;
  totals.m3 = Math.round(totals.m3 * 100) / 100;

  const capacity = vehicle
    ? {
        kg: Number(vehicle.capacity_kg ?? 0),
        pallets: Number(vehicle.capacity_pallets ?? 0),
        crates: vehicle.capacity_crates ?? 0,
        m3: Number(vehicle.capacity_m3 ?? 0),
      }
    : null;

  const pct = { kg: null, pallets: null, crates: null, m3: null } as Record<Dim, number | null>;
  const overloaded: Dim[] = [];
  const nearFull: Dim[] = [];
  if (capacity) {
    for (const d of Object.keys(totals) as Dim[]) {
      if (capacity[d] > 0) {
        const p = Math.round((totals[d] / capacity[d]) * 100);
        pct[d] = p;
        if (totals[d] > capacity[d]) overloaded.push(d);
        else if (p >= NEAR_FULL) nearFull.push(d);
      }
    }
  }
  return { totals, capacity, pct, overloaded, nearFull };
}

export type IssueCode = "no_vehicle" | "no_driver" | "empty" | "overloaded" | "awaiting_warehouse" | "closed_points";
export type Issue = { code: IssueCode; label: string; severity: "block" | "confirm" | "info" };

export type RouteForIssues = {
  vehicleId: string | null;
  driverId: string | null;
  stopsCount: number;
  awaitingCount: number;
  closedPointsCount?: number;
  load: RouteLoad;
};

/**
 * Problemy trasy.
 * block   — nie można przekazać do załadunku (brak auta, kierowcy, pusta trasa)
 * confirm — można, ale tylko po świadomym potwierdzeniu (przeciążenie)
 * info    — ostrzeżenie (zamówienia jeszcze w magazynie, oddział zamknięty tego dnia)
 */
export function routeIssues(r: RouteForIssues): Issue[] {
  const issues: Issue[] = [];
  if (!r.vehicleId) issues.push({ code: "no_vehicle", label: "brak pojazdu", severity: "block" });
  if (!r.driverId) issues.push({ code: "no_driver", label: "brak kierowcy", severity: "block" });
  if (r.stopsCount === 0) issues.push({ code: "empty", label: "brak punktów", severity: "block" });
  if (r.load.overloaded.length) {
    const parts = r.load.overloaded.map((d) => `${DIM_LABELS[d]} ${r.load.pct[d]}%`).join(", ");
    issues.push({ code: "overloaded", label: `przeciążenie: ${parts}`, severity: "confirm" });
  }
  if (r.awaitingCount > 0) issues.push({ code: "awaiting_warehouse", label: `${r.awaitingCount} do realizacji w magazynie`, severity: "info" });
  if (r.closedPointsCount) issues.push({ code: "closed_points", label: `${r.closedPointsCount} oddz. zamknięte tego dnia`, severity: "info" });
  return issues;
}

export type ReadyDecision = { ok: true } | { ok: false; needsConfirm: boolean; reasons: string[] };

/** Czy trasę można oznaczyć „Gotowa do załadunku”. Przeciążenie wymaga potwierdzenia (force). */
export function canMarkReady(issues: Issue[], force = false): ReadyDecision {
  const blocking = issues.filter((i) => i.severity === "block");
  if (blocking.length) return { ok: false, needsConfirm: false, reasons: blocking.map((i) => i.label) };
  const confirm = issues.filter((i) => i.severity === "confirm");
  if (confirm.length && !force) return { ok: false, needsConfirm: true, reasons: confirm.map((i) => i.label) };
  return { ok: true };
}

export const ROUTE_STATUS_LABELS: Record<string, string> = {
  draft: "Szkic",
  planned: "Gotowa do załadunku",
  dispatched: "Wydana kierowcy",
  in_progress: "W trasie",
  completed: "Zakończona",
  closed: "Zamknięta",
  cancelled: "Anulowana",
};

export const ROUTE_KIND_LABELS: Record<string, string> = {
  regular: "trasa stała",
  second: "2. kurs",
  extra: "kurs dodatkowy",
  emergency: "awaryjny",
  weekend: "weekendowy",
  express: "ekspres",
  dowozka: "dowózka",
};

/** Kurs dodatkowy — walidacja formularza bez zod (mało pól). */
export function validateExtraRoute(input: { name?: string; kind?: string; reason?: string }): string | null {
  if (!input.name || input.name.trim().length < 2) return "Podaj nazwę kursu.";
  if (!input.kind || !(input.kind in ROUTE_KIND_LABELS) || input.kind === "regular") return "Wybierz rodzaj kursu.";
  if ((input.kind === "dowozka" || input.kind === "emergency") && (!input.reason || input.reason.trim().length < 3)) {
    return "Dla dowózki i kursu awaryjnego podaj przyczynę.";
  }
  return null;
}
