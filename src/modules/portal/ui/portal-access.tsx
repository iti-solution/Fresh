"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { createPortalAccess, disablePortalAccess, resetPortalPassword, type PortalAccessState } from "../server/staff-actions";

export type PortalAccessRow = { userId: string; email: string; isActive: boolean; createdAt: string };

/** Login i hasło do przekazania klientowi — z przyciskiem „Kopiuj” (np. do SMS-a lub maila). */
function Credentials({ loginUrl, email, password }: { loginUrl: string; email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Portal zamówień: ${loginUrl}\nLogin: ${email}\nHasło: ${password}`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-success/25 bg-success-soft p-3 text-sm">
      <pre className="whitespace-pre-wrap break-all font-mono text-[12.5px] text-foreground">{text}</pre>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Skopiowano" : "Kopiuj dane"}
        </Button>
        <span className="text-xs text-muted">Hasło widać tylko teraz.</span>
      </div>
    </div>
  );
}

function AccessRow({ row, customerId, loginUrl }: { row: PortalAccessRow; customerId: string; loginUrl: string }) {
  const [state, action, pending] = useActionState<PortalAccessState, FormData>(
    () => resetPortalPassword(customerId, row.userId),
    {},
  );
  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{row.email}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            row.isActive ? "bg-success-soft text-success" : "bg-foreground/[0.06] text-muted",
          )}
        >
          {row.isActive ? "aktywny" : "wyłączony"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={action}>
          <Button type="submit" size="xs" variant="outline" disabled={pending}>
            <KeyRound /> {row.isActive ? "Nowe hasło" : "Włącz z nowym hasłem"}
          </Button>
        </form>
        {row.isActive && (
          <form action={disablePortalAccess.bind(null, customerId, row.userId)}>
            <Button type="submit" size="xs" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger">
              Wyłącz dostęp
            </Button>
          </form>
        )}
      </div>
      {state.message && !state.ok && <p className="text-xs text-danger">{state.message}</p>}
      {state.ok && state.password && (
        <Credentials loginUrl={loginUrl} email={state.email ?? row.email} password={state.password} />
      )}
    </li>
  );
}

export function PortalAccess({ customerId, rows, loginUrl }: { customerId: string; rows: PortalAccessRow[]; loginUrl: string }) {
  const [state, action, pending] = useActionState<PortalAccessState, FormData>(createPortalAccess.bind(null, customerId), {});
  return (
    <section className="overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-[15px] font-semibold">Portal zamówień</h3>
        <p className="mt-0.5 text-xs text-muted">
          Klient zamawia sam przez telefon lub komputer; zamówienia trafiają do „Zamówienia” ze znacznikiem „Portal”.
        </p>
      </header>
      {rows.length > 0 && (
        <ul>
          {rows.map((r) => (
            <AccessRow key={r.userId} row={r} customerId={customerId} loginUrl={loginUrl} />
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-col gap-2 border-t border-border bg-surface-2 px-4 py-3">
        <Label htmlFor="portal-email">{rows.length ? "Dodaj kolejną osobę" : "Nadaj dostęp"}</Label>
        <div className="flex gap-2">
          <Input
            id="portal-email"
            name="email"
            type="email"
            placeholder="kuchnia@restauracja.pl"
            aria-invalid={Boolean(state.fieldErrors?.email)}
            key={state.ok ? state.email : "form"}
          />
          <Button type="submit" disabled={pending} className="shrink-0">
            {pending ? "Zakładanie…" : "Utwórz login"}
          </Button>
        </div>
        {state.fieldErrors?.email && <p className="text-xs text-danger">{state.fieldErrors.email.join(" ")}</p>}
        {state.message && !state.ok && !state.fieldErrors?.email && <p className="text-xs text-danger">{state.message}</p>}
        {state.ok && state.password && state.email && (
          <Credentials loginUrl={loginUrl} email={state.email} password={state.password} />
        )}
      </form>
    </section>
  );
}
