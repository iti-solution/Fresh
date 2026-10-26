import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "plum" | "primary";

export const TONE_PILL: Record<Tone, string> = {
  neutral: "bg-foreground/[0.06] text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  plum: "bg-plum-soft text-plum",
  primary: "bg-accent text-primary-strong",
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-subtle",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  plum: "bg-plum",
  primary: "bg-primary",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  plum: "text-plum",
  primary: "text-primary-strong",
};

/** Status w formie pigułki z kropką. */
export function Pill({
  tone = "neutral",
  children,
  dot = true,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_PILL[tone],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", className, title }: { tone?: Tone; className?: string; title?: string }) {
  return (
    <span
      title={title}
      aria-hidden={!title}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone], className)}
    />
  );
}

/** Tablica rejestracyjna — jak na aucie: biała, z niebieskim paskiem UE. */
export function Plate({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return <span className="text-subtle">brak auta</span>;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-stretch overflow-hidden whitespace-nowrap rounded-[4px] border border-foreground/25 bg-white align-middle shadow-[0_1px_0_rgb(0_0_0/0.04)]",
        className,
      )}
    >
      <span
        className="flex w-[9px] flex-col items-center justify-end bg-[#1f4fa3] pb-[2px] text-[6px] font-bold leading-none text-white"
        aria-hidden
      >
        PL
      </span>
      <span className="flex items-center px-1.5 font-mono text-[12px] font-medium tracking-wide text-foreground">{children}</span>
    </span>
  );
}

/** Numer dokumentu (WZ, zamówienie). */
export function DocRef({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px] text-muted">{children}</span>;
}

/** Auto: tablica + marka i model (+ typ), np. do list szablonów i przydziałów. */
export function VehicleTag({
  registration,
  make,
  kind,
  className,
}: {
  registration: string | null;
  make?: string | null;
  kind?: string | null;
  className?: string;
}) {
  if (!registration) return <span className="text-subtle">brak auta</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <Plate>{registration}</Plate>
      {(make || kind) && (
        <span className="min-w-0 leading-tight">
          {make && <span className="block truncate text-[13px] font-medium text-foreground">{make}</span>}
          {kind && <span className="block truncate text-xs text-muted">{kind}</span>}
        </span>
      )}
    </span>
  );
}
