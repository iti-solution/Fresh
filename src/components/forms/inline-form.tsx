"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

/** Zwarty formularz w jednej linii (ustawienia, wiersze tabel): pola jako dzieci, komunikat obok przycisku. */
export function InlineForm({
  action,
  children,
  submitLabel = "Zapisz",
  variant = "primary",
  className,
  resetOnSuccess = true,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel?: string;
  variant?: "primary" | "outline" | "soft";
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState & { n?: number }, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    return { ...r, n: (prev.n ?? 0) + 1 };
  }, {});
  const errors = Object.values(state.fieldErrors ?? {})
    .flat()
    .filter(Boolean);
  return (
    <form
      key={resetOnSuccess && state.ok ? state.n : "form"}
      action={formAction}
      className={cn("flex flex-wrap items-end gap-2", className)}
      noValidate
    >
      {children}
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {pending ? "Zapisywanie…" : submitLabel}
      </Button>
      {(state.message || errors.length > 0) && (
        <p role="status" className={cn("basis-full text-xs", state.ok ? "text-success" : "text-danger")}>
          {[state.message, ...errors].filter(Boolean).join(" ")}
        </p>
      )}
    </form>
  );
}
