// Przydział aut i kierowców do tras na dany dzień (kierowca nie jest związany z autem na stałe).

export type AssignableRoute = {
  id: string;
  name: string;
  courseNo: number;
  vehicleId: string | null;
  vehicleLabel: string | null;
  driverId: string | null;
  driverLabel: string | null;
};

/**
 * Konflikty przydziału w jednym dniu: to samo auto albo ten sam kierowca na dwóch trasach w tym samym kursie.
 * Drugi kurs tym samym autem/kierowcą (course_no 2) jest dozwolony.
 */
export function assignmentConflicts(routes: AssignableRoute[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string, msg: string) => out.set(id, [...(out.get(id) ?? []), msg]);
  for (const r of routes) {
    for (const o of routes) {
      if (o.id === r.id || o.courseNo !== r.courseNo) continue;
      if (r.vehicleId && r.vehicleId === o.vehicleId)
        add(r.id, `auto ${r.vehicleLabel ?? ""} także na trasie ${o.name}`.replace("  ", " "));
      if (r.driverId && r.driverId === o.driverId) add(r.id, `${r.driverLabel ?? "kierowca"} także na trasie ${o.name}`);
    }
  }
  return out;
}

export type HistoryRow = {
  date: string;
  vehicleId: string | null;
  vehicle: string | null;
  driverId: string | null;
  driver: string | null;
  km: number | null;
  orders: number;
};

export type UsageSummary = {
  key: string;
  label: string;
  days: number;
  routes: number;
  km: number;
  orders: number;
  partners: string[];
};

/** Podsumowanie dziennika: dla każdego auta (albo kierowcy) — ile dni, ile km, z kim jeździło. */
export function usageSummary(rows: HistoryRow[], by: "vehicle" | "driver"): UsageSummary[] {
  const map = new Map<string, UsageSummary & { dates: Set<string>; partnerSet: Set<string> }>();
  for (const r of rows) {
    const key = by === "vehicle" ? r.vehicleId : r.driverId;
    const label = by === "vehicle" ? r.vehicle : r.driver;
    const partner = by === "vehicle" ? r.driver : r.vehicle;
    if (!key || !label) continue;
    const s = map.get(key) ?? {
      key,
      label,
      days: 0,
      routes: 0,
      km: 0,
      orders: 0,
      partners: [],
      dates: new Set<string>(),
      partnerSet: new Set<string>(),
    };
    s.routes += 1;
    s.km += r.km ?? 0;
    s.orders += r.orders;
    s.dates.add(r.date);
    if (partner) s.partnerSet.add(partner);
    map.set(key, s);
  }
  return [...map.values()]
    .map(({ dates, partnerSet, ...s }) => ({
      ...s,
      days: dates.size,
      partners: [...partnerSet].sort((a, b) => a.localeCompare(b, "pl")),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pl"));
}
