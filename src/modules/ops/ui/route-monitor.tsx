"use client";

import { Maximize, Minimize, Phone, SlidersHorizontal, Truck, User, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BoardRoute, BoardStop, BoardUnassigned } from "@/modules/planning/ui/board";

/**
 * Monitor tras — ekran na telewizor w dyspozytorni: zegar, postęp dnia i kolumna na każdą trasę.
 * Zrealizowane punkty zwijają się u góry („N dostarczonych wyżej”), widać najbliższe dostawy i prognozę dojazdu.
 * Ustawienia (wielkość tekstu, szerokość kolumn, pola) zapamiętuje przeglądarka tego ekranu.
 */

type PresetKey = "podstawowy" | "zaawansowany" | "kompaktowy" | "wlasny";
type Density = "compact" | "normal" | "comfortable";

type MonitorView = {
  preset: PresetKey;
  dark: boolean;
  density: Density;
  scale: number; // 0.85–1.6
  columnWidth: number; // px
  // nagłówek trasy
  showRouteName: boolean;
  showVehicle: boolean;
  showDriver: boolean;
  showStatus: boolean;
  showProgress: boolean;
  // punkty
  showAddress: boolean;
  showPhone: boolean;
  showWindow: boolean;
  showEta: boolean;
  showSeq: boolean;
  // ekran
  showClock: boolean;
  showLegend: boolean;
  showUnassigned: boolean;
  hideDone: boolean;
  onlyProblems: boolean;
  refreshSec: number; // 0 = wyłączone
};

const BASE_VIEW: MonitorView = {
  preset: "podstawowy",
  dark: false,
  density: "normal",
  scale: 1,
  columnWidth: 300,
  showRouteName: true,
  showVehicle: true,
  showDriver: true,
  showStatus: true,
  showProgress: true,
  showAddress: true,
  showPhone: false,
  showWindow: true,
  showEta: true,
  showSeq: true,
  showClock: true,
  showLegend: true,
  showUnassigned: true,
  hideDone: true,
  onlyProblems: false,
  refreshSec: 30,
};

const PRESETS: Record<Exclude<PresetKey, "wlasny">, { label: string; hint: string; patch: Partial<MonitorView> }> = {
  podstawowy: { label: "Podstawowy", hint: "Najważniejsze dla dyspozytora", patch: BASE_VIEW },
  zaawansowany: {
    label: "Zaawansowany",
    hint: "Wszystkie dane, w tym telefony",
    patch: { ...BASE_VIEW, showPhone: true, hideDone: false, columnWidth: 340, density: "comfortable" },
  },
  kompaktowy: {
    label: "Kompaktowy",
    hint: "Dużo tras na jednym ekranie",
    patch: { ...BASE_VIEW, showAddress: false, showSeq: false, showStatus: false, density: "compact", columnWidth: 240, scale: 0.9 },
  },
};

const DEFAULT_VIEW: MonitorView = BASE_VIEW;
const KEY = "driver.monitor.view";

/** Ciemny motyw ekranu: podmieniamy tokeny kolorów tylko w obrębie monitora. */
const DARK_VARS = {
  "--ink": "#f1f5fb",
  "--foreground": "#e6edf7",
  "--muted": "#a9b6cc",
  "--subtle": "#8392ab",
  "--border": "#2c4062",
  "--border-strong": "#3b5379",
  "--info-soft": "#1f3a63",
  "--surface": "#1a2c47",
  "--surface-2": "#223858",
};

const GAP: Record<Density, string> = { compact: "space-y-1 p-1.5", normal: "space-y-1.5 p-2", comfortable: "space-y-2.5 p-2.5" };
const CARD_PAD: Record<Density, string> = { compact: "px-2 py-1", normal: "px-2.5 py-1.5", comfortable: "px-3 py-2.5" };

