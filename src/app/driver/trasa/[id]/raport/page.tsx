import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatPln, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { shiftReport, type StopStatus } from "@/modules/execution/domain/execution";
import { driverLogout } from "@/modules/execution/server/auth-actions";
import { getDriverRoute, getPackagingTypes } from "@/modules/execution/server/queries";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Raport zmiany" };

export default async function ReportPage({ params }: PageProps<"/driver/trasa/[id]/raport">) {
  const ctx = await requireTenantContext();
  if (ctx.role !== "driver") redirect("/driver");
  const { id } = await params;
  const route = await getDriverRoute(id);
  if (!route) notFound();

  const supabase = await createClient();
  const stopIds = route.stops.map((s) => s.id);
  const [types, { data: pack }, { data: cash }] = await Promise.all([
    getPackagingTypes(),
    supabase.from("packaging_movements").select("packaging_type_id, qty, reason, stop_id").eq("party_type", "driver").in("stop_id", stopIds.length ? stopIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("cash_movements").select("amount").eq("party_type", "driver").eq("route_id", id),
  ]);
  const packaging = types.map((t) => {
    const rows = (pack ?? []).filter((m) => m.packaging_type_id === t.id);
    return {
      code: t.code,
      name: t.name,
      out: -rows.filter((m) => m.reason === "issue").reduce((a, m) => a + m.qty, 0),
      back: rows.filter((m) => m.reason === "return").reduce((a, m) => a + m.qty, 0),
    };
  });
  const r = shiftReport({
    stops: route.stops.map((s) => ({ status: s.status as StopStatus, windowEnd: s.windowEnd, completedAtLocal: s.completedAt })),
    odometerStart: route.odometerStart,
    odometerEnd: route.odometerEnd,
    packaging,
    cashGrosze: (cash ?? []).reduce((a, m) => a + toGrosze(m.amount), 0),
    startedAt: null,
    finishedAt: null,
  });

  return (
    <main className="flex flex-col gap-3 p-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{formatDayLabel(route.date)} · {route.vehicle}</p>
        <h1 className="text-2xl font-semibold">Raport zmiany · {route.name}</h1>
      </header>

      <section className="flex flex-col gap-1 rounded-2xl bg-primary px-4 py-4 text-white">
        <p className="text-sm font-semibold opacity-90">Twoje wynagrodzenie za dziś</p>
        <p className="text-2xl font-bold">pojawi się po ustawieniu stawek</p>
        <p className="text-xs opacity-85">Naliczanie (dniówka, premia, stawki dowózkowe) — kolejny etap wdrożenia.</p>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Tile label="Punkty" value={`${r.finished} / ${r.total}`} sub={`${r.partial} częśc. · ${r.exceptions} wyjątki`} />
        <Tile label="W oknie" value={r.withWindow ? `${r.onTime} / ${r.withWindow}` : "—"} sub="dostawy na czas" />
        <Tile label="Przebieg" value={r.km !== null ? `${r.km} km` : "—"} sub={route.odometerEnd ? `licznik ${route.odometerEnd.toLocaleString("pl-PL")}` : "trasa w toku"} />
      </section>

      <section className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Do zdania w bazie</p>
        <div className="flex justify-between"><span>Gotówka z pobrań</span><strong className="tabular-nums">{formatPln(r.cashGrosze)}</strong></div>
        {r.packaging.filter((p) => p.out || p.back).map((p) => (
          <div key={p.code} className="flex justify-between"><span>{p.name} — zebrane od klientów</span><strong className="tabular-nums">{p.back}</strong></div>
        ))}
        {r.packaging.every((p) => !p.out && !p.back) && <p className="text-muted">Brak zapisanych opakowań.</p>}
      </section>

      {route.status === "completed" ? (
        <form action={driverLogout}><button className="h-14 w-full rounded-xl bg-foreground text-lg font-bold text-background">Wyloguj</button></form>
      ) : (
        <Link href={`/driver/trasa/${id}`} className="flex h-14 items-center justify-center rounded-xl border border-border bg-surface font-semibold">Wróć do trasy</Link>
      )}
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}
