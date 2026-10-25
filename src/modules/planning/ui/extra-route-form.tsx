"use client";

import { useActionState, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "dowozka", label: "Dowózka (np. po reklamacji)" },
  { value: "second", label: "Drugi kurs kierowcy" },
  { value: "extra", label: "Kurs dodatkowy" },
  { value: "express", label: "Ekspres" },
  { value: "emergency", label: "Awaryjny" },
  { value: "weekend", label: "Weekendowy" },
];

const field = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary";

export function ExtraRouteForm({
  action,
  vehicles,
  drivers,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  vehicles: { id: string; label: string }[];
  drivers: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  // po błędzie zachowujemy wpisane wartości (React czyści formularz po wysłaniu)
  const [kept, setKept] = useState<{ v: Record<string, string>; n: number }>({ v: {}, n: 0 });
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    const v = Object.fromEntries([...fd.entries()].map(([k, x]) => [k, String(x)]));
    setKept((k) => ({ v: r.ok ? {} : v, n: k.n + 1 }));
    if (r.ok) setOpen(false);
    return r;
  }, {});
  const val = (k: string, d = "") => kept.v[k] ?? d;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={buttonVariants({ variant: "outline", size: "sm" })}>
        + Kurs dodatkowy / dowózka
      </button>
      {state.ok && state.message && !open && <p role="status" className="absolute right-0 top-10 z-10 w-80 rounded-md bg-accent p-3 text-xs text-primary shadow">{state.message}</p>}
      {open && (
        <form key={kept.n} action={formAction} className="absolute right-0 top-10 z-20 flex w-96 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-lg">
          <p className="text-sm font-semibold">Nowy kurs na ten dzień</p>
          <label className="flex flex-col gap-1 text-xs font-medium">Rodzaj
            <select name="kind" defaultValue={val("kind", "dowozka")} className={field}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">Nazwa
            <input name="name" defaultValue={val("name")} placeholder="np. Dowózka Zakopane" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">Przyczyna (wymagana dla dowózki i kursu awaryjnego)
            <input name="reason" defaultValue={val("reason")} placeholder="np. reklamacja — przejrzałe banany" className={field} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium">Pojazd
              <select name="vehicle_id" defaultValue={val("vehicle_id")} className={field}>
                <option value="">— później —</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">Kierowca
              <select name="driver_id" defaultValue={val("driver_id")} className={field}>
                <option value="">— później —</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
          </div>
          {state.message && !state.ok && <p className="text-xs text-danger">{state.message}</p>}
          <div className="flex items-center gap-2">
            <button disabled={pending} className={cn(buttonVariants({ size: "sm" }))}>{pending ? "Tworzenie…" : "Utwórz kurs"}</button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:underline">Anuluj</button>
          </div>
        </form>
      )}
    </div>
  );
}
