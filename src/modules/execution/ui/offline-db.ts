"use client";

import Dexie, { type EntityTable } from "dexie";
import type { DriverEvent, RouteSnapshot } from "../domain/offline";

// Pamięć telefonu kierowcy (IndexedDB). Przeżywa brak zasięgu, zamknięcie przeglądarki i restart telefonu.

export type QueuedEvent = {
  client_event_id: string;
  route_id: string;
  event: DriverEvent;
  created_at: string;
  attempts: number;
  last_error: string | null;
};
export type QueuedFile = {
  client_file_id: string;
  client_event_id: string;
  route_id: string;
  kind: "photo" | "signature";
  blob: Blob;
  created_at: string;
  attempts: number;
};
export type QueuedPosition = {
  id?: number;
  route_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  recorded_at: string;
};
export type StoredSnapshot = { route_id: string; snapshot: RouteSnapshot; saved_at: string };
export type RejectedEvent = { client_event_id: string; route_id: string; type: string; reason: string; at: string };

class DriverDb extends Dexie {
  snapshots!: EntityTable<StoredSnapshot, "route_id">;
  queue!: EntityTable<QueuedEvent, "client_event_id">;
  files!: EntityTable<QueuedFile, "client_file_id">;
  positions!: EntityTable<QueuedPosition, "id">;
  rejected!: EntityTable<RejectedEvent, "client_event_id">;

  constructor() {
    super("driver-app");
    this.version(1).stores({
      snapshots: "route_id",
      queue: "client_event_id, route_id, created_at",
      files: "client_file_id, client_event_id, route_id",
      positions: "++id, route_id, recorded_at",
      rejected: "client_event_id, route_id",
    });
  }
}

let db: DriverDb | null = null;
export function driverDb(): DriverDb {
  db ??= new DriverDb();
  return db;
}

/** UUID v4 z telefonu (crypto.randomUUID nie działa na starszych WebView bez HTTPS). */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
