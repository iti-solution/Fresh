import "server-only";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Potwierdzenia dostaw dla biura: zdarzenia z telefonu, zdjęcia i podpisy (podpisane linki na 1 godzinę).

export type ProofFile = { id: string; kind: string; url: string | null; stopId: string | null };

async function signed(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length || !hasAdminKey()) return out;
  const { data } = await createAdminClient().storage.from("delivery-photos").createSignedUrls(paths, 3600);
  for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
  return out;
}

export const EVENT_LABELS: Record<string, string> = {
  route_started: "Start trasy",
  route_finished: "Koniec zmiany",
  stop_pending: "Nie rozpoczęto",
  stop_in_progress: "Teraz realizuje",
  stop_delivered: "Dostarczono",
  stop_partial: "Częściowo",
  stop_absent: "Brak odbioru",
  stop_refused: "Odmowa przyjęcia",
  stop_complaint: "Reklamacja",
  stop_saved: "Zapis punktu",
  return_recorded: "Zwrot towaru",
  comment: "Komentarz",
  problem_reported: "Zgłoszenie",
};

type Payload = { reason?: string; text?: string; comment?: string; kind?: string; gps?: { lat: number; lng: number; accuracy: number | null }; odometer_start?: number; odometer_end?: number };

/** Zgłoszenia kierowców z dnia (problemy, opóźnienia) ze zdjęciami — panel centrum operacyjnego. */
export async function getDayReports(tenantId: string, day: string) {
  const db = await createClient();
  const { data: routes } = await db.from("routes").select("id, name, drivers(first_name, last_name, phone)").eq("tenant_id", tenantId).eq("route_date", day);
  const ids = (routes ?? []).map((r) => r.id);
  if (!ids.length) return [];
  const [{ data: events }, { data: files }] = await Promise.all([
    db
      .from("delivery_events")
      .select("id, route_id, stop_id, type, payload, occurred_at, route_stops(sequence, delivery_points(name, customers(name)))")
      .eq("tenant_id", tenantId)
      .in("route_id", ids)
      .in("type", ["problem_reported", "stop_complaint", "return_recorded"])
      .order("occurred_at", { ascending: false })
      .limit(100),
    db.from("attachments").select("id, event_id, stop_id, kind, storage_path").eq("tenant_id", tenantId).in("route_id", ids).limit(500),
  ]);
  const urls = await signed((files ?? []).filter((f) => f.kind === "photo").map((f) => f.storage_path));
  const routeById = new Map((routes ?? []).map((r) => [r.id, r]));
  return (events ?? []).map((e) => {
    const p = (e.payload ?? {}) as Payload;
    const r = routeById.get(e.route_id);
    return {
      id: e.id,
      type: e.type,
      label: e.type === "problem_reported" ? (p.kind === "delay" ? "Opóźnienie" : "Problem") : (EVENT_LABELS[e.type] ?? e.type),
      text: p.text ?? p.reason ?? p.comment ?? "",
      at: new Date(e.occurred_at).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }),
      route: r?.name ?? "",
      driver: r?.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : null,
      driverPhone: r?.drivers?.phone ?? null,
      stopId: e.stop_id,
      customer: e.route_stops?.delivery_points?.customers?.name ?? null,
      photos: (files ?? [])
        .filter((f) => f.kind === "photo" && (f.event_id === e.id || (e.type !== "problem_reported" && f.stop_id && f.stop_id === e.stop_id)))
        .map((f) => urls.get(f.storage_path))
        .filter((u): u is string => Boolean(u)),
    };
  });
}

/** Potwierdzenie dostawy jednego punktu: oś czasu, GPS, zdjęcia, podpis, opakowania, gotówka. */
export async function getStopProof(tenantId: string, stopId: string) {
  const db = await createClient();
  const { data: s } = await db
    .from("route_stops")
    .select(
      `id, sequence, status, arrived_at, completed_at, route_id,
       routes(id, name, route_date, drivers(first_name, last_name, phone), vehicles(registration)),
       delivery_points(name, address_line, postal_code, city, contact_phone, customers(name, external_code)),
       route_stop_orders(orders(external_ref, order_value, cod_amount, crates, pallets, weight_kg))`,
    )
    .eq("id", stopId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!s) return null;
  const [{ data: events }, { data: files }, { data: pack }, { data: cash }] = await Promise.all([
    db.from("delivery_events").select("id, type, payload, occurred_at, received_at").eq("tenant_id", tenantId).eq("stop_id", stopId).order("occurred_at"),
    db.from("attachments").select("id, kind, storage_path, created_at").eq("tenant_id", tenantId).eq("stop_id", stopId),
    db.from("packaging_movements").select("qty, reason, packaging_types(name)").eq("tenant_id", tenantId).eq("stop_id", stopId).eq("party_type", "customer"),
    db.from("cash_movements").select("amount").eq("tenant_id", tenantId).eq("stop_id", stopId).eq("party_type", "driver").eq("reason", "cod_collected"),
  ]);
  const urls = await signed((files ?? []).map((f) => f.storage_path));
  return {
    stop: s,
    events: (events ?? []).map((e) => ({ ...e, payload: (e.payload ?? {}) as Payload, label: EVENT_LABELS[e.type] ?? e.type })),
    photos: (files ?? []).filter((f) => f.kind === "photo").map((f) => ({ id: f.id, url: urls.get(f.storage_path) ?? null })),
    signature: (files ?? []).filter((f) => f.kind === "signature").map((f) => ({ id: f.id, url: urls.get(f.storage_path) ?? null }))[0] ?? null,
    packaging: pack ?? [],
    cash: cash ?? [],
  };
}
