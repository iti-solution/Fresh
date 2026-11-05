import { NextResponse, type NextRequest } from "next/server";
import { UUID_RE } from "@/modules/execution/domain/offline";
import { getDriverCtx } from "@/modules/execution/server/driver-context";
import { getRouteSnapshot } from "@/modules/execution/server/queries";
import { getDriverPayPreview } from "@/modules/payroll/server/preview";

// Migawka trasy do zapisania w telefonie (działa potem bez sieci).
export async function GET(_req: NextRequest, { params }: RouteContext<"/api/driver/route/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const c = await getDriverCtx();
  if (!c) return NextResponse.json({ error: "not_driver" }, { status: 401 });
  const pay = await getDriverPayPreview(c, id).catch(() => null);
  const snap = await getRouteSnapshot(id, pay);
  if (!snap) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(snap, { headers: { "Cache-Control": "no-store" } });
}
