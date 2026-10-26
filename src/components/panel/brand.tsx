import { cn } from "@/lib/utils";

/** Znak Fresh: liść, którego nerw jest trasą z trzema przystankami. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#2f8a57" />
      <path d="M8.5 23.5C8.5 14 14.5 8.5 24 8.5c0 9.5-5.5 15-15.5 15Z" fill="#e8f5ec" />
      <path d="M10 22c3-3.2 5.2-5.6 9.6-11" fill="none" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11.6" cy="20.2" r="1.5" fill="#1f7a4d" />
      <circle cx="15.2" cy="16.3" r="1.5" fill="#1f7a4d" />
      <circle cx="18.6" cy="12.2" r="1.5" fill="#1f7a4d" />
    </svg>
  );
}

export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className={cn("text-[19px] font-semibold tracking-[-0.02em]", inverted ? "text-white" : "text-foreground")}>
        Fresh
      </span>
    </span>
  );
}
