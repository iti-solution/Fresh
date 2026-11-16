"use client";

import {
  Apple,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  Columns3,
  FolderOpen,
  Headset,
  IdCard,
  ListOrdered,
  MonitorPlay,
  Package,
  Radar,
  Route,
  Search,
  Settings,
  Sparkles,
  Store,
  Truck,
  Wallet,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { sectionForPath, type NavSection, type NavSectionKey } from "@/modules/tenancy/domain/access";

/** Ikony ekranów (zakładki działu, tytuły). */
export const NAV_ICONS: Record<string, LucideIcon> = {
  "/centrum": Radar,
  "/start": Route,
  "/planowanie": Columns3,
  "/monitor": MonitorPlay,
  "/trasy": ListOrdered,
  "/zlecenia": ClipboardList,
  "/bok": Headset,
  "/raport": ChartNoAxesCombined,
  "/kartoteki/klienci": Store,
  "/kartoteki/pojazdy": Truck,
  "/kartoteki/kierowcy": IdCard,
  "/kartoteki/przewoznicy": Building2,
  "/kartoteki/produkty": Apple,
  "/do-sprawdzenia": Sparkles,
  "/kartoteki/szablony": Waypoints,
  "/opakowania": Package,
  "/rozliczenia": Wallet,
  "/audyt": Search,
  "/ustawienia": Settings,
};

/** Ikony działów menu bocznego. Dział z jednym ekranem bierze ikonę tego ekranu. */
const SECTION_ICONS: Record<NavSectionKey, LucideIcon> = {
  centrum: Radar,
  monitor: MonitorPlay,
  bok: Headset,
  zamowienia: ClipboardList,
  planowanie: Columns3,
  rozliczenia: Wallet,
  raporty: ChartNoAxesCombined,
  kartoteki: FolderOpen,
  system: Settings,
};

/**
 * Menu boczne: jedna krótka lista działów (bez nagłówków grup i zwijania). Ekrany działu są
 * zakładkami u góry strony — patrz `SectionTabs`. Cienkie kreski dzielą: start · praca dnia · pieniądze i raporty · dane stałe.
 */
/** Plakietka z liczbą spraw (np. zamówienia do sprawdzenia) — klucz to adres ekranu. */
export type NavBadges = Record<string, number>;

function Badge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn("inline-flex min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[11px] leading-5 font-bold text-white tabular-nums", className)}
      aria-label={`${n} do sprawdzenia`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function SidebarNav({
  sections,
  onNavigate,
  badges = {},
}: {
  sections: NavSection[];
  onNavigate?: () => void;
  badges?: NavBadges;
}) {
  const pathname = usePathname();
  const current = sectionForPath(sections, pathname)?.section.key;
  return (
    <nav aria-label="Menu główne">
      <ul className="space-y-0.5">
        {sections
          .filter((s) => s.inSidebar)
          .map((s, idx) => {
            const active = s.key === current;
            const Icon = s.items.length === 1 ? (NAV_ICONS[s.href] ?? SECTION_ICONS[s.key]) : SECTION_ICONS[s.key];
            return (
              <li key={s.key} className={cn(s.divider && idx > 0 && "mt-2.5 border-t border-white/[0.08] pt-2.5")}>
                <Link
                  href={s.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[14.5px] font-medium transition-colors",
                    active ? "bg-ink-2 text-white" : "text-ink-foreground/90 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  {active && <span className="absolute inset-y-2 -left-2.5 w-[3px] rounded-r bg-primary" aria-hidden />}
                  <Icon
                    className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-ink-muted group-hover:text-ink-foreground")}
                    strokeWidth={2}
                  />
                  <span className="flex-1 truncate">{s.label}</span>
                  <Badge n={s.items.reduce((a, i) => a + (badges[i.href] ?? 0), 0)} />
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}

/**
 * Zakładki działu pod górnym paskiem: ekrany, które wcześniej były osobnymi pozycjami menu.
 * Gdy dział ma jeden ekran (albo ścieżka nie należy do żadnego działu), paska nie ma.
 * `peer` + `data-tabs` pozwalają ekranom na pełną wysokość (tablica, monitor) odjąć wysokość paska.
 */
export function SectionTabs({ sections, badges = {} }: { sections: NavSection[]; badges?: NavBadges }) {
  const pathname = usePathname();
  const hit = sectionForPath(sections, pathname);
  if (!hit || hit.section.items.length < 2) return null;
  return (
    <nav
      data-tabs="on"
      aria-label={`Ekrany działu ${hit.section.label}`}
      className="peer sticky top-12 z-20 flex h-10 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border bg-surface px-3 md:px-5"
    >
      {hit.section.items.map((item) => {
        const active = item.href === hit.item.href;
        const Icon = NAV_ICONS[item.href] ?? Package;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-2 px-2.5 text-[13.5px] whitespace-nowrap transition-colors",
              active ? "font-semibold text-foreground" : "font-medium text-muted hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active ? "text-primary-strong" : "text-subtle")} strokeWidth={2} />
            {item.label}
            <Badge n={badges[item.href] ?? 0} />
            {active && <span className="absolute inset-x-1.5 bottom-0 h-[3px] rounded-t bg-primary" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}
