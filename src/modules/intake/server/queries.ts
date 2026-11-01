import "server-only";
import { createClient } from "@/lib/supabase/server";
import { accuracy, type Accuracy, type Outcome } from "../domain/parse";

/** Wiadomości czekające na sprawdzenie (najstarsze pierwsze) i ostatnio sprawdzone. */
export async function getReviewQueue(tenantId: string) {
  const supabase = await createClient();
  const cols =
    "id, status, parser, created_at, reviewed_at, delivery_date, order_id, customers(name), inbound_messages(channel, sender, body, received_at, audio_path), order_draft_lines(confidence, proposed_product_id, outcome), orders(external_ref)";
  const [{ data: pending, error }, { data: done }] = await Promise.all([
    supabase
      .from("order_drafts")
      .select(cols)
      .eq("tenant_id", tenantId)
      .eq("status", "needs_review")
      .order("created_at")
      .limit(100),
    supabase
      .from("order_drafts")
      .select(cols)
      .eq("tenant_id", tenantId)
      .neq("status", "needs_review")
      .order("reviewed_at", { ascending: false })
      .limit(15),
  ]);
  if (error) throw error;
  return { pending: pending ?? [], done: done ?? [] };
}

/** Skuteczność rozpoznawania z ostatnich 30 dni — łącznie i per wersja parsera. */
export async function getAccuracy(tenantId: string): Promise<{ total: Accuracy; byParser: { parser: string; acc: Accuracy }[] }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data, error } = await supabase
    .from("order_drafts")
    .select("id, parser, order_draft_lines(outcome)")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .gte("reviewed_at", since)
    .limit(2000);
  if (error) throw error;
  const rows = (data ?? []).flatMap((d) =>
    d.order_draft_lines.map((l) => ({ draftId: d.id, parser: d.parser, outcome: l.outcome as Outcome | null })),
  );
  const parsers = [...new Set(rows.map((r) => r.parser))];
  return {
    total: accuracy(rows),
    byParser: parsers.map((p) => ({ parser: p, acc: accuracy(rows.filter((r) => r.parser === p)) })),
  };
}

export async function getDraft(tenantId: string, draftId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_drafts")
    .select(
      "id, status, parser, note, delivery_date, customer_id, delivery_point_id, created_at, reviewed_at, order_id, orders(external_ref), customers(name), inbound_messages(channel, sender, body, received_at, audio_path), order_draft_lines(id, line_no, phrase, span_start, span_end, proposed_product_id, proposed_qty, confidence, final_product_id, final_qty, outcome)",
    )
    .eq("tenant_id", tenantId)
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, order_draft_lines: [...data.order_draft_lines].sort((a, b) => a.line_no - b.line_no) };
}

/** Klienci z aktywnymi oddziałami — do wyboru, gdy nadawca nie został rozpoznany. */
export async function getCustomersWithPoints(tenantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, delivery_points(id, name, city, is_active)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      points: c.delivery_points.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name, city: p.city })),
    }))
    .filter((c) => c.points.length > 0);
}

export async function getCatalogForReview(tenantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, code, name, category, unit, pack_label, is_active")
    .eq("tenant_id", tenantId)
    .order("category", { nullsFirst: false })
    .order("name");
  if (error) throw error;
  return data ?? [];
}
