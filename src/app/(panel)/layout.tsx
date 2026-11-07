import { Building2, ChevronsUpDown, LogOut, Search, Settings } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/panel/brand";
import { MobileNav } from "@/components/panel/mobile-nav";
import { SidebarNav } from "@/components/panel/sidebar-nav";
import { CurrentPathInput, FullscreenButton, TopbarTitle } from "@/components/panel/topbar";
import { cn } from "@/lib/utils";
import { formatDayLabel, todayInWarsaw } from "@/modules/orders/domain/orders";
import { navForRole, ROLE_LABELS } from "@/modules/tenancy/domain/access";
import { signOut, switchDataMode } from "@/modules/tenancy/server/actions";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { BRAND } from "@/lib/brand";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantContext();
  if (ctx.role === "driver") redirect("/driver");
  if (ctx.role === "customer") redirect("/portal");
  const nav = navForRole(ctx.role);
  const canSettings = nav.some((i) => i.href === "/ustawienia");
  const initials = (ctx.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col bg-ink text-ink-foreground md:flex">
        <div className="flex h-12 shrink-0 items-center border-b border-white/[0.07] px-4">
          <Link href="/" aria-label={`${BRAND.full} — strona startowa`}>
            <Wordmark inverted />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 py-3">
          <SidebarNav items={nav} />
        </div>
        <div className="flex shrink-0 items-center gap-2.5 border-t border-white/[0.07] px-3.5 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-white">{ctx.email}</span>
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
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-black/20 bg-ink px-3 text-ink-foreground md:px-5">
          <MobileNav items={nav} />
          <div className="min-w-0 shrink-0 md:w-56">
            <TopbarTitle />
          </div>
          <form action="/bok" className="relative hidden w-full max-w-sm lg:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              name="q"
              type="search"
              placeholder="Gdzie jest dostawa? Klient, zamówienie, telefon…"
              aria-label="Szukaj dostawy"
              className="h-8 w-full rounded-md border border-white/10 bg-white/[0.06] pr-3 pl-9 text-[13px] text-white outline-none placeholder:text-ink-muted focus:border-primary/60 focus:bg-white/10"
            />
          </form>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-[13px] text-ink-muted capitalize 2xl:inline">{formatDayLabel(todayInWarsaw())}</span>
            <DataModeToggle isDemo={ctx.isDemo} />
            <Link
              href="/wybierz-firme"
              title="Zmień firmę"
              className="hidden h-8 max-w-[240px] items-center gap-2 rounded-md border border-white/10 pr-2 pl-2.5 transition-colors hover:bg-white/[0.06] sm:flex"
            >
              <Building2 className="size-4 shrink-0 text-ink-muted" />
              <span className="truncate text-[13px] font-medium text-white">{ctx.tenantName}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-ink-muted" />
            </Link>
            <FullscreenButton className="hidden md:flex" />
          </div>
        </header>
        <main className="w-full flex-1 px-3 py-4 md:px-5 md:py-5">{children}</main>
      </div>
    </div>
  );
}

/** „Dane przykładowe / Prawdziwe dane” — jedno kliknięcie między firmą demo a własną firmą, na tym samym ekranie. */
function DataModeToggle({ isDemo }: { isDemo: boolean }) {
  const item = (active: boolean) =>
    cn(
      "h-7 px-2.5 text-[11.5px] font-semibold tracking-[0.04em] uppercase transition-colors",
      active ? "bg-primary text-primary-foreground" : "text-ink-foreground hover:bg-white/10 hover:text-white",
    );
  return (
    <div className="flex overflow-hidden rounded-md border border-white/15" role="group" aria-label="Rodzaj danych">
      <form action={switchDataMode.bind(null, "demo")}>
        <CurrentPathInput />
        <button
          className={item(isDemo)}
          aria-pressed={isDemo}
          disabled={isDemo}
          title="Firma demo z przykładowymi trasami"
        >
          <span className="hidden sm:inline">Dane przykładowe</span>
          <span className="sm:hidden">Demo</span>
        </button>
      </form>
      <form action={switchDataMode.bind(null, "real")}>
        <CurrentPathInput />
        <button className={item(!isDemo)} aria-pressed={!isDemo} disabled={!isDemo} title="Twoja firma i prawdziwe dane">
          <span className="hidden sm:inline">Prawdziwe dane</span>
          <span className="sm:hidden">Moje</span>
        </button>
      </form>
    </div>
  );
}
