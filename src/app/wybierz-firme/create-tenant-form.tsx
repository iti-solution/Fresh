"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { createTenant, type ActionState } from "@/modules/tenancy/server/actions";

export function CreateTenantForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTenant, {});
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nazwa firmy</Label>
        <Input id="name" name="name" required minLength={2} placeholder="np. Hurtownia Owoców Kowalski" />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Tworzenie…" : "Utwórz firmę"}
      </Button>
    </form>
  );
}
