import { ChevronRight, FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/panel/auth-shell";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { ROLE_LABELS } from "@/modules/tenancy/domain/access";
import { createDemoTenant, selectTenant, signOut } from "@/modules/tenancy/server/actions";
import { getUserWithMemberships } from "@/modules/tenancy/server/context";
import { CreateTenantForm } from "./create-tenant-form";

export const metadata: Metadata = { title: "Wybór firmy" };

export default async function SelectTenantPage() {
  const user = await getUserWithMemberships();
  if (!user) redirect("/login");
  const hasDemo = user.memberships.some((m) => m.isDemo);

  return (
    <AuthShell>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">Wybierz firmę</h1>
          <form action={signOut} className="text-sm text-muted">
            Zalogowano jako {user.email}. <button className="font-medium text-primary-strong hover:underline">Wyloguj</button>
          </form>
        </div>

        {user.memberships.length > 0 && (
          <ul className="overflow-hidden rounded-xl border border-border">
            {user.memberships.map((m) => (
              <li key={m.tenantId} className="border-b border-border last:border-0">
                <form action={selectTenant}>
                  <input type="hidden" name="tenantId" value={m.tenantId} />
                  <button className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-primary-strong">
                      {m.tenantName.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.tenantName}</span>
                      <span className="text-xs text-muted">{ROLE_LABELS[m.role]}</span>
                    </span>
                    {m.isDemo && <Pill tone="warning">demo</Pill>}
                    <ChevronRight className="size-4 text-subtle group-hover:text-foreground" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          <div>
            <h2 className="font-semibold">Załóż nową firmę</h2>
            <p className="text-sm text-muted">Zostaniesz jej administratorem i zaprosisz zespół.</p>
          </div>
          <CreateTenantForm />
        </div>

        {!hasDemo && (
          <div className="space-y-3 rounded-xl border border-dashed border-border-strong p-4">
            <div className="flex gap-3">
              <FlaskConical className="mt-0.5 size-5 shrink-0 text-primary-strong" />
              <div>
                <h2 className="font-semibold">Firma demo</h2>
                <p className="text-sm text-muted">
                  Hurtownia spod Krakowa: 40 oddziałów klientów, 7 aut, 6 tras stałych, zamówienia na jutro i 4 tygodnie
                  zrealizowanych tras do raportów.
                </p>
              </div>
            </div>
            <form action={createDemoTenant}>
              <Button variant="outline" type="submit" className="w-full">
                Utwórz firmę demo
              </Button>
            </form>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
