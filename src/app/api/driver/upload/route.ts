import { NextResponse, type NextRequest } from "next/server";
import { UUID_RE } from "@/modules/execution/domain/offline";
import { getDriverCtx } from "@/modules/execution/server/driver-context";

// Zdjęcia i podpis z punktu (M4.4). Plik wysyłany po przyjęciu jego zdarzenia; ponowne wysłanie nie dubluje.
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const c = await getDriverCtx();
  if (!c) return json(401, { error: "not_driver" });
  const fd = await request.formData().catch(() => null);
  if (!fd) return json(400, { error: "invalid_form" });
  const fileId = String(fd.get("client_file_id") ?? "");
  const eventId = String(fd.get("client_event_id") ?? "");
  const kind = fd.get("kind") === "signature" ? "signature" : "photo";
  const file = fd.get("file");
  if (!UUID_RE.test(fileId) || !UUID_RE.test(eventId) || !(file instanceof Blob)) return json(400, { error: "invalid_fields" });
  const ext = TYPES[file.type];
  if (!ext) return json(415, { error: "unsupported_type" });
  if (file.size > MAX_BYTES) return json(413, { error: "too_large" });

  // zdarzenie musi być już przyjęte i należeć do trasy tego kierowcy
  const { data: ev } = await c.admin
    .from("delivery_events")
    .select("id, route_id, stop_id, routes!inner(driver_id)")
    .eq("tenant_id", c.tenantId)
    .eq("client_event_id", eventId)
    .maybeSingle();
  if (!ev) return json(409, { error: "event_not_synced" });
  if (ev.routes?.driver_id !== c.driverId) return json(403, { error: "not_your_route" });

  const path = `${c.tenantId}/${ev.route_id}/${fileId}.${ext}`;
  const { error: upErr } = await c.admin.storage
    .from("delivery-photos")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return json(502, { error: "storage_failed" });
  const { error } = await c.admin.from("attachments").upsert(
    {
      tenant_id: c.tenantId,
      client_file_id: fileId,
      event_id: ev.id,
      route_id: ev.route_id,
      stop_id: ev.stop_id,
      kind,
      storage_path: path,
      content_type: file.type,
      size_bytes: file.size,
    },
    { onConflict: "tenant_id,client_file_id", ignoreDuplicates: true },
  );
  if (error) return json(500, { error: "db_failed" });
  return json(200, { ok: true });
}
