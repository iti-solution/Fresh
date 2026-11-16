import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Circle } from "lucide-react";
import { Meter, PageHeader, Panel } from "@/components/panel/page";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { onboardingProgress, onboardingSteps } from "@/modules/tenancy/domain/onboarding";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Pierwsze kroki" };

export default async function OnboardingPage() {
  const ctx = await requireAccess("/start");
  const db = await createClient();
  const t = ctx.tenantId;
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const head = { count: "exact" as const, head: true };
  const [
    customers,
    points,
    vehicles,
    drivers,
    driversWithPin,
    packagingTypes,
    templates,
    templatePoints,
    payRules,
    orders,
    routes,
    pointTypes,
    closures,
    products,
    carriers,
    members,
    apiKeys,
  ] = await Promise.all([
    count(db.from("customers").select("id", head).eq("tenant_id", t)),
    count(db.from("delivery_points").select("id", head).eq("tenant_id", t)),
    count(db.from("vehicles").select("id", head).eq("tenant_id", t)),
    count(db.from("drivers").select("id", head).eq("tenant_id", t).eq("is_active", true)),
    count(db.from("drivers").select("id", head).eq("tenant_id", t).eq("is_active", true).not("pin_hash", "is", null)),
    count(db.from("packaging_types").select("id", head).eq("tenant_id", t)),
    count(db.from("route_templates").select("id", head).eq("tenant_id", t)),
    count(db.from("route_template_points").select("template_id", head).eq("tenant_id", t)),
    count(db.from("driver_pay_rules").select("id", head).eq("tenant_id", t)),
    count(db.from("orders").select("id", head).eq("tenant_id", t)),
    count(db.from("routes").select("id", head).eq("tenant_id", t)),
    count(db.from("point_types").select("id", head).eq("tenant_id", t)),
    count(db.from("delivery_point_exceptions").select("id", head).eq("tenant_id", t).is("delivery_point_id", null)),
    count(db.from("products").select("id", head).eq("tenant_id", t)),
    count(db.from("carriers").select("id", head).eq("tenant_id", t)),
    count(db.from("memberships").select("user_id", head).eq("tenant_id", t)),
    count(db.from("tenant_api_keys").select("id", head).eq("tenant_id", t).is("revoked_at", null)),
  ]);
  const steps = onboardingSteps({
    customers,
    points,
    vehicles,
    drivers,
    driversWithPin,
    packagingTypes,
    templates,
    templatePoints,
    payRules,
    orders,
    routes,
    pointTypes,
    closures,
    products,
    carriers,
    members,
    apiKeys,
  });
  const p = onboardingProgress(steps);

  return (
    <>
      <PageHeader
        title="Pierwsze kroki"
        description="Uruchomienie firmy w jeden dzień: od kartoteki klientów do pierwszego dnia na trasach. Każdy krok możesz wrócić i poprawić."
      />
      <Panel className="mb-6 max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            Gotowe <b className="tabular-nums">{p.done}</b> z {p.total} kroków
          </p>
          {p.next && (
            <Link href={p.next.href} className={buttonVariants({ size: "sm" })}>
              Następny krok: {p.next.title}
            </Link>
          )}
        </div>
        <Meter pct={p.pct} tone="success" className="mt-3" />
      </Panel>
      <ol className="flex max-w-3xl flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.key}>
            <div
              className={cn(
                "rounded-[var(--radius-panel)] border px-5 py-4 shadow-[var(--shadow-panel)]",
                s.done ? "border-success/50 bg-success/5" : p.next?.key === s.key ? "border-primary bg-surface" : "border-border bg-surface",
              )}
            >
              <div className="flex items-start gap-4">
                {s.done ? (
                  <CircleCheck className="mt-0.5 size-6 shrink-0 text-success" />
                ) : (
                  <Circle className="mt-0.5 size-6 shrink-0 text-subtle" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {i + 1}. {s.title}
                    {s.optional && <Pill dot={false}>opcjonalnie</Pill>}
                    {s.done && <Pill tone="success">gotowe</Pill>}
                  </p>
                  <p className={cn("text-sm", s.done ? "font-medium text-success" : "text-muted")}>{s.detail}</p>
                  {!s.done && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
                      {s.todo.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <Link href={s.href} className={buttonVariants({ size: "sm", variant: s.done ? "outline" : "primary" })}>
                  {s.done ? "Popraw" : "Zrób to"}
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
