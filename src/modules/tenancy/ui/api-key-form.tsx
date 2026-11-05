"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { createApiKey, type ApiKeyState } from "../server/settings-actions";

/** Tworzenie klucza API: jawny klucz pokazujemy tylko raz, z przyciskiem „Kopiuj”. */
export function ApiKeyForm() {
  const [state, action, pending] = useActionState<ApiKeyState, FormData>(createApiKey, {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm font-medium">
          Nazwa klucza
          <Input name="name" placeholder="np. WF-Mag — eksport zamówień" aria-invalid={Boolean(state.fieldErrors?.name)} />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Tworzenie…" : "Utwórz klucz"}
        </Button>
      </form>
      {state.message && <p className={state.ok ? "text-xs text-success" : "text-xs text-danger"}>{state.message}</p>}
      {state.key && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2">
          <code className="break-all font-mono text-xs">{state.key}</code>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(state.key!);
              setCopied(true);
            }}
          >
            {copied ? "Skopiowano" : "Kopiuj"}
          </Button>
        </div>
      )}
    </div>
  );
}
