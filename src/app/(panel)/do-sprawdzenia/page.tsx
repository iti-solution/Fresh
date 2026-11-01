import { CheckCircle2, ChevronRight, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice, PageHeader, Panel, StatTile } from "@/components/panel/page";
import { Pill } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { CHANNEL_LABELS, confidenceTone, type Channel } from "@/modules/intake/domain/intake";
import { getAccuracy, getReviewQueue } from "@/modules/intake/server/queries";
import { NewMessageForm } from "@/modules/intake/ui/new-message-form";
import { canReviewIntake } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Do sprawdzenia" };

const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pl-PL", {
        timeZone: "Europe/Warsaw",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pl-PL")}%`);

export default async function ReviewQueuePage({ searchParams }: PageProps<"/do-sprawdzenia">) {
  const ctx = await requireAccess("/do-sprawdzenia");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ pending, done }, acc, { data: customers }] = await Promise.all([
    getReviewQueue(ctx.tenantId),
    getAccuracy(ctx.tenantId),
    supabase.from("customers").select("id, name").eq("tenant_id", ctx.tenantId).eq("is_active", true).order("name"),
  ]);
  const t = acc.total;
  const editable = canReviewIntake(ctx.role);

  return (
    <>
      <PageHeader
        title="Do sprawdzenia"
        description="Klienci piszą albo nagrywają zamówienia w portalu (lub przysyłają SMS-y i e-maile). Automat zamienia je na pozycje, a BOK sprawdza kompletność i zatwierdza — z tych decyzji liczymy skuteczność."
      />
      {sp.zatwierdzono && <Notice>Zamówienie wprowadzone. Poprawki zapisane do słownika klienta.</Notice>}
      {sp.odrzucono && <Notice tone="info">Wiadomość odrzucona — nie trafi do zamówień.</Notice>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Czeka na sprawdzenie"
          value={pending.length}
          tone={pending.length ? "warning" : "success"}
          icon={<Inbox />}
        />
        <StatTile
          label="Zamówienia bez poprawek"
          value={pct(t.orderRate)}
          sub={t.orders ? `${t.ordersExact} z ${t.orders} · 30 dni` : "jeszcze brak danych"}
          tone={t.orderRate === null ? undefined : t.orderRate >= 80 ? "success" : t.orderRate >= 50 ? "warning" : "danger"}
          icon={<CheckCircle2 />}
        />
        <StatTile
          label="Pozycje trafione"
          value={pct(t.lineRate)}
          sub={t.lines + t.linesRemoved ? `${t.linesAccepted} z ${t.lines + t.linesRemoved} pozycji` : "jeszcze brak danych"}
        />
        <StatTile
          label="Poprawki człowieka"
          value={t.linesCorrected + t.linesAdded + t.linesRemoved}
          sub={`${t.linesCorrected} zmienione · ${t.linesAdded} dodane · ${t.linesRemoved} usunięte`}
        />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <Panel title={`Czeka na sprawdzenie (${pending.length})`} flush>
            {pending.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="Wszystko sprawdzone">
                Wklej wiadomość od klienta po prawej — automat odczyta zamówienie, a Ty je zatwierdzisz.
              </EmptyState>
            ) : (
              <ul>
                {pending.map((d) => {
                  const minConf = Math.min(...d.order_draft_lines.map((l) => Number(l.confidence ?? 0)), 1);
                  const unknown = d.order_draft_lines.filter((l) => !l.proposed_product_id).length;
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/do-sprawdzenia/${d.id}`}
                        className="flex items-center gap-4 border-b border-border px-5 py-3 last:border-0 hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {d.customers?.name ?? d.inbound_messages?.sender ?? "Nieznany nadawca"}
                            </span>
                            <span className="text-xs text-muted">
                              {CHANNEL_LABELS[(d.inbound_messages?.channel ?? "other") as Channel]}
                              {d.inbound_messages?.audio_path ? " · nagranie" : ""} · {fmt(d.created_at)}
                            </span>
                          </span>
                          <span className="block truncate text-sm text-muted">{d.inbound_messages?.body}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Pill tone="neutral" dot={false}>
                            {d.order_draft_lines.length} poz.
                          </Pill>
                          {unknown > 0 ? (
                            <Pill tone="danger">{unknown} do wyboru</Pill>
                          ) : (
                            <Pill tone={confidenceTone(d.order_draft_lines.length ? minConf : 0)}>
                              {d.order_draft_lines.length ? `min. ${Math.round(minConf * 100)}%` : "brak pozycji"}
                            </Pill>
                          )}
                          <ChevronRight className="size-4 text-subtle" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {done.length > 0 && (
            <Panel title="Ostatnio sprawdzone" flush>
              <ul>
                {done.map((d) => {
                  const lines = d.order_draft_lines;
                  const exact = d.status === "approved" && lines.every((l) => l.outcome === "accepted");
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/do-sprawdzenia/${d.id}`}
                        className="flex items-center gap-4 border-b border-border px-5 py-2.5 last:border-0 hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          <span className="font-medium">{d.customers?.name ?? "—"}</span>
                          <span className="text-muted"> · {fmt(d.reviewed_at)}</span>
                        </span>
                        {d.status === "rejected" ? (
                          <Pill tone="neutral">odrzucone</Pill>
                        ) : exact ? (
                          <Pill tone="success">bez poprawek</Pill>
                        ) : (
                          <Pill tone="warning">
                            poprawione {lines.filter((l) => l.outcome && l.outcome !== "accepted").length}/{lines.length}
                          </Pill>
                        )}
                        {d.orders?.external_ref && <span className="font-mono text-xs text-muted">{d.orders.external_ref}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {acc.byParser.length > 1 && (
            <Panel title="Skuteczność według wersji rozpoznawania" description="Ostatnie 30 dni">
              <ul className="space-y-1 text-sm">
                {acc.byParser.map((p) => (
                  <li key={p.parser} className="flex justify-between gap-4">
                    <span className="font-mono text-xs">{p.parser}</span>
                    <span className="tabular-nums">
                      {pct(p.acc.orderRate)} zamówień bez poprawek · {pct(p.acc.lineRate)} pozycji
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {editable && (
          <div className="min-w-0 flex-[1_1_360px]">
            <Panel
              title="Wiadomość spoza portalu"
              description="Klient zadzwonił albo wysłał SMS? Wklej treść lub notatkę z rozmowy"
            >
              <NewMessageForm customers={customers ?? []} />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
