"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/primitives";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { CHANNEL_LABELS, MANUAL_CHANNELS } from "../domain/intake";
import { createDraftFromMessage } from "../server/actions";

const EXAMPLE =
  "Dzień dobry, tu Ania z Bistro Kazimierz. Na jutro poproszę 2 skrzynki pomidorów, 5 kg cebuli, 3 rukole i 6... nie, 10 pęczków natki. Zostawcie w chłodni od zaplecza, dzięki!";

/** Wklejenie wiadomości od klienta (SMS, e-mail, WhatsApp, notatka z rozmowy) → rozpoznanie → ekran sprawdzenia. */
export function NewMessageForm({ customers }: { customers: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createDraftFromMessage, {});
  const err = (k: string) => state.fieldErrors?.[k]?.join(" ");
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Kanał</span>
          <select name="channel" defaultValue="sms" className={inputClass}>
            {MANUAL_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Od kogo (telefon lub e-mail)</span>
          <input name="sender" placeholder="+48 600 100 200" className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Klient</span>
        <select name="customer_id" defaultValue="" className={inputClass}>
          <option value="">Rozpoznaj po nadawcy</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Treść wiadomości</span>
        <textarea
          name="body"
          rows={6}
          placeholder={EXAMPLE}
          aria-invalid={Boolean(err("body"))}
          className={cn(inputClass, "h-auto py-2.5 leading-relaxed")}
        />
        {err("body") && <span className="text-xs text-danger">{err("body")}</span>}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Sparkles /> {pending ? "Rozpoznaję…" : "Rozpoznaj zamówienie"}
        </Button>
        {state.message && !state.ok && <p className="text-sm text-danger">{state.message}</p>}
      </div>
    </form>
  );
}
