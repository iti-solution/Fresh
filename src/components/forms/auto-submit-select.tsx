"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/** Lista rozwijana, która zapisuje wybór od razu (bez przycisku). Działa wewnątrz <form action={…}>. */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  placeholder,
  label,
  className,
}: {
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  placeholder?: string;
  label: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={defaultValue ?? ""}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={cn(
        "h-8 max-w-full cursor-pointer rounded-md border border-border-strong bg-surface px-2 text-xs text-foreground outline-none hover:border-subtle focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:opacity-50",
        className,
      )}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Mały przycisk ikonowy z obsługą stanu wysyłania. */
export function IconSubmit({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-label={label}
      title={label}
      disabled={pending}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-40 [&_svg]:size-4",
        className,
      )}
    >
      {children}
    </button>
  );
}
