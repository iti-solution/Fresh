"use client";

import { Mail, MessageCircle, MessageSquare, Mic, Phone, Plus, Sparkles, Trash2, Image as ImageIcon, Inbox } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/primitives";
import { Pill } from "@/components/ui/status";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { unitLabel } from "@/modules/portal/domain/portal";
import { CHANNEL_LABELS, confidenceTone, type Channel } from "../domain/intake";
import { highlight } from "../domain/parse";

export type ReviewProduct = {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  unit: string;
  pack_label: string | null;
  is_active: boolean;
};
export type ReviewCustomer = { id: string; name: string; points: { id: string; name: string; city: string | null }[] };
export type ReviewLine = {
  id: string;
  phrase: string | null;
  span_start: number | null;
  span_end: number | null;
  proposed_product_id: string | null;
  proposed_qty: number | string | null;
  confidence: number | string | null;
};

type EditLine = {
  key: string;
  draftLineId: string | null;
  phrase: string | null;
  productId: string;
  qty: string;
  confidence: number | null;
};

const CHANNEL_ICONS: Record<Channel, typeof Mail> = {
  sms: MessageSquare,
  email: Mail,
  whatsapp: MessageCircle,
  phone: Phone,
  voice: Mic,
  photo: ImageIcon,
  other: Inbox,
};

const TONE_UNDERLINE = { success: "decoration-success", warning: "decoration-warning", danger: "decoration-danger" } as const;

function fmtQty(v: number | string | null): string {
  if (v === null || v === "") return "";
  return Number(v).toLocaleString("pl-PL", { maximumFractionDigits: 3, useGrouping: false });
}

let nextKey = 0;

