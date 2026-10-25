"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

type Driver = { id: string; name: string };

export function PinLogin({ drivers, login }: { drivers: Driver[]; login: (driverId: string, s: FormState, fd: FormData) => Promise<FormState> }) {
  const [selected, setSelected] = useState<Driver | null>(null);
  const [pin, setPin] = useState("");

  if (!selected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Wybierz swoje nazwisko:</p>
        {drivers.length === 0 && <p className="rounded-lg bg-surface p-4 text-sm">Żaden kierowca nie ma jeszcze PIN-u. Dyspozytor ustawia go w kartotece kierowców.</p>}
        {drivers.map((d) => (
          <button key={d.id} onClick={() => setSelected(d)} className="h-14 rounded-xl border border-border bg-surface px-4 text-left text-lg font-semibold active:bg-accent">
            {d.name}
          </button>
        ))}
      </div>
    );
  }
  return <PinPad key={selected.id} driver={selected} login={login} pin={pin} setPin={setPin} onBack={() => { setSelected(null); setPin(""); }} />;
}

function PinPad({ driver, login, pin, setPin, onBack }: {
  driver: Driver; login: (driverId: string, s: FormState, fd: FormData) => Promise<FormState>; pin: string; setPin: (p: string) => void; onBack: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(login.bind(null, driver.id), {});
  const [pending, start] = useTransition();
  const submit = (value: string) => {
    const fd = new FormData();
    fd.set("pin", value);
    start(() => action(fd));
  };
  const press = (k: string) => {
    if (pending) return;
    if (k === "⌫") return setPin(pin.slice(0, -1));
    if (k === "OK") return pin.length >= 4 && submit(pin);
    if (pin.length < 6) setPin(pin + k);
  };
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="h-11 self-start text-sm text-primary">‹ Zmień kierowcę</button>
      <p className="text-center text-xl font-semibold">{driver.name}</p>
      <div aria-label="Wpisany PIN" className="flex justify-center gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={cn("h-4 w-4 rounded-full border-2 border-foreground/40", i < pin.length && "border-primary bg-primary", i >= 4 && i >= pin.length && "opacity-30")} />
        ))}
      </div>
      {state.message && <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-center text-sm text-danger">{state.message}</p>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            disabled={pending || (k === "OK" && pin.length < 4)}
            aria-label={k === "⌫" ? "Usuń cyfrę" : k === "OK" ? "Zaloguj" : `Cyfra ${k}`}
            className={cn(
              "h-16 rounded-2xl text-2xl font-semibold active:scale-95 disabled:opacity-40",
              k === "OK" ? "bg-primary text-primary-foreground" : "border border-border bg-surface",
            )}
          >
            {pending && k === "OK" ? "…" : k}
          </button>
        ))}
      </div>
    </div>
  );
}
