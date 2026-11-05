"use client";

import { useEffect } from "react";
import type { RouteSnapshot } from "../domain/offline";
import { driverDb } from "./offline-db";

/** Na liście tras: zapisuje w telefonie trasy dnia, żeby dało się je otworzyć bez zasięgu (np. w hali bez sieci). */
export function PrefetchRoutes({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  useEffect(() => {
    if (!navigator.onLine || !key) return;
    const ctrl = new AbortController();
    (async () => {
      for (const id of key.split(",")) {
        try {
          const res = await fetch(`/api/driver/route/${id}`, { cache: "no-store", signal: ctrl.signal });
          if (res.ok) {
            const snap = (await res.json()) as RouteSnapshot;
            const db = driverDb();
            const stored = await db.snapshots.get(id);
            if (!stored || stored.snapshot.fetchedAt < snap.fetchedAt) await db.snapshots.put({ route_id: id, snapshot: snap, saved_at: new Date().toISOString() });
          }
          // strona trasy trafia do pamięci service workera
          await fetch(`/driver/trasa/${id}`, { signal: ctrl.signal, credentials: "same-origin" });
        } catch {
          return;
        }
      }
    })();
    return () => ctrl.abort();
  }, [key]);
  return null;
}
