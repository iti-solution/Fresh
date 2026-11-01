import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/panel/page";
import { Pill, type Tone } from "@/components/ui/status";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { unitLabel } from "@/modules/portal/domain/portal";
import type { Channel } from "@/modules/intake/domain/intake";
import { highlight } from "@/modules/intake/domain/parse";
import { approveDraft, rejectDraft } from "@/modules/intake/server/actions";
import { getCatalogForReview, getCustomersWithPoints, getDraft } from "@/modules/intake/server/queries";
import { DraftReview } from "@/modules/intake/ui/draft-review";
import { canReviewIntake } from "@/modules/tenancy/domain/access";
import { adminKeyProblem, createAdminClient } from "@/lib/supabase/admin";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Sprawdź zamówienie" };

const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  accepted: { label: "trafione", tone: "success" },
  corrected: { label: "poprawione", tone: "warning" },
  added: { label: "dodane przez człowieka", tone: "info" },
  removed: { label: "usunięte", tone: "neutral" },
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default async function DraftPage({ params }: PageProps<"/do-sprawdzenia/[id]">) {
  const ctx = await requireAccess("/do-sprawdzenia");
  const { id } = await params;
  const [draft, products, customers] = await Promise.all([
    getDraft(ctx.tenantId, id),
    getCatalogForReview(ctx.tenantId),
    getCustomersWithPoints(ctx.tenantId),
  ]);
  if (!draft || !draft.inbound_messages) notFound();
  const msg = draft.inbound_messages;
  // Nagranie klienta: podpisany link na godzinę (bucket prywatny, czyta tylko serwer)
  let audioUrl: string | null = null;
  if (msg.audio_path && !adminKeyProblem()) {
    const { data } = await createAdminClient().storage.from("order-audio").createSignedUrl(msg.audio_path, 3600);
    audioUrl = data?.signedUrl ?? null;
  }
  const back = (
    <nav className="mb-3 text-sm">
      <Link href="/do-sprawdzenia" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
        ‹ Do sprawdzenia
      </Link>
    </nav>
  );

  // Już sprawdzone (albo brak uprawnień): podgląd decyzji człowieka
  if (draft.status !== "needs_review" || !canReviewIntake(ctx.role)) {
    const name = new Map(products.map((p) => [p.id, p]));
    const parts = highlight(
      msg.body,
      draft.order_draft_lines
        .filter((l) => l.span_start !== null && l.span_end !== null)
        .map((l) => ({ start: l.span_start!, end: l.span_end!, key: l.id })),
    );
    return (
      <>
        {back}
        <h1 className="mb-1 text-[26px] font-semibold leading-tight tracking-[-0.015em]">
          {draft.customers?.name ?? msg.sender ?? "Wiadomość"}
        </h1>
        <p className="mb-5 text-sm text-muted">
          {draft.status === "approved" ? "Zatwierdzone" : draft.status === "rejected" ? "Odrzucone" : "Czeka na sprawdzenie"}
          {draft.reviewed_at && ` ${fmt(draft.reviewed_at)}`}
          {draft.orders?.external_ref && ` · zamówienie ${draft.orders.external_ref}`}
          {draft.delivery_date && ` · dostawa ${formatDayLabel(draft.delivery_date)}`} · {draft.parser}
        </p>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Panel title="Wiadomość">
            {audioUrl && <audio src={audioUrl} controls preload="metadata" className="mb-3 h-10 w-full" />}
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {parts.map((p, i) => (p.key ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
            </p>
          </Panel>
          <Panel title="Propozycja automatu → decyzja człowieka" flush>
            <table className="w-full text-sm">
              <tbody>
                {draft.order_draft_lines.map((l) => {
                  const o = OUTCOME[l.outcome ?? ""] ?? { label: "—", tone: "neutral" as Tone };
                  const prop = l.proposed_product_id ? name.get(l.proposed_product_id) : null;
                  const fin = l.final_product_id ? name.get(l.final_product_id) : null;
                  return (
                    <tr key={l.id} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-2.5">
                        {l.phrase && <p className="text-xs text-muted">„{l.phrase}”</p>}
                        <p className={l.outcome === "removed" ? "text-muted line-through" : undefined}>
                          {prop
                            ? `${prop.name} × ${Number(l.proposed_qty)} ${unitLabel(prop.unit)}`
                            : l.phrase
                              ? "nie rozpoznano"
                              : "—"}
                        </p>
                        {l.outcome === "corrected" || l.outcome === "added" ? (
                          <p className="font-medium">
                            → {fin?.name} × {Number(l.final_qty)} {fin ? unitLabel(fin.unit) : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Pill tone={o.tone}>{o.label}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </div>
      </>
    );
  }

  return (
    <>
      {back}
      <h1 className="mb-1 text-[26px] font-semibold leading-tight tracking-[-0.015em]">Sprawdź zamówienie</h1>
      <p className="mb-5 text-sm text-muted">
        Porównaj z wiadomością, popraw co trzeba i wprowadź. Najedź na pozycję, żeby zobaczyć jej fragment w tekście.
      </p>
      <DraftReview
        approve={approveDraft.bind(null, draft.id)}
        reject={rejectDraft.bind(null, draft.id)}
        message={{
          channel: msg.channel as Channel,
          sender: msg.sender,
          body: msg.body,
          received: fmt(msg.received_at),
          audioUrl,
        }}
        senderLabel={draft.customers?.name ?? msg.sender ?? "Nieznany nadawca"}
        parser={draft.parser}
        lines={draft.order_draft_lines.filter((l) => l.outcome === null && l.line_no < 1000)}
        products={products}
        customers={customers}
        initialPointId={draft.delivery_point_id}
        initialDate={draft.delivery_date ?? ""}
        initialNote={draft.note}
      />
    </>
  );
}