function parseView(raw: unknown): MonitorView {
  if (!raw || typeof raw !== "object") return DEFAULT_VIEW;
  const r = raw as Partial<MonitorView>;
  const d = DEFAULT_VIEW;
  const num = (v: unknown, min: number, max: number, def: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const preset: PresetKey = r.preset && ["podstawowy", "zaawansowany", "kompaktowy", "wlasny"].includes(r.preset) ? r.preset : "wlasny";
  const density: Density = r.density === "compact" || r.density === "comfortable" ? r.density : "normal";
  const refresh = [0, 15, 30, 60, 120].includes(r.refreshSec as number) ? (r.refreshSec as number) : d.refreshSec;
  return {
    preset,
    dark: bool(r.dark, d.dark),
    density,
    scale: num(r.scale, 0.85, 1.6, d.scale),
    columnWidth: num(r.columnWidth, 220, 460, d.columnWidth),
    showRouteName: bool(r.showRouteName, d.showRouteName),
    showVehicle: bool(r.showVehicle, d.showVehicle),
    showDriver: bool(r.showDriver, d.showDriver),
    showStatus: bool(r.showStatus, d.showStatus),
    showProgress: bool(r.showProgress, d.showProgress),
    showAddress: bool(r.showAddress, d.showAddress),
    showPhone: bool(r.showPhone, d.showPhone),
    showWindow: bool(r.showWindow, d.showWindow),
    showEta: bool(r.showEta, d.showEta),
    showSeq: bool(r.showSeq, d.showSeq),
    showClock: bool(r.showClock, d.showClock),
    showLegend: bool(r.showLegend, d.showLegend),
    showUnassigned: bool(r.showUnassigned, d.showUnassigned),
    hideDone: bool(r.hideDone, d.hideDone),
    onlyProblems: bool(r.onlyProblems, d.onlyProblems),
    refreshSec: refresh,
  };
}

export function RouteMonitor({
  dayLabel,
  isToday,
  routes,
  unassigned,
}: {
  dayLabel: string;
  isToday: boolean;
  routes: BoardRoute[];
  unassigned: BoardUnassigned[];
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<MonitorView>(DEFAULT_VIEW);
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState<string>("");
  const [full, setFull] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- odczyt preferencji z przeglądarki po hydratacji
      setView(parseView(JSON.parse(localStorage.getItem(KEY) ?? "null")));
    } catch {
      /* domyślne */
    }
  }, []);

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
    const tick = () => setClock(fmt.format(new Date()));
    tick();
    const t = setInterval(tick, 10_000);
    // monitor stoi na ścianie — odświeżanie danych według ustawienia (domyślnie co 30 s)
    const r = view.refreshSec
      ? setInterval(() => document.visibilityState === "visible" && router.refresh(), view.refreshSec * 1000)
      : null;
    const sync = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => {
      clearInterval(t);
      if (r) clearInterval(r);
      document.removeEventListener("fullscreenchange", sync);
    };
  }, [router, view.refreshSec]);

  const save = (v: MonitorView) => {
    setView(v);
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* ignorujemy */
    }
  };

  const shown = view.onlyProblems ? routes.filter((r) => r.overloaded || r.missingResource || r.outOfWindow > 0) : routes;
  const total = routes.reduce((a, r) => a + r.stops.length, 0);
  const done = routes.reduce((a, r) => a + r.stops.filter((s) => s.done).length, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-col",
        view.dark ? "bg-[#0d1829]" : "bg-[#e2e8f3]",
        full ? "h-screen p-3" : "-mx-3 -my-4 h-[calc(100vh-var(--chrome,3rem))] p-3 md:-mx-5 md:-my-5",
      )}
      style={{ fontSize: `${view.scale}rem`, ...(view.dark ? DARK_VARS : {}) } as React.CSSProperties}
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
        {view.showClock && <p className="text-[2.6em] leading-none font-bold tracking-[-0.03em] text-ink tabular-nums">{isToday ? clock : "—"}</p>}
        <p className="text-[1.35em] font-medium text-muted capitalize">{dayLabel}</p>
        <div className="flex min-w-[140px] flex-1 items-center gap-3 sm:max-w-[260px]">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-info" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[0.95em] font-semibold text-muted tabular-nums">
            {done}/{total}
          </span>
        </div>
        {view.showLegend && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[1.05em] font-semibold text-ink">
          <LegendBox className="border-l-[5px] border-l-success bg-surface">Do dostarczenia</LegendBox>
          <LegendBox className="border-l-[5px] border-l-border-strong bg-foreground/[0.06]">Dostarczone</LegendBox>
          <LegendBox className="border-2 border-danger bg-surface">Problem z pojazdem</LegendBox>
        </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[0.8em] font-semibold tracking-[0.06em] text-ink uppercase hover:bg-foreground/10"
            >
              <SlidersHorizontal className="size-4" /> Dostosuj widok
            </button>
            {open && <MonitorSettings view={view} onChange={save} onClose={() => setOpen(false)} />}
          </div>
          <button
            type="button"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen())}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-foreground/10"
            title={full ? "Zamknij pełny ekran" : "Pełny ekran (telewizor)"}
            aria-label={full ? "Zamknij pełny ekran" : "Pełny ekran"}
          >
            {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto pb-1">
        {view.showUnassigned && unassigned.length > 0 && (
          <Column width={view.columnWidth} dashed>
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <p className="text-[1.3em] font-bold text-ink">Nieprzypisane</p>
              <span className="rounded-md bg-info-soft px-2 text-[1em] font-bold text-info tabular-nums">{unassigned.length}</span>
            </div>
            <Scroller density={view.density}>
              {unassigned.map((o) => (
                <StopCard
                  key={o.id}
                  title={o.customer}
                  address={view.showAddress ? o.address : null}
                  phone={view.showPhone ? o.phone : null}
                  window={view.showWindow ? o.window : ""}
                  density={view.density}
                />
              ))}
            </Scroller>
          </Column>
        )}
        {shown.map((r) => (
          <RouteColumn key={r.id} route={r} view={view} />
        ))}
        {shown.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface/60 text-[1.2em] text-muted">
            {routes.length === 0 ? "Na ten dzień nie ma tras." : "Brak tras z problemami."}
          </div>
        )}
      </div>
    </div>
  );
}

