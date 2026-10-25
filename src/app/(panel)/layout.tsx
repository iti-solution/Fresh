import Link from "next/link";
import { redirect } from "next/navigation";
import { SidebarNav } from "@/components/panel/sidebar-nav";
import { navForRole, ROLE_LABELS } from "@/modules/tenancy/domain/access";
import { signOut } from "@/modules/tenancy/server/actions";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantContext();
  if (ctx.role === "driver") redirect("/driver");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <Link href="/pulpit" className="mb-6 px-3 text-xl font-semibold tracking-tight text-primary">
          Fresh
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav items={navForRole(ctx.role)} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">{ctx.tenantName}</span>
            <span className="text-muted">· {ROLE_LABELS[ctx.role]}</span>
            {ctx.memberships.length > 1 && (
              <Link href="/wybierz-firme" className="text-primary hover:underline">
                zmień firmę
              </Link>
            )}
          </div>
          <form action={signOut} className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{ctx.email}</span>
            <button className="text-muted hover:text-foreground hover:underline">Wyloguj</button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
