import writeXlsxFile from "write-excel-file/node";
import { NextResponse, type NextRequest } from "next/server";
import { toGrosze } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { MONTH_RE } from "@/modules/payroll/domain/month";
import { LINE_LABELS, monthRange, type PayLineCode } from "@/modules/payroll/domain/payroll";
import { canAccess } from "@/modules/tenancy/domain/access";
import { getUserWithMemberships } from "@/modules/tenancy/server/context";
import { TENANT_COOKIE } from "@/lib/env";

// M5.4 — eksport rozliczeń miesiąca dla kadr (XLSX): podsumowanie na kierowcę + wszystkie pozycje z opisem.
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("miesiac") ?? "";
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "bad_month" }, { status: 400 });
  const user = await getUserWithMemberships();
  const selected = request.cookies.get(TENANT_COOKIE)?.value;
  const m =
    user?.memberships.find((x) => x.tenantId === selected) ?? (user?.memberships.length === 1 ? user.memberships[0] : undefined);
  if (!m || !canAccess(m.role, "/rozliczenia")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { from, to } = monthRange(month);
  const db = await createClient();
  const { data, error } = await db
    .from("driver_settlements")
    .select(
      "id, status, total_amount, approved_at, drivers(first_name, last_name, employment_type), driver_settlement_lines(work_date, code, label, quantity, rate, amount, note, is_manual, routes(name))",
    )
    .eq("tenant_id", m.tenantId)
    .eq("period_start", from)
    .eq("period_end", to);
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });

  const codes = Object.keys(LINE_LABELS) as PayLineCode[];
  const bold = { fontWeight: "bold" as const };
  const head = (labels: string[]) => labels.map((value) => ({ value, ...bold }));
  const rows = (data ?? []).sort((a, b) => (a.drivers?.last_name ?? "").localeCompare(b.drivers?.last_name ?? "", "pl"));

  const summary = [
    head(["Kierowca", "Forma zatrudnienia", "Status", "Dni pracy", ...codes.map((c) => LINE_LABELS[c]), "Razem [zł]"]),
    ...rows.map((s) => {
      const lines = s.driver_settlement_lines ?? [];
      const sum = (c: string) =>
        lines.filter((l) => (l.code ?? "manual") === c).reduce((a, l) => a + toGrosze(l.amount), 0) / 100;
      return [
        `${s.drivers?.last_name ?? ""} ${s.drivers?.first_name ?? ""}`.trim(),
        s.drivers?.employment_type ?? "",
        s.status === "draft" ? "robocze" : "zatwierdzone",
        new Set(lines.filter((l) => !l.is_manual).map((l) => l.work_date)).size,
        ...codes.map((c) => sum(c)),
        toGrosze(s.total_amount) / 100,
      ];
    }),
  ];
  const detail = [
    head(["Kierowca", "Dzień", "Trasa", "Składnik", "Ilość", "Stawka", "Kwota [zł]", "Skąd się wzięła"]),
    ...rows.flatMap((s) =>
      [...(s.driver_settlement_lines ?? [])]
        .sort((a, b) => a.work_date.localeCompare(b.work_date))
        .map((l) => [
          `${s.drivers?.last_name ?? ""} ${s.drivers?.first_name ?? ""}`.trim(),
          l.work_date,
          l.routes?.name ?? "",
          l.label ?? l.code ?? "",
          Number(l.quantity),
          Number(l.rate),
          Number(l.amount),
          l.note ?? "",
        ]),
    ),
  ];
  const buffer = await writeXlsxFile([
    {
      sheet: "Podsumowanie",
      data: summary,
      columns: [{ width: 28 }, { width: 18 }, { width: 14 }, { width: 10 }, ...codes.map(() => ({ width: 14 })), { width: 14 }],
    },
    {
      sheet: "Pozycje",
      data: detail,
      columns: [
        { width: 28 },
        { width: 12 },
        { width: 26 },
        { width: 22 },
        { width: 10 },
        { width: 10 },
        { width: 12 },
        { width: 70 },
      ],
    },
  ]).toBuffer();
  const approvedIds = rows.filter((s) => s.status === "approved").map((s) => s.id);
  if (approvedIds.length)
    await db.from("driver_settlements").update({ exported_at: new Date().toISOString() }).in("id", approvedIds);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rozliczenia-kierowcow-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
