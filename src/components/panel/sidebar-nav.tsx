"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/modules/tenancy/domain/access";

const GROUP_ORDER: NavItem["group"][] = ["Operacje", "Kartoteki", "Rozliczenia", "Wzrost", "System"];

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-5">
      {GROUP_ORDER.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="space-y-1">
            <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted">{group}</p>
            {groupItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-1.5 text-sm",
                    active ? "bg-accent font-medium text-primary" : "hover:bg-accent/60",
                  )}
                >
                  <span>{item.label}</span>
                  {item.milestone !== "M0" && <span className="text-[10px] text-muted">{item.milestone}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
