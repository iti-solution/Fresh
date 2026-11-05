"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, inputClass } from "@/components/ui/primitives";
import { Pill } from "@/components/ui/status";
import { guessMapping, rowsToObjects, type Cell, type ImportField, type RawRow } from "@/lib/tabular";
import { cn } from "@/lib/utils";

export type WizardIssue = { line: number; ref: string; problem: string };
export type WizardResult = {
  ok: boolean;
  message?: string;
  summary?: Record<string, number>;
  issues?: WizardIssue[];
};

export type WizardPayload = { fileName: string; defaultDate: string; mapping: Record<string, string>; rows: RawRow[]; firstLine: number };

const SUMMARY_LABELS: Record<string, string> = {
  total: "wierszy w pliku",
  created: "nowych",
  updated: "zaktualizowanych",
  unmatched: "do dopasowania",
  skipped: "pominiętych",
  errors: "z błędami",
  customers_created: "nowych klientów",
  customers_updated: "zaktualizowanych klientów",
  points_created: "nowych adresów",
  points_updated: "zaktualizowanych adresów",
};

async function readFile(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { default: readXlsxFile } = await import("read-excel-file");
    return (await readXlsxFile(file)) as Cell[][];
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const Papa = (await import("papaparse")).default;
    // eksporty z polskich systemów bywają w Windows-1250 — gdy UTF-8 daje „�”, czytamy jeszcze raz
    let text = await file.text();
    if (text.includes("�")) text = new TextDecoder("windows-1250").decode(await file.arrayBuffer());
    const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy", delimiter: "" });
    return parsed.data as Cell[][];
  }
  throw new Error("Obsługujemy pliki .xlsx i .csv. Plik .xls zapisz w Excelu jako .xlsx.");
}

/**
 * Import z pliku w trzech krokach: plik → przypisanie kolumn (zapamiętane dla firmy) → wynik z listą problemów.
 * Plik czytamy w przeglądarce; na serwer idą tylko przypisane kolumny.
 */
export function ImportWizard({
  fields,
  savedMapping,
  action,
  defaultDate,
  askDate = true,
  unmatchedHref,
  doneHref,
  doneLabel,
}: {
  fields: ImportField[];
  savedMapping: Record<string, string> | null;
  action: (p: WizardPayload) => Promise<WizardResult>;
  defaultDate: string;
  askDate?: boolean;
  unmatchedHref?: string;
  doneHref: string;
  doneLabel: string;
}) {
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: RawRow[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [date, setDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WizardResult | null>(null);
  const [pending, start] = useTransition();

  const missing = fields.filter((f) => f.required && !mapping[f.key]);
  const preview = useMemo(() => file?.rows.slice(0, 5) ?? [], [file]);
  const mappedFields = fields.filter((f) => mapping[f.key]);

  async function onFile(f: File | undefined) {
    setError(null);
    setResult(null);
    if (!f) return;
    try {
      const { headers, rows } = rowsToObjects(await readFile(f));
      if (!rows.length) throw new Error("W pliku nie ma wierszy z danymi pod nagłówkami.");
      setFile({ name: f.name, headers, rows });
      setMapping(guessMapping(fields, headers, savedMapping) as Record<string, string>);
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : "Nie udało się odczytać pliku.");
    }
  }

  function submit() {
    if (!file) return;
    const used = new Set(Object.values(mapping).filter(Boolean));
    const rows = file.rows.map((r) => Object.fromEntries(Object.entries(r).filter(([h]) => used.has(h))));
    const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
    start(async () => {
      try {
        const r = await action({ fileName: file.name, defaultDate: date, mapping: clean, rows, firstLine: 2 });
        setResult(r);
        if (!r.ok) setError(r.message ?? "Import się nie udał.");
      } catch {
        setError("Import się nie udał — plik mógł być za duży. Podziel go na mniejsze części.");
      }
    });
  }

  if (result?.ok && result.summary) {
    const s = result.summary;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(s)
            .filter(([k, v]) => v > 0 || k === "total")
            .map(([k, v]) => (
              <Pill key={k} tone={k === "unmatched" || k === "errors" ? "warning" : k === "total" ? "neutral" : "success"}>
                {v} {SUMMARY_LABELS[k] ?? k}
              </Pill>
            ))}
        </div>
        {result.issues && result.issues.length > 0 && (
          <div className="max-h-96 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Wiersz</th>
                  <th className="px-3 py-2 font-medium">Numer</th>
                  <th className="px-3 py-2 font-medium">Co jest nie tak</th>
                </tr>
              </thead>
              <tbody>
                {result.issues.map((i, n) => (
                  <tr key={n} className="border-t border-border">
                    <td className="px-3 py-1.5 tabular-nums">{i.line || "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{i.ref || "—"}</td>
                    <td className="px-3 py-1.5">{i.problem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {unmatchedHref && (s.unmatched ?? 0) > 0 && (
            <Link href={unmatchedHref} className={buttonVariants()}>
              Dopasuj {s.unmatched} ręcznie
            </Link>
          )}
          <Link href={doneHref} className={buttonVariants({ variant: unmatchedHref && (s.unmatched ?? 0) > 0 ? "outline" : "primary" })}>
            {doneLabel}
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setFile(null);
              setResult(null);
            }}
          >
            Importuj kolejny plik
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Plik z ERP (.xlsx albo .csv)
          <input
            type="file"
            accept=".xlsx,.csv,.txt"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="text-sm file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:font-medium file:text-primary-strong"
          />
        </label>
        {askDate && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Dzień dostawy (gdy plik go nie podaje)
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </label>
        )}
      </div>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {file && (
        <>
          <p className="text-sm text-muted">
            <strong className="text-foreground">{file.name}</strong> · {file.rows.length} wierszy · {file.headers.length} kolumn. Sprawdź,
            która kolumna z pliku odpowiada któremu polu. Przypisanie zapamiętamy na następny raz.
          </p>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  {f.label} {f.required && <span className="text-danger">*</span>}
                </span>
                <select
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                  className={cn(inputClass, "h-9", !mapping[f.key] && "text-subtle")}
                >
                  <option value="">— brak w pliku —</option>
                  {file.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {f.hint && <span className="text-xs text-muted">{f.hint}</span>}
              </label>
            ))}
          </div>

          {mappedFields.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    {mappedFields.map((f) => (
                      <th key={f.key} className="whitespace-nowrap px-3 py-2 font-medium">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {mappedFields.map((f) => (
                        <td key={f.key} className="max-w-48 truncate whitespace-nowrap px-3 py-1.5">
                          {r[mapping[f.key]] || <span className="text-subtle">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-3 py-1.5 text-xs text-muted">Podgląd pierwszych {preview.length} wierszy.</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={pending || missing.length > 0}>
              {pending ? "Importuję…" : `Importuj ${file.rows.length} wierszy`}
            </Button>
            {missing.length > 0 && <span className="text-sm text-danger">Brakuje: {missing.map((f) => f.label).join(", ")}</span>}
          </div>
        </>
      )}
    </div>
  );
}
