"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
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

const inputCls =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 aria-[invalid=true]:border-danger";

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
        <label className={cn("flex items-center gap-2 text-sm sm:col-span-1", f.span && spanCls[f.span])}>
          <input type="checkbox" name={f.name} defaultChecked={f.defaultChecked} className="h-5 w-5 accent-[var(--primary)]" />
          {f.label}
          {f.hint && <span className="text-xs text-muted">({f.hint})</span>}
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
              <span className="flex h-10 w-11 items-center justify-center rounded-md border border-border bg-surface text-sm font-medium peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
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
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
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

  return (
    <div className={cn("flex flex-col gap-1.5 sm:col-span-1", f.span && spanCls[f.span])}>
      <label id={`${id}-label`} htmlFor={f.kind === "weekdays" ? undefined : id} className="text-sm font-medium">
        {f.label}
      </label>
      {control}
      {invalid ? (
        <p id={`${id}-err`} className="text-xs text-danger">
          {errors!.join(" ")}
        </p>
      ) : (
        f.hint && (
          <p id={`${id}-hint`} className="text-xs text-muted">
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
    <form key={submitted.version} action={formAction} className="flex max-w-4xl flex-col gap-6" noValidate>
      {sections.map((s) => (
        <fieldset key={s.title} className="rounded-lg border border-border bg-surface p-5">
          <legend className="px-1 text-sm font-semibold">{s.title}</legend>
          {s.description && <p className="-mt-1 mb-3 text-xs text-muted">{s.description}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {s.fields.map((f) => (
              <Field key={f.name} f={withSubmitted(f, sub)} errors={state.fieldErrors?.[f.name]} />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button type="submit" disabled={pending}>
          {pending ? "Zapisywanie…" : submitLabel}
        </Button>
        {cancelHref && (
          <Link href={cancelHref} className="text-sm text-muted hover:underline">
            Anuluj
          </Link>
        )}
        {state.message && (
          <p role="status" className={cn("text-sm", state.ok ? "text-primary" : "text-danger")}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
