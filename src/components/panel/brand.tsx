import { cn } from "@/lib/utils";

/** Znak Fresh: liść w barwach ExpertWMS, którego nerw jest trasą z trzema przystankami. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#ff5f00" />
      <path d="M7.5 24.5C7.5 14 14 7.5 24.5 7.5c0 10.5-6.5 17-17 17Z" fill="#ffffff" />
      <path d="M9.3 22.7c3.3-3.4 5.8-6.2 10.6-12" fill="none" stroke="#ff5f00" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="11.2" cy="20.7" r="1.6" fill="#0f2a48" />
      <circle cx="15.1" cy="16.4" r="1.6" fill="#0f2a48" />
      <circle cx="18.8" cy="11.9" r="1.6" fill="#0f2a48" />
    </svg>
  );
}

/** Logotyp: znak + „EXPERTTMS” w kroju i rytmie znaku ExpertWMS (wersaliki, rozstrzelone). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `inverted` zostaje w API na wypadek wersji na jasnym tle
export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-[20px] leading-none font-bold tracking-[0.06em] text-primary">EXPERTTMS</span>
    </span>
  );
}
