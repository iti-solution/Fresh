import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormRenderer } from "@/components/forms/form-renderer";
import { PageHeader } from "@/components/panel/module-placeholder";
import { Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { inputClass } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { saveDriver } from "@/modules/masterdata/server/actions";
import { setDriverPin } from "@/modules/execution/server/auth-actions";
import { ActionForm } from "@/modules/execution/ui/action-form";
import { driverSections } from "@/modules/masterdata/ui/field-defs";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";
import { shiftDay, todayInWarsaw } from "@/modules/orders/domain/orders";
import { getAssignments } from "@/modules/planning/server/history";
import { AssignmentTable } from "@/modules/planning/ui/assignment-history";

export const metadata: Metadata = { title: "Kierowca" };

export default async function DriverPage({ params }: PageProps<"/kartoteki/kierowcy/[id]">) {
  const ctx = await requireAccess("/kartoteki/kierowcy");
  if (!canEdit(ctx.role)) redirect("/kartoteki/kierowcy");
  const { id } = await params;
  const isNew = id === "nowy";
  const supabase = await createClient();
  const today = todayInWarsaw();
  const [driver, history] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : supabase.from("drivers").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle(),
    isNew
      ? Promise.resolve([])
      : getAssignments(ctx.tenantId, { from: shiftDay(today, -29), to: shiftDay(today, 1), driverId: id }),
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
        sections={driverSections(driver.data)}
        submitLabel={isNew ? "Dodaj kierowcę" : "Zapisz"}
        cancelHref="/kartoteki/kierowcy"
      />
      {!isNew && (
        <section className="mt-8 max-w-4xl rounded-[var(--radius-panel)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
          <h2 className="text-sm font-semibold">PIN do terminala</h2>
          <p className="mb-3 mt-1 text-xs text-muted">
            {driver.data?.pin_hash
              ? "PIN jest ustawiony. Wpisz nowy, żeby go zmienić (np. gdy kierowca zapomniał)."
              : "Kierowca nie ma jeszcze PIN-u — bez niego nie zaloguje się w aplikacji."}{" "}
            Terminal przypisujesz na urządzeniu kierowcy w{" "}
            <a href="/driver/terminal" className="text-primary-strong underline">
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
                  className={cn(inputClass, "w-40")}
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
                  className={cn(inputClass, "w-40")}
                />
              </label>
              <button className={buttonVariants()}>Ustaw PIN</button>
            </div>
          </ActionForm>
        </section>
      )}
      {!isNew && (
        <Panel
          className="mt-8"
          title="Historia przydziałów"
          description="Ostatnie 30 dni: którym autem jeździł, na jakiej trasie i z jakimi zamówieniami"
          actions={
            <Link
              href={`/kartoteki/pojazdy/dziennik?kierowca=${id}&dni=90`}
              className="text-sm font-medium text-primary-strong hover:underline"
            >
              Pełny dziennik
            </Link>
          }
          flush
        >
          <AssignmentTable rows={history} hide="driver" />
        </Panel>
      )}
    </>
  );
}
