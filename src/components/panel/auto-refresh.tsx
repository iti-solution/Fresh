"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Odświeża dane ekranu co `seconds` (tylko gdy karta jest widoczna) i pokazuje godzinę ostatniego stanu. */
export function AutoRefresh({ seconds = 60, stamp }: { seconds?: number; stamp: string }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, paused]);
  return (
    <button
      type="button"
      onClick={() => setPaused((p) => !p)}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted hover:border-border-strong"
      title={paused ? "Wznów automatyczne odświeżanie" : "Wstrzymaj automatyczne odświeżanie"}
    >
      <span className={paused ? "h-2 w-2 rounded-full bg-subtle" : "live-dot h-2 w-2 rounded-full bg-success"} />
      {paused ? `Wstrzymano · stan na ${stamp}` : `Na żywo · stan na ${stamp}`}
    </button>
  );
}
