"use client";

import {
  Banknote,
  CalendarClock,
  ClipboardList,
  IdCard,
  MapPin,
  MessageSquareText,
  Package,
  Route,
  Store,
  Truck,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/primitives";
import { formToObject, type FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

export type FieldOption = { value: string; label: string };

export type FieldDef =
  | {
      kind: "text" | "tel" | "date" | "time";
      name: string;
      label: string;
      defaultValue?: string | null;
      placeholder?: string;
      span?: 1 | 2 | 3;
      hint?: string;
      required?: boolean;
    }
  | {
      kind: "number";
      name: string;
      label: string;
      defaultValue?: number | string | null;
      placeholder?: string;
      span?: 1 | 2 | 3;
      hint?: string;
      step?: string;
      suffix?: string;
    }
  | {
      kind: "textarea";
      name: string;
      label: string;
      defaultValue?: string | null;
      placeholder?: string;
      span?: 1 | 2 | 3;
      hint?: string;
    }
  | {
      kind: "select";
      name: string;
      label: string;
      defaultValue?: string | null;
      options: FieldOption[];
      span?: 1 | 2 | 3;
      hint?: string;
      emptyLabel?: string;
    }
  | { kind: "checkbox"; name: string; label: string; defaultChecked?: boolean; span?: 1 | 2 | 3; hint?: string }
  | { kind: "weekdays"; name: string; label: string; defaultValue?: number[]; span?: 1 | 2 | 3; hint?: string }
  | {
      kind: "timerange";
      name: string;
      nameTo: string;
      label: string;
      defaultFrom?: string;
      defaultTo?: string;
      span?: 1 | 2 | 3;
      hint?: string;
    };

export type SectionDef = { title: string; description?: string; fields: FieldDef[] };

const WEEKDAYS = [
  { v: 1, l: "pn" },
  { v: 2, l: "wt" },
  { v: 3, l: "śr" },
  { v: 4, l: "cz" },
  { v: 5, l: "pt" },
  { v: 6, l: "sb" },
  { v: 7, l: "nd" },
];

const inputCls = cn(inputClass, "h-11 rounded-md");

/** Ikona sekcji dobrana po tytule (formularze kartotek, zamówień, rozliczeń). */
const SECTION_ICONS: [RegExp, LucideIcon][] = [
  [/pojazd|auto/i, Truck],
  [/ładown|ładunek|opakow/i, Package],
  [/koszt|własno|stawk|rozlicz/i, Wallet],
  [/gotówk|pobran/i, Banknote],
  [/kierowc|osoba|opiekun|kontakt/i, User],
  [/adres|dostawy$/i, MapPin],
  [/kiedy|okno|godzin|harmonogram|przydział/i, CalendarClock],
  [/trasa/i, Route],
  [/uwag/i, MessageSquareText],
  [/klient|kontrahent|firma/i, Store],
  [/etat|umow|zatrudn/i, IdCard],
];
function sectionIcon(title: string): LucideIcon {
  return SECTION_ICONS.find(([re]) => re.test(title))?.[1] ?? ClipboardList;
}

/** Etykieta w górnej krawędzi pola (jak w Material) — więcej pól na ekranie, opis zawsze widoczny. */
const floatLabel =
  "pointer-events-none absolute -top-2 left-2.5 z-[1] max-w-[calc(100%-1.25rem)] truncate bg-surface px-1 text-[11.5px] leading-4 font-medium text-muted";

const spanCls = { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3" } as const;

type Submitted = Record<string, unknown> | null;

/** Po błędzie walidacji pokazujemy to, co użytkownik wpisał, a nie wartości sprzed edycji. */
function withSubmitted(f: FieldDef, sub: Submitted): FieldDef {
  if (!sub) return f;
  const str = (k: string) => (typeof sub[k] === "string" ? (sub[k] as string) : "");
  switch (f.kind) {
    case "checkbox":
      return { ...f, defaultChecked: sub[f.name] !== undefined };
    case "weekdays":
      return { ...f, defaultValue: ((sub[f.name] as string[] | undefined) ?? []).map(Number) };
    case "timerange":
      return { ...f, defaultFrom: str(f.name), defaultTo: str(f.nameTo) };
    default:
      return { ...f, defaultValue: str(f.name) } as FieldDef;
  }
}

function Field({ f, errors }: { f: FieldDef; errors?: string[] }) {
  const id = `f-${f.name}`;
  const invalid = Boolean(errors?.length);
  const describedBy = invalid ? `${id}-err` : f.hint ? `${id}-hint` : undefined;

  let control: React.ReactNode;
  switch (f.kind) {
    case "textarea":
      control = (
        <textarea
          id={id}
          name={f.name}
          defaultValue={f.defaultValue ?? ""}
          placeholder={f.placeholder}
          rows={3}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(inputCls, "h-auto min-h-20 py-2")}
        />
      );
      break;
    case "select":
      control = (
        <select
          id={id}
          name={f.name}
          defaultValue={f.defaultValue ?? ""}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputCls}
        >
          {f.emptyLabel !== undefined && <option value="">{f.emptyLabel}</option>}
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "checkbox":
      return (
        <label
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-3 self-start rounded-md text-[13px] sm:col-span-1",
            f.span && spanCls[f.span],
          )}
        >
          <input type="checkbox" name={f.name} defaultChecked={f.defaultChecked} className="peer sr-only" />
          <span className="relative h-5 w-9 shrink-0 rounded-full bg-foreground/15 transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-primary-strong peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
          <span>
            <span className="block font-medium">{f.label}</span>
            {f.hint && <span className="block text-[11.5px] text-muted">{f.hint}</span>}
          </span>
        </label>
      );
    case "weekdays":
      control = (
        <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => (
            <label key={d.v} className="cursor-pointer">
              <input
                type="checkbox"
                name={`${f.name}[]`}
                value={d.v}
                defaultChecked={f.defaultValue?.includes(d.v)}
                className="peer sr-only"
              />
              <span className="flex h-8 min-w-12 items-center justify-center rounded-md border border-border-strong bg-surface px-2 text-[12.5px] font-semibold peer-checked:border-primary-strong peer-checked:bg-accent peer-checked:text-primary-strong peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
                {d.l}
              </span>
            </label>
          ))}
        </div>
      );
      break;
    case "timerange":
      control = (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="time"
            name={f.name}
            defaultValue={f.defaultFrom ?? ""}
            aria-label={`${f.label} od`}
            aria-invalid={invalid}
            className={inputCls}
          />
          <span className="text-muted">–</span>
          <input
            type="time"
            name={f.nameTo}
            defaultValue={f.defaultTo ?? ""}
            aria-label={`${f.label} do`}
            aria-invalid={invalid}
            className={inputCls}
          />
        </div>
      );
      break;
    case "number":
      control = (
        <div className="relative">
          <input
            id={id}
            name={f.name}
            inputMode="decimal"
            defaultValue={f.defaultValue ?? ""}
            placeholder={f.placeholder}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={cn(inputCls, f.suffix && "pr-12")}
          />
          {f.suffix && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted">
              {f.suffix}
            </span>
          )}
        </div>
      );
      break;
    default:
      control = (
        <input
          id={id}
          type={f.kind}
          name={f.name}
          defaultValue={f.defaultValue ?? ""}
          placeholder={f.placeholder}
          required={f.required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputCls}
        />
      );
  }

  const floating = f.kind !== "weekdays";
  const required = "required" in f && f.required;
  return (
    <div className={cn("flex flex-col gap-1 sm:col-span-1", f.span && spanCls[f.span])}>
      {floating ? (
        <div className="relative">
          <label id={`${id}-label`} htmlFor={id} className={cn(floatLabel, invalid && "text-danger")}>
            {f.label}
            {required && "*"}
          </label>
          {control}
        </div>
      ) : (
        <>
          <label id={`${id}-label`} className="text-[12.5px] font-medium text-muted">
            {f.label}
          </label>
          {control}
        </>
      )}
      {invalid ? (
        <p id={`${id}-err`} className="px-1 text-[11.5px] text-danger">
          {errors!.join(" ")}
        </p>
      ) : (
        f.hint && (
          <p id={`${id}-hint`} className="px-1 text-[11.5px] leading-snug text-muted">
            {f.hint}
          </p>
        )
      )}
    </div>
  );
}

