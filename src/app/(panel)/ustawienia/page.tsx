import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/panel/page";
import { Button, buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { ROLE_LABELS } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";
import { resetDemoTenant, signOut } from "@/modules/tenancy/server/actions";

export const metadata: Metadata = { title: "Ustawienia konta" };

export default async function AccountSettingsPage() {
  const ctx = await requireAccess("/ustawienia");

  return (
    <>
      <PageHeader title="Ustawienia konta" description="Firma, na której pracujesz, i Twoje konto." />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Panel title="Firma">
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Nazwa firmy</dt>
              <dd className="font-medium">{ctx.tenantName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Rodzaj danych</dt>
              <dd>{ctx.isDemo ? <Pill tone="warning">dane przykładowe (demo)</Pill> : <Pill tone="success">prawdziwe dane</Pill>}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Dostępne firmy</dt>
              <dd>{ctx.memberships.length}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/wybierz-firme" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Zmień firmę
            </Link>
            {ctx.isDemo && (
              <form action={resetDemoTenant}>
                <Button size="sm" variant="outline">
                  Odśwież dane demo
                </Button>
              </form>
            )}
          </div>
        </Panel>
        <Panel title="Twoje konto">
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">E-mail</dt>
              <dd className="font-medium">{ctx.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Rola</dt>
              <dd>
                <Pill tone="info">{ROLE_LABELS[ctx.role]}</Pill>
              </dd>
            </div>
          </dl>
          <form action={signOut} className="mt-4">
            <Button size="sm" variant="outline">
              Wyloguj
            </Button>
          </form>
        </Panel>
      </div>
    </>
  );
}
