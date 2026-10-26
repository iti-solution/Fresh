"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { FormState } from "@/lib/forms";

export function AddNoteForm({ action, today }: { action: (s: FormState, fd: FormData) => Promise<FormState>; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-primary-strong hover:underline">
        + Dodaj uwagę tymczasową
      </button>
    );
  }

  const err = (k: string) => state.fieldErrors?.[k]?.join(" ");
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
      <label className="text-xs font-medium" htmlFor="note-text">Uwaga (kierowca zobaczy ją tylko w tych dniach)</label>
      <input id="note-text" name="text" placeholder="np. Remont wjazdu — rozładunek od parkingu" aria-invalid={Boolean(err("text"))}
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary" />
      {err("text") && <p className="text-xs text-danger">{err("text")}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Od
          <input type="date" name="valid_from" defaultValue={today} className="h-10 rounded-md border border-border bg-surface px-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Do (puste = bez końca)
          <input type="date" name="valid_to" className="h-10 rounded-md border border-border bg-surface px-2 text-sm" />
        </label>
        <button disabled={pending} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {pending ? "Dodawanie…" : "Dodaj"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 px-2 text-sm text-muted hover:underline">Zamknij</button>
      </div>
      {err("valid_to") && <p className="text-xs text-danger">{err("valid_to")}</p>}
      {state.message && <p role="status" className={state.ok ? "text-xs text-primary-strong" : "text-xs text-danger"}>{state.message}</p>}
    </form>
  );
}
