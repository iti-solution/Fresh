"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { replay, validateEvent, type DriverEvent, type EventInput, type GeoPoint, type RouteSnapshot } from "../domain/offline";
import { driverDb, newId, type QueuedEvent } from "./offline-db";

const SYNC_EVERY_MS = 20_000;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const POSITION_EVERY_MS = 3 * 60_000;

export type SyncState = {
  online: boolean;
  syncing: boolean;
  pending: number; // zdarzenia + pliki czekające na wysłanie
  lastSyncAt: string | null;
  sessionExpired: boolean;
  rejected: { id: string; reason: string }[];
};

export type NewFile = { kind: "photo" | "signature"; blob: Blob };

/**
 * Trasa w telefonie: migawka z serwera + kolejka zdarzeń w IndexedDB.
 * Każda akcja kierowcy działa natychmiast (także bez zasięgu), a wysyła się w tle, gdy jest sieć.
 */
export function useRoute(routeId: string, initial: RouteSnapshot | null) {
  const [snapshot, setSnapshot] = useState<RouteSnapshot | null>(initial);
  const [queue, setQueue] = useState<QueuedEvent[]>([]);
  const [filesPending, setFilesPending] = useState(0);
  const [sync, setSync] = useState<Omit<SyncState, "online" | "pending">>({
    syncing: false,
    lastSyncAt: null,
    sessionExpired: false,
    rejected: [],
  });
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const lastPos = useRef<GeoPoint | null>(null);
  const syncing = useRef(false);

  const refreshLocal = useCallback(async () => {
    const db = driverDb();
    const [q, f] = await Promise.all([
      db.queue.where("route_id").equals(routeId).sortBy("created_at"),
      db.files.where("route_id").equals(routeId).count(),
    ]);
    setQueue(q);
    setFilesPending(f);
  }, [routeId]);

  // start: migawka z serwera (świeższa) albo z telefonu (gdy strona otwarta bez sieci)
  useEffect(() => {
    let alive = true;
    (async () => {
      const db = driverDb();
      const stored = await db.snapshots.get(routeId);
      if (!alive) return;
      if (initial && (!stored || stored.snapshot.fetchedAt <= initial.fetchedAt)) {
        await db.snapshots.put({ route_id: routeId, snapshot: initial, saved_at: new Date().toISOString() });
      } else if (stored) {
        setSnapshot(stored.snapshot);
      }
      await refreshLocal();
    })();
    return () => {
      alive = false;
    };
  }, [routeId, initial, refreshLocal]);

  const view = useMemo(
    () =>
      snapshot
        ? replay(
            snapshot,
            queue.map((q) => q.event),
          )
        : null,
    [snapshot, queue],
  );

  const runSync = useCallback(async () => {
    if (syncing.current || typeof navigator === "undefined" || !navigator.onLine) return;
    syncing.current = true;
    setSync((s) => ({ ...s, syncing: true }));
    const db = driverDb();
    try {
      // 1) zdarzenia i pozycje GPS
      const q = await db.queue.orderBy("created_at").limit(50).toArray();
      const positions = await db.positions.orderBy("recorded_at").limit(300).toArray();
      if (q.length || positions.length) {
        const res = await fetch("/api/driver/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: q.map((x) => x.event), positions }),
        });
        if (res.status === 401) {
          setSync((s) => ({ ...s, sessionExpired: true }));
          return;
        }
        if (!res.ok) throw new Error(`sync ${res.status}`);
        const body = (await res.json()) as { results: { id: string; status: string; reason?: string }[] };
        const rejected: { id: string; reason: string }[] = [];
        const confirmed: DriverEvent[] = [];
        for (const r of body.results) {
          if (r.status === "ok" || r.status === "duplicate") {
            const ev = q.find((x) => x.client_event_id === r.id);
            if (ev) confirmed.push(ev.event);
            await db.queue.delete(r.id);
          } else if (r.reason === "retry")
            await db.queue.update(r.id, { attempts: (q.find((x) => x.client_event_id === r.id)?.attempts ?? 0) + 1 });
          else {
            const ev = q.find((x) => x.client_event_id === r.id);
            await db.rejected.put({
              client_event_id: r.id,
              route_id: ev?.route_id ?? routeId,
              type: ev?.event.type ?? "?",
              reason: r.reason ?? "odrzucone",
              at: new Date().toISOString(),
            });
            await db.queue.delete(r.id);
            await db.files.where("client_event_id").equals(r.id).delete();
            rejected.push({ id: r.id, reason: r.reason ?? "odrzucone" });
          }
        }
        if (positions.length) await db.positions.bulkDelete(positions.map((p) => p.id!));
        // przyjęte zdarzenia wchodzą do migawki w telefonie — ekran nie „cofa się”, gdy świeża migawka jeszcze nie przyszła
        const byRoute = new Map<string, DriverEvent[]>();
        for (const e of confirmed) byRoute.set(e.route_id, [...(byRoute.get(e.route_id) ?? []), e]);
        for (const [rid, evs] of byRoute) {
          const stored = await db.snapshots.get(rid);
          if (!stored) continue;
          const next = replay(stored.snapshot, evs);
          await db.snapshots.put({ ...stored, snapshot: next, saved_at: new Date().toISOString() });
          if (rid === routeId) setSnapshot(next);
        }
        if (rejected.length) setSync((s) => ({ ...s, rejected: [...s.rejected, ...rejected] }));
      }

      // 2) zdjęcia i podpisy zdarzeń, które serwer już przyjął
      const stillQueued = new Set((await db.queue.toArray()).map((x) => x.client_event_id));
      for (const f of await db.files.toArray()) {
        if (stillQueued.has(f.client_event_id)) continue;
        const fd = new FormData();
        fd.set("client_file_id", f.client_file_id);
        fd.set("client_event_id", f.client_event_id);
        fd.set("kind", f.kind);
        fd.set("file", f.blob, `${f.client_file_id}.${f.blob.type === "image/png" ? "png" : "jpg"}`);
        const res = await fetch("/api/driver/upload", { method: "POST", body: fd });
        if (res.ok || [400, 403, 413, 415].includes(res.status) || f.attempts > 20) await db.files.delete(f.client_file_id);
        else await db.files.update(f.client_file_id, { attempts: f.attempts + 1 });
        if (res.status === 401) {
          setSync((s) => ({ ...s, sessionExpired: true }));
          return;
        }
      }

      // 3) świeża migawka (zmiany dyspozytora trafiają do kierowcy przy synchronizacji — D14)
      if ((await db.queue.where("route_id").equals(routeId).count()) === 0) {
        const res = await fetch(`/api/driver/route/${routeId}`, { cache: "no-store" });
        if (res.ok) {
          const fresh = (await res.json()) as RouteSnapshot;
          await db.snapshots.put({ route_id: routeId, snapshot: fresh, saved_at: new Date().toISOString() });
          setSnapshot(fresh);
        } else if (res.status === 401) setSync((s) => ({ ...s, sessionExpired: true }));
      }
      setSync((s) => ({ ...s, lastSyncAt: new Date().toISOString(), sessionExpired: false }));
    } catch {
      // brak zasięgu albo serwer niedostępny — spróbujemy za chwilę
    } finally {
      syncing.current = false;
      await refreshLocal();
      setSync((s) => ({ ...s, syncing: false }));
    }
  }, [routeId, refreshLocal]);

  // synchronizacja: co 20 s, po odzyskaniu sieci, po powrocie do aplikacji
  useEffect(() => {
    const kick = () => void runSync();
    const first = setTimeout(kick, 0);
    const t = setInterval(kick, SYNC_EVERY_MS);
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [runSync]);

  // GPS przy otwartej trasie: ostatnia pozycja do potwierdzeń + punkt co kilka minut (D3)
  const tracking = view?.status === "in_progress";
  useEffect(() => {
    if (!tracking || typeof navigator === "undefined" || !navigator.geolocation) return;
    let lastSaved = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        lastPos.current = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
        if (p.timestamp - lastSaved >= POSITION_EVERY_MS) {
          lastSaved = p.timestamp;
          void driverDb().positions.add({
            route_id: routeId,
            ...lastPos.current,
            recorded_at: new Date(p.timestamp).toISOString(),
          });
        }
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking, routeId]);

  /** Zapis akcji kierowcy: walidacja na telefonie, kolejka, natychmiastowa zmiana na ekranie. */
  const record = useCallback(
    async (input: EventInput, files: NewFile[] = []): Promise<string | null> => {
      if (!view) return "Trasa się jeszcze wczytuje.";
      const event = {
        ...input,
        client_event_id: newId(),
        route_id: routeId,
        occurred_at: new Date().toISOString(),
        location: lastPos.current,
      } as DriverEvent;
      const problem = validateEvent(view, event);
      if (problem) return problem;
      const db = driverDb();
      const now = new Date().toISOString();
      await db.transaction("rw", db.queue, db.files, async () => {
        await db.queue.put({
          client_event_id: event.client_event_id,
          route_id: routeId,
          event,
          created_at: now,
          attempts: 0,
          last_error: null,
        });
        for (const f of files)
          await db.files.put({
            client_file_id: newId(),
            client_event_id: event.client_event_id,
            route_id: routeId,
            kind: f.kind,
            blob: f.blob,
            created_at: now,
            attempts: 0,
          });
      });
      await refreshLocal();
      void runSync();
      return null;
    },
    [view, routeId, refreshLocal, runSync],
  );

  const dismissRejected = useCallback(() => setSync((s) => ({ ...s, rejected: [] })), []);

  return {
    route: view,
    record,
    sync: { ...sync, online, pending: queue.length + filesPending } satisfies SyncState,
    syncNow: runSync,
    dismissRejected,
  };
}
