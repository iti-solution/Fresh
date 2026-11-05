import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { FormRenderer } from "@/components/forms/form-renderer";
import { Notice, PageHeader, Panel } from "@/components/panel/page";
import { Plate } from "@/components/ui/status";
import { formatPln, toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { closeChecklist, type CloseInput } from "@/modules/packaging/domain/ledger";
import { closeRoute } from "@/modules/packaging/server/actions";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Zamknięcie trasy" };

export default async function CloseRoutePage({ params, searchParams }: PageProps<"/rozliczenia/zamkniecie/[routeId]">) {
  const ctx = await requireAccess("/rozliczenia");
  const { routeId } = await params;
  const sp = await searchParams;
  const db = await createClient();
  const { data: r } = await db
    .from("routes")
    .select(
      "id, name, route_date, status, odometer_start, odometer_end, close_report, closed_at, drivers(first_name, last_name), vehicles(registration), route_stops(id, status)",
    )
    .eq("id", routeId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!r) notFound();
  const stopIds = r.route_stops.map((s) => s.id);
  const ids = stopIds.length ? stopIds : ["00000000-0000-0000-0000-000000000000"];
  const [{ data: types }, { data: pack }, { data: cash }] = await Promise.all([
    db.from("packaging_types").select("id, name").eq("tenant_id", ctx.tenantId).eq("is_active", true).order("code"),
    db.from("packaging_movements").select("packaging_type_id, qty, reason").eq("party_type", "driver").in("stop_id", ids),
    db.from("cash_movements").select("amount, reason").eq("party_type", "driver").eq("route_id", routeId),
  ]);
  const input: CloseInput = {
    status: r.status,
    openStops: r.route_stops.filter((s) => ["pending", "arrived", "in_progress"].includes(s.status)).length,
    odometerStart: r.odometer_start,
    odometerEnd: r.odometer_end,
    packaging: (types ?? []).map((t) => {
      const mv = (pack ?? []).filter((m) => m.packaging_type_id === t.id);
      return {
        typeId: t.id,
        name: t.name,
        issued: -mv.filter((m) => m.reason === "issue").reduce((a, m) => a + m.qty, 0),
        collected: mv.filter((m) => m.reason === "return").reduce((a, m) => a + m.qty, 0),
      };
    }),
    cashCollectedGrosze: (cash ?? []).filter((c) => c.reason === "cod_collected").reduce((a, c) => a + toGrosze(c.amount), 0),
  };
  const checks = closeChecklist(input);
  const closed = r.status === "closed";
  const report = (r.close_report ?? {}) as {
    cash_received?: number;
    packaging?: { type_id: string; received: number }[];
    note?: string | null;
  };
  const editable = canEdit(ctx.role) && (r.status === "completed" || r.status === "in_progress");

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href={`/centrum?dzien=${r.route_date}`} className="text-muted hover:text-foreground">
          ‹ Centrum operacyjne
        </Link>
      </nav>
      <PageHeader
        title={`Zamknięcie trasy: ${r.name}`}
        description={
          <>
            <span className="capitalize">{formatDayLabel(r.route_date)}</span> ·{" "}
            {r.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : "bez kierowcy"}{" "}
            {r.vehicles && <Plate>{r.vehicles.registration}</Plate>}
          </>
        }
      />
      {sp.zamknieto && (
        <Notice>Trasa zamknięta. Ruchy opakowań i gotówki zapisane, wynagrodzenie dnia doliczone do rozliczenia miesiąca.</Notice>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel title="Checklista" flush>
          <ul className="divide-y divide-border">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-3 px-5 py-3 text-sm">
                {c.ok ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                )}
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className={cn("block", c.ok ? "text-muted" : "text-warning")}>{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {closed ? (
          <Panel title="Przyjęto przy zamknięciu">
            <dl className="grid grid-cols-[180px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted">Zamknięto</dt>
              <dd>{r.closed_at ? new Date(r.closed_at).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—"}</dd>
              <dt className="text-muted">Gotówka przyjęta</dt>
              <dd>
                {formatPln(toGrosze(report.cash_received ?? 0))}{" "}
                {toGrosze(report.cash_received ?? 0) !== input.cashCollectedGrosze && (
                  <span className="text-danger">
                    (pobrano {formatPln(input.cashCollectedGrosze)} — różnica{" "}
                    {formatPln(toGrosze(report.cash_received ?? 0) - input.cashCollectedGrosze)})
                  </span>
                )}
              </dd>
              {input.packaging.map((p) => {
                const got = report.packaging?.find((x) => x.type_id === p.typeId)?.received ?? 0;
                return (
                  <div key={p.typeId} className="contents">
                    <dt className="text-muted">{p.name}</dt>
                    <dd>
                      zdano {got} z {p.collected} zebranych{" "}
                      {got !== p.collected && <span className="text-danger">(różnica {got - p.collected})</span>}
                    </dd>
                  </div>
                );
              })}
              {report.note && (
                <>
                  <dt className="text-muted">Uwagi</dt>
                  <dd>{report.note}</dd>
                </>
              )}
            </dl>
          </Panel>
        ) : editable ? (
          <FormRenderer
            action={closeRoute.bind(null, routeId)}
            submitLabel="Zamknij trasę"
            sections={[
              ...(r.status === "in_progress"
                ? [
                    {
                      title: "Licznik",
                      description:
                        "Kierowca nie zakończył zmiany w aplikacji. Wpisz stan licznika — niepotwierdzone punkty zostaną oznaczone jako pominięte.",
                      fields: [
                        {
                          kind: "number" as const,
                          name: "odometer_end",
                          label: "Stan licznika na koniec",
                          suffix: "km",
                          hint: `start: ${r.odometer_start ?? "—"} km`,
                        },
                      ],
                    },
                  ]
                : []),
              {
                title: "Opakowania zdane do magazynu",
                description:
                  "Policz, ile kierowca oddał. Domyślnie wpisane jest to, co zebrał od klientów — różnica trafi do raportu.",
                fields: input.packaging.map((p) => ({
                  kind: "number" as const,
                  name: `recv_${p.typeId}`,
                  label: p.name,
                  defaultValue: p.collected,
                  suffix: "szt.",
                  hint: `zebrano ${p.collected}, wydano ${p.issued}`,
                })),
              },
              {
                title: "Gotówka",
                fields: [
                  {
                    kind: "text",
                    name: "cash_received",
                    label: "Przyjęto w kasie (zł)",
                    defaultValue: input.cashCollectedGrosze ? (input.cashCollectedGrosze / 100).toFixed(2).replace(".", ",") : "",
                    hint: `kierowca pobrał ${formatPln(input.cashCollectedGrosze)}`,
                  },
                  { kind: "textarea", name: "note", label: "Uwagi (np. wyjaśnienie różnicy)", span: 2 },
                ],
              },
            ]}
          />
        ) : (
          <Panel>
            <p className="text-sm text-muted">
              {r.status === "planned" || r.status === "draft" || r.status === "dispatched"
                ? "Trasa jeszcze się nie zaczęła."
                : "Masz dostęp tylko do podglądu."}
            </p>
          </Panel>
        )}
      </div>
    </>
  );
}
