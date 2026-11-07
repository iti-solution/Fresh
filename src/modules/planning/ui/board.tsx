"use client";

import {
  ArrowDownWideNarrow,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  Clock,
  Columns3,
  Copy,
  Hash,
  Inbox,
  ListOrdered,
  Lock,
  MapPin,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Truck,
  User,
  Weight,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  autoPanels,
  DEFAULT_BOARD_VIEW,
  hasProblems,
  matchesFilter,
  parseBoardView,
  ROUTE_FILTER_LABELS,
  ROUTE_SORT_LABELS,
  sortRoutes,
  splitIntoPanels,
  type BoardView,
  type RouteFilter,
  type RouteSort,
} from "../domain/board";

/* ───────────────────────────── typy danych z serwera ───────────────────────────── */

export type BoardLoad = { key: string; label: string; unit: string; value: string; cap: string | null; pct: number | null; over: boolean };

export type BoardStop = {
  id: string;
  seq: number;
  customer: string;
  address: string;
  phone: string | null;
  window: string;
  eta: string | null;
  out: boolean;
  done: boolean;
  statusLabel: string | null;
  kg: number;
  pallets: number;
  crates: number;
  orderIds: string[];
  awaiting: boolean;
  closed: boolean;
  priority: boolean;
  note: string | null;
};

type FormAction = (fd: FormData) => void | Promise<void>;
type VoidAction = () => void | Promise<void>;

export type BoardRoute = {
  id: string;
  name: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  plannedStart: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  driverId: string | null;
  driverLabel: string | null;
  driverPhone: string | null;
  canChange: boolean;
  load: BoardLoad[];
  maxLoadPct: number;
  overloaded: boolean;
  missingResource: boolean;
  outOfWindow: number;
  issues: string[];
  stops: BoardStop[];
  ready: { ok: boolean; needsConfirm: boolean; reasons: string[] };
  printHref: string;
  actions: {
    setVehicle?: FormAction;
    setDriver?: FormAction;
    sortByWindow?: VoidAction;
    markReady?: VoidAction;
    markReadyForce?: VoidAction;
    backToDraft?: VoidAction;
    deleteEmpty?: VoidAction;
    copy?: FormAction;
  };
};

export type BoardUnassigned = {
  id: string;
  ref: string | null;
  customer: string;
  address: string;
  phone: string | null;
  window: string;
  kg: number;
  pallets: number;
  crates: number;
  awaiting: boolean;
  priority: boolean;
};

type MoveOrders = (orderIds: string[], routeId: string | null) => Promise<{ moved: number; error?: string }>;
type MoveStop = (stopId: string, delta: number) => Promise<{ error?: string }>;

type DragPayload = { orderIds: string[]; stopId?: string; fromRouteId: string | null; fromIndex?: number };

const VIEW_KEY = "driver.board.view";
const SORT_KEY = "driver.board.sort";

/* ───────────────────────────── tablica ───────────────────────────── */

