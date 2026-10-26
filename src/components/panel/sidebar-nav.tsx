"use client";

import {
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  Headset,
  IdCard,
  LayoutDashboard,
  Package,
  Radar,
  Route,
  Search,
  Settings,
  Store,
  Truck,
  Waypoints,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/modules/tenancy/domain/access";

/** Grupy menu. „System” (ustawienia) jest w stopce paska, nie na liście. */
const GROUPS: { name: NavItem["group"]; collapsible: boolean }[] = [
  { name: "Operacje", collapsible: false },
  { name: "Zestawienia", collapsible: false },
  { name: "Kartoteki", collapsible: true },
  { name: "Rozliczenia", collapsible: true },
];

export const NAV_ICONS: Record<string, LucideIcon> = {
  "/pulpit": LayoutDashboard,
  "/centrum": Radar,
  "/planowanie": Route,
  "/zlecenia": ClipboardList,
  "/bok": Headset,
  "/raport": ChartNoAxesCombined,
  "/kartoteki/klienci": Store,
  "/kartoteki/pojazdy": Truck,
  "/kartoteki/kierowcy": IdCard,
  "/kartoteki/przewoznicy": Building2,
  "/kartoteki/szablony": Waypoints,
  "/opakowania": Package,
  "/rozliczenia": Wallet,
  "/audyt": Search,
  "/ustawienia": Settings,
};

const STORAGE_KEY = "fresh.nav.open";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Menu boczne: zwarte (32 px na pozycję), grupy rzadziej używane (kartoteki, rozliczenia) zwijane.
 * Grupa z aktywnym ekranem jest zawsze rozwinięta; stan zapamiętujemy w przeglądarce.
 */
export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, boolean>;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- odczyt preferencji z przeglądarki po hydratacji
      setOpen(saved);
    } catch {
      /* brak dostępu do pamięci przeglądarki — zostają domyślne */
    }
  }, []);

  const toggle = (group: string, value: boolean) => {
    const next = { ...open, [group]: value };
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignorujemy */
    }
  };

  return (
    <nav className="space-y-4" aria-label="Menu główne">
      {GROUPS.map(({ name, collapsible }) => {
        const groupItems = items.filter((i) => i.group === name);
        if (groupItems.length === 0) return null;
        const hasActive = groupItems.some((i) => isActive(pathname, i.href));
        const expanded = !collapsible || hasActive || open[name] === true;
        return (
          <div key={name}>
            {collapsible ? (
              <button
                type="button"
                onClick={() => toggle(name, !expanded)}
                disabled={hasActive}
                aria-expanded={expanded}
                className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase transition-colors hover:text-ink-foreground disabled:cursor-default disabled:hover:text-ink-muted"
              >
                {name}
                {!hasActive && <ChevronDown className={cn("size-3.5 transition-transform", !expanded && "-rotate-90")} />}
              </button>
            ) : (
              <p className="mb-1 px-3 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">{name}</p>
            )}
            {expanded && (
              <ul className="space-y-px">
                {groupItems.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = NAV_ICONS[item.href] ?? Package;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex h-8 items-center gap-2.5 rounded-md px-3 text-[14px] font-medium transition-colors",
                          active ? "bg-ink-2 text-white" : "text-ink-foreground/90 hover:bg-white/[0.06] hover:text-white",
                        )}
                      >
                        {active && <span className="absolute inset-y-1.5 -left-3 w-[3px] rounded-r bg-primary" aria-hidden />}
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            active ? "text-primary" : "text-ink-muted group-hover:text-ink-foreground",
                          )}
                          strokeWidth={2}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {!item.built && (
                          <span className="rounded bg-white/[0.07] px-1.5 text-[10px] font-semibold text-ink-muted">
                            {item.milestone}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
