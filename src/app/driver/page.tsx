import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { driverLogout } from "@/modules/execution/server/auth-actions";
import { getDriverRoutes } from "@/modules/execution/server/queries";
import { formatDayLabel, todayInWarsaw } from "@/modules/orders/domain/orders";
import { ROUTE_STATUS_LABELS } from "@/modules/planning/domain/load";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Moje trasy" };

export default async function DriverHome() {
  const ctx = await requireTenantContext();

  if (ctx.role !== "driver") {
    return (
      <main className="flex flex-col gap-4 p-5">
        <p className="text-2xl font-semibold text-primary-strong">Fresh · aplikacja kierowcy</p>
        <Card className="flex flex-col gap-3 text-sm">
          <p>
            Jesteś zalogowany jako <strong>{ctx.email}</strong> (nie kierowca).
          </p>
          <p className="text-muted">
            Kierowcy logują się PIN-em na telefonie/terminalu przypisanym do firmy. PIN ustawisz w kartotece kierowców.
          </p>
          <Link href="/driver/terminal" className={buttonVariants({ size: "lg" })}>
            Przypisz to urządzenie jako terminal
          </Link>
          <Link href="/pulpit" className="text-center text-primary-strong">
            Wróć do panelu
          </Link>
        </Card>
      </main>
    );
  }

  const routes = await getDriverRoutes();
  const today = todayInWarsaw();
  const active = routes.find((r) => r.status === "in_progress");
  if (active) redirect(`/driver/trasa/${active.id}`);

  return (
    <main className="flex flex-col gap-4 p-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-semibold text-primary-strong">Moje trasy</p>
          <p className="text-sm text-muted">{ctx.tenantName}</p>
        </div>
        <form action={driverLogout}>
          <button className="h-12 px-3 text-sm text-muted">Wyloguj</button>
        </form>
      </header>
      {routes.length === 0 && (
        <Card className="text-sm">
          Nie masz jeszcze tras gotowych do załadunku. Gdy dyspozytor przekaże trasę do załadunku, pojawi się tutaj.
        </Card>
      )}
      {routes.map((r) => (
        <Link
          key={r.id}
          href={`/driver/trasa/${r.id}`}
          className={cn(
            "flex flex-col gap-1 rounded-2xl border bg-surface p-4",
            r.date === today ? "border-primary" : "border-border",
          )}
        >
          <span className="text-sm font-medium text-muted">
            {r.date === today ? "Dziś" : formatDayLabel(r.date)}
            {r.courseNo > 1 ? ` · kurs ${r.courseNo}` : ""}
          </span>
          <span className="text-xl font-semibold">{r.name}</span>
          <span className="text-sm text-muted">
            {r.vehicle ?? "bez pojazdu"} · {r.stops} punktów · {ROUTE_STATUS_LABELS[r.status] ?? r.status}
          </span>
          {r.status === "completed" && (
            <span className="text-sm text-primary-strong">
              Zakończona: {r.finished}/{r.stops} punktów — zobacz raport
            </span>
          )}
        </Link>
      ))}
    </main>
  );
}