export function DraftReview({
  approve,
  reject,
  message,
  senderLabel,
  parser,
  lines: initialLines,
  products,
  customers,
  initialPointId,
  initialDate,
  initialNote,
}: {
  approve: (state: FormState, fd: FormData) => Promise<FormState>;
  reject: () => Promise<void>;
  message: { channel: Channel; sender: string | null; body: string; received: string };
  senderLabel: string;
  parser: string;
  lines: ReviewLine[];
  products: ReviewProduct[];
  customers: ReviewCustomer[];
  initialPointId: string | null;
  initialDate: string;
  initialNote: string | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(approve, {});
  const [pointId, setPointId] = useState(initialPointId ?? "");
  const [active, setActive] = useState<string | null>(null);
  const [lines, setLines] = useState<EditLine[]>(() =>
    initialLines.map((l) => ({
      key: l.id,
      draftLineId: l.id,
      phrase: l.phrase,
      productId: l.proposed_product_id ?? "",
      qty: fmtQty(l.proposed_qty),
      confidence: l.confidence === null ? null : Number(l.confidence),
    })),
  );

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const groups = useMemo(() => {
    const m = new Map<string, ReviewProduct[]>();
    for (const p of products) {
      const k = p.category ?? "Inne";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [products]);
  const proposal = useMemo(() => new Map(initialLines.map((l) => [l.id, l])), [initialLines]);

  const parts = highlight(
    message.body,
    initialLines
      .filter((l) => l.span_start !== null && l.span_end !== null)
      .map((l) => ({ start: l.span_start!, end: l.span_end!, key: l.id })),
  );
  const toneByLine = new Map(initialLines.map((l) => [l.id, confidenceTone(l.confidence === null ? 0 : Number(l.confidence))]));

  const payload = JSON.stringify(
    lines
      .filter((l) => l.productId || l.qty)
      .map((l) => ({ product_id: l.productId, qty: Number(l.qty.replace(",", ".")), draft_line_id: l.draftLineId })),
  );
  const Icon = CHANNEL_ICONS[message.channel] ?? Inbox;
  const isAi = parser.startsWith("claude");

  function update(key: string, patch: Partial<EditLine>) {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  return (
    <form action={formAction} className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <input type="hidden" name="lines" value={payload} />

      {/* WIADOMOŚĆ — jak karta „AI Order” u Fresho */}
      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)] lg:sticky lg:top-20">
        <header className="flex items-center gap-3 bg-ink px-4 py-3 text-ink-foreground">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Icon className="size-4 text-white" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate font-semibold text-white">{senderLabel}</span>
            <span className="block truncate text-xs text-ink-muted">
              {CHANNEL_LABELS[message.channel]}
              {message.sender && ` · ${message.sender}`} · {message.received}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
            <Sparkles className="size-3.5" /> {isAi ? "Odczytane przez AI" : "Odczytane automatycznie"}
          </span>
        </header>
        <p className="whitespace-pre-wrap px-5 py-4 text-[15px] leading-relaxed">
          {parts.map((p, i) =>
            p.key ? (
              <strong
                key={i}
                onMouseEnter={() => setActive(p.key!)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  "cursor-default rounded-sm font-semibold underline decoration-2 underline-offset-4 transition-colors",
                  TONE_UNDERLINE[toneByLine.get(p.key) ?? "danger"],
                  active === p.key && "bg-accent",
                )}
              >
                {p.text}
              </strong>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-2 px-5 py-2.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-success" /> pewne
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-warning" /> sprawdź
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-danger" /> nie wiem
          </span>
        </footer>
      </section>

      {/* ZAMÓWIENIE DO ZATWIERDZENIA */}
      <section className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-panel)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium">Klient i oddział</span>
            <select
              name="delivery_point_id"
              value={pointId}
              onChange={(e) => setPointId(e.target.value)}
              aria-invalid={!pointId && Boolean(state.message)}
              className={inputClass}
            >
              <option value="">— wybierz —</option>
              {customers.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.points.map((p) => (
                    <option key={p.id} value={p.id}>
                      {c.name} — {p.name}
                      {p.city ? ` (${p.city})` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Dzień dostawy</span>
            <input type="date" name="delivery_date" defaultValue={initialDate} className={inputClass} />
          </label>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_112px_88px_36px] gap-2 border-b border-border bg-surface-2 px-3 py-2 text-xs font-medium text-muted">
            <span>Produkt</span>
            <span>Ilość</span>
            <span>Pewność</span>
            <span className="sr-only">Usuń</span>
          </div>
          {lines.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted">Automat nic nie rozpoznał — dodaj pozycje ręcznie.</p>
          )}
          {lines.map((l) => {
            const p = byId.get(l.productId);
            const prop = l.draftLineId ? proposal.get(l.draftLineId) : undefined;
            const changed =
              prop &&
              (l.productId !== (prop.proposed_product_id ?? "") ||
                Number(l.qty.replace(",", ".")) !== Number(prop.proposed_qty ?? NaN));
            const tone = l.confidence === null ? null : confidenceTone(l.confidence);
            return (
              <div
                key={l.key}
                onMouseEnter={() => l.draftLineId && setActive(l.draftLineId)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_112px_88px_36px] items-center gap-2 border-b border-border px-3 py-2 last:border-0",
                  active && active === l.draftLineId && "bg-accent/50",
                )}
              >
                <div className="min-w-0">
                  {l.phrase && <p className="mb-1 truncate text-xs text-muted">„{l.phrase}”</p>}
                  <select
                    value={l.productId}
                    onChange={(e) => update(l.key, { productId: e.target.value })}
                    aria-label="Produkt"
                    aria-invalid={!l.productId}
                    className={cn(inputClass, "h-9")}
                  >
                    <option value="">— wybierz produkt —</option>
                    {groups.map(([cat, items]) => (
                      <optgroup key={cat} label={cat}>
                        {items.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                            {x.pack_label ? ` · ${x.pack_label}` : ""}
                            {x.is_active ? "" : " (wycofany)"}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 self-end">
                  <input
                    inputMode="decimal"
                    value={l.qty}
                    onChange={(e) => update(l.key, { qty: e.target.value })}
                    aria-label="Ilość"
                    className={cn(inputClass, "h-9 w-16 px-2 text-right tabular-nums")}
                  />
                  <span className="text-xs text-muted">{p ? unitLabel(p.unit) : ""}</span>
                </div>
                <div className="self-end pb-1.5">
                  {changed ? (
                    <Pill tone="info">poprawione</Pill>
                  ) : tone ? (
                    <Pill tone={tone}>{Math.round((l.confidence ?? 0) * 100)}%</Pill>
                  ) : (
                    <Pill tone="info">dodane</Pill>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                  className="flex h-9 w-9 items-center justify-center self-end rounded-md text-subtle hover:bg-danger-soft hover:text-danger"
                  aria-label="Usuń pozycję"
                  title="Usuń pozycję"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setLines((cur) => [
                ...cur,
                { key: `new-${nextKey++}`, draftLineId: null, phrase: null, productId: "", qty: "1", confidence: null },
              ])
            }
          >
            <Plus /> Dodaj pozycję
          </Button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Uwagi do dostawy</span>
          <textarea
            name="note"
            defaultValue={initialNote ?? ""}
            rows={2}
            maxLength={500}
            className={cn(inputClass, "h-auto py-2")}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="submit" size="lg" disabled={pending}>
            <Sparkles /> {pending ? "Zapisywanie…" : "Wprowadź zamówienie"}
          </Button>
          <Button
            type="submit"
            variant="ghost"
            formAction={reject}
            formNoValidate
            className="text-danger hover:bg-danger-soft hover:text-danger"
          >
            Odrzuć — to nie zamówienie
          </Button>
          {state.message && !state.ok && (
            <p role="alert" className="text-sm text-danger">
              {state.message}
            </p>
          )}
        </div>
        <p className="text-xs text-muted">
          Każda Twoja poprawka liczy się do skuteczności rozpoznawania i uczy słownik tego klienta — następnym razem automat
          odczyta to sam.
        </p>
      </section>
    </form>
  );
}
