import { Building2, ChevronsUpDown, LogOut, Search, Settings } from "lucide-react";
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
  const canSettings = nav.some((i) => i.href === "/ustawienia");
  const initials = (ctx.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col bg-ink text-ink-foreground md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-white/[0.07] px-5">
          <Link href="/" aria-label="ExpertTMS — strona startowa">
            <Wordmark inverted />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav items={nav} />
        </div>
        <div className="flex shrink-0 items-center gap-2.5 border-t border-white/[0.07] px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-white">{ctx.email}</span>
            <span className="block truncate text-[11px] text-ink-muted">{ROLE_LABELS[ctx.role]}</span>
          </span>
          {canSettings && (
            <Link
              href="/ustawienia"
              className="rounded-md p-1.5 text-ink-muted hover:bg-white/[0.06] hover:text-white"
              title="Ustawienia"
              aria-label="Ustawienia"
            >
              <Settings className="size-4" />
            </Link>
          )}
          <form action={signOut}>
            <button
              className="rounded-md p-1.5 text-ink-muted hover:bg-white/[0.06] hover:text-white"
              title="Wyloguj"
              aria-label="Wyloguj"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-md md:px-8">
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
            <span className="hidden text-muted capitalize xl:inline">{formatDayLabel(todayInWarsaw())}</span>
            <Link
              href="/wybierz-firme"
              title="Zmień firmę"
              className="flex h-9 max-w-[280px] items-center gap-2 rounded-lg border border-border bg-surface pr-2 pl-3 transition-colors hover:border-border-strong"
            >
              <Building2 className="size-4 shrink-0 text-subtle" />
              <span className="truncate font-medium">{ctx.tenantName}</span>
              {ctx.isDemo && <span className="rounded bg-accent px-1.5 text-[11px] font-semibold text-primary-strong">demo</span>}
              <ChevronsUpDown className="size-3.5 shrink-0 text-subtle" />
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
