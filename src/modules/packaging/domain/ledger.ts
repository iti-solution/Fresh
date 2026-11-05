// Księga opakowań i gotówki (M5.1, M5.2, M5.2a, M5.2b) — czyste funkcje.

export type Movement = { qty: number; created_at: string; reason: string };

/**
 * Opakowania zalegające u klienta dłużej niż `days` dni: wydania rozliczane zwrotami od najstarszych (FIFO).
 * Zwraca ilość nadal u klienta wydaną przed progiem i datę najstarszego niezwróconego wydania.
 */
export function overdueAtCustomer(movements: Movement[], today: string, days = 30): { overdue: number; oldest: string | null; balance: number } {
  const limit = new Date(`${today}T23:59:59Z`);
  limit.setUTCDate(limit.getUTCDate() - days);
  const issues: { qty: number; at: string }[] = [];
  let returned = 0;
  for (const m of [...movements].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (m.qty > 0) issues.push({ qty: m.qty, at: m.created_at });
    else returned += -m.qty;
  }
  for (const i of issues) {
    const used = Math.min(i.qty, returned);
    i.qty -= used;
    returned -= used;
  }
  const open = issues.filter((i) => i.qty > 0);
  const balance = open.reduce((a, i) => a + i.qty, 0) - returned;
  const old = open.filter((i) => new Date(i.at) <= limit);
  return { overdue: old.reduce((a, i) => a + i.qty, 0), oldest: open[0]?.at.slice(0, 10) ?? null, balance };
}

export type CloseInput = {
  status: string;
  openStops: number;
  odometerStart: number | null;
  odometerEnd: number | null;
  packaging: { typeId: string; name: string; issued: number; collected: number }[];
  cashCollectedGrosze: number; // pobrania zebrane na punktach tej trasy
};

export type CheckItem = { key: string; label: string; ok: boolean; detail: string };

/** Checklista zamknięcia trasy (M5.5). Zamknąć można też z uwagami — ale dyspozytor widzi, czego brakuje. */
export function closeChecklist(r: CloseInput): CheckItem[] {
  const km = r.odometerEnd !== null && r.odometerStart !== null ? r.odometerEnd - r.odometerStart : null;
  return [
    {
      key: "finished",
      label: "Kierowca zakończył zmianę",
      ok: r.status === "completed",
      detail: r.status === "completed" ? "raport zmiany wysłany" : "trasa nadal w realizacji — wpisz licznik końcowy",
    },
    { key: "stops", label: "Wszystkie punkty potwierdzone", ok: r.openStops === 0, detail: r.openStops ? `${r.openStops} bez potwierdzenia (zostaną oznaczone jako pominięte)` : "tak" },
    { key: "km", label: "Kilometry wpisane", ok: km !== null && km >= 0, detail: km !== null ? `${km} km (licznik ${r.odometerStart} → ${r.odometerEnd})` : "brak licznika" },
    {
      key: "packaging",
      label: "Opakowania do zdania",
      ok: true,
      detail: r.packaging.filter((p) => p.collected || p.issued).map((p) => `${p.name}: zebrano ${p.collected}`).join(", ") || "brak ruchów",
    },
    { key: "cash", label: "Gotówka do przyjęcia", ok: true, detail: r.cashCollectedGrosze ? `${(r.cashCollectedGrosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł` : "brak pobrań" },
  ];
}

/** Różnice przy zamknięciu: kierowca zdał mniej/więcej niż zebrał, w kasie mniej/więcej niż pobrał. */
export function closeDifferences(r: CloseInput, received: { typeId: string; qty: number }[], cashReceivedGrosze: number) {
  const packaging = r.packaging
    .map((p) => {
      const got = received.find((x) => x.typeId === p.typeId)?.qty ?? 0;
      return { typeId: p.typeId, name: p.name, expected: p.collected, received: got, diff: got - p.collected };
    })
    .filter((p) => p.diff !== 0);
  return { packaging, cashDiffGrosze: cashReceivedGrosze - r.cashCollectedGrosze };
}

export const PACKAGING_REASONS: Record<string, string> = {
  issue: "wydanie u klienta",
  return: "zwrot od klienta",
  load: "załadunek na trasę",
  handover: "zdanie do magazynu",
  correction: "korekta",
  damage: "uszkodzenie",
  inventory: "inwentaryzacja",
};

export const CORRECTION_REASONS = ["correction", "damage", "inventory"] as const;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];
