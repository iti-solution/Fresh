import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">
          <span className="text-primary">Fresh</span> · wybierz firmę
        </h1>
        <form action={signOut}>
          <button className="text-sm text-muted hover:underline">Wyloguj ({user.email})</button>
        </form>
      </div>

      {user.memberships.length > 0 && (
        <Card className="space-y-2 p-3">
          {user.memberships.map((m) => (
            <form key={m.tenantId} action={selectTenant}>
              <input type="hidden" name="tenantId" value={m.tenantId} />
              <button className="flex w-full items-center justify-between rounded-md px-3 py-3 text-left hover:bg-accent">
                <span className="font-medium">{m.tenantName}</span>
                <span className="flex gap-2">
                  {m.isDemo && <Badge className="bg-warning/10 text-warning">demo</Badge>}
                  <Badge>{ROLE_LABELS[m.role]}</Badge>
                </span>
              </button>
            </form>
          ))}
        </Card>
      )}

      <Card className="space-y-4">
        <div>
          <h2 className="font-medium">Załóż nową firmę</h2>
          <p className="text-sm text-muted">Zostaniesz jej administratorem.</p>
        </div>
        <CreateTenantForm />
      </Card>

      {!hasDemo && (
        <Card className="space-y-3 border-dashed">
          <div>
            <h2 className="font-medium">Firma demo</h2>
            <p className="text-sm text-muted">
              „Hurtownia Demo Bielsko”: 40 punktów dostaw w Bielsku, Żywcu i okolicach, 6 aut, 6 kierowców, 5 szablonów tras,
              opakowania i święta. Do testów i pokazów.
            </p>
          </div>
          <form action={createDemoTenant}>
            <Button variant="outline" type="submit">
              Utwórz firmę demo
            </Button>
          </form>
        </Card>
      )}
    </main>
  );
}
