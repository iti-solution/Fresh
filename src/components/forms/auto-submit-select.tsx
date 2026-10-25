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
        "h-8 max-w-full rounded-md border border-border bg-surface px-2 text-xs outline-none focus:border-primary disabled:opacity-50",
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
        "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-sm hover:bg-accent disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