export function PlanningBoard({
  day,
  dayLabel,
  prevHref,
  nextHref,
  routes,
  unassigned,
  editable,
  vehicles,
  drivers,
  moveOrders,
  moveStop,
  toolbarActions,
  notices,
}: {
  day: string;
  dayLabel: string;
  prevHref: string;
  nextHref: string;
  routes: BoardRoute[];
  unassigned: BoardUnassigned[];
  editable: boolean;
  vehicles: { id: string; label: string }[];
  drivers: { id: string; label: string }[];
  moveOrders: MoveOrders;
  moveStop: MoveStop;
  toolbarActions?: ReactNode;
  notices?: ReactNode;
}) {
  const router = useRouter();
  const [view, setView] = useState<BoardView>(DEFAULT_BOARD_VIEW);
  const [sort, setSort] = useState<RouteSort>("name");
  const [filter, setFilter] = useState<RouteFilter>("all");
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(1600);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- odczyt preferencji z przeglądarki po hydratacji
      setView(parseBoardView(JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null")));
      const s = localStorage.getItem(SORT_KEY) as RouteSort | null;
      if (s && s in ROUTE_SORT_LABELS) setSort(s);
    } catch {
      /* brak pamięci przeglądarki — domyślne */
    }
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const saveView = (v: BoardView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(v));
    } catch {
      /* ignorujemy */
    }
  };
  const saveSort = (s: RouteSort) => {
    setSort(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      /* ignorujemy */
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "error" ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const problems = routes.filter((r) => hasProblems(r)).length;
  const visible = useMemo(
    () =>
      sortRoutes(
        routes.map((r) => ({ ...r, stopsCount: r.stops.length })),
        sort,
      ).filter((r) => matchesFilter(r, filter)),
    [routes, sort, filter],
  );

  const run = useCallback(
    (fn: () => Promise<{ error?: string; moved?: number }>, okText: string) => {
      startTransition(async () => {
        const res = await fn();
        if (res.error) setToast({ text: `Nie udało się: ${res.error}`, tone: "error" });
        else setToast({ text: okText, tone: "ok" });
        setSelected(new Set());
        router.refresh();
      });
    },
    [router],
  );

  /** Upuszczenie: na trasę (koniec trasy), na punkt (kolejność w tej samej trasie), na „Nieprzypisane”. */
  const onDrop = useCallback(
    (payload: DragPayload, target: { routeId: string | null; index?: number }) => {
      if (!editable) return;
      const extra = [...selected].filter((id) => id !== payload.stopId);
      const extraOrders = extra.flatMap((sid) => routes.flatMap((r) => r.stops).find((s) => s.id === sid)?.orderIds ?? []);
      const orderIds = [...new Set([...payload.orderIds, ...extraOrders])];
      if (target.routeId && target.routeId === payload.fromRouteId) {
        if (payload.stopId && target.index !== undefined && payload.fromIndex !== undefined && extra.length === 0) {
          const delta = target.index - payload.fromIndex;
          if (delta !== 0) run(() => moveStop(payload.stopId!, delta), "Zmieniono kolejność punktów");
        }
        return;
      }
      if (!target.routeId && !payload.fromRouteId) return;
      const name = target.routeId ? (routes.find((r) => r.id === target.routeId)?.name ?? "trasę") : null;
      run(
        () => moveOrders(orderIds, target.routeId),
        name ? `Przeniesiono na trasę ${name}` : "Zdjęto z trasy — punkt jest w „Nieprzypisanych”",
      );
    },
    [editable, moveOrders, moveStop, routes, run, selected],
  );

  const toggleSelect = (stopId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(stopId)) next.delete(stopId);
      else next.add(stopId);
      return next;
    });

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const jumpTo = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setHighlight(id);
    requestAnimationFrame(() =>
      document.getElementById(`route-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start", inline: "start" }),
    );
    setTimeout(() => setHighlight(null), 1600);
  };

  const panelsCount = view.panels === "auto" ? autoPanels(width - (showUnassigned ? 300 : 60)) : view.panels;
  const panels = splitIntoPanels(visible, Math.min(panelsCount, Math.max(1, visible.length)));
  const allCollapsed = visible.length > 0 && visible.every((r) => collapsed.has(r.id));

  const cardProps = {
    view,
    editable,
    vehicles,
    drivers,
    onDrop,
    selected,
    toggleSelect,
    toggleCollapse,
    collapsed,
    highlight,
    day,
  };

  return (
    <div className="flex h-[calc(100vh-5.25rem)] min-h-[560px] flex-col gap-2.5 md:h-[calc(100vh-5.75rem)]">
      {/* pasek narzędzi */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-[var(--shadow-panel)]">
        <ToolButton label="Odśwież" onClick={() => router.refresh()} tone="primary">
          <RefreshCw className={cn(pending && "animate-spin")} />
        </ToolButton>
        <div className="flex items-center">
          <Link href={prevHref} aria-label="Poprzedni dzień" className={toolLink}>
            <ChevronLeft />
          </Link>
          <span className="mx-1 inline-flex h-9 min-w-[150px] items-center justify-center rounded-lg border border-border-strong px-3 text-[13px] font-semibold capitalize">
            {dayLabel}
          </span>
          <Link href={nextHref} aria-label="Następny dzień" className={toolLink}>
            <ChevronRight />
          </Link>
        </div>
        <LabeledSelect label="Pokaż trasy" value={filter} onChange={(v) => setFilter(v as RouteFilter)} options={ROUTE_FILTER_LABELS} />
        {problems > 0 && (
          <button
            type="button"
            onClick={() => setFilter(filter === "problems" ? "all" : "problems")}
            aria-pressed={filter === "problems"}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
              filter === "problems" ? "bg-danger text-white" : "bg-danger-soft text-danger hover:bg-danger/15",
            )}
          >
            <CircleAlert className="size-4" />
            {problems} {problems === 1 ? "trasa" : problems < 5 ? "trasy" : "tras"} z problemami
          </button>
        )}
        <LabeledSelect label="Kolejność tras" value={sort} onChange={(v) => saveSort(v as RouteSort)} options={ROUTE_SORT_LABELS} />
        <div className="relative">
          <ToolButton label="Widok tablicy" onClick={() => setSettingsOpen((o) => !o)} active={settingsOpen}>
            <SlidersHorizontal />
          </ToolButton>
          {settingsOpen && <ViewSettings view={view} onChange={saveView} onClose={() => setSettingsOpen(false)} />}
        </div>
        <ToolButton
          label={allCollapsed ? "Rozwiń wszystkie trasy" : "Zwiń wszystkie trasy"}
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(visible.map((r) => r.id)))}
        >
          {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
        </ToolButton>
        <div className="ml-auto flex flex-wrap items-center gap-2">{toolbarActions}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-1 text-[12px] text-muted">
        <span>
          {editable
            ? "Przeciągnij punkt, aby zmienić trasę lub kolejność · Ctrl / Shift + klik, aby zaznaczyć kilka"
            : "Podgląd planu — zmiany wprowadza dyspozytor"}
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="ml-3 font-semibold text-info hover:underline">
              Zaznaczono {selected.size} — wyczyść
            </button>
          )}
        </span>
        <Legend />
      </div>

      {notices}

      {/* plansza */}
      {view.layout === "panels" ? (
        <div className="flex min-h-0 flex-1 gap-2.5">
          <UnassignedPanel
            items={unassigned}
            open={showUnassigned}
            onToggle={() => setShowUnassigned((o) => !o)}
            onDrop={onDrop}
            editable={editable}
            view={view}
          />
          {visible.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface text-sm text-muted">
              Żadna trasa nie pasuje do filtra.
            </div>
          ) : (
            panels.map((list, i) => (
              <section
                key={i}
                className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-2/70 shadow-[var(--shadow-panel)]"
              >
                <div className="flex items-center gap-1.5 border-b border-border bg-surface px-2.5 py-2">
                  <JumpSelect routes={visible} onJump={jumpTo} />
                </div>
                <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                  {list.map((r) => (
                    <RouteCard key={r.id} route={r} {...cardProps} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto pb-1">
          <UnassignedPanel
            items={unassigned}
            open={showUnassigned}
            onToggle={() => setShowUnassigned((o) => !o)}
            onDrop={onDrop}
            editable={editable}
            view={view}
          />
          {visible.map((r) => (
            <div key={r.id} className="flex w-[300px] shrink-0 flex-col">
              <RouteCard route={r} {...cardProps} column />
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-pop)]",
            toast.tone === "ok" ? "bg-ink text-white" : "bg-danger text-white",
          )}
        >
          {toast.text}
        </div>
      )}
      {pending && (
        <div className="fixed right-5 bottom-5 z-50 rounded-lg bg-surface px-3 py-2 text-xs font-medium text-muted shadow-[var(--shadow-pop)]">
          Zapisuję…
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── elementy paska ───────────────────────────── */

const toolLink =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong text-muted transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-4";

function ToolButton({
  label,
  onClick,
  children,
  tone,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "primary";
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors [&_svg]:size-4",
        tone === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary-hover"
          : active
            ? "bg-accent text-primary-strong"
            : "text-muted hover:bg-foreground/[0.06] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
}) {
  return (
    <label className="relative inline-flex h-9 items-center rounded-lg border border-border-strong bg-surface pr-8 pl-3 text-[13px] hover:border-subtle">
      <span className="pointer-events-none absolute -top-2 left-2 bg-surface px-1 text-[10.5px] text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full cursor-pointer appearance-none bg-transparent font-medium outline-none"
        aria-label={label}
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-subtle" />
    </label>
  );
}

function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-1 rounded-full bg-success" /> Do dostarczenia
      </span>
      <span className="flex items-center gap-1.5">
        <Lock className="size-3 text-subtle" /> Dostarczone
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-danger">▲</span> Poza oknem dostawy
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1 w-4 rounded-full bg-danger" /> Przekroczona ładowność
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-warning" /> W magazynie
      </span>
    </span>
  );
}

function JumpSelect({ routes, onJump }: { routes: BoardRoute[]; onJump: (id: string) => void }) {
  return (
    <label className="relative flex h-9 flex-1 items-center rounded-lg border border-border-strong bg-surface pl-9 text-[13px] hover:border-subtle">
      <Search className="pointer-events-none absolute left-3 size-4 text-subtle" />
      <select
        value=""
        onChange={(e) => e.target.value && onJump(e.target.value)}
        className="h-full w-full cursor-pointer appearance-none bg-transparent pr-8 text-muted outline-none"
        aria-label="Skocz do trasy"
      >
        <option value="">Skocz do trasy…</option>
        {routes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.vehicleLabel ? ` · ${r.vehicleLabel}` : ""}
            {r.driverLabel ? ` · ${r.driverLabel}` : ""}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-subtle" />
    </label>
  );
}

/* ───────────────────────────── ustawienia widoku ───────────────────────────── */

function ViewSettings({ view, onChange, onClose }: { view: BoardView; onChange: (v: BoardView) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const set = (patch: Partial<BoardView>) => onChange({ ...view, ...patch });
  const toggle = (k: keyof BoardView["show"]) => onChange({ ...view, show: { ...view.show, [k]: !view.show[k] } });

  const rows: { k: keyof BoardView["show"]; label: string; icon: ReactNode }[] = [
    { k: "seq", label: "Numer punktu (Lp.)", icon: <Hash /> },
    { k: "address", label: "Adres", icon: <MapPin /> },
    { k: "window", label: "Okno dostawy", icon: <Clock /> },
    { k: "eta", label: "Przyjazd (ETA)", icon: <Clock /> },
    { k: "load", label: "Waga, palety, skrzynki", icon: <Weight /> },
    { k: "phone", label: "Telefon klienta", icon: <Phone /> },
  ];

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Widok tablicy"
      className="absolute top-11 right-0 z-40 w-[320px] overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-pop)]"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-[15px] font-semibold">Widok tablicy</p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_BOARD_VIEW)}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-info hover:underline"
        >
          <RotateCcw className="size-3.5" /> Domyślne
        </button>
      </div>
      <div className="space-y-3 border-b border-border px-4 py-3">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Układ</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["panels", "Panele", "Listy tras obok siebie", <PanelsTopLeft key="p" />],
              ["columns", "Kolumny", "Trasa jako kolumna", <Columns3 key="c" />],
            ] as const
          ).map(([k, title, sub, icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ layout: k })}
              aria-pressed={view.layout === k}
              className={cn(
                "rounded-lg border p-2.5 text-left transition-colors [&_svg]:size-4",
                view.layout === k ? "border-primary-strong bg-accent ring-1 ring-primary-strong" : "border-border-strong hover:bg-surface-2",
              )}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                {icon} {title}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-muted">{sub}</span>
            </button>
          ))}
        </div>
        {view.layout === "panels" && (
          <div className="flex items-center justify-between">
            <span className="text-[13px]">Liczba paneli</span>
            <div className="flex rounded-lg bg-foreground/[0.06] p-0.5">
              {(["auto", 2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set({ panels: n })}
                  className={cn(
                    "h-7 min-w-9 rounded-md px-2 text-[12.5px] font-semibold",
                    view.panels === n ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
                  )}
                >
                  {n === "auto" ? "Auto" : n}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[13px]">Gęstość</span>
          <div className="flex rounded-lg bg-foreground/[0.06] p-0.5">
            {(
              [
                ["comfortable", "Wygodna"],
                ["compact", "Zwarta"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => set({ density: k })}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[12.5px] font-semibold",
                  view.density === k ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-1 border-b border-border px-4 py-3">
        <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Punkty</p>
        {rows.map((r) => (
          <Toggle key={r.k} label={r.label} icon={r.icon} on={view.show[r.k]} onClick={() => toggle(r.k)} />
        ))}
      </div>
      <div className="space-y-1 px-4 py-3">
        <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Nagłówek trasy</p>
        <Toggle label="Telefon kierowcy" icon={<Phone />} on={view.show.driverPhone} onClick={() => toggle("driverPhone")} />
      </div>
    </div>
  );
}

function Toggle({ label, icon, on, onClick }: { label: string; icon: ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md py-1.5 text-left text-[13px] hover:bg-surface-2"
    >
      <span className="text-subtle [&_svg]:size-4">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-primary-strong" : "bg-foreground/15")}>
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/* ───────────────────────────── nieprzypisane ───────────────────────────── */

function UnassignedPanel({
  items,
  open,
  onToggle,
  onDrop,
  editable,
  view,
}: {
  items: BoardUnassigned[];
  open: boolean;
  onToggle: () => void;
  onDrop: (p: DragPayload, t: { routeId: string | null; index?: number }) => void;
  editable: boolean;
  view: BoardView;
}) {
  const [over, setOver] = useState(false);
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!editable) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const p = readPayload(e);
      if (p) onDrop(p, { routeId: null });
    },
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={onToggle}
        {...dropProps}
        className={cn(
          "flex w-11 shrink-0 flex-col items-center gap-3 rounded-xl border border-border bg-surface py-3 shadow-[var(--shadow-panel)] hover:bg-surface-2",
          over && "ring-2 ring-info",
        )}
        title="Pokaż nieprzypisane"
      >
        <PanelLeftOpen className="size-4 text-muted" />
        <span className="rounded-full bg-warning-soft px-1.5 text-xs font-bold text-warning tabular-nums">{items.length}</span>
        <span className="text-[12px] font-semibold text-muted [writing-mode:vertical-rl]">Nieprzypisane</span>
      </button>
    );

  return (
    <section
      {...dropProps}
      aria-label="Nieprzypisane zamówienia"
      className={cn(
        "flex w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border bg-surface shadow-[var(--shadow-panel)] transition-shadow",
        over ? "border-info ring-2 ring-info/40" : "border-border",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Inbox className="size-4 text-muted" />
        <h2 className="flex-1 text-[14px] font-semibold">Nieprzypisane</h2>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
            items.length ? "bg-info-soft text-info" : "bg-success-soft text-success",
          )}
        >
          {items.length}
        </span>
        <button type="button" onClick={onToggle} className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-foreground" title="Zwiń">
          <PanelLeftClose className="size-4" />
        </button>
      </header>
      <ol className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <li className="px-4 py-8 text-center text-[13px] text-muted">Wszystkie zamówienia są na trasach.</li>
        )}
        {items.map((o, i) => (
          <li
            key={o.id}
            draggable={editable}
            onDragStart={(e) => writePayload(e, { orderIds: [o.id], fromRouteId: null })}
            className={cn(
              "border-b border-l-[3px] border-b-border px-3 text-[12.5px] last:border-b-0 hover:bg-surface-2",
              view.density === "compact" ? "py-1" : "py-2",
              o.awaiting ? "border-l-warning" : "border-l-success",
              editable && "cursor-grab active:cursor-grabbing",
            )}
            title={o.ref ?? undefined}
          >
            <p className="flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="shrink-0 font-semibold text-foreground">{o.customer}</span>
              {view.show.address && <span className="truncate text-muted">{o.address}</span>}
            </p>
            <p className="mt-0.5 flex items-center gap-2.5 overflow-hidden whitespace-nowrap text-muted tabular-nums">
              {view.show.seq && <span className="w-5 shrink-0 text-subtle">{i + 1}</span>}
              {view.show.window && <span className="shrink-0">{o.window}</span>}
              {view.show.phone && o.phone && (
                <span className="inline-flex min-w-0 items-center gap-1 truncate">
                  <Phone className="size-3 shrink-0" />
                  {o.phone}
                </span>
              )}
              {o.priority && <span className="ml-auto shrink-0 text-[11px] font-bold text-danger">PRIO</span>}
            </p>
            {view.show.load && (
              <p className="mt-0.5 text-subtle tabular-nums">
                {Math.round(o.kg)} kg · {o.crates} skrz.{o.pallets ? ` · ${o.pallets} pal.` : ""}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ───────────────────────────── karta trasy ───────────────────────────── */

const STATUS_TONE: Record<string, string> = {
  draft: "bg-foreground/[0.06] text-muted",
  planned: "bg-success-soft text-success",
  dispatched: "bg-info-soft text-info",
  in_progress: "bg-danger-soft text-danger",
  completed: "bg-success-soft text-success",
  closed: "bg-foreground/[0.06] text-muted",
};

function RouteCard({
  route: r,
  view,
  editable,
  vehicles,
  drivers,
  onDrop,
  selected,
  toggleSelect,
  toggleCollapse,
  collapsed,
  highlight,
  column,
}: {
  route: BoardRoute;
  view: BoardView;
  editable: boolean;
  vehicles: { id: string; label: string }[];
  drivers: { id: string; label: string }[];
  onDrop: (p: DragPayload, t: { routeId: string | null; index?: number }) => void;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  toggleCollapse: (id: string) => void;
  collapsed: Set<string>;
  highlight: string | null;
  column?: boolean;
  day: string;
}) {
  const [over, setOver] = useState(false);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const isCollapsed = collapsed.has(r.id);
  const doneCount = r.stops.filter((s) => s.done).length;
  const compact = view.density === "compact";
  const canDrop = editable && r.canChange;

  return (
    <article
      id={`route-${r.id}`}
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setOver(false);
          setOverIndex(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        setOverIndex(null);
        const p = readPayload(e);
        if (p) onDrop(p, { routeId: r.id });
      }}
      className={cn(
        "scroll-mt-2 overflow-hidden rounded-lg border bg-surface shadow-[0_1px_2px_rgb(19_36_31/0.06)] transition-shadow",
        column && "flex min-h-0 flex-1 flex-col",
        over ? "border-info ring-2 ring-info/40" : r.overloaded ? "border-danger/40" : "border-border",
        highlight === r.id && "ring-2 ring-primary",
      )}
    >
      <header className={cn("px-3", compact ? "py-2" : "py-2.5")}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleCollapse(r.id)}
            className="-ml-1 rounded p-0.5 text-subtle hover:bg-surface-2 hover:text-foreground"
            aria-label={isCollapsed ? `Rozwiń ${r.name}` : `Zwiń ${r.name}`}
            aria-expanded={!isCollapsed}
          >
            <ChevronDown className={cn("size-4 transition-transform", isCollapsed && "-rotate-90")} />
          </button>
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.01em]" title={r.name}>
            {r.name}
            {r.subtitle && !column && (
              <span className="ml-2 hidden text-[12px] font-normal text-muted min-[1500px]:inline">{r.subtitle}</span>
            )}
          </h3>
          {!column && <RouteBadges route={r} doneCount={doneCount} />}
          <Link
            href={r.printHref}
            title="Lista załadunkowa"
            aria-label={`Lista załadunkowa ${r.name}`}
            className="shrink-0 rounded p-1 text-subtle hover:bg-surface-2 hover:text-foreground"
          >
            <Printer className="size-4" />
          </Link>
          {editable && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                className="shrink-0 rounded p-1 text-subtle hover:bg-surface-2 hover:text-foreground"
                aria-label={`Działania na trasie ${r.name}`}
                aria-expanded={menu}
              >
                <MoreHorizontal className="size-4" />
              </button>
              {menu && <RouteMenu route={r} vehicles={vehicles} drivers={drivers} onClose={() => setMenu(false)} />}
            </div>
          )}
        </div>

        {column && (
          <div className="mt-1 flex items-center gap-1.5">
            <RouteBadges route={r} doneCount={doneCount} />
            {r.subtitle && <span className="truncate text-[11.5px] text-muted">{r.subtitle}</span>}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          <span className={cn("inline-flex items-center gap-1 font-semibold", !r.vehicleLabel && "text-danger")}>
            <Truck className="size-3.5 text-subtle" />
            <span className="font-mono">{r.vehicleLabel ?? "brak auta"}</span>
          </span>
          <span className={cn("inline-flex min-w-0 items-center gap-1", !r.driverLabel && "font-semibold text-danger")}>
            <User className="size-3.5 shrink-0 text-subtle" />
            <span className="truncate">{r.driverLabel ?? "brak kierowcy"}</span>
          </span>
          {view.show.driverPhone && r.driverPhone && (
            <a href={`tel:${r.driverPhone}`} className="inline-flex items-center gap-1 text-muted tabular-nums hover:text-foreground">
              <Phone className="size-3.5 text-subtle" />
              {r.driverPhone}
            </a>
          )}
          {r.plannedStart && (
            <span className="inline-flex items-center gap-1 text-muted tabular-nums">
              <Clock className="size-3.5 text-subtle" />
              {r.plannedStart}
            </span>
          )}
        </div>

        <div className={cn("mt-2 flex gap-3", column ? "flex-col" : "items-end")}>
          <div className={cn("grid flex-1 gap-x-2.5 gap-y-1.5", column ? "grid-cols-2" : "grid-cols-4")}>
            {r.load.map((l) => (
              <div key={l.key} className="min-w-0" title={`${l.label}: ${l.value}${l.cap ? ` / ${l.cap}` : ""} ${l.unit}`}>
                <p className={cn("truncate text-[11.5px] tabular-nums", l.over ? "font-bold text-danger" : "text-muted")}>
                  {l.value}
                  {l.cap ? `/${l.cap}` : ""} {l.unit}
                </p>
                <div className="mt-0.5 h-[3px] overflow-hidden rounded-full bg-foreground/[0.08]">
                  <div
                    className={cn("h-full rounded-full", l.over ? "bg-danger" : (l.pct ?? 0) >= 90 ? "bg-[#d99a00]" : "bg-info")}
                    style={{ width: `${Math.min(100, Math.max(0, l.pct ?? 0))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {r.outOfWindow > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-danger">
              <CircleAlert className="size-3.5" /> Poza oknem: {r.outOfWindow}
            </span>
          )}
        </div>
        {r.issues.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1">
            {r.issues.map((i) => (
              <span key={i} className="rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">
                {i}
              </span>
            ))}
          </p>
        )}
      </header>

      {!isCollapsed && (
        <ol className={cn("border-t border-border", column && "min-h-0 flex-1 overflow-y-auto")}>
          {r.stops.length === 0 && (
            <li className="px-4 py-5 text-center text-[12.5px] text-muted">
              {canDrop ? "Przeciągnij tu punkty z „Nieprzypisanych”." : "Brak punktów."}
            </li>
          )}
          {r.stops.map((s, idx) => {
            const draggable = canDrop && !s.done;
            const isSel = selected.has(s.id);
            return (
              <li
                key={s.id}
                draggable={draggable}
                onDragStart={(e) =>
                  writePayload(e, { orderIds: s.orderIds, stopId: s.id, fromRouteId: r.id, fromIndex: idx })
                }
                onDragOver={(e) => {
                  if (!canDrop) return;
                  e.preventDefault();
                  setOverIndex(idx);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOver(false);
                  setOverIndex(null);
                  const p = readPayload(e);
                  if (p) onDrop(p, { routeId: r.id, index: idx });
                }}
                onClick={(e) => {
                  if (draggable && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                    e.preventDefault();
                    toggleSelect(s.id);
                  }
                }}
                className={cn(
                  "group relative grid items-center gap-x-2 border-b border-l-[3px] border-b-border px-2.5 text-[12.5px] last:border-b-0",
                  compact ? "py-1" : "py-1.5",
                  column
                    ? "grid-cols-[minmax(0,1fr)_auto]"
                    : "grid-cols-[auto_auto_minmax(0,1fr)_auto]",
                  s.done ? "border-l-border-strong bg-foreground/[0.035] text-muted" : s.awaiting ? "border-l-warning" : "border-l-success",
                  isSel && "bg-info-soft",
                  draggable && "cursor-grab hover:bg-surface-2 active:cursor-grabbing",
                  overIndex === idx && "before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-info",
                )}
              >
                {column ? (
                  <>
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-1.5">
                        {view.show.seq && <span className="w-4 shrink-0 text-right text-subtle tabular-nums">{s.seq}</span>}
                        <span className={cn("truncate font-semibold", s.done ? "text-muted" : "text-foreground")}>{s.customer}</span>
                      </span>
                      {view.show.address && <span className="block truncate pl-5.5 text-muted">{s.address}</span>}
                      {view.show.phone && s.phone && (
                        <span className="flex items-center gap-1 pl-5.5 text-muted tabular-nums">
                          <Phone className="size-3" /> {s.phone}
                        </span>
                      )}
                      {view.show.window && <WindowText stop={s} className="pl-5.5" />}
                    </span>
                    <span className="self-end text-right">
                      {s.done ? (
                        <span className="text-[11.5px] text-subtle">✓ {s.statusLabel ?? "dostarczone"}</span>
                      ) : (
                        view.show.eta && s.eta && <span className="text-[14px] font-bold tabular-nums">{s.eta}</span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    {view.show.seq ? (
                      <span className="w-5 text-right font-medium text-subtle tabular-nums">{s.seq}</span>
                    ) : (
                      <span />
                    )}
                    {view.show.window ? <WindowText stop={s} /> : <span />}
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className={cn("shrink-0 truncate font-semibold", s.done ? "text-muted" : "text-foreground")}>
                        {s.customer}
                      </span>
                      {view.show.address && <span className="truncate text-muted">{s.address}</span>}
                      {s.awaiting && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Zamówienie w magazynie" />}
                      {s.priority && <span className="shrink-0 text-[11px] font-bold text-danger">PRIO</span>}
                      {s.closed && <span className="shrink-0 text-[11px] font-bold text-danger">zamknięte</span>}
                    </span>
                    <span className="flex items-center gap-2 text-muted tabular-nums">
                      {view.show.load && (
                        <span className="hidden text-[11.5px] text-subtle 2xl:inline">
                          {Math.round(s.kg)} kg · {s.crates} skrz.
                        </span>
                      )}
                      {view.show.phone && s.phone && (
                        <span className="hidden items-center gap-1 xl:inline-flex">
                          <Phone className="size-3" />
                          {s.phone}
                        </span>
                      )}
                      {view.show.eta && !s.done && s.eta && (
                        <span className={cn("w-10 text-right font-semibold", s.out ? "text-danger" : "text-foreground")}>{s.eta}</span>
                      )}
                      {s.done && <Lock className="size-3 text-subtle" aria-label="Zrealizowany" />}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}

function RouteBadges({ route: r, doneCount }: { route: BoardRoute; doneCount: number }) {
  return (
    <>
      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold", STATUS_TONE[r.status] ?? STATUS_TONE.draft)}>
        {r.statusLabel}
      </span>
      <span className="shrink-0 rounded bg-info-soft px-1.5 py-0.5 text-[11px] font-bold text-info tabular-nums">
        {doneCount > 0 ? `${doneCount}/${r.stops.length}` : `${r.stops.length} pkt`}
      </span>
    </>
  );
}

function WindowText({ stop: s, className }: { stop: BoardStop; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap tabular-nums",
        s.out ? "font-semibold text-danger" : s.done ? "text-subtle" : "text-muted",
        className,
      )}
      title={s.out ? `Prognozowany dojazd ${s.eta} — po zamknięciu okna` : "Okno dostawy"}
    >
      {s.out && <span aria-hidden>▲</span>}
      {s.window}
    </span>
  );
}

/* ───────────────────────────── menu trasy ───────────────────────────── */

function RouteMenu({
  route: r,
  vehicles,
  drivers,
  onClose,
}: {
  route: BoardRoute;
  vehicles: { id: string; label: string }[];
  drivers: { id: string; label: string }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const a = r.actions;
  const item =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:text-subtle";

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute top-8 right-0 z-40 w-[300px] rounded-xl border border-border bg-surface p-2 shadow-[var(--shadow-pop)]"
    >
      {r.canChange && a.setVehicle && a.setDriver && (
        <div className="space-y-2 border-b border-border px-1 pt-1 pb-3">
          <form action={a.setVehicle}>
            <MenuSelect name="vehicle_id" label="Pojazd" value={r.vehicleId} options={vehicles} />
          </form>
          <form action={a.setDriver}>
            <MenuSelect name="driver_id" label="Kierowca" value={r.driverId} options={drivers} />
          </form>
        </div>
      )}
      <div className="pt-1.5">
        {r.canChange && a.sortByWindow && r.stops.length > 1 && (
          <form action={a.sortByWindow}>
            <button className={item}>
              <ArrowDownWideNarrow /> Ułóż kolejność wg okien dostaw
            </button>
          </form>
        )}
        {r.canChange && r.status === "draft" && a.markReady && (
          r.ready.ok ? (
            <form action={a.markReady}>
              <button className={cn(item, "font-semibold text-primary-strong")}>
                <ListOrdered /> Gotowa do załadunku
              </button>
            </form>
          ) : r.ready.needsConfirm && a.markReadyForce ? (
            <form action={a.markReadyForce}>
              <button className={cn(item, "font-semibold text-danger")} title={r.ready.reasons.join(", ")}>
                <ListOrdered /> Gotowa mimo przeciążenia
              </button>
            </form>
          ) : (
            <button className={item} disabled title={`Najpierw: ${r.ready.reasons.join(", ")}`}>
              <ListOrdered /> Gotowa do załadunku — {r.ready.reasons.join(", ")}
            </button>
          )
        )}
        {r.canChange && r.status === "planned" && a.backToDraft && (
          <form action={a.backToDraft}>
            <button className={item}>
              <RotateCcw /> Cofnij do szkicu
            </button>
          </form>
        )}
        {a.copy && (
          <form action={a.copy} className="flex items-center gap-2 px-2.5 py-1.5">
            <Copy className="size-4 text-subtle" />
            <span className="text-[13px]">Kopiuj na</span>
            <input type="date" name="to" required className="h-8 flex-1 rounded-md border border-border-strong px-2 text-[13px]" aria-label="Na dzień" />
            <button className="h-8 rounded-md bg-primary px-2.5 text-[12.5px] font-semibold text-primary-foreground">OK</button>
          </form>
        )}
        {r.canChange && a.deleteEmpty && r.stops.length === 0 && (
          <form action={a.deleteEmpty}>
            <button className={cn(item, "text-danger")}>
              <X /> Usuń pusty kurs
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function MenuSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | null;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute -top-2 left-2 bg-surface px-1 text-[10.5px] text-muted">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          "h-10 w-full cursor-pointer appearance-none rounded-lg border bg-surface pr-8 pl-3 text-[13px] outline-none focus:border-primary",
          value ? "border-border-strong" : "border-danger",
        )}
      >
        <option value="">— wybierz —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-3 right-2.5 size-4 text-subtle" />
    </label>
  );
}

/* ───────────────────────────── przeciąganie ───────────────────────────── */

const MIME = "application/x-driver-board";

function writePayload(e: React.DragEvent, p: DragPayload) {
  e.dataTransfer.setData(MIME, JSON.stringify(p));
  e.dataTransfer.effectAllowed = "move";
}

function readPayload(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(MIME);
    if (!raw) return null;
    const p = JSON.parse(raw) as DragPayload;
    return Array.isArray(p.orderIds) ? p : null;
  } catch {
    return null;
  }
}
