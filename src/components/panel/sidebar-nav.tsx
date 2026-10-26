"use client";

import {
  Building2,
  ChartNoAxesCombined,
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
import { cn } from "@/lib/utils";
import type { NavItem } from "@/modules/tenancy/domain/access";

const GROUP_ORDER: NavItem["group"][] = ["Operacje", "Zestawienia", "Kartoteki", "Rozliczenia", "Wzrost", "System"];

const ICONS: Record<string, LucideIcon> = {
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

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-6" aria-label="Menu główne">
      {GROUP_ORDER.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group}>
            <p className="mb-1.5 px-3 text-[11px] font-medium text-ink-muted">{group}</p>
            <ul className="space-y-0.5">
              {groupItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = ICONS[item.href] ?? Package;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors",
                        active
                          ? "bg-white/[0.09] font-medium text-white"
                          : "text-ink-foreground/85 hover:bg-white/[0.05] hover:text-white",
                      )}
                    >
                      {active && <span className="absolute inset-y-2 -left-3 w-[3px] rounded-r bg-[#5cc48a]" aria-hidden />}
                      <Icon
                        className={cn(
                          "size-[17px] shrink-0",
                          active ? "text-[#7fd4a3]" : "text-ink-muted group-hover:text-ink-foreground",
                        )}
                        strokeWidth={1.8}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {!item.built && (
                        <span className="rounded bg-white/[0.07] px-1.5 py-px text-[10px] font-medium text-ink-muted">
                          {item.milestone}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
