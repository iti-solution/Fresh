"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="space-y-2 rounded-xl border border-success/20 bg-success-soft p-4 text-sm" role="status">
        <p className="font-semibold text-success">Sprawdź skrzynkę {state.email}</p>
        <p className="text-muted">
          Wysłaliśmy link do logowania. Otwórz go w tej samej przeglądarce. Link jest ważny przez godzinę.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Adres e-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          placeholder="jan@hurtownia.pl"
          className="h-12 text-base"
        />
      </div>
      {state.status === "error" && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Wysyłanie…" : "Wyślij link do logowania"}
      </Button>
    </form>
  );
}
