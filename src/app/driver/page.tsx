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
import { BRAND } from "@/lib/brand";
import { PrefetchRoutes } from "@/modules/execution/ui/prefetch-routes";

export const metadata: Metadata = { title: "Moje trasy" };

export default async function DriverHome() {
  const ctx = await requireTenantContext();
  if (ctx.role === "customer") redirect("/portal");

  if (ctx.role !== "driver") {
    return (
      <main className="flex flex-col gap-4 p-5">
        <p className="text-2xl font-semibold text-primary-strong">{BRAND.full} · aplikacja kierowcy</p>
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
    <main className="flex min-h-screen flex-col gap-3 bg-[#e4ebe6] pb-6">
      <header className="flex items-center justify-between bg-ink px-4 py-4 text-white">
        <div>
          <p className="text-[24px] leading-tight font-bold">Moje trasy</p>
          <p className="text-sm text-ink-muted">{ctx.tenantName}</p>
        </div>
        <form action={driverLogout}>
          <button className="h-12 rounded-lg px-3 text-sm text-ink-foreground hover:bg-white/10">Wyloguj</button>
        </form>
      </header>
      <div className="flex flex-col gap-2.5 px-3">
        <PrefetchRoutes ids={routes.filter((r) => r.status !== "completed" && r.date >= today).map((r) => r.id)} />
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
              "flex flex-col gap-1 rounded-2xl border-l-[6px] bg-surface p-4 shadow-[0_1px_3px_rgb(19_36_31/0.1)]",
              r.status === "completed" ? "border-l-border-strong" : r.date === today ? "border-l-success" : "border-l-info",
            )}
          >
            <span className="text-sm font-semibold text-muted">
              {r.date === today ? "Dziś" : formatDayLabel(r.date)}
              {r.courseNo > 1 ? ` · kurs ${r.courseNo}` : ""}
            </span>
            <span className="text-[22px] leading-tight font-bold">{r.name}</span>
            <span className="text-[15px] text-muted">
              <span className="font-mono font-semibold text-foreground">{r.vehicle ?? "bez pojazdu"}</span> · {r.stops} punktów ·{" "}
              {ROUTE_STATUS_LABELS[r.status] ?? r.status}
            </span>
            {r.status !== "completed" && (
              <span className="mt-2 flex h-12 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
                {r.status === "in_progress" ? "Kontynuuj trasę" : "Otwórz trasę"}
              </span>
            )}
            {r.status === "completed" && (
              <span className="text-sm text-primary-strong">
                Zakończona: {r.finished}/{r.stops} punktów — zobacz raport
              </span>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
