"use client";

import Link from "next/link";
import { CloudOff, Phone, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Plate } from "@/components/ui/status";
import { formatPln } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import {
  EXCEPTION_STATUSES,
  parseCash,
  parseOdometer,
  QUICK_STATUSES,
  quickStatusOf,
  shiftReport,
  STOP_STATUS_LABELS,
  type QuickStatus,
} from "../domain/execution";
import { progress, type RouteSnapshot, type SnapshotStop } from "../domain/offline";
import { PhotoPicker, SignaturePad } from "./media";
import { useRoute, type NewFile, type SyncState } from "./use-route";

type Screen = { name: "list" } | { name: "stop"; id: string } | { name: "problem"; stopId: string | null } | { name: "finish" } | { name: "report" };

const ON: Record<QuickStatus, string> = {
  none: "bg-surface text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12)]",
  now: "bg-info text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]",
  partial: "bg-warning text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]",
  done: "bg-success text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]",
};

const BIG = "h-14 w-full rounded-xl text-lg font-semibold disabled:opacity-50";
const PRIMARY = cn(BIG, "bg-primary text-primary-foreground shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)] active:bg-primary-hover");

/** Aplikacja kierowcy dla jednej trasy — działa bez zasięgu (M4.2). */
export function RouteApp({ routeId, initial }: { routeId: string; initial: RouteSnapshot | null }) {
  const { route, record, sync, syncNow, dismissRejected } = useRoute(routeId, initial);
  const [screen, setScreenState] = useState<Screen>({ name: "list" });

  const go = useCallback((s: Screen) => {
    setScreenState(s);
    window.history.pushState({ driverScreen: s }, "");
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setScreenState((e.state?.driverScreen as Screen) ?? { name: "list" });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const back = () => window.history.back();

  if (!route) {
    return (
      <main className="flex flex-col gap-4 p-5">
        <SyncBar sync={sync} onSync={syncNow} />
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm">
          Tej trasy nie ma jeszcze w pamięci telefonu. Połącz się z internetem i otwórz ją ponownie z listy tras.
        </p>
        <Link href="/driver" className="h-11 text-sm text-primary-strong">
          ‹ Moje trasy
        </Link>
      </main>
    );
  }

  const shown: Screen = route.status === "completed" || route.status === "closed" ? (screen.name === "list" || screen.name === "finish" ? { name: "report" } : screen) : screen;
  const banners = (
    <>
      <SyncBar sync={sync} onSync={syncNow} />
      {sync.rejected.length > 0 && (
        <div role="alert" className="mx-3 mt-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <p className="font-semibold">Serwer nie przyjął {sync.rejected.length} zapisów:</p>
          <ul className="list-disc pl-5">
            {sync.rejected.map((r) => (
              <li key={r.id}>{r.reason}</li>
            ))}
          </ul>
          <button className="mt-1 h-10 font-semibold underline" onClick={dismissRejected}>
            Rozumiem
          </button>
        </div>
      )}
    </>
  );

  switch (shown.name) {
    case "stop": {
      const stop = route.stops.find((s) => s.id === shown.id);
      if (!stop) return <ListScreen route={route} record={record} go={go} banners={banners} />;
      return <StopScreen route={route} stop={stop} record={record} back={back} go={go} banners={banners} />;
    }
    case "problem":
      return <ProblemScreen route={route} stopId={shown.stopId} record={record} back={back} banners={banners} />;
    case "finish":
      return <FinishScreen route={route} record={record} back={back} banners={banners} />;
    case "report":
      return <ReportScreen route={route} banners={banners} />;
    default:
      return route.status === "planned" || route.status === "dispatched" ? (
        <StartScreen route={route} record={record} banners={banners} />
      ) : (
        <ListScreen route={route} record={record} go={go} banners={banners} />
      );
  }
}

type Rec = ReturnType<typeof useRoute>["record"];

function SyncBar({ sync, onSync }: { sync: SyncState; onSync: () => void }) {
  const offline = !sync.online;
  return (
    <div
      className={cn(
        "flex min-h-10 items-center gap-2 px-4 py-1.5 text-xs font-medium",
        sync.sessionExpired ? "bg-danger text-white" : offline ? "bg-warning text-white" : sync.pending ? "bg-info-soft text-info" : "bg-success-soft text-success",
      )}
      role="status"
    >
      {offline ? <CloudOff className="size-4" /> : <RefreshCw className={cn("size-4", sync.syncing && "animate-spin")} />}
      <span className="flex-1">
        {sync.sessionExpired ? (
          <>
            Sesja wygasła — <Link href="/driver/login" className="underline">zaloguj się PIN-em</Link>. Zapisy są bezpieczne w telefonie.
          </>
        ) : offline ? (
          `Bez zasięgu — zapisujesz w telefonie${sync.pending ? ` (${sync.pending} do wysłania)` : ""}`
        ) : sync.pending ? (
          `Wysyłanie… ${sync.pending} do wysłania`
        ) : (
          "Wszystko wysłane"
        )}
      </span>
      {!offline && sync.pending > 0 && !sync.sessionExpired && (
        <button onClick={onSync} className="h-8 rounded-md px-2 underline">
          Wyślij teraz
        </button>
      )}
    </div>
  );
}

function ErrorText({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
      {text}
    </p>
  ) : null;
}

// ---------------- START ----------------
function StartScreen({ route, record, banners }: { route: RouteSnapshot; record: Rec; banners: ReactNode }) {
  const [vehicle, setVehicle] = useState(route.vehicleId ?? route.vehicles[0]?.id ?? "");
  const [odo, setOdo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex flex-col pb-6">
      {banners}
      <div className="flex flex-col gap-4 p-5">
        <Link href="/driver" className="h-11 text-sm text-primary-strong">
          ‹ Moje trasy
        </Link>
        <div>
          <p className="text-sm font-medium text-muted">{formatDayLabel(route.date)}</p>
          <h1 className="text-2xl font-semibold">{route.name}</h1>
          <p className="text-sm text-muted">
            {route.stops.length} punktów · pierwszy: {route.stops[0]?.customer ?? "—"} ({route.stops[0]?.window})
          </p>
        </div>
        <form
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = parseOdometer(odo);
            if (n === null) return setErr("Wpisz stan licznika (same cyfry).");
            setBusy(true);
            setErr(await record({ type: "route_started", odometer_start: n, vehicle_id: vehicle || null }));
            setBusy(false);
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Pojazd
            <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="h-14 rounded-xl border border-border-strong bg-surface px-3 text-lg">
              {route.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Stan licznika na start (km)
            <input
              value={odo}
              onChange={(e) => setOdo(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="np. 128455"
              className="h-14 rounded-xl border-2 border-primary bg-surface px-4 text-2xl font-bold tabular-nums"
            />
          </label>
          <ErrorText text={err} />
          <button disabled={busy} className={PRIMARY}>
            Rozpocznij trasę
          </button>
        </form>
        <ol className="flex flex-col gap-2">
          {route.stops.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">{s.sequence}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.customer}</span>
                <span className="text-muted">
                  {s.branch} · okno {s.window}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

// ---------------- LISTA ----------------
function ListScreen({ route, record, go, banners }: { route: RouteSnapshot; record: Rec; go: (s: Screen) => void; banners: ReactNode }) {
  const p = progress(route);
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex flex-col bg-ink text-white">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{route.name}</h1>
              <p className="text-xs text-ink-muted">licznik start {route.odometerStart?.toLocaleString("pl-PL")} km</p>
            </div>
            {route.vehicle && <Plate>{route.vehicle}</Plate>}
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} />
            </div>
            <span className="text-base font-semibold tabular-nums">
              {p.finished} / {p.total}
            </span>
          </div>
        </div>
        {banners}
      </header>
      <ErrorText text={err} />
      <ol className="flex flex-1 flex-col gap-2 p-3">
        {route.stops.map((s) => {
          const q = quickStatusOf(s.status);
          return (
            <li
              key={s.id}
              className={cn(
                "flex flex-col gap-2.5 rounded-2xl border bg-surface p-3",
                s.status === "in_progress" ? "border-2 border-info shadow-[0_0_0_4px_rgb(42_111_176/0.12)]" : "border-border",
              )}
            >
              <button type="button" onClick={() => go({ name: "stop", id: s.id })} className="flex items-start gap-3 text-left">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    q === "done" ? "bg-success text-white" : q === "partial" ? "bg-warning text-white" : q === null ? "bg-danger-soft text-danger" : q === "now" ? "bg-info text-white" : "bg-ink text-white",
                  )}
                >
                  {s.sequence}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{s.customer}</span>
                  <span className="block text-sm text-muted">
                    {s.branch} · {s.address}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-steel-soft px-2 py-0.5 text-xs font-semibold text-ink-2 tabular-nums">okno {s.window}</span>
                    {s.temporary && s.pointType && <span className="rounded bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">{s.pointType}</span>}
                    {s.notes.map((n) => (
                      <span key={n} className="rounded bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
                        {n}
                      </span>
                    ))}
                    {s.orders.some((o) => o.cod) && <span className="rounded bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">pobranie</span>}
                    {q === null && <span className="rounded bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{STOP_STATUS_LABELS[s.status]}</span>}
                  </span>
                </span>
                <span className="flex h-11 items-center px-1 text-sm font-semibold text-primary-strong">Szczegóły ›</span>
              </button>
              <div role="group" aria-label="Status punktu" className="grid grid-cols-4 gap-1 rounded-xl bg-foreground/[0.06] p-1">
                {(Object.keys(QUICK_STATUSES) as QuickStatus[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={q === k}
                    onClick={async () => setErr(await record({ type: "stop_quick", stop_id: s.id, status: k }))}
                    className={cn("h-12 w-full rounded-lg px-1 text-xs font-bold leading-tight", q === k ? ON[k] : "text-foreground/80")}
                  >
                    {QUICK_STATUSES[k].label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      <footer className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-border bg-surface p-3">
        <button type="button" onClick={() => go({ name: "problem", stopId: null })} className="h-14 rounded-xl border border-border-strong bg-surface text-base font-semibold">
          Zgłoś problem
        </button>
        <button type="button" onClick={() => go({ name: "finish" })} className="h-14 rounded-xl bg-ink text-base font-semibold text-white">
          Zakończ zmianę
        </button>
      </footer>
    </main>
  );
}

// ---------------- PUNKT ----------------
const OUTCOMES = [
  { v: "delivered", l: "Dostarczono", cls: "peer-checked:bg-success peer-checked:text-white" },
  { v: "partial", l: "Częściowo", cls: "peer-checked:bg-warning peer-checked:text-white" },
  { v: "absent", l: "Brak odbioru", cls: "peer-checked:bg-foreground peer-checked:text-background" },
  { v: "refused", l: "Odmowa", cls: "peer-checked:bg-foreground peer-checked:text-background" },
  { v: "complaint", l: "Reklamacja", cls: "peer-checked:bg-danger peer-checked:text-white" },
  { v: "keep", l: "Bez zmiany statusu", cls: "peer-checked:bg-border" },
] as const;

function CallButton({ phone, label, sub, tone = "neutral" }: { phone: string | null; label: string; sub: string | null; tone?: "neutral" | "primary" }) {
  if (!phone)
    return <span className="flex min-h-14 items-center justify-center rounded-xl border border-dashed border-border px-2 text-center text-xs text-muted">brak: {label.toLowerCase()}</span>;
  return (
    <a
      href={`tel:${phone}`}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 text-center text-sm font-bold",
        tone === "primary" ? "border-primary/40 bg-accent text-primary-strong" : "border-border bg-surface",
      )}
    >
      <span className="flex items-center gap-1">
        <Phone className="size-4" /> {label}
      </span>
      {sub && <span className="text-xs font-normal text-muted">{sub}</span>}
    </a>
  );
}

function StopScreen({ route, stop, record, back, go, banners }: { route: RouteSnapshot; stop: SnapshotStop; record: Rec; back: () => void; go: (s: Screen) => void; banners: ReactNode }) {
  const inProgress = route.status === "in_progress";
  const codTotal = stop.orders.reduce((a, o) => a + (o.cod ? Math.round(o.cod * 100) : 0), 0);
  const initialOutcome = stop.status === "partial" ? "partial" : ["absent", "refused", "complaint"].includes(stop.status) ? stop.status : "delivered";
  const [outcome, setOutcome] = useState<string>(initialOutcome);
  const [pack, setPack] = useState<Record<string, { out: string; back: string }>>(() =>
    Object.fromEntries(route.packagingTypes.map((t) => [t.id, { out: stop.packaging[t.id]?.out ? String(stop.packaging[t.id].out) : "", back: stop.packaging[t.id]?.back ? String(stop.packaging[t.id].back) : "" }])),
  );
  const [cash, setCash] = useState(stop.cashGrosze ? (stop.cashGrosze / 100).toFixed(2).replace(".", ",") : "");
  const [reason, setReason] = useState("");
  const [ret, setRet] = useState("");
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [signature, setSignature] = useState<Blob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fixed = [
    ["Dzwonić", stop.call],
    ["Wjazd", stop.access],
    ["Piętro", stop.floor],
    ["Rozładunek", stop.unloading],
    ["Inne", stop.other],
  ].filter(([, v]) => v);
  const needsReason = outcome in EXCEPTION_STATUSES && EXCEPTION_STATUSES[outcome as keyof typeof EXCEPTION_STATUSES].needsReason;

  async function save() {
    const int = (v: string) => {
      const n = Number(v.replace(/\s/g, "") || 0);
      return Number.isInteger(n) && n >= 0 ? n : -1;
    };
    const packaging = route.packagingTypes.map((t) => ({ typeId: t.id, out: int(pack[t.id]?.out ?? ""), back: int(pack[t.id]?.back ?? "") }));
    if (packaging.some((p) => p.out < 0 || p.back < 0)) return setErr("Opakowania: wpisz liczby całkowite.");
    const cashG = cash.trim() === "" ? null : parseCash(cash);
    if (cash.trim() !== "" && cashG === null) return setErr("Kwota w zł, np. 640,50.");
    const files: NewFile[] = [...photos.map((blob) => ({ kind: "photo" as const, blob })), ...(signature ? [{ kind: "signature" as const, blob: signature }] : [])];
    setBusy(true);
    const e = await record(
      {
        type: "stop_saved",
        stop_id: stop.id,
        outcome: outcome as "delivered",
        reason,
        comment,
        return_text: ret,
        packaging,
        cash_grosze: codTotal > 0 || stop.cashGrosze ? cashG : null,
        photos: photos.length,
        signature: Boolean(signature),
      },
      files,
    );
    setBusy(false);
    if (e) setErr(e);
    else back();
  }

  return (
    <main className="flex flex-col gap-3 pb-6">
      <header className="flex flex-col gap-1 border-b border-border bg-surface px-4 py-3">
        <button type="button" onClick={back} className="flex h-10 items-center text-left text-sm text-primary-strong">
          ‹ Trasa · punkt {stop.sequence} z {route.stops.length}
        </button>
        <h1 className="text-xl font-semibold">{stop.customer}</h1>
        <p className="text-sm text-muted">
          {stop.branch}
          {stop.pointType ? ` (${stop.pointType.toLowerCase()})` : ""} · {stop.address}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded bg-steel-soft px-2 py-0.5 text-xs font-semibold text-ink-2">okno {stop.window}</span>
          <span className="rounded bg-foreground/[0.08] px-2 py-0.5 text-xs font-semibold">{STOP_STATUS_LABELS[stop.status]}</span>
          {(stop.photos > 0 || stop.signed) && (
            <span className="rounded bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
              {stop.photos ? `${stop.photos} zdj.` : ""}
              {stop.photos && stop.signed ? " · " : ""}
              {stop.signed ? "podpis" : ""}
            </span>
          )}
        </div>
      </header>
      {banners}

      <div className="grid grid-cols-2 gap-2 px-3">
        <CallButton phone={stop.phone} label="Odbiorca" sub={stop.branch} />
        <CallButton phone={stop.salesRepPhone} label="Opiekun" sub={stop.salesRep} tone="primary" />
        {(stop.siteManager || stop.siteManagerPhone) && (
          <div className="col-span-2">
            <CallButton phone={stop.siteManagerPhone} label="Osoba na miejscu" sub={stop.siteManager} />
          </div>
        )}
      </div>

      {stop.notes.map((n) => (
        <p key={n} className="mx-3 rounded-xl bg-warning-soft px-4 py-2.5 text-sm font-medium text-warning">
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
            <div className="flex justify-between gap-2">
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
        <form
          className="mx-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {route.packagingTypes.length > 0 && (
            <fieldset className="rounded-xl border border-border bg-surface px-4 py-3">
              <legend className="px-1 text-sm font-semibold">Opakowania</legend>
              <div className="grid grid-cols-[1fr_88px_88px] items-center gap-2 text-sm">
                <span />
                <span className="text-center text-xs text-muted">wydano</span>
                <span className="text-center text-xs text-muted">zwrot</span>
                {route.packagingTypes.map((t) => (
                  <div key={t.id} className="contents">
                    <span>
                      {t.name}
                      {stop.customerBalance?.[t.id] ? (
                        <span className="block text-xs text-warning">u klienta: {stop.customerBalance[t.id]}</span>
                      ) : null}
                    </span>
                    {(["out", "back"] as const).map((k) => (
                      <input
                        key={k}
                        inputMode="numeric"
                        aria-label={`${t.name} ${k === "out" ? "wydano" : "zwrot"}`}
                        value={pack[t.id]?.[k] ?? ""}
                        onChange={(e) => setPack((p) => ({ ...p, [t.id]: { ...p[t.id], [k]: e.target.value } }))}
                        placeholder="0"
                        className="h-12 rounded-lg border border-border text-center text-lg font-bold tabular-nums"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          {(codTotal > 0 || stop.cashGrosze > 0) && (
            <label className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold">
              Pobrano gotówkę (zł){codTotal > 0 && ` — do pobrania ${formatPln(codTotal)}`}
              <input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" placeholder="0,00" className="h-12 rounded-lg border border-border px-3 text-lg font-bold tabular-nums" />
            </label>
          )}

          <fieldset className="rounded-xl border border-border bg-surface px-4 py-3">
            <legend className="px-1 text-sm font-semibold">Wynik dostawy</legend>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <label key={o.v} className={cn(o.v === "keep" && "col-span-2")}>
                  <input type="radio" name="outcome" value={o.v} checked={outcome === o.v} onChange={() => setOutcome(o.v)} className="peer sr-only" />
                  <span className={cn("flex h-12 items-center justify-center rounded-lg border border-border text-sm font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-primary", o.cls)}>
                    {o.l}
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-3 flex flex-col gap-1 text-xs font-medium">
              Przyczyna {needsReason ? "(wymagana)" : "(przy reklamacji i odmowie)"}
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="np. uszkodzony karton, 2 szt." className="h-12 rounded-lg border border-border px-3 text-base" />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <legend className="px-1 text-sm font-semibold">Zdjęcia i podpis odbiorcy</legend>
            <PhotoPicker photos={photos} onChange={setPhotos} />
            <SignaturePad onChange={setSignature} />
          </fieldset>

          <fieldset className="rounded-xl border border-border bg-surface px-4 py-3">
            <legend className="px-1 text-sm font-semibold">Zwrot towaru i komentarz</legend>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Zwrot towaru (co, ile, dlaczego)
              <input value={ret} onChange={(e) => setRet(e.target.value)} placeholder="np. 1 opakowanie — zła jakość" className="h-12 rounded-lg border border-border px-3 text-base" />
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs font-medium">
              Komentarz dla dyspozytora
              <input value={comment} onChange={(e) => setComment(e.target.value)} className="h-12 rounded-lg border border-border px-3 text-base" />
            </label>
          </fieldset>

          <ErrorText text={err} />
          <button disabled={busy} className={PRIMARY}>
            Zapisz punkt
          </button>
          <button type="button" onClick={() => go({ name: "problem", stopId: stop.id })} className="h-12 text-sm font-semibold text-muted underline">
            Zgłoś problem na tym punkcie
          </button>
        </form>
      )}
    </main>
  );
}

// ---------------- ZGŁOSZENIE ----------------
function ProblemScreen({ route, stopId, record, back, banners }: { route: RouteSnapshot; stopId: string | null; record: Rec; back: () => void; banners: ReactNode }) {
  const [kind, setKind] = useState<"problem" | "delay">("problem");
  const [stop, setStop] = useState(stopId ?? "");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex flex-col gap-3 pb-6">
      <header className="border-b border-border bg-surface px-4 py-3">
        <button type="button" onClick={back} className="flex h-10 items-center text-sm text-primary-strong">
          ‹ Wróć
        </button>
        <h1 className="text-xl font-semibold">Zgłoś problem dyspozytorowi</h1>
      </header>
      {banners}
      <form
        className="mx-3 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await record({ type: "problem_reported", stop_id: stop || null, kind, text, photos: photos.length }, photos.map((blob) => ({ kind: "photo", blob })));
          setBusy(false);
          if (r) setErr(r);
          else back();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["problem", "Problem"],
              ["delay", "Opóźnienie"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={cn("h-12 rounded-lg border text-sm font-bold", kind === v ? "border-ink bg-ink text-white" : "border-border bg-surface")}>
              {l}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Punkt (opcjonalnie)
          <select value={stop} onChange={(e) => setStop(e.target.value)} className="h-12 rounded-lg border border-border bg-surface px-3 text-base">
            <option value="">— cała trasa —</option>
            {route.stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sequence}. {s.customer}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Co się stało?
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={kind === "delay" ? "np. korek na A4, ok. 30 min spóźnienia" : "np. zamknięta brama, uszkodzona paleta"}
            className="rounded-lg border border-border px-3 py-2 text-base"
          />
        </label>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        <ErrorText text={err} />
        <button disabled={busy} className={PRIMARY}>
          Wyślij zgłoszenie
        </button>
      </form>
    </main>
  );
}

// ---------------- KONIEC ----------------
function FinishScreen({ route, record, back, banners }: { route: RouteSnapshot; record: Rec; back: () => void; banners: ReactNode }) {
  const [odo, setOdo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = route.stops.filter((s) => ["pending", "arrived", "in_progress"].includes(s.status));
  return (
    <main className="flex flex-col gap-4 pb-6">
      {banners}
      <div className="flex flex-col gap-4 px-5 pt-3">
        <button type="button" onClick={back} className="h-11 text-left text-sm text-primary-strong">
          ‹ Wróć do trasy
        </button>
        <h1 className="text-2xl font-semibold">Zakończ zmianę</h1>
        {open.length > 0 && (
          <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            <p className="flex items-center gap-1 font-semibold">
              <TriangleAlert className="size-4" /> Niezrealizowane punkty: {open.length}
            </p>
            <p>{open.map((s) => s.customer).join(", ")}</p>
            <p className="mt-1">Możesz zakończyć mimo to — dyspozytor zobaczy je jako niezrealizowane.</p>
          </div>
        )}
        <form
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = parseOdometer(odo);
            if (n === null) return setErr("Wpisz stan licznika (same cyfry).");
            setBusy(true);
            setErr(await record({ type: "route_finished", odometer_end: n }));
            setBusy(false);
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Stan licznika na koniec (km)
            <input value={odo} onChange={(e) => setOdo(e.target.value)} inputMode="numeric" autoComplete="off" placeholder={route.odometerStart ? String(route.odometerStart) : ""} className="h-14 rounded-xl border-2 border-primary px-4 text-2xl font-bold tabular-nums" />
          </label>
          <p className="text-xs text-muted">Start: {route.odometerStart?.toLocaleString("pl-PL")} km</p>
          <ErrorText text={err} />
          <button disabled={busy} className={cn(BIG, "bg-foreground text-background")}>
            Zakończ i pokaż raport
          </button>
        </form>
      </div>
    </main>
  );
}

// ---------------- RAPORT ZMIANY ----------------
function ReportScreen({ route, banners }: { route: RouteSnapshot; banners: ReactNode }) {
  const packaging = route.packagingTypes.map((t) => ({
    code: t.code,
    name: t.name,
    out: route.stops.reduce((a, s) => a + (s.packaging[t.id]?.out ?? 0), 0),
    back: route.stops.reduce((a, s) => a + (s.packaging[t.id]?.back ?? 0), 0),
  }));
  const r = shiftReport({
    stops: route.stops.map((s) => ({ status: s.status, windowEnd: s.windowEnd, completedAtLocal: s.completedAt })),
    odometerStart: route.odometerStart,
    odometerEnd: route.odometerEnd,
    packaging,
    cashGrosze: route.stops.reduce((a, s) => a + s.cashGrosze, 0),
    startedAt: null,
    finishedAt: null,
  });
  return (
    <main className="flex flex-col gap-3 pb-6">
      {banners}
      <div className="flex flex-col gap-3 px-4 pt-3">
        <header>
          <p className="text-sm font-medium text-muted">
            {formatDayLabel(route.date)} · {route.vehicle}
          </p>
          <h1 className="text-2xl font-semibold">Raport zmiany · {route.name}</h1>
        </header>

        <section className="flex flex-col gap-1 rounded-2xl bg-ink px-4 py-4 text-white">
          <p className="text-sm font-semibold opacity-90">Twoje wynagrodzenie za dziś</p>
          {route.pay ? (
            <>
              <p className="text-3xl font-bold tabular-nums">{formatPln(route.pay.todayGrosze)}</p>
              <ul className="mt-1 text-sm opacity-90">
                {route.pay.lines.map((l) => (
                  <li key={l.label} className="flex justify-between gap-2">
                    <span>{l.label}</span>
                    <span className="tabular-nums">{formatPln(l.amountGrosze)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-white/20 pt-2 text-sm">
                Od początku miesiąca: <strong className="tabular-nums">{formatPln(route.pay.monthGrosze)}</strong>
              </p>
              <p className="text-xs opacity-75">Kwota wstępna — ostateczną zatwierdza kierownik w rozliczeniu miesięcznym.</p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold">pojawi się po ustawieniu stawek</p>
              <p className="text-xs opacity-85">Kierownik ustawia stawki w module „Rozliczenia kierowców”.</p>
            </>
          )}
        </section>

        <section className="grid grid-cols-3 gap-2">
          <Tile label="Punkty" value={`${r.finished} / ${r.total}`} sub={`${r.partial} częśc. · ${r.exceptions} wyjątki`} />
          <Tile label="W oknie" value={r.withWindow ? `${r.onTime} / ${r.withWindow}` : "—"} sub="dostawy na czas" />
          <Tile label="Przebieg" value={r.km !== null ? `${r.km} km` : "—"} sub={route.odometerEnd ? `licznik ${route.odometerEnd.toLocaleString("pl-PL")}` : "trasa w toku"} />
        </section>

        <section className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
          <p className="text-sm font-medium text-muted">Do zdania w bazie</p>
          <div className="flex justify-between">
            <span>Gotówka z pobrań</span>
            <strong className="tabular-nums">{formatPln(r.cashGrosze)}</strong>
          </div>
          {r.packaging
            .filter((p) => p.out || p.back)
            .map((p) => (
              <div key={p.code} className="flex justify-between">
                <span>{p.name} — zebrane od klientów</span>
                <strong className="tabular-nums">{p.back}</strong>
              </div>
            ))}
          {r.packaging.every((p) => !p.out && !p.back) && <p className="text-muted">Brak zapisanych opakowań.</p>}
        </section>

        <Link href="/driver" className="flex h-14 items-center justify-center rounded-xl border border-border bg-surface font-semibold">
          Moje trasy
        </Link>
      </div>
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
