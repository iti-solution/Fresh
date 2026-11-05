"use client";

import { useEffect } from "react";

/** Rejestruje service worker aplikacji kierowcy (praca bez zasięgu). W trybie deweloperskim pomijamy. */
export function RegisterDriverSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/driver-sw.js", { scope: "/driver" }).catch(() => undefined);
  }, []);
  return null;
}