export function FormRenderer({
  action,
  sections,
  submitLabel = "Zapisz",
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  sections: SectionDef[];
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [submitted, setSubmitted] = useState<{ values: Submitted; version: number }>({ values: null, version: 0 });
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await action(prev, fd);
    // po błędzie zachowujemy wpisane wartości; po sukcesie wracamy do danych z serwera
    setSubmitted((s) => ({ values: result.ok ? null : formToObject(fd), version: s.version + 1 }));
    return result;
  }, {});
  const sub = submitted.values;
  return (
    <form
      key={submitted.version}
      action={formAction}
      className="max-w-4xl overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-panel)]"
      noValidate
    >
      {sections.map((s) => {
        const Icon = sectionIcon(s.title);
        return (
          <fieldset key={s.title} className="border-b border-border px-5 pt-4 pb-5 last-of-type:border-b-0">
            <legend className="sr-only">{s.title}</legend>
            <div className="mb-4" aria-hidden>
              <p className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.06em] text-foreground uppercase">
                <Icon className="size-4 text-muted" strokeWidth={1.8} />
                {s.title}
              </p>
              {s.description && <p className="mt-1 pl-6 text-[12px] text-muted">{s.description}</p>}
            </div>
            <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-3">
              {s.fields.map((f) => (
                <Field key={f.name} f={withSubmitted(f, sub)} errors={state.fieldErrors?.[f.name]} />
              ))}
            </div>
          </fieldset>
        );
      })}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface-2/95 px-5 py-3 backdrop-blur">
        {state.message && (
          <p role="status" className={cn("mr-auto text-sm font-medium", state.ok ? "text-success" : "text-danger")}>
            {state.message}
          </p>
        )}
        {cancelHref && (
          <Link href={cancelHref} className="rounded-md px-3 py-2 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.05]">
            Anuluj
          </Link>
        )}
        <Button type="submit" disabled={pending} size="sm" className="min-w-24">
          {pending ? "Zapisywanie…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
