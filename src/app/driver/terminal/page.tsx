import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { registerTerminal } from "@/modules/execution/server/auth-actions";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Przypisz terminal" };

export default async function TerminalPage() {
  const ctx = await requireTenantContext();
  const allowed = canEdit(ctx.role);
  return (
    <main className="flex flex-1 flex-col justify-center gap-4 p-6">
      <p className="text-2xl font-semibold text-primary">Przypisz terminal</p>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-sm">
        <p>
          Ten telefon / terminal zostanie przypisany do firmy <strong>{ctx.tenantName}</strong>. Potem zostaniesz wylogowany, a na
          ekranie pojawi się lista kierowców do logowania PIN-em.
        </p>
        <p className="text-muted">Zrób to raz na każdym urządzeniu, którego używają kierowcy.</p>
        {allowed ? (
          <form action={registerTerminal}>
            <Button size="lg" className="w-full">
              Przypisz ten terminal
            </Button>
          </form>
        ) : (
          <p className="text-danger">Terminal może przypisać tylko administrator lub dyspozytor.</p>
        )}
      </div>
    </main>
  );
}
