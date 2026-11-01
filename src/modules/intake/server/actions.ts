"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toFormErrors, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { canReviewIntake } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";
import { approveSchema, intakeErrorMessage, matchSender, messageSchema } from "../domain/intake";
import { createDraft } from "./create-draft";

/** Wiadomość od klienta → rozpoznanie → szkic do sprawdzenia. Nic nie trafia do zamówień bez człowieka. */
export async function createDraftFromMessage(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canReviewIntake(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
  const parsed = messageSchema.safeParse(formToObject(fd));
  if (!parsed.success) return toFormErrors(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();

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

  const res = await createDraft(supabase, {
    tenantId: ctx.tenantId,
    channel: v.channel,
    sender: v.sender,
    body: v.body,
    createdBy: ctx.userId,
    customerId,
    pointId,
  });
  if ("error" in res) return { ok: false, message: res.error };
  revalidatePath("/do-sprawdzenia");
  redirect(`/do-sprawdzenia/${res.draftId}`);
}

/** Człowiek zatwierdza (po poprawkach) → zamówienie + wynik każdej pozycji + nauka słownika. */
export async function approveDraft(draftId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireTenantContext();
  if (!canReviewIntake(ctx.role)) return { ok: false, message: "Nie masz uprawnień." };
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
  if (!canReviewIntake(ctx.role)) return;
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
