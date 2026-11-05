// Lista załadunkowa (M3.7): kolejność odwrotna do dostaw — to, co kierowca wyda jako pierwsze, ładujemy na końcu.

export type LoadOrderLine = { code: string | null; name: string; qty: number; unit: string };
export type LoadOrder = {
  ref: string | null;
  pallets: number;
  crates: number;
  weightKg: number;
  codGrosze: number;
  ready: boolean;
  notes: string | null;
  lines: LoadOrderLine[];
};
export type LoadStop = { sequence: number; customer: string; place: string; address: string; window: string; orders: LoadOrder[] };

export type LoadingRow = LoadStop & { loadNo: number; pallets: number; crates: number; weightKg: number; codGrosze: number; notReady: number };

export function buildLoadingList(stops: LoadStop[]) {
  const sorted = [...stops].sort((a, b) => b.sequence - a.sequence);
  const rows: LoadingRow[] = sorted.map((s, i) => ({
    ...s,
    loadNo: i + 1,
    pallets: round2(s.orders.reduce((a, o) => a + o.pallets, 0)),
    crates: s.orders.reduce((a, o) => a + o.crates, 0),
    weightKg: Math.round(s.orders.reduce((a, o) => a + o.weightKg, 0)),
    codGrosze: s.orders.reduce((a, o) => a + o.codGrosze, 0),
    notReady: s.orders.filter((o) => !o.ready).length,
  }));
  const totals = rows.reduce(
    (t, r) => ({
      stops: t.stops + 1,
      orders: t.orders + r.orders.length,
      pallets: round2(t.pallets + r.pallets),
      crates: t.crates + r.crates,
      weightKg: t.weightKg + r.weightKg,
      codGrosze: t.codGrosze + r.codGrosze,
      notReady: t.notReady + r.notReady,
    }),
    { stops: 0, orders: 0, pallets: 0, crates: 0, weightKg: 0, codGrosze: 0, notReady: 0 },
  );
  return { rows, totals };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
