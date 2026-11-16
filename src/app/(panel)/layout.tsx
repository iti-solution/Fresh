import { Building2, ChevronsUpDown, LogOut, Search, Settings } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/panel/brand";
import { MobileNav } from "@/components/panel/mobile-nav";
import { SectionTabs, SidebarNav } from "@/components/panel/sidebar-nav";
import { CurrentPathInput, FullscreenButton, TopbarTitle } from "@/components/panel/topbar";
import { cn } from "@/lib/utils";
import { formatDayLabel, todayInWarsaw } from "@/modules/orders/domain/orders";
import { ROLE_LABELS, sectionsForRole } from "@/modules/tenancy/domain/access";
import { signOut, switchDataMode } from "@/modules/tenancy/server/actions";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantContext();
  if (ctx.role === "driver") redirect("/driver");
  if (ctx.role === "customer") redirect("/portal");
  const sections = sectionsForRole(ctx.role);
  // zamówienia od klientów czekające na sprawdzenie — plakietka przy „Zamówienia” i „Do sprawdzenia”
  const reviewsVisible = sections.some((x) => x.items.some((i) => i.href === "/do-sprawdzenia"));
  const { count: reviewCount } = reviewsVisible
    ? await (await createClient())
        .from("order_drafts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId)
        .eq("status", "needs_review")
    : { count: 0 };
  const badges = { "/do-sprawdzenia": reviewCount ?? 0 };
  // Ikona w stopce prowadzi do działu „Ustawienia” (administrator) albo samych „Pierwszych kroków” (dyspozytor).
  const system = sections.find((s) => s.key === "system");
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
          <SidebarNav sections={sections} badges={badges} />
        </div>
        <div className="flex shrink-0 items-center gap-2.5 border-t border-white/[0.07] px-3.5 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-white">{ctx.email}</span>
            <span className="block truncate text-[11px] text-ink-muted">{ROLE_LABELS[ctx.role]}</span>
          </span>
          {system && (
            <Link
              href={system.href}
              className="rounded-md p-1.5 text-ink-muted hover:bg-white/[0.06] hover:text-white"
              title={system.label}
              aria-label={system.label}
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
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-surface px-3 text-foreground md:px-5">
          <MobileNav sections={sections} badges={badges} />
          <div className="min-w-0 shrink-0 md:w-56">
            <TopbarTitle />
          </div>
          <form action="/bok" className="relative hidden w-full max-w-sm lg:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input
              name="q"
              type="search"
              placeholder="Gdzie jest dostawa? Klient, zamówienie, telefon…"
              aria-label="Szukaj dostawy"
              className="h-8 w-full rounded-md border border-border bg-surface-2 pr-3 pl-9 text-[13px] text-foreground outline-none placeholder:text-subtle focus:border-primary-strong/50 focus:bg-surface"
            />
          </form>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-[13px] text-muted capitalize 2xl:inline">{formatDayLabel(todayInWarsaw())}</span>
            <DataModeToggle isDemo={ctx.isDemo} />
            <Link
              href="/wybierz-firme"
              title="Zmień firmę"
              className="hidden h-8 max-w-[240px] items-center gap-2 rounded-md border border-border pr-2 pl-2.5 transition-colors hover:bg-accent sm:flex"
            >
              <Building2 className="size-4 shrink-0 text-subtle" />
              <span className="truncate text-[13px] font-medium text-foreground">{ctx.tenantName}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-subtle" />
            </Link>
            <FullscreenButton className="hidden md:flex" />
          </div>
        </header>
        <SectionTabs sections={sections} badges={badges} />
        {/* --chrome = wysokość pasków nad treścią; ekrany na pełną wysokość (tablica, monitor) odejmują ją od okna */}
        <main className="w-full flex-1 px-3 py-4 [--chrome:3rem] peer-data-[tabs=on]:[--chrome:5.5rem] md:px-5 md:py-5">
          {children}
        </main>
      </div>
    </div>
  );
}

/** „Dane przykładowe / Prawdziwe dane” — jedno kliknięcie między firmą demo a własną firmą, na tym samym ekranie. */
function DataModeToggle({ isDemo }: { isDemo: boolean }) {
  const item = (active: boolean) =>
    cn(
      "h-7 px-2.5 text-[11.5px] font-semibold tracking-[0.04em] uppercase transition-colors",
      active ? "bg-primary text-primary-foreground" : "text-muted hover:bg-accent hover:text-primary-strong",
    );
  return (
    <div className="flex overflow-hidden rounded-md border border-border-strong" role="group" aria-label="Rodzaj danych">
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