function LegendBox({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-5 w-6 rounded-sm", className)} />
      {children}
    </span>
  );
}

function Column({ width, children, problem, dashed }: { width: number; children: ReactNode; problem?: boolean; dashed?: boolean }) {
  return (
    <section
      className={cn(
        "flex shrink-0 flex-col overflow-hidden rounded-xl bg-surface/90 shadow-[var(--shadow-panel)]",
        problem ? "border-2 border-danger" : dashed ? "border border-dashed border-border-strong" : "border border-border",
      )}
      style={{ width }}
    >
      {children}
    </section>
  );
}

/** Lista z informacją „jeszcze N punktów niżej”, gdy nie mieści się na ekranie. */
function Scroller({ children, top, density = "normal" }: { children: ReactNode; top?: ReactNode; density?: Density }) {
  const ref = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const hidden = [...el.children].filter((c) => c.getBoundingClientRect().bottom > box.bottom + 4).length;
      setBelow(hidden);
    };
    measure();
    el.addEventListener("scroll", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [children]);
  return (
    <>
      {top}
      <div ref={ref} className={cn("flex-1 overflow-y-auto [scrollbar-width:none]", GAP[density])}>
        {children}
      </div>
      <p className={cn("border-t border-border py-1 text-center text-[0.8em] font-semibold text-info", below === 0 && "invisible")}>
        ▼ jeszcze {below} {below === 1 ? "punkt" : below < 5 ? "punkty" : "punktów"} niżej
      </p>
    </>
  );
}

function RouteColumn({ route: r, view }: { route: BoardRoute; view: MonitorView }) {
  const doneStops = r.stops.filter((s) => s.done);
  const visibleStops = view.hideDone ? r.stops.filter((s) => !s.done) : r.stops;
  const pct = r.stops.length ? Math.round((doneStops.length / r.stops.length) * 100) : 0;
  const problem = r.overloaded || r.missingResource;
  return (
    <Column width={view.columnWidth} problem={problem}>
      <div className="border-b border-border px-3 pt-2.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          {view.showRouteName ? (
            <p className="min-w-0 truncate text-[1.3em] leading-tight font-bold text-ink" title={r.name}>
              {r.name}
            </p>
          ) : (
            <span />
          )}
          <span className="shrink-0 rounded-md bg-info-soft px-1.5 text-[0.95em] font-bold text-info tabular-nums">
            {doneStops.length}/{r.stops.length}
          </span>
        </div>
        {view.showStatus && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.8em] text-muted">
            <span className="font-semibold text-foreground">{r.statusLabel}</span>
            {r.plannedStart && <span>Wyjazd {r.plannedStart}</span>}
            {r.outOfWindow > 0 && <span className="font-semibold text-danger">▲ poza oknem: {r.outOfWindow}</span>}
          </p>
        )}
        {(view.showVehicle || view.showDriver) && (
          <p className="mt-1 flex items-center gap-3 text-[0.85em]">
            {view.showVehicle && (
              <span className={cn("inline-flex items-center gap-1 font-semibold", !r.vehicleLabel && "text-danger")}>
                <Truck className="size-[1.05em]" />
                <span className="font-mono">{r.vehicleLabel ?? "brak auta"}</span>
              </span>
            )}
            {view.showDriver && (
              <span className={cn("inline-flex min-w-0 items-center gap-1 truncate text-muted", !r.driverLabel && "text-danger")}>
                <User className="size-[1.05em] shrink-0" />
                <span className="truncate">{r.driverLabel ?? "brak kierowcy"}</span>
              </span>
            )}
          </p>
        )}
        {view.showProgress && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
            <div className="h-full rounded-full bg-steel" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <Scroller
        density={view.density}
        top={
          view.hideDone && doneStops.length > 0 ? (
            <p className="border-b border-border bg-surface-2 py-1 text-center text-[0.8em] font-semibold text-info">
              ▲ {doneStops.length} {doneStops.length === 1 ? "dostarczony" : "dostarczonych"} wyżej
            </p>
          ) : undefined
        }
      >
        {visibleStops.map((s) => (
          <MonitorStop key={s.id} stop={s} view={view} />
        ))}
        {visibleStops.length === 0 && (
          <p className="py-6 text-center text-[0.9em] text-muted">{r.stops.length ? "Wszystkie punkty zrealizowane" : "Brak punktów"}</p>
        )}
      </Scroller>
    </Column>
  );
}

