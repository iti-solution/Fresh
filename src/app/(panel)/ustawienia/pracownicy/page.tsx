import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/panel/page";
import { Pill } from "@/components/ui/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NAV_ITEMS, ROLE_LABELS, type Role } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Dostępny dla pracowników" };

export default async function StaffAccessPage() {
  const ctx = await requireAccess("/ustawienia/pracownicy");
  const supabase = await createClient();
  const res = await supabase.from("memberships").select("user_id, role").eq("tenant_id", ctx.tenantId);
  if (res.error) throw res.error;

  // Adresy e-mail pracowników: odczyt kluczem serwerowym, wyłącznie dla administratora tej firmy.
  const admin = createAdminClient();
  const members = await Promise.all(
    (res.data ?? []).map(async (m) => {
      const { data } = await admin.auth.admin.getUserById(m.user_id);
      return { userId: m.user_id, role: m.role as Role, email: data.user?.email ?? "—" };
    }),
  );
  members.sort((a, b) => a.email.localeCompare(b.email, "pl"));

  const roles = [...new Set(members.map((m) => m.role))];
  const screens = NAV_ITEMS.filter((i) => i.built);

  return (
    <>
      <PageHeader title="Dostępny dla pracowników" description="Kto ma dostęp do firmy i które ekrany widzi — zależnie od roli." />
      <div className="grid gap-4">
        <Panel title="Osoby z dostępem" description={`${members.length} kont w firmie ${ctx.tenantName}.`} className="max-w-4xl">
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {members.length === 0 && <li className="px-3 py-2 text-muted">Brak kont.</li>}
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium">
                  {m.email}
                  {m.userId === ctx.userId && <span className="ml-2 text-xs text-muted">(Ty)</span>}
                </span>
                <Pill tone="info">{ROLE_LABELS[m.role]}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Co widzi która rola" description="Ekrany panelu i uprawnienia ról używanych w firmie." className="max-w-4xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-medium">Ekran</th>
                  {roles.map((r) => (
                    <th key={r} className="px-2 py-2 text-center font-medium">
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {screens.map((i) => (
                  <tr key={i.href} className="border-b border-border/60">
                    <td className="py-1.5 pr-4">{i.label}</td>
                    {roles.map((r) => (
                      <td key={r} className="px-2 py-1.5 text-center">
                        {i.roles.includes(r) ? <span className="font-semibold text-success">✓</span> : <span className="text-muted">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
