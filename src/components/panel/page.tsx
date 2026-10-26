import Link from "next/link";
import type { ReactNode } from "react";
import { TONE_TEXT, type Tone } from "@/components/ui/status";
import { cn } from "@/lib/utils";

/** Nagłówek ekranu: tytuł, jedno zdanie opisu, akcje po prawej. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-foreground">{title}</h1>
        {description && <p className="max-w-3xl text-sm text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Sekcja ekranu z nagłówkiem. `flush` = treść bez wewnętrznego odstępu (tabele, listy). */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  flush,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold leading-snug">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? undefined : "p-5"}>{children}</div>
    </section>
  );
}

/** Kafelek liczby: wartość jest pierwsza, etykieta pod nią — czyta się jak zdanie „40 zamówień”. */
export function StatTile({
  label,
  value,
  sub,
  tone,
  delta,
  deltaGoodWhen = "up",
  deltaSuffix = "%",
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  delta?: number | null;
  deltaGoodWhen?: "up" | "down";
  deltaSuffix?: string;
  href?: string;
  icon?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon && <span className={cn("text-subtle [&_svg]:size-4", tone && TONE_TEXT[tone])}>{icon}</span>}
      </div>
      <p
        className={cn(
          "mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
          tone && tone !== "neutral" && TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        {delta !== undefined && <Delta value={delta} goodWhen={deltaGoodWhen} suffix={deltaSuffix} />}
        {sub && <span>{sub}</span>}
      </div>
    </>
  );
  const cls = "block min-w-0 rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-[var(--shadow-panel)]";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-border-strong hover:bg-surface-2")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Zmiana r/r (tydzień do tygodnia). Kolor zależy od tego, czy wzrost jest dobry. */
export function Delta({
  value,
  goodWhen = "up",
  suffix = "%",
}: {
  value: number | null | undefined;
  goodWhen?: "up" | "down";
  suffix?: string;
}) {
  if (value === null || value === undefined) return <span className="text-subtle">brak porównania</span>;
  const good = goodWhen === "up" ? value >= 0 : value <= 0;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1 font-semibold tabular-nums",
        good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      {sign}
      {Math.abs(value).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}
      {suffix}
    </span>
  );
}

/** Pasek wypełnienia (ładowność, postęp). Kolor rośnie z ryzykiem. */
export function Meter({ pct, tone, className, label }: { pct: number | null; tone?: Tone; className?: string; label?: string }) {
  const p = pct ?? 0;
  const auto: Tone = p > 100 ? "danger" : p >= 90 ? "warning" : "primary";
  const t = tone ?? auto;
  const bg = {
    danger: "bg-danger",
    warning: "bg-warning",
    primary: "bg-primary",
    success: "bg-success",
    info: "bg-info",
    plum: "bg-plum",
    neutral: "bg-subtle",
  }[t];
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.07]", className)}
      role="meter"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full", bg)} style={{ width: `${Math.max(0, Math.min(p, 100))}%` }} />
    </div>
  );
}

/** Pusty stan: mówi, co zrobić dalej. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && (
        <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Komunikat w treści (potwierdzenie, ostrzeżenie). */
export function Notice({
  tone = "primary",
  children,
  className,
}: {
  tone?: "primary" | "warning" | "danger" | "info";
  children: ReactNode;
  className?: string;
}) {
  const cls = {
    primary: "border-primary/20 bg-accent text-primary-strong",
    warning: "border-warning/25 bg-warning-soft text-[#7a4900]",
    danger: "border-danger/25 bg-danger-soft text-danger",
    info: "border-info/20 bg-info-soft text-info",
  }[tone];
  return (
    <div
      role="status"
      className={cn("mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-sm", cls, className)}
    >
      {children}
    </div>
  );
}

/** Przełącznik zakładek opartych o link (filtry w adresie — działają też po odświeżeniu). */
export function Segmented({
  items,
  className,
}: {
  items: { href: string; label: ReactNode; active: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <nav className={cn("inline-flex flex-wrap gap-0.5 rounded-lg bg-foreground/[0.06] p-0.5", className)}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
            i.active ? "bg-surface text-foreground shadow-[0_1px_2px_rgb(20_32_27/0.12)]" : "text-muted hover:text-foreground",
          )}
        >
          {i.label}
          {i.count !== undefined && (
            <span className={cn("tabular-nums text-xs", i.active ? "text-muted" : "text-subtle")}>{i.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
