import type { Metadata } from "next";
import Link from "next/link";
import { requirePortalContext } from "@/modules/portal/server/context";
import { getPortalPoints } from "@/modules/portal/server/queries";
import { VoiceComposer } from "@/modules/portal/ui/voice-composer";

export const metadata: Metadata = { title: "Napisz lub nagraj zamówienie" };

export default async function WriteOrderPage() {
  const ctx = await requirePortalContext();
  const points = await getPortalPoints(ctx);
  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href="/portal" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
          ‹ Moje zamówienia
        </Link>
      </nav>
      <h1 className="mb-1 text-[24px] font-semibold leading-tight tracking-[-0.01em]">Napisz lub nagraj zamówienie</h1>
      <p className="mb-4 text-sm text-muted">
        Tak jak w SMS-ie albo przez telefon — własnymi słowami. Resztą zajmie się hurtownia.
      </p>
      <VoiceComposer points={points} />
    </>
  );
}