function MonitorStop({ stop: s, view }: { stop: BoardStop; view: MonitorView }) {
  return (
    <StopCard
      seq={view.showSeq ? s.seq : undefined}
      density={view.density}
      title={s.customer}
      address={view.showAddress ? s.address : null}
      phone={view.showPhone ? s.phone : null}
      window={view.showWindow ? s.window : ""}
      out={s.out}
      eta={s.done || !view.showEta ? null : s.eta}
      done={s.done ? (s.statusLabel ?? "dostarczone") : null}
      awaiting={s.awaiting}
    />
  );
}

function StopCard({
  seq,
  title,
  address,
  phone,
  window,
  out,
  eta,
  done,
  awaiting,
  density = "normal",
}: {
  seq?: number;
  title: string;
  address: string | null;
  phone: string | null;
  window: string;
  out?: boolean;
  eta?: string | null;
  done?: string | null;
  awaiting?: boolean;
  density?: Density;
}) {
  return (
    <div
      className={cn(
        "rounded-md border-l-[5px] shadow-[0_1px_2px_rgb(19_36_31/0.08)]",
        CARD_PAD[density],
        done ? "border-l-border-strong bg-foreground/[0.05] text-muted" : awaiting ? "border-l-warning bg-surface" : "border-l-success bg-surface",
      )}
    >
      <p className="flex items-baseline gap-2">
        {seq !== undefined && <span className="w-[1.4em] shrink-0 text-right text-[0.85em] text-subtle tabular-nums">{seq}</span>}
        <span className={cn("min-w-0 truncate text-[1.05em] font-semibold", done ? "text-muted" : "text-ink")}>{title}</span>
      </p>
      <div className={cn(seq !== undefined && "pl-[calc(1.4em*0.85+0.5rem)]")}>
        {address && <p className="truncate text-[0.82em] text-muted">{address}</p>}
        {phone && (
          <p className="flex items-center gap-1 text-[0.85em] text-muted tabular-nums">
            <Phone className="size-[0.9em]" /> {phone}
          </p>
        )}
        <p className="flex items-end justify-between gap-2">
          <span className={cn("text-[0.85em] tabular-nums", out ? "font-bold text-danger" : "text-muted")}>
            {out && "▲ "}
            {window}
          </span>
          {done ? (
            <span className="text-[0.8em]">✓ {done}</span>
          ) : (
            eta && <span className={cn("text-[1.15em] font-bold tabular-nums", out ? "text-danger" : "text-ink")}>{eta}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function MonitorSettings({ view, onChange, onClose }: { view: MonitorView; onChange: (v: MonitorView) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  // ręczna zmiana pojedynczej opcji przełącza zestaw na „Własny”
  const set = (p: Partial<MonitorView>) => onChange({ ...view, ...p, preset: "wlasny" });
  const sw = (label: string, key: keyof MonitorView) => (
    <Switch label={label} on={view[key] as boolean} onClick={() => set({ [key]: !view[key] } as Partial<MonitorView>)} />
  );
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Dostosuj widok"
      className="absolute top-11 right-0 z-40 max-h-[calc(100vh-7rem)] w-[340px] overflow-y-auto rounded-xl border border-border bg-surface text-[14px] shadow-[var(--shadow-pop)]"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <p className="font-semibold">Dostosuj widok</p>
        <button type="button" onClick={onClose} className="rounded p-1 text-subtle hover:bg-surface-2" aria-label="Zamknij">
          <X className="size-4" />
        </button>
      </div>

      <Group title="Zestaw">
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((k) => (
            <button
              key={k}
              type="button"
              title={PRESETS[k].hint}
              onClick={() => onChange({ ...view, ...PRESETS[k].patch, dark: view.dark, refreshSec: view.refreshSec, preset: k })}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[12px] font-semibold",
                view.preset === k ? "border-info bg-info-soft text-info" : "border-border hover:bg-surface-2",
              )}
            >
              {PRESETS[k].label}
            </button>
          ))}
        </div>
        {view.preset === "wlasny" && <p className="mt-1.5 text-[12px] text-muted">Zestaw własny — zmienione ręcznie.</p>}
      </Group>

      <Group title="Wygląd">
        <Segment
          label="Motyw"
          value={view.dark ? "dark" : "light"}
          options={[
            { v: "light", l: "Jasny" },
            { v: "dark", l: "Ciemny" },
          ]}
          onChange={(v) => set({ dark: v === "dark" })}
        />
        <Segment
          label="Odstępy"
          value={view.density}
          options={[
            { v: "compact", l: "Ciasno" },
            { v: "normal", l: "Normalnie" },
            { v: "comfortable", l: "Luźno" },
          ]}
          onChange={(v) => set({ density: v as Density })}
        />
        <Slider label="Wielkość tekstu" value={view.scale} min={0.85} max={1.6} step={0.05} show={`×${view.scale.toFixed(2)}`} onChange={(v) => set({ scale: v })} />
        <Slider label="Szerokość kolumn" value={view.columnWidth} min={220} max={460} step={10} show={`${view.columnWidth} px`} onChange={(v) => set({ columnWidth: v })} />
      </Group>

      <Group title="Nagłówek trasy">
        {sw("Nazwa trasy", "showRouteName")}
        {sw("Pojazd", "showVehicle")}
        {sw("Kierowca", "showDriver")}
        {sw("Status i godzina wyjazdu", "showStatus")}
        {sw("Pasek postępu", "showProgress")}
      </Group>

      <Group title="Punkty dostawy">
        {sw("Numer kolejny", "showSeq")}
        {sw("Adres", "showAddress")}
        {sw("Telefon klienta", "showPhone")}
        {sw("Okno przyjęcia", "showWindow")}
        {sw("Prognoza dojazdu (ETA)", "showEta")}
        {sw("Zwijaj dostarczone", "hideDone")}
      </Group>

      <Group title="Ekran">
        {sw("Zegar", "showClock")}
        {sw("Legenda kolorów", "showLegend")}
        {sw("Kolumna „Nieprzypisane”", "showUnassigned")}
        {sw("Tylko trasy z problemami", "onlyProblems")}
        <Segment
          label="Odświeżanie danych"
          value={String(view.refreshSec)}
          options={[
            { v: "0", l: "Wył." },
            { v: "15", l: "15 s" },
            { v: "30", l: "30 s" },
            { v: "60", l: "1 min" },
            { v: "120", l: "2 min" },
          ]}
          onChange={(v) => onChange({ ...view, refreshSec: Number(v) })}
        />
      </Group>

      <div className="px-4 py-3">
        <button type="button" onClick={() => onChange(DEFAULT_VIEW)} className="text-[13px] font-semibold text-info hover:underline">
          Przywróć domyślne
        </button>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-b border-border px-4 py-3">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">{title}</p>
      {children}
    </div>
  );
}

function Segment({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ v: string; l: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[13px]">{label}</p>
      <div className="flex rounded-md border border-border p-0.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 rounded px-1.5 py-1 text-[12px] font-semibold",
              value === o.v ? "bg-info-soft text-info" : "text-muted hover:bg-surface-2",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  show,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[13px]">
        {label}
        <span className="rounded bg-info-soft px-1.5 text-[12px] font-semibold text-info tabular-nums">{show}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[#2f5fa8]"
      />
    </label>
  );
}

function Switch({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md py-1.5 text-left text-[13px] hover:bg-surface-2"
    >
      {label}
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-primary-strong" : "bg-foreground/15")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}
