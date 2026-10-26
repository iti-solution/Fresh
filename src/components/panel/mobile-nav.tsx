"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import type { NavItem } from "@/modules/tenancy/domain/access";
import { Wordmark } from "./brand";
import { SidebarNav } from "./sidebar-nav";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-foreground/[0.05] md:hidden"
        aria-label="Otwórz menu"
      >
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-ink/50" aria-label="Zamknij menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-ink px-3 py-4 shadow-[var(--shadow-pop)]">
            <div className="mb-6 flex items-center justify-between px-3">
              <Wordmark inverted />
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-white" aria-label="Zamknij menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav items={items} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
