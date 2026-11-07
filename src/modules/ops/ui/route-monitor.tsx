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

type MonitorView = {
  scale: number; // 0.85–1.6
  columnWidth: number; // px
  showAddress: boolean;
  showPhone: boolean;
  showUnassigned: boolean;
  hideDone: boolean;
};

const DEFAULT_VIEW: MonitorView = {
  scale: 1,
  columnWidth: 300,
  showAddress: true,
  showPhone: true,
  showUnassigned: true,
  hideDone: true,
};
const KEY = "driver.monitor.view";

function parseView(raw: unknown): MonitorView {
  if (!raw || typeof raw !== "object") return DEFAULT_VIEW;
  const r = raw as Partial<MonitorView>;
  const num = (v: unknown, min: number, max: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    scale: num(r.scale, 0.85, 1.6, DEFAULT_VIEW.scale),
    columnWidth: num(r.columnWidth, 220, 460, DEFAULT_VIEW.columnWidth),
    showAddress: bool(r.showAddress, DEFAULT_VIEW.showAddress),
    showPhone: bool(r.showPhone, DEFAULT_VIEW.showPhone),
    showUnassigned: bool(r.showUnassigned, DEFAULT_VIEW.showUnassigned),
    hideDone: bool(r.hideDone, DEFAULT_VIEW.hideDone),
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
    const fmt = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
    const tick = () => setClock(fmt.format(new Date()));
    tick();
    const t = setInterval(tick, 10_000);
    // monitor stoi na ścianie — odświeżamy dane co 30 s
    const r = setInterval(() => document.visibilityState === "visible" && router.refresh(), 30_000);
    const sync = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => {
      clearInterval(t);
      clearInterval(r);
      document.removeEventListener("fullscreenchange", sync);
    };
  }, [router]);

  const save = (v: MonitorView) => {
    setView(v);
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* ignorujemy */
    }
  };

  const total = routes.reduce((a, r) => a + r.stops.length, 0);
  const done = routes.reduce((a, r) => a + r.stops.filter((s) => s.done).length, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-col bg-[#e4ebe6]",
        full ? "h-screen p-3" : "-mx-3 -my-4 h-[calc(100vh-3rem)] p-3 md:-mx-5 md:-my-5",
      )}
      style={{ fontSize: `${view.scale}rem` }}
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
        <p className="text-[2.6em] leading-none font-bold tracking-[-0.03em] text-ink tabular-nums">{isToday ? clock : "—"}</p>
        <p className="text-[1.35em] font-medium text-muted capitalize">{dayLabel}</p>
        <div className="flex min-w-[140px] flex-1 items-center gap-3 sm:max-w-[260px]">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/80">
            <div className="h-full rounded-full bg-info" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[0.95em] font-semibold text-muted tabular-nums">
            {done}/{total}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[1.05em] font-semibold text-ink">
          <LegendBox className="border-l-[5px] border-l-success bg-white">Do dostarczenia</LegendBox>
          <LegendBox className="border-l-[5px] border-l-border-strong bg-foreground/[0.06]">Dostarczone</LegendBox>
          <LegendBox className="border-2 border-danger bg-white">Problem z pojazdem</LegendBox>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[0.8em] font-semibold tracking-[0.06em] text-ink uppercase hover:bg-white/60"
            >
              <SlidersHorizontal className="size-4" /> Dostosuj widok
            </button>
            {open && <MonitorSettings view={view} onChange={save} onClose={() => setOpen(false)} />}
          </div>
          <button
            type="button"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen())}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-white/60"
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
            <Scroller>
              {unassigned.map((o) => (
                <StopCard
                  key={o.id}
                  title={o.customer}
                  address={view.showAddress ? o.address : null}
                  phone={view.showPhone ? o.phone : null}
                  window={o.window}
                />
              ))}
            </Scroller>
          </Column>
        )}
        {routes.map((r) => (
          <RouteColumn key={r.id} route={r} view={view} />
        ))}
        {routes.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong bg-white/60 text-[1.2em] text-muted">
            Na ten dzień nie ma tras.
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
        "flex shrink-0 flex-col overflow-hidden rounded-xl bg-white/85 shadow-[var(--shadow-panel)]",
        problem ? "border-2 border-danger" : dashed ? "border border-dashed border-border-strong" : "border border-border",
      )}
      style={{ width }}
    >
      {children}
    </section>
  );
}

