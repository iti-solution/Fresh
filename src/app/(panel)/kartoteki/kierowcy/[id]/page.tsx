import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader } from "@/components/panel/module-placeholder";
import { createClient } from "@/lib/supabase/server";
import { saveDriver } from "@/modules/masterdata/server/actions";
import { setDriverPin } from "@/modules/execution/server/auth-actions";
import { ActionForm } from "@/modules/execution/ui/action-form";
import { driverSections } from "@/modules/masterdata/ui/field-defs";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Kierowca" };

export default async function DriverPage({ params }: PageProps<"/kartoteki/kierowcy/[id]">) {
  const ctx = await requireAccess("/kartoteki/kierowcy");
  if (!canEdit(ctx.role)) redirect("/kartoteki/kierowcy");
  const { id } = await params;
  const isNew = id === "nowy";
  const supabase = await createClient();
  const [driver, vehicles] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : supabase.from("drivers").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle(),
    supabase.from("vehicles").select("id, registration").eq("tenant_id", ctx.tenantId).order("registration"),
  ]);
  if (!isNew && !driver.data) notFound();

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href="/kartoteki/kierowcy" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
          ‹ Kierowcy
        </Link>
      </nav>
      <PageHeader title={isNew ? "Nowy kierowca" : `${driver.data?.first_name} ${driver.data?.last_name}`} />
      <FormRenderer
        action={saveDriver.bind(null, isNew ? null : id)}
        sections={driverSections(
          driver.data,
          (vehicles.data ?? []).map((v) => ({ value: v.id, label: v.registration })),
        )}
        submitLabel={isNew ? "Dodaj kierowcę" : "Zapisz"}
        cancelHref="/kartoteki/kierowcy"
      />
      {!isNew && (
        <section className="mt-8 max-w-4xl rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">PIN do terminala</h2>
          <p className="mb-3 mt-1 text-xs text-muted">
            {driver.data?.pin_hash
              ? "PIN jest ustawiony. Wpisz nowy, żeby go zmienić (np. gdy kierowca zapomniał)."
              : "Kierowca nie ma jeszcze PIN-u — bez niego nie zaloguje się w aplikacji."}{" "}
            Terminal przypisujesz na urządzeniu kierowcy w{" "}
            <a href="/driver/terminal" className="text-primary underline">
              aplikacji kierowcy
            </a>
            .
          </p>
          <ActionForm action={setDriverPin.bind(null, id)} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Nowy PIN (4–6 cyfr)
                <input
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  className="h-10 w-40 rounded-md border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Powtórz PIN
                <input
                  name="pin2"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  className="h-10 w-40 rounded-md border border-border bg-surface px-3 text-sm"
                />
              </label>
              <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Ustaw PIN</button>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
