import { NextResponse, type NextRequest } from "next/server";
import { hasAdminKey } from "@/lib/supabase/admin";
import { parseIncomingEvent, UUID_RE } from "@/modules/execution/domain/offline";
import { applyDriverEvent, savePositions, type ApplyResult, type IncomingPosition } from "@/modules/execution/server/apply";
import { getDriverCtx } from "@/modules/execution/server/driver-context";

// M4.2 — synchronizacja kolejki zdarzeń z telefonu kierowcy. Idempotentna po client_event_id.
const MAX_EVENTS = 100;
const MAX_POSITIONS = 500;

const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!hasAdminKey()) return json(503, { error: "server_not_configured" });
  const c = await getDriverCtx();
  if (!c) return json(401, { error: "not_driver" });
  let body: { events?: unknown[]; positions?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  const results: ApplyResult[] = [];
  for (const raw of events) {
    const e = parseIncomingEvent(raw);
    const id = String((raw as { client_event_id?: unknown })?.client_event_id ?? "");
    if (typeof e === "string") {
      results.push({ id, status: "rejected", reason: e });
      continue;
    }
    try {
      results.push(await applyDriverEvent(c, e));
    } catch {
      // błąd przejściowy — telefon spróbuje ponownie
      results.push({ id, status: "rejected", reason: "retry" });
    }
  }

  const positions: IncomingPosition[] = (Array.isArray(body.positions) ? body.positions.slice(0, MAX_POSITIONS) : [])
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .filter((p) => typeof p.lat === "number" && typeof p.lng === "number" && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
    .filter((p) => !Number.isNaN(Date.parse(String(p.recorded_at))))
    .map((p) => ({
      route_id: UUID_RE.test(String(p.route_id ?? "")) ? String(p.route_id) : null,
      lat: p.lat as number,
      lng: p.lng as number,
      accuracy: typeof p.accuracy === "number" ? Math.round(p.accuracy * 10) / 10 : null,
      recorded_at: new Date(String(p.recorded_at)).toISOString(),
    }));
  const savedPositions = await savePositions(c, positions);
  return json(200, { results, positions: savedPositions, serverTime: new Date().toISOString() });
}
