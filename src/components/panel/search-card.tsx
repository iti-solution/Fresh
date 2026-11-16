"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CARD =
  "flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-3.5 shadow-[var(--shadow-panel)] sm:flex-row sm:items-center";
const INPUT =
  "h-12 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-11 text-[15px] outline-none placeholder:text-subtle focus:border-primary focus:ring-[3px] focus:ring-primary/15";

/** Duża karta wyszukiwania — wspólna dla ekranów dnia (formularz GET, wynik po stronie serwera). */
export function SearchCard({
  action,
  q,
  hidden = {},
  placeholder,
  label,
  clearHref,
  children,
}: {
  action: string;
  q: string;
  hidden?: Record<string, string | undefined>;
  placeholder: string;
  label: string;
  clearHref?: string;
  children?: ReactNode;
}) {
  return (
    <form action={action} className={CARD}>
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-subtle" />
        <input name="q" type="search" defaultValue={q} placeholder={placeholder} aria-label={label} className={INPUT} />
      </div>
      <button className={buttonVariants({ size: "lg" })}>Szukaj</button>
      {q && clearHref && (
        <Link href={clearHref} className="text-sm text-muted hover:text-foreground hover:underline">
          Wyczyść
        </Link>
      )}
      {children}
    </form>
  );
}

/** To samo, ale filtruje na bieżąco w przeglądarce (tablica tras — bez przeładowania). */
export function LiveSearchCard({
  value,
  onChange,
  placeholder,
  label,
  result,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  result?: ReactNode;
}) {
  return (
    <div className={cn(CARD)}>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className={INPUT}
        />
      </div>
      {result && <span className="text-sm text-muted">{result}</span>}
      <button type="button" onClick={() => onChange(value)} className={buttonVariants({ size: "lg" })}>
        Szukaj
      </button>
    </div>
  );
}
