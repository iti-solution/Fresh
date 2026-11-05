import type { Metadata } from "next";
import Link from "next/link";
import { FormRenderer } from "@/components/forms/form-renderer";
import { EmptyState, PageHeader, Panel, Segmented, StatTile } from "@/components/panel/page";
import { Pill } from "@/components/ui/status";
import { formatPln } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { todayInWarsaw } from "@/modules/orders/domain/orders";
import { PACKAGING_REASONS } from "@/modules/packaging/domain/ledger";
import { addCashCorrection, addPackagingCorrection } from "@/modules/packaging/server/actions";
import { getCustomerHistory, getCustomerPackaging, getDriverBalances } from "@/modules/packaging/server/queries";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Opakowania" };

const VIEWS = [
  { key: "", label: "Salda klientów" },
  { key: "kierowcy", label: "Różnice u kierowców" },
  { key: "historia", label: "Historia klienta" },
] as const;

export default async function PackagingPage({ searchParams }: PageProps<"/opakowania">) {
  const ctx = await requireAccess("/opakowania");
  const sp = await searchParams;
  const view = typeof sp.widok === "string" ? sp.widok : "";
  const customerId = typeof sp.klient === "string" ? sp.klient : "";
  const today = todayInWarsaw();
  const editable = canEdit(ctx.role);
  const db = await createClient();
  const [{ types, rows }, drivers, { data: customers }, { data: driverList }] = await Promise.all([
    getCustomerPackaging(ctx.tenantId, today),
    getDriverBalances(ctx.tenantId),
    db.from("customers").select("id, name, external_code").eq("tenant_id", ctx.tenantId).order("name"),
    db.from("drivers").select("id, first_name, last_name").eq("tenant_id", ctx.tenantId).order("last_name"),
  ]);
  const history = view === "historia" && customerId ? await getCustomerHistory(ctx.tenantId, customerId) : [];
  const totals = types.map((t) => ({
    ...t,
    atCustomers: rows.reduce((a, r) => a + Math.max(0, r.byType[t.id]?.balance ?? 0), 0),
    overdue: rows.reduce((a, r) => a + (r.byType[t.id]?.overdue ?? 0), 0),
  }));
  const deposit = rows.reduce((a, r) => a + r.depositGrosze, 0);

  return (
    <>
      <PageHeader
        title="Opakowania i gotówka"
        description="Księga opakowań: wydania i zwroty z punktów, zdanie do magazynu przy zamknięciu trasy, korekty z powodem. Zalegające = u klienta dłużej niż 30 dni."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {totals.slice(0, 3).map((t) => (
          <StatTile key={t.id} label={`${t.name} u klientów`} value={t.atCustomers.toLocaleString("pl-PL")} sub={t.overdue ? `${t.overdue} zalega > 30 dni` : "nic nie zalega"} tone={t.overdue ? "warning" : undefined} />
        ))}
        <StatTile label="Kaucja u klientów" value={formatPln(deposit)} sub={`${rows.length} klientów z saldem`} />
      </div>
      <Segmented
        className="mb-4"
        items={VIEWS.map((v) => ({
          href: `/opakowania${v.key ? `?widok=${v.key}` : ""}`,
          label: v.label,
          active: view === v.key,
          count: v.key === "" ? rows.length : v.key === "kierowcy" ? drivers.length : undefined,
        }))}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {view === "" && (
            <Panel flush>
              {rows.length === 0 ? (
                <EmptyState title="Brak opakowań u klientów">Salda pojawią się, gdy kierowcy zaczną wpisywać wydania i zwroty.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-left text-xs text-muted">
                      <tr>
                        <th className="px-4 py-2 font-medium">Klient</th>
                        {types.map((t) => (
                          <th key={t.id} className="px-3 py-2 text-right font-medium">
                            {t.name}
                          </th>
                        ))}
                        <th className="px-4 py-2 text-right font-medium">Kaucja</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.customerId} className="border-t border-border hover:bg-surface-2">
                          <td className="px-4 py-2">
                            <Link href={`/opakowania?widok=historia&klient=${r.customerId}`} className="font-medium hover:text-primary-strong hover:underline">
                              {r.customer}
                            </Link>
                            {r.code && <span className="ml-1 text-xs text-muted">{r.code}</span>}
                          </td>
                          {types.map((t) => {
                            const b = r.byType[t.id];
                            return (
                              <td key={t.id} className="px-3 py-2 text-right tabular-nums">
                                <span className={cn(b?.balance && b.balance < 0 && "text-danger")}>{b?.balance ?? 0}</span>
                                {b?.overdue ? (
                                  <span className="block text-[11px] text-warning" title={`najstarsze od ${b.oldest}`}>
                                    {b.overdue} &gt; 30 dni
                                  </span>
                                ) : null}
                              </td>
                            );
                          })}
                          <td className="px-4 py-2 text-right tabular-nums">{r.depositGrosze ? formatPln(r.depositGrosze) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {view === "kierowcy" && (
            <Panel title="Kierowcy z niezdanymi opakowaniami lub gotówką" description="Po zamknięciu trasy saldo kierowcy powinno wynosić zero. Dodatnie = ma u siebie, ujemne = oddał więcej niż zebrał." flush>
              {drivers.length === 0 ? (
                <EmptyState title="Brak różnic">Wszyscy kierowcy rozliczeni.</EmptyState>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {drivers.map((d) => (
                    <li key={d.driverId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                      <span className="font-medium">{d.name}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {d.packaging
                          .filter((p) => p.balance)
                          .map((p) => (
                            <Pill key={p.typeId} tone={p.balance > 0 ? "warning" : "danger"}>
                              {p.name}: {p.balance > 0 ? "+" : ""}
                              {p.balance}
                            </Pill>
                          ))}
                        {d.cashGrosze !== 0 && <Pill tone={d.cashGrosze > 0 ? "warning" : "danger"}>gotówka {formatPln(d.cashGrosze)}</Pill>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {view === "historia" && (
            <Panel
              title="Historia ruchów klienta"
              actions={
                <form className="flex gap-2" action="/opakowania">
                  <input type="hidden" name="widok" value="historia" />
                  <select name="klient" defaultValue={customerId} className="h-8 max-w-64 rounded-md border border-border-strong bg-surface px-2 text-sm">
                    <option value="">— wybierz klienta —</option>
                    {(customers ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.external_code ? `${c.external_code} · ` : ""}
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button className="h-8 rounded-md border border-border-strong px-3 text-sm">Pokaż</button>
                </form>
              }
              flush
            >
              {!customerId ? (
                <p className="px-5 py-4 text-sm text-muted">Wybierz klienta.</p>
              ) : history.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">Brak ruchów.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Kiedy</th>
                      <th className="px-4 py-2 font-medium">Opakowanie</th>
                      <th className="px-4 py-2 text-right font-medium">Ilość</th>
                      <th className="px-4 py-2 font-medium">Rodzaj</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-4 py-2 tabular-nums">{new Date(m.created_at).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="px-4 py-2">{m.packaging_types?.name}</td>
                        <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", m.qty > 0 ? "text-warning" : "text-success")}>
                          {m.qty > 0 ? "+" : ""}
                          {m.qty}
                        </td>
                        <td className="px-4 py-2">
                          {PACKAGING_REASONS[m.reason] ?? m.reason}
                          {m.route_stops?.routes && <span className="text-xs text-muted"> · {m.route_stops.routes.name}</span>}
                          {m.note && <span className="block text-xs text-muted">{m.note}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}
        </div>

        {editable && (
          <div className="flex flex-col gap-6">
            <FormRenderer
              action={addPackagingCorrection}
              submitLabel="Zapisz korektę"
              sections={[
                {
                  title: "Korekta opakowań",
                  description: "Np. inwentaryzacja u klienta albo uszkodzone skrzynki. Ilość dodatnia zwiększa saldo strony.",
                  fields: [
                    { kind: "select", name: "party_type", label: "Kogo dotyczy", defaultValue: "customer", options: [{ value: "customer", label: "Klient" }, { value: "driver", label: "Kierowca" }], span: 3 },
                    {
                      kind: "select",
                      name: "party_id",
                      label: "Klient albo kierowca",
                      emptyLabel: "— wybierz —",
                      options: [
                        ...(customers ?? []).map((c) => ({ value: c.id, label: `Klient: ${c.name}` })),
                        ...(driverList ?? []).map((d) => ({ value: d.id, label: `Kierowca: ${d.first_name} ${d.last_name}` })),
                      ],
                      span: 3,
                    },
                    { kind: "select", name: "packaging_type_id", label: "Opakowanie", options: types.map((t) => ({ value: t.id, label: t.name })), span: 2 },
                    { kind: "number", name: "qty", label: "Ilość (±)" },
                    {
                      kind: "select",
                      name: "reason",
                      label: "Powód",
                      defaultValue: "inventory",
                      options: [
                        { value: "inventory", label: "inwentaryzacja" },
                        { value: "damage", label: "uszkodzenie" },
                        { value: "correction", label: "inna korekta" },
                      ],
                      span: 3,
                    },
                    { kind: "text", name: "note", label: "Opis", span: 3 },
                  ],
                },
              ]}
            />
            <FormRenderer
              action={addCashCorrection}
              submitLabel="Zapisz korektę gotówki"
              sections={[
                {
                  title: "Korekta gotówki kierowcy",
                  description: "Wyjaśniona różnica kasowa. Ujemna kwota zmniejsza saldo kierowcy.",
                  fields: [
                    { kind: "select", name: "driver_id", label: "Kierowca", emptyLabel: "— wybierz —", options: (driverList ?? []).map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` })), span: 3 },
                    { kind: "text", name: "amount", label: "Kwota (zł)", placeholder: "np. -40,50" },
                    { kind: "text", name: "note", label: "Opis", span: 2 },
                  ],
                },
              ]}
            />
          </div>
        )}
      </div>
    </>
  );
}
