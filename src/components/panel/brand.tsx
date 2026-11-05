import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Znak: limonkowa trasa z trzema przystankami na butelkowej zieleni — kurs od magazynu do klientów. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#6bbf2a" />
      <path d="M8 23.5h6.5a4 4 0 0 0 0-8h-3a4 4 0 0 1 0-8H24" fill="none" stroke="#12332b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="23.5" r="2.3" fill="#12332b" />
      <circle cx="14.5" cy="15.5" r="1.7" fill="#ffffff" stroke="#12332b" strokeWidth="1.4" />
      <circle cx="24" cy="7.5" r="2.3" fill="#ffffff" stroke="#12332b" strokeWidth="1.4" />
    </svg>
  );
}

/** Logotyp: znak + nazwa produktu + dopisek (wersaliki). Na jasnym tle nazwa w ciemnej zieleni (kontrast). */
export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex items-baseline gap-1.5 leading-none">
        <span className={cn("text-[20px] font-bold tracking-[0.06em]", inverted ? "text-primary" : "text-ink")}>
          {BRAND.name.toUpperCase()}
        </span>
        <span className={cn("text-[11px] font-semibold tracking-[0.14em]", inverted ? "text-ink-muted" : "text-muted")}>{BRAND.suffix}</span>
      </span>
    </span>
  );
}
