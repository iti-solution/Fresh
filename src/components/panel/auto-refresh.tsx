"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Odświeża dane ekranu „na żywo”. Z `tenantId` słucha zmian w bazie (Supabase Realtime — potwierdzenia kierowców,
 * statusy tras) i odświeża po 2 s ciszy; dodatkowo co `seconds` jako zabezpieczenie. Tylko gdy karta jest widoczna.
 */
export function AutoRefresh({ seconds = 60, stamp, tenantId }: { seconds?: number; stamp: string; tenantId?: string }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, paused]);

  useEffect(() => {
    if (paused || !tenantId) return;
    const supabase = createClient();
    const bump = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, 2000);
    };
    const filter = `tenant_id=eq.${tenantId}`;
    const channel = supabase
      .channel(`ops-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_events", filter }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "route_stops", filter }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "routes", filter }, bump)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, tenantId, paused]);

  return (
    <button
      type="button"
      onClick={() => setPaused((p) => !p)}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted hover:border-border-strong"
      title={
        paused
          ? "Wznów automatyczne odświeżanie"
          : live
            ? "Zmiany z tras pojawiają się od razu"
            : "Wstrzymaj automatyczne odświeżanie"
      }
    >
      <span className={paused ? "h-2 w-2 rounded-full bg-subtle" : "live-dot h-2 w-2 rounded-full bg-success"} />
      {paused ? `Wstrzymano · stan na ${stamp}` : `${live ? "Na żywo" : "Odświeżanie co minutę"} · stan na ${stamp}`}
    </button>
  );
}
