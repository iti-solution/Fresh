import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderParser } from "@/lib/adapters/order-parser";
import type { Database } from "@/lib/supabase/database.types";
import { availableDeliveryDates, earliestDeliveryDate, portalSettings, warsawNow } from "@/modules/portal/domain/portal";
import type { Channel } from "../domain/intake";

type Db = SupabaseClient<Database>;

export type DraftInput = {
  tenantId: string;
  channel: Channel;
  sender: string | null;
  body: string;
  audioPath?: string | null;
  createdBy: string;
  customerId: string | null;
  pointId: string | null;
  /** Dzień wybrany przez klienta w portalu — ma pierwszeństwo przed „jutro” z treści. */
  deliveryDate?: string | null;
};

/**
 * Wiadomość → rozpoznanie (słownik klienta + katalog, opcjonalnie AI) → szkic z pozycjami do sprawdzenia przez BOK.
 * Wspólne dla panelu (wklejona wiadomość) i portalu (klient pisze lub nagrywa). `db` musi mieć prawo zapisu
 * do tabel przyjęcia — w portalu to klient serwerowy, użyty dopiero po sprawdzeniu dostępu klienta.
 */
export async function createDraft(db: Db, input: DraftInput): Promise<{ draftId: string } | { error: string }> {
  const { tenantId, customerId } = input;
  let pointId = input.pointId;

  const { data: msg, error: mErr } = await db
    .from("inbound_messages")
    .insert({
      tenant_id: tenantId,
      channel: input.channel,
      sender: input.sender,
      body: input.body,
      audio_path: input.audioPath ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (mErr || !msg) return { error: "Nie udało się zapisać wiadomości." };

  const [{ data: products }, { data: aliases }, { data: points }, { data: tenant }] = await Promise.all([
    db.from("products").select("id, name, code, unit, category").eq("tenant_id", tenantId).eq("is_active", true),
    customerId
      ? db
          .from("product_aliases")
          .select("alias_key, product_id, customer_id")
          .eq("tenant_id", tenantId)
          .or(`customer_id.is.null,customer_id.eq.${customerId}`)
      : db.from("product_aliases").select("alias_key, product_id, customer_id").eq("tenant_id", tenantId).is("customer_id", null),
    customerId
      ? db
          .from("delivery_points")
          .select("id, delivery_weekdays, active_from, active_to")
          .eq("tenant_id", tenantId)
          .eq("customer_id", customerId)
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({
          data: [] as { id: string; delivery_weekdays: number[]; active_from: string | null; active_to: string | null }[],
        }),
    db.from("tenants").select("settings").eq("id", tenantId).single(),
  ]);
  if (!pointId && points?.length === 1) pointId = points[0].id;

  const now = warsawNow();
  const result = await getOrderParser().parse({
    text: input.body,
    catalog: products ?? [],
    aliases: (aliases ?? []).map((a) => ({
      alias_key: a.alias_key,
      product_id: a.product_id,
      customerSpecific: a.customer_id !== null,
    })),
    today: now.date,
  });

  // Dzień: wybrany przez klienta → z treści („jutro”, „na piątek”) → najbliższy dzień dostaw oddziału
  const settings = portalSettings(tenant?.settings);
  const point = points?.find((p) => p.id === pointId);
  const fallbackDate = point
    ? (availableDeliveryDates(now, settings, {
        weekdays: point.delivery_weekdays ?? [],
        activeFrom: point.active_from,
        activeTo: point.active_to,
      })[0] ?? earliestDeliveryDate(now, settings))
    : earliestDeliveryDate(now, settings);

  const { data: draft, error: dErr } = await db
    .from("order_drafts")
    .insert({
      tenant_id: tenantId,
      message_id: msg.id,
      customer_id: customerId,
      delivery_point_id: pointId,
      delivery_date: input.deliveryDate ?? result.dateHint ?? fallbackDate,
      note: result.note,
      parser: result.parser,
    })
    .select("id")
    .single();
  if (dErr || !draft) return { error: "Nie udało się zapisać rozpoznanego zamówienia." };

  if (result.lines.length) {
    const { error: lErr } = await db.from("order_draft_lines").insert(
      result.lines.map((l, i) => ({
        tenant_id: tenantId,
        draft_id: draft.id,
        line_no: i + 1,
        phrase: l.phrase,
        alias_key: l.aliasKey || null,
        span_start: l.spanStart,
        span_end: l.spanEnd,
        proposed_product_id: l.productId,
        proposed_qty: l.qty,
        confidence: l.confidence,
      })),
    );
    if (lErr) return { error: "Nie udało się zapisać pozycji." };
  }
  return { draftId: draft.id };
}
