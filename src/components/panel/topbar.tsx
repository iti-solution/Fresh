"use client";

import { Maximize, Minimize } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/modules/tenancy/domain/access";

/** Tytuły ekranów, których nie ma w menu (podstrony). */
const EXTRA_TITLES: [string, string][] = [
  ["/centrum/punkt", "Punkt dostawy"],
  ["/rozliczenia/zamkniecie", "Zamknięcie trasy"],
  ["/rozliczenia/stawki", "Stawki kierowców"],
  ["/kartoteki/pojazdy/dziennik", "Dziennik przydziałów"],
];

/** Tytuł bieżącego ekranu w górnym pasku — z menu, najdłuższe dopasowanie ścieżki. */
export function TopbarTitle() {
  const pathname = usePathname();
  const extra = EXTRA_TITLES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  const item = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const title = extra?.[1] ?? item?.label ?? "";
  return <p className="truncate text-[17px] font-semibold tracking-[-0.01em] text-white">{title}</p>;
}

/** Pełny ekran (dyspozytor na drugim monitorze, monitor tras na telewizorze). */
export function FullscreenButton({ className }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return (
    <button
      type="button"
      onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
      title={on ? "Zamknij pełny ekran" : "Pełny ekran"}
      aria-label={on ? "Zamknij pełny ekran" : "Pełny ekran"}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-ink-foreground transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-4",
        className,
      )}
    >
      {on ? <Minimize /> : <Maximize />}
    </button>
  );
}

/** Ścieżka bieżącego ekranu — przełącznik danych wraca na ten sam ekran. */
export function CurrentPathInput() {
  const pathname = usePathname();
  return <input type="hidden" name="returnTo" value={pathname} />;
}

/** Tytuł strony: gdy powtarza tytuł z górnego paska, zostaje tylko dla czytników ekranu. */
export function PageTitle({ children }: { children: string }) {
  const pathname = usePathname();
  const item = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const duplicate = item?.label === children || (item?.href === pathname && children.length < 40 && sameMeaning(item.label, children));
  return (
    <h1
      className={cn(
        duplicate ? "sr-only" : "text-[20px] font-semibold leading-tight tracking-[-0.015em] text-foreground",
      )}
    >
      {children}
    </h1>
  );
}

function sameMeaning(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().split(/\s+/)[0];
  return norm(a) === norm(b);
}
