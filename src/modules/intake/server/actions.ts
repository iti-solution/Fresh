"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrderParser } from "@/lib/adapters/order-parser";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { availableDeliveryDates, earliestDeliveryDate, portalSettings, warsawNow } from "@/modules/portal/domain/portal";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { approveSchema, intakeErrorMessage, matchSender, messageSchema } from "../domain/intake";

/** Wiadomość od klienta → rozpoznanie → szkic do sprawdzenia. Nic nie trafia do zamówień bez człowieka. */
export async function createDraftFromMessage(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  const parsed = messageSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();

  const { data: msg, error: mErr } = await supabase
    .from("inbound_messages")
    .insert({ tenant_id: ctx.tenantId, channel: v.channel, sender: v.sender, body: v.body, created_by: ctx.userId })
    .select("id")
    .single();
  if (mErr || !msg) return { ok: false, message: "Nie udało się zapisać wiadomości." };

  // Kto napisał: wybrany ręcznie albo po telefonie oddziału / e-mailu konta w portalu
  let customerId = v.customer_id;
  let pointId: string | null = null;
  if (!customerId) {
    const [{ data: pts }, { data: users }] = await Promise.all([
      supabase
        .from("delivery_points")
        .select("id, customer_id, contact_phone")
        .eq("tenant_id", ctx.tenantId)
        .eq("is_active", true),
      supabase.from("customer_portal_users").select("customer_id, login_email").eq("tenant_id", ctx.tenantId),
    ]);
    const hit = matchSender(v.sender, [
      ...(pts ?? []).map((p) => ({ customerId: p.customer_id, pointId: p.id, phone: p.contact_phone })),
      ...(users ?? []).map((u) => ({ customerId: u.customer_id, pointId: null, email: u.login_email })),
    ]);
    customerId = hit?.customerId ?? null;
    pointId = hit?.pointId ?? null;
  }

  const [{ data: products }, { data: aliases }, { data: points }, { data: tenant }] = await Promise.all([
    supabase.from("products").select("id, name, code, unit, category").eq("tenant_id", ctx.tenantId).eq("is_active", true),
    customerId
      ? supabase
          .from("product_aliases")
          .select("alias_key, product_id, customer_id")
          .eq("tenant_id", ctx.tenantId)
          .or(`customer_id.is.null,customer_id.eq.${customerId}`)
      : supabase
          .from("product_aliases")
          .select("alias_key, product_id, customer_id")
          .eq("tenant_id", ctx.tenantId)
          .is("customer_id", null),
    customerId
      ? supabase
          .from("delivery_points")
          .select("id, delivery_weekdays, active_from, active_to")
          .eq("tenant_id", ctx.tenantId)
          .eq("customer_id", customerId)
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({
          data: [] as { id: string; delivery_weekdays: number[]; active_from: string | null; active_to: string | null }[],
        }),
    supabase.from("tenants").select("settings").eq("id", ctx.tenantId).single(),
  ]);
  if (!pointId && points?.length === 1) pointId = points[0].id;

  const now = warsawNow();
  const parser = getOrderParser();
  const result = await parser.parse({
    text: v.body,
    catalog: products ?? [],
    aliases: (aliases ?? []).map((a) => ({
      alias_key: a.alias_key,
      product_id: a.product_id,
      customerSpecific: a.customer_id !== null,
    })),
    today: now.date,
  });

  // Dzień: z wiadomości, inaczej najbliższy dzień dostaw oddziału
  const settings = portalSettings(tenant?.settings);
  const point = points?.find((p) => p.id === pointId);
  const fallbackDate = point
    ? (availableDeliveryDates(now, settings, {
        weekdays: point.delivery_weekdays ?? [],
        activeFrom: point.active_from,
        activeTo: point.active_to,
      })[0] ?? earliestDeliveryDate(now, settings))
    : earliestDeliveryDate(now, settings);

  const { data: draft, error: dErr } = await supabase
    .from("order_drafts")
    .insert({
      tenant_id: ctx.tenantId,
      message_id: msg.id,
      customer_id: customerId,
      delivery_point_id: pointId,
      delivery_date: result.dateHint ?? fallbackDate,
      note: result.note,
      parser: result.parser,
    })
    .select("id")
    .single();
  if (dErr || !draft) return { ok: false, message: "Nie udało się zapisać rozpoznanego zamówienia." };

  if (result.lines.length) {
    const { error: lErr } = await supabase.from("order_draft_lines").insert(
      result.lines.map((l, i) => ({
        tenant_id: ctx.tenantId,
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
    if (lErr) return { ok: false, message: "Nie udało się zapisać pozycji." };
  }
  revalidatePath("/do-sprawdzenia");
  redirect(`/do-sprawdzenia/${draft.id}`);
}

/** Człowiek zatwierdza (po poprawkach) → zamówienie + wynik każdej pozycji + nauka słownika. */
export async function approveDraft(draftId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  const parsed = approveSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error, parsed.error.issues[0]?.message ?? "Popraw zamówienie.");
  const v = parsed.data;
  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("intake_approve_draft", {
    p_draft: draftId,
    p_point: v.delivery_point_id,
    p_date: v.delivery_date,
    p_lines: v.lines.map((l) => ({ product_id: l.product_id, qty: l.qty, draft_line_id: l.draft_line_id ?? null })),
    p_note: v.note ?? undefined,
  });
  if (error || !orderId) return { ok: false, message: intakeErrorMessage(error?.message) };
  revalidatePath("/do-sprawdzenia");
  revalidatePath("/zlecenia");
  redirect(`/do-sprawdzenia?zatwierdzono=${draftId}`);
}

export async function rejectDraft(draftId: string): Promise<void> {
  const ctx = await requireTenantContext();
  if (!canEdit(ctx.role)) return;
  const supabase = await createClient();
  await supabase
    .from("order_drafts")
    .update({ status: "rejected", reviewed_by: ctx.userId, reviewed_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "needs_review");
  revalidatePath("/do-sprawdzenia");
  redirect("/do-sprawdzenia?odrzucono=1");
}
