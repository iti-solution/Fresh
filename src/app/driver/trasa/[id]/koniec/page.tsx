import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { finishRoute } from "@/modules/execution/server/actions";
import { getDriverRoute } from "@/modules/execution/server/queries";
import { ActionForm } from "@/modules/execution/ui/action-form";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Zakończ zmianę" };

export default async function FinishPage({ params }: PageProps<"/driver/trasa/[id]/koniec">) {
  const ctx = await requireTenantContext();
  if (ctx.role !== "driver") redirect("/driver");
  const { id } = await params;
  const route = await getDriverRoute(id);
  if (!route) notFound();
  if (route.status !== "in_progress") redirect(`/driver/trasa/${id}`);
  const open = route.stops.filter((s) => ["pending", "arrived", "in_progress"].includes(s.status));

  return (
    <main className="flex flex-col gap-4 p-5">
      <Link href={`/driver/trasa/${id}`} className="h-11 text-sm text-primary">
        ‹ Wróć do trasy
      </Link>
      <h1 className="text-2xl font-semibold">Zakończ zmianę</h1>
      {open.length > 0 && (
        <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-[#6b2e05]">
          <p className="font-semibold">Niezrealizowane punkty: {open.length}</p>
          <p>{open.map((s) => s.customer).join(", ")}</p>
          <p className="mt-1">Możesz zakończyć mimo to — dyspozytor zobaczy je jako niezrealizowane.</p>
        </div>
      )}
      <ActionForm
        action={finishRoute.bind(null, id)}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Stan licznika na koniec (km)
          <input
            name="odometer_end"
            inputMode="numeric"
            autoComplete="off"
            placeholder={route.odometerStart ? String(route.odometerStart) : ""}
            className="h-14 rounded-xl border-2 border-primary px-4 text-2xl font-bold tabular-nums"
          />
        </label>
        <p className="text-xs text-muted">Start: {route.odometerStart?.toLocaleString("pl-PL")} km</p>
        <button className="h-14 rounded-xl bg-foreground text-lg font-bold text-background">Zakończ i pokaż raport</button>
      </ActionForm>
    </main>
  );
}
