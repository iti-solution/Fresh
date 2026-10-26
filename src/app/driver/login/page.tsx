import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { driverLogin } from "@/modules/execution/server/auth-actions";
import { getTerminalTenant } from "@/modules/execution/server/terminal";
import { PinLogin } from "@/modules/execution/ui/pin-login";

export const metadata: Metadata = { title: "Logowanie kierowcy" };

export default async function DriverLoginPage({ searchParams }: PageProps<"/driver/login">) {
  const sp = await searchParams;
  const tenantId = hasAdminKey() ? await getTerminalTenant() : null;

  if (!tenantId) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-4 p-6">
        <p className="text-2xl font-semibold text-primary">Fresh · kierowca</p>
        <div className="rounded-xl border border-border bg-surface p-5 text-sm">
          <p className="font-semibold">Ten telefon nie jest jeszcze przypisany do firmy.</p>
          <p className="mt-2 text-muted">
            Dyspozytor lub administrator: zaloguj się na tym urządzeniu i otwórz{" "}
            <Link href="/driver/terminal" className="font-medium text-primary underline">
              Przypisz terminal
            </Link>
            . Wystarczy raz.
          </p>
          {!hasAdminKey() && <p className="mt-2 text-danger">Brak klucza serwerowego w konfiguracji aplikacji.</p>}
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  const [{ data: tenant }, { data: drivers }] = await Promise.all([
    admin.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    admin.from("drivers").select("id, first_name, last_name, pin_hash, is_active").eq("tenant_id", tenantId).order("last_name"),
  ]);
  const list = (drivers ?? [])
    .filter((d) => d.is_active && d.pin_hash)
    .map((d) => ({ id: d.id, name: `${d.first_name} ${d.last_name}` }));

  return (
    <main className="flex flex-1 flex-col gap-5 p-5">
      <header>
        <p className="text-2xl font-semibold text-primary">Fresh · kierowca</p>
        <p className="text-sm text-muted">{tenant?.name}</p>
      </header>
      {sp.terminal === "1" && (
        <p role="status" className="rounded-lg bg-accent px-4 py-3 text-sm text-primary">
          Terminal przypisany do firmy. Kierowcy logują się PIN-em.
        </p>
      )}
      <PinLogin drivers={list} login={driverLogin} />
    </main>
  );
}
