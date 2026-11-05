import { LogOut, Phone } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/panel/brand";
import { portalLogout } from "@/modules/portal/server/actions";
import { requirePortalContext } from "@/modules/portal/server/context";
import { BRAND } from "@/lib/brand";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortalContext();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-ink text-ink-foreground">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
          <Link href="/portal" className="flex min-w-0 items-center gap-2.5" aria-label="Portal zamówień — start">
            <BrandMark className="h-7 w-7 shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-semibold text-white">{ctx.customerName}</span>
              <span className="block truncate text-[11.5px] text-ink-muted">zamówienia w {ctx.tenantName}</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {ctx.salesRepPhone && (
              <a
                href={`tel:${ctx.salesRepPhone}`}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-white/[0.08] hover:text-white"
                title={`Zadzwoń do opiekuna${ctx.salesRepName ? `: ${ctx.salesRepName}` : ""}`}
                aria-label="Zadzwoń do opiekuna handlowego"
              >
                <Phone className="size-5" />
              </a>
            )}
            <form action={portalLogout}>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-white/[0.08] hover:text-white"
                title="Wyloguj"
                aria-label="Wyloguj"
              >
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">{children}</main>
      <footer className="mx-auto w-full max-w-2xl px-4 pb-6 text-xs text-subtle">{ctx.email} · {BRAND.full}</footer>
    </div>
  );
}
