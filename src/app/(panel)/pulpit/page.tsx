import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/panel/module-placeholder";
import { Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Pulpit" };

type TableName = "customers" | "delivery_points" | "vehicles" | "drivers" | "route_templates" | "packaging_types";

const TILES: { table: TableName; label: string; href: string }[] = [
  { table: "customers", label: "Klienci", href: "/kartoteki/klienci" },
  { table: "delivery_points", label: "Punkty dostaw", href: "/kartoteki/klienci" },
  { table: "vehicles", label: "Pojazdy", href: "/kartoteki/pojazdy" },
  { table: "drivers", label: "Kierowcy", href: "/kartoteki/kierowcy" },
  { table: "route_templates", label: "Szablony tras", href: "/kartoteki/szablony" },
  { table: "packaging_types", label: "Typy opakowań", href: "/opakowania" },
];

export default async function DashboardPage() {
  const ctx = await requireAccess("/pulpit");
  const supabase = await createClient();

  const counts = await Promise.all(
    TILES.map(async (t) => {
      const { count } = await supabase.from(t.table).select("*", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId);
      return count ?? 0;
    }),
  );
  const empty = counts.every((c) => c === 0);

  return (
    <>
      <PageHeader title="Pulpit" description={`${ctx.tenantName} — stan kartotek`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {TILES.map((t, i) => (
          <Link key={t.table} href={t.href}>
            <Card className="p-4 transition-colors hover:border-primary">
              <p className="text-sm text-muted">{t.label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{counts[i]}</p>
            </Card>
          </Link>
        ))}
      </div>
      {empty && (
        <Card className="mt-6 max-w-2xl text-sm">
          Kartoteki są puste. Import klientów i punktów dostaw z Excela pojawi się w etapie M1. Do testów możesz założyć firmę
          demo na stronie{" "}
          <Link href="/wybierz-firme" className="text-primary hover:underline">
            wyboru firmy
          </Link>
          .
        </Card>
      )}
    </>
  );
}
