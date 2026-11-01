import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { requirePortalContext } from "@/modules/portal/server/context";
import { getPortalMessage } from "@/modules/portal/server/queries";

export const metadata: Metadata = { title: "Wysłane zamówienie" };

export default async function PortalMessagePage({ params, searchParams }: PageProps<"/portal/wiadomosc/[id]">) {
  const ctx = await requirePortalContext();
  const { id } = await params;
  const sp = await searchParams;
  const m = await getPortalMessage(ctx, id);
  if (!m) notFound();

  const status =
    m.status === "approved"
      ? {
          icon: CheckCircle2,
          cls: "text-success",
          title: "Zamówienie przyjęte",
          text: "Obsługa klienta potwierdziła zamówienie.",
        }
      : m.status === "rejected"
        ? {
            icon: XCircle,
            cls: "text-danger",
            title: "Nie przyjęto jako zamówienie",
            text: "Obsługa klienta skontaktuje się z Tobą. Możesz też zadzwonić do opiekuna.",
          }
        : {
            icon: Clock,
            cls: "text-info",
            title: "Obsługa klienta sprawdza",
            text: "Zamieniamy Twoją wiadomość na zamówienie. Potwierdzenie pojawi się tutaj.",
          };
  const Icon = status.icon;

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-sm">
        <Link href="/portal" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
          ‹ Moje zamówienia
        </Link>
      </nav>
      <section className="rounded-[var(--radius-panel)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
        {sp.wyslano === "1" && (
          <p className="mb-3 text-sm font-semibold text-success">Dziękujemy — wiadomość wysłana do hurtowni.</p>
        )}
        <div className="flex items-start gap-3">
          <Icon className={cn("mt-0.5 size-6 shrink-0", status.cls)} />
          <div>
            <h1 className="text-[20px] font-semibold leading-tight">{status.title}</h1>
            <p className="mt-1 text-sm text-muted">{status.text}</p>
            <p className="mt-2 text-sm capitalize">
              {m.delivery_date ? formatDayLabel(m.delivery_date) : "—"}
              {m.delivery_points?.name && <span className="normal-case text-muted"> · {m.delivery_points.name}</span>}
            </p>
          </div>
        </div>
        {m.order_id && (
          <Link href={`/portal/zamowienie/${m.order_id}`} className={cn(buttonVariants({ size: "lg" }), "mt-4 w-full")}>
            Zobacz zamówienie
          </Link>
        )}
      </section>
      <section className="rounded-[var(--radius-panel)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
        <h2 className="mb-2 text-sm font-semibold text-muted">
          Twoja wiadomość{m.inbound_messages?.audio_path ? " (z nagraniem)" : ""}
        </h2>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.inbound_messages?.body}</p>
      </section>
    </div>
  );
}