/** Lista z informacją „jeszcze N punktów niżej”, gdy nie mieści się na ekranie. */
function Scroller({ children, top }: { children: ReactNode; top?: ReactNode }) {
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
      <div ref={ref} className="flex-1 space-y-1.5 overflow-y-auto p-2 [scrollbar-width:none]">
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
          <p className="min-w-0 truncate text-[1.3em] leading-tight font-bold text-ink" title={r.name}>
            {r.name}
          </p>
          <span className="shrink-0 rounded-md bg-info-soft px-1.5 text-[0.95em] font-bold text-info tabular-nums">
            {doneStops.length}/{r.stops.length}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.8em] text-muted">
          <span className="font-semibold text-foreground">{r.statusLabel}</span>
          {r.plannedStart && <span>Wyjazd {r.plannedStart}</span>}
          {r.outOfWindow > 0 && <span className="font-semibold text-danger">▲ poza oknem: {r.outOfWindow}</span>}
        </p>
        <p className="mt-1 flex items-center gap-3 text-[0.85em]">
          <span className={cn("inline-flex items-center gap-1 font-semibold", !r.vehicleLabel && "text-danger")}>
            <Truck className="size-[1.05em]" />
            <span className="font-mono">{r.vehicleLabel ?? "brak auta"}</span>
          </span>
          <span className={cn("inline-flex min-w-0 items-center gap-1 truncate text-muted", !r.driverLabel && "text-danger")}>
            <User className="size-[1.05em] shrink-0" />
            <span className="truncate">{r.driverLabel ?? "brak kierowcy"}</span>
          </span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
          <div className="h-full rounded-full bg-steel" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Scroller
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
      seq={s.seq}
      title={s.customer}
      address={view.showAddress ? s.address : null}
      phone={view.showPhone ? s.phone : null}
      window={s.window}
      out={s.out}
      eta={s.done ? null : s.eta}
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
}) {
  return (
    <div
      className={cn(
        "rounded-md border-l-[5px] px-2.5 py-1.5 shadow-[0_1px_2px_rgb(19_36_31/0.08)]",
        done ? "border-l-border-strong bg-foreground/[0.05] text-muted" : awaiting ? "border-l-warning bg-white" : "border-l-success bg-white",
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
  const set = (p: Partial<MonitorView>) => onChange({ ...view, ...p });
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Dostosuj widok"
      className="absolute top-11 right-0 z-40 w-[320px] rounded-xl border border-border bg-surface text-[14px] shadow-[var(--shadow-pop)]"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="font-semibold">Dostosuj widok</p>
        <button type="button" onClick={onClose} className="rounded p-1 text-subtle hover:bg-surface-2" aria-label="Zamknij">
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-4 border-b border-border px-4 py-3">
        <Slider label="Wielkość tekstu" value={view.scale} min={0.85} max={1.6} step={0.05} show={`×${view.scale.toFixed(2)}`} onChange={(v) => set({ scale: v })} />
        <Slider label="Szerokość kolumn" value={view.columnWidth} min={220} max={460} step={10} show={`${view.columnWidth} px`} onChange={(v) => set({ columnWidth: v })} />
      </div>
      <div className="space-y-1 px-4 py-3">
        <Switch label="Adres" on={view.showAddress} onClick={() => set({ showAddress: !view.showAddress })} />
        <Switch label="Telefon klienta" on={view.showPhone} onClick={() => set({ showPhone: !view.showPhone })} />
        <Switch label="Kolumna „Nieprzypisane”" on={view.showUnassigned} onClick={() => set({ showUnassigned: !view.showUnassigned })} />
        <Switch label="Zwijaj dostarczone" on={view.hideDone} onClick={() => set({ hideDone: !view.hideDone })} />
        <button type="button" onClick={() => onChange(DEFAULT_VIEW)} className="mt-2 text-[13px] font-semibold text-info hover:underline">
          Przywróć domyślne
        </button>
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
        className="mt-1.5 w-full accent-[#2f6b5a]"
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
