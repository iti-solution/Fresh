"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, inputClass } from "@/components/ui/primitives";
import type { FormState } from "@/lib/forms";
import { fold } from "@/lib/tabular";
import { cn } from "@/lib/utils";
import { assignOrderPoint } from "../server/actions";

export type MatchOrder = {
  id: string;
  ref: string | null;
  date: string;
  customerCode: string | null;
  pointCode: string | null;
  customerName: string | null;
  address: string | null;
  suggestions: string[]; // id adresów
};
export type MatchPoint = { id: string; label: string };

function Row({ o, points, byId }: { o: MatchOrder; points: MatchPoint[]; byId: Map<string, MatchPoint> }) {
  const [q, setQ] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(assignOrderPoint.bind(null, o.id), {});
  const filtered = useMemo(() => {
    const f = fold(q);
    if (f.length < 2) return [];
    return points.filter((p) => fold(p.label).includes(f)).slice(0, 50);
  }, [q, points]);
  if (state.ok) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
        <span className="font-mono text-xs">{o.ref}</span> <span className="text-success">✓ {state.message}</span>
      </li>
    );
  }
  const suggestions = o.suggestions.map((id) => byId.get(id)).filter(Boolean) as MatchPoint[];
  return (
    <li className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="min-w-0 text-sm">
        <p>
          <span className="font-mono text-xs font-medium">{o.ref ?? "bez numeru"}</span>{" "}
          <span className="text-muted">· {o.date.slice(8, 10)}.{o.date.slice(5, 7)}</span>
        </p>
        <p className="font-medium">{o.customerName ?? "— brak nazwy klienta —"}</p>
        <p className="text-muted">{o.address ?? "— brak adresu —"}</p>
        <p className="text-xs text-muted">
          {o.customerCode && <>kod klienta <code>{o.customerCode}</code> </>}
          {o.pointCode && <>· kod adresu <code>{o.pointCode}</code></>}
        </p>
      </div>
      <form action={action} className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj klienta lub adresu…" className="h-9 min-w-48 flex-1" aria-label="Szukaj adresu" />
          <select name="point_id" required defaultValue="" className={cn(inputClass, "h-9 min-w-64 flex-[2]")} aria-label="Adres dostawy">
            <option value="" disabled>
              — wybierz adres dostawy —
            </option>
            {suggestions.length > 0 && (
              <optgroup label="Podpowiedzi">
                {suggestions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            )}
            {filtered.length > 0 && (
              <optgroup label={`Wyniki „${q}”`}>
                {filtered.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(o.pointCode || o.customerCode) && (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" name="remember" defaultChecked /> zapamiętaj kod {o.pointCode ?? o.customerCode} — następny import trafi sam
            </label>
          )}
          <Button size="sm" disabled={pending}>
            {pending ? "Zapisywanie…" : "Przypnij"}
          </Button>
          {state.message && !state.ok && <span className="text-xs text-danger">{state.message}</span>}
        </div>
      </form>
    </li>
  );
}

export function MatchList({ orders, points }: { orders: MatchOrder[]; points: MatchPoint[] }) {
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  return (
    <ul className="divide-y divide-border">
      {orders.map((o) => (
        <Row key={o.id} o={o} points={points} byId={byId} />
      ))}
    </ul>
  );
}
