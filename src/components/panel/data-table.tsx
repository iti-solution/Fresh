import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string; headClassName?: string };

/** Gęsta tabela do odczytu: przyklejony nagłówek, wyrównane liczby, podświetlenie wiersza. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  className,
  rowClassName,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  empty: ReactNode;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  if (rows.length === 0) return <div className="px-5 py-10 text-center text-sm text-muted">{empty}</div>;
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted first:pl-5 last:pr-5",
                  c.headClassName,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn("border-b border-border transition-colors last:border-0 hover:bg-surface-2", rowClassName?.(row))}
            >
              {columns.map((c) => (
                <td key={c.header} className={cn("px-4 py-2.5 align-middle first:pl-5 last:pr-5", c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
