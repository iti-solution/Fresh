import { ChevronsUpDown, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/panel/brand";
import { MobileNav } from "@/components/panel/mobile-nav";
import { SidebarNav } from "@/components/panel/sidebar-nav";
import { formatDayLabel, todayInWarsaw } from "@/modules/orders/domain/orders";
import { navForRole, ROLE_LABELS } from "@/modules/tenancy/domain/access";
import { signOut } from "@/modules/tenancy/server/actions";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantContext();
  if (ctx.role === "driver") redirect("/driver");
  const nav = navForRole(ctx.role);
  const initials = (ctx.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-ink text-ink-foreground md:flex">
        <div className="px-6 pt-5 pb-4">
          <Link href="/" aria-label="Fresh — strona startowa">
            <Wordmark inverted />
          </Link>
        </div>
        <div className="px-3 pb-4">
          <Link
            href="/wybierz-firme"
            className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 transition-colors hover:bg-white/[0.08]"
            title="Zmień firmę"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-white">{ctx.tenantName}</span>
              <span className="block truncate text-[11px] text-ink-muted">
                {ctx.isDemo ? "Firma demonstracyjna" : ROLE_LABELS[ctx.role]}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-ink-muted" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <SidebarNav items={nav} />
        </div>
        <form action={signOut} className="flex items-center gap-3 border-t border-white/[0.07] px-5 py-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f8a57]/25 text-[11px] font-semibold text-[#9ee0b9]">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-white">{ctx.email}</span>
            <span className="block truncate text-[11px] text-ink-muted">{ROLE_LABELS[ctx.role]}</span>
          </span>
          <button
            className="rounded-md p-1.5 text-ink-muted hover:bg-white/[0.06] hover:text-white"
            title="Wyloguj"
            aria-label="Wyloguj"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-md md:px-8">
          <MobileNav items={nav} />
          <form action="/bok" className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input
              name="q"
              type="search"
              placeholder="Gdzie jest dostawa? Klient, nr zamówienia, telefon…"
              aria-label="Szukaj dostawy"
              className="h-9 w-full rounded-lg border border-transparent bg-foreground/[0.05] pr-3 pl-9 text-sm outline-none placeholder:text-subtle focus:border-primary/40 focus:bg-surface focus:ring-[3px] focus:ring-primary/15"
            />
          </form>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {ctx.isDemo && (
              <span className="hidden rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning sm:inline">
                Dane demo
              </span>
            )}
            <span className="hidden text-muted capitalize lg:inline">{formatDayLabel(todayInWarsaw())}</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
