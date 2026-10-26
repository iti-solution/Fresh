import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatPln, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { STOP_STATUS_LABELS } from "@/modules/execution/domain/execution";
import { saveStop } from "@/modules/execution/server/actions";
import { getDriverRoute, getPackagingTypes } from "@/modules/execution/server/queries";
import { ActionForm } from "@/modules/execution/ui/action-form";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Punkt dostawy" };

const OUTCOMES = [
  { v: "delivered", l: "Dostarczono", cls: "peer-checked:bg-primary peer-checked:text-white" },
  { v: "partial", l: "Częściowo", cls: "peer-checked:bg-warning peer-checked:text-white" },
  { v: "absent", l: "Brak odbioru", cls: "peer-checked:bg-foreground peer-checked:text-background" },
  { v: "refused", l: "Odmowa", cls: "peer-checked:bg-foreground peer-checked:text-background" },
  { v: "complaint", l: "Reklamacja", cls: "peer-checked:bg-danger peer-checked:text-white" },
  { v: "keep", l: "Bez zmiany statusu", cls: "peer-checked:bg-border" },
];

export default async function DriverStopPage({ params }: PageProps<"/driver/trasa/[id]/punkt/[stopId]">) {
  const ctx = await requireTenantContext();
  if (ctx.role !== "driver") redirect("/driver");
  const { id, stopId } = await params;
  const route = await getDriverRoute(id);
  const stop = route?.stops.find((s) => s.id === stopId);
  if (!route || !stop) notFound();
  const inProgress = route.status === "in_progress";

  const supabase = await createClient();
  const [types, { data: pack }, { data: cash }] = await Promise.all([
    getPackagingTypes(),
    supabase
      .from("packaging_movements")
      .select("packaging_type_id, qty, reason")
      .eq("stop_id", stopId)
      .eq("party_type", "driver"),
    supabase
      .from("cash_movements")
      .select("amount")
      .eq("stop_id", stopId)
      .eq("party_type", "driver")
      .eq("reason", "cod_collected"),
  ]);
  const saved = (typeId: string, reason: string) =>
    (pack ?? []).filter((m) => m.packaging_type_id === typeId && m.reason === reason).reduce((a, m) => a + m.qty, 0);
  const cashSaved = (cash ?? []).reduce((a, m) => a + toGrosze(m.amount), 0);
  const codTotal = stop.orders.reduce((a, o) => a + (o.cod ? toGrosze(o.cod) : 0), 0);
  const fixed = [
    ["Dzwonić", stop.call],
    ["Wjazd", stop.access],
    ["Piętro", stop.floor],
    ["Rozładunek", stop.unloading],
    ["Inne", stop.other],
  ].filter(([, v]) => v);
  const defaultOutcome =
    stop.status === "delivered"
      ? "delivered"
      : stop.status === "partial"
        ? "partial"
        : ["absent", "refused", "complaint"].includes(stop.status)
          ? stop.status
          : "delivered";

  return (
    <main className="flex flex-col gap-3 pb-6">
      <header className="flex flex-col gap-1 border-b border-border bg-surface px-4 py-3">
        <Link href={`/driver/trasa/${id}`} className="flex h-10 items-center text-sm text-primary">
          ‹ Trasa · punkt {stop.sequence} z {route.stops.length}
        </Link>
        <h1 className="text-xl font-semibold">{stop.customer}</h1>
        <p className="text-sm text-muted">
          {stop.branch} · {stop.address}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded bg-accent px-2 py-0.5 text-xs font-semibold text-primary">okno {stop.window}</span>
          <span className="rounded bg-foreground/[0.08] px-2 py-0.5 text-xs font-semibold">
            {STOP_STATUS_LABELS[stop.status]}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 px-3">
        {stop.phone ? (
          <a
            href={`tel:${stop.phone}`}
            className="flex min-h-14 flex-col items-center justify-center rounded-xl border border-border bg-surface text-sm font-bold"
          >
            Zadzwoń do odbiorcy<span className="text-xs font-normal text-muted">{stop.branch}</span>
          </a>
        ) : (
          <span className="flex min-h-14 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted">
            brak telefonu odbiorcy
          </span>
        )}
        {stop.salesRepPhone ? (
          <a
            href={`tel:${stop.salesRepPhone}`}
            className="flex min-h-14 flex-col items-center justify-center rounded-xl border border-[#b9d9c4] bg-accent text-sm font-bold text-primary"
          >
            Zadzwoń do opiekuna<span className="text-xs font-normal">{stop.salesRep}</span>
          </a>
        ) : (
          <span className="flex min-h-14 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted">
            brak opiekuna
          </span>
        )}
      </div>

      {stop.notes.map((n) => (
        <p key={n} className="mx-3 rounded-xl bg-warning-soft px-4 py-2.5 text-sm font-medium text-[#6b2e05]">
          Uwaga: {n}
        </p>
      ))}
      {fixed.length > 0 && (
        <dl className="mx-3 grid grid-cols-[96px_1fr] gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          {fixed.map(([k, v]) => (
            <div key={k as string} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mx-3 flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        {stop.orders.map((o) => (
          <div key={o.id}>
            <div className="flex justify-between">
              <span className="font-semibold">{o.ref ?? "zamówienie"}</span>
              <span className="text-muted">
                {o.pallets ? `${o.pallets} pal · ` : ""}
                {o.crates} skrz · {Math.round(o.weight_kg)} kg
              </span>
            </div>
            {o.notes_sales && <p className="text-xs text-muted">Uwaga: {o.notes_sales}</p>}
            {o.notes_logistics && <p className="text-xs text-warning">{o.notes_logistics}</p>}
          </div>
        ))}
        {codTotal > 0 && <p className="mt-1 font-semibold text-danger">Pobranie: {formatPln(codTotal)}</p>}
      </div>

      {!inProgress ? (
        <p className="mx-3 rounded-xl bg-border/50 px-4 py-3 text-sm">Rozpocznij trasę, żeby zapisywać dostawy.</p>
      ) : (
        <ActionForm action={saveStop.bind(null, id, stopId)} className="mx-3 flex flex-col gap-3">
          <fieldset className="rounded-xl border border-border bg-surface px-4 py-3">
            <legend className="px-1 text-sm font-semibold">Opakowania</legend>
            <div className="grid grid-cols-[1fr_88px_88px] items-center gap-2 text-sm">
              <span className="text-xs text-muted" />
              <span className="text-center text-xs text-muted">wydano</span>
              <span className="text-center text-xs text-muted">zwrot</span>
              {types.map((t) => (
                <div key={t.id} className="contents">
                  <span>{t.name}</span>
                  <input
                    name={`out_${t.id}`}
                    inputMode="numeric"
                    aria-label={`${t.name} wydano`}
                    defaultValue={-saved(t.id, "issue") || ""}
                    placeholder="0"
                    className="h-12 rounded-lg border border-border text-center text-lg font-bold tabular-nums"
                  />
                  <input
                    name={`back_${t.id}`}
                    inputMode="numeric"
                    aria-label={`${t.name} zwrot`}
                    defaultValue={saved(t.id, "return") || ""}
                    placeholder="0"
                    className="h-12 rounded-lg border border-border text-center text-lg font-bold tabular-nums"
                  />
                </div>
              ))}
            </div>
          </fieldset>

          {codTotal > 0 && (
            <label className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold">
              Pobrano gotówkę (zł) — do pobrania {formatPln(codTotal)}
              <input
                name="cash"
                inputMode="decimal"
                defaultValue={cashSaved ? (cashSaved / 100).toFixed(2).replace(".", ",") : ""}
                placeholder="0,00"
                className="h-12 rounded-lg border border-border px-3 text-lg font-bold tabular-nums"
              />
            </label>
          )}

          <fieldset className="rounded-xl border border-border bg-surface px-4 py-3">
            <legend className="px-1 text-sm font-semibold">Wynik dostawy</legend>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <label key={o.v} className={cn(o.v === "keep" && "col-span-2")}>
                  <input
                    type="radio"
                    name="outcome"
                    value={o.v}
                    defaultChecked={o.v === defaultOutcome}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex h-12 items-center justify-center rounded-lg border border-border text-sm font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
                      o.cls,
                    )}
                  >
                    {o.l}
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-3 flex flex-col gap-1 text-xs font-medium">
              Przyczyna (wymagana przy reklamacji i odmowie)
              <input
                name="reason"
                placeholder="np. przejrzałe banany, 2 skrzynki"
                className="h-12 rounded-lg border border-border px-3 text-base"
              />
            </label>
          </fieldset>

          <fieldset className="rounded-xl border border-border bg-surface px-4 py-3">
            <legend className="px-1 text-sm font-semibold">Zwrot towaru i komentarz</legend>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Zwrot towaru (co, ile, dlaczego)
              <input
                name="return_text"
                placeholder="np. 1 skrzynka sałaty — zła jakość"
                className="h-12 rounded-lg border border-border px-3 text-base"
              />
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs font-medium">
              Komentarz dla dyspozytora
              <input name="comment" className="h-12 rounded-lg border border-border px-3 text-base" />
            </label>
            <p className="mt-2 text-xs text-muted">Zdjęcia i podpis odbiorcy — w kolejnej wersji aplikacji.</p>
          </fieldset>

          <button className="h-14 rounded-xl bg-primary text-lg font-semibold text-primary-foreground shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)] active:bg-primary-strong">
            Zapisz punkt
          </button>
        </ActionForm>
      )}
    </main>
  );
}
