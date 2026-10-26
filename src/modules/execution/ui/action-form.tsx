"use client";

import { useActionState, useTransition } from "react";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

/**
 * Formularz wysyłany ręcznie (bez automatycznego czyszczenia pól przez React po błędzie).
 * Dzieci renderuje serwer; komunikat i błędy pól pokazujemy pod spodem.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [pending, startTransition] = useTransition();
  const errors = Object.values(state.fieldErrors ?? {})
    .flat()
    .filter(Boolean) as string[];
  return (
    <form
      className={cn(className, pending && "pointer-events-none opacity-70")}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) fd.set(submitter.name, submitter.value);
        startTransition(() => formAction(fd));
      }}
    >
      {children}
      {(state.message || errors.length > 0) && (
        <div
          role="status"
          className={cn("rounded-lg px-4 py-3 text-sm", state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}
        >
          {state.message}
          {errors.length > 0 && !state.ok && (
            <ul className="mt-1 list-disc pl-5">
              {[...new Set(errors)].map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {pending && <p className="text-center text-sm text-muted">Zapisywanie…</p>}
    </form>
  );
}
