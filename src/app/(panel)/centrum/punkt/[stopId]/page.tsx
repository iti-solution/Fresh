import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { PageHeader, Panel } from "@/components/panel/page";
import { DocRef, Pill, Plate } from "@/components/ui/status";
import { formatPln, toGrosze } from "@/lib/forms";
import { STOP_STATUS_LABELS, type StopStatus } from "@/modules/execution/domain/execution";
import { PACKAGING_REASONS } from "@/modules/packaging/domain/ledger";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { getStopProof } from "@/modules/ops/server/proof";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Potwierdzenie dostawy" };

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }) : "—");

export default async function StopProofPage({ params }: PageProps<"/centrum/punkt/[stopId]">) {
  const ctx = await requireAccess("/centrum");
  const { stopId } = await params;
  const proof = await getStopProof(ctx.tenantId, stopId);
  if (!proof) notFound();
  const { stop: s, events, photos, signature, packaging, cash } = proof;
  const r = s.routes;
  const p = s.delivery_points;
  const orders = s.route_stop_orders.map((x) => x.orders).filter((o): o is NonNullable<typeof o> => Boolean(o));
  const gps = [...events].reverse().find((e) => e.payload.gps)?.payload.gps;

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href={`/centrum?dzien=${r?.route_date ?? ""}`} className="text-muted hover:text-foreground">
          ‹ Centrum operacyjne
        </Link>
      </nav>
      <PageHeader
        title={`${p?.customers?.name ?? "—"} — ${p?.name ?? ""}`}
        description={
          <>
            {p?.address_line}, {p?.postal_code} {p?.city} · <span className="capitalize">{r ? formatDayLabel(r.route_date) : ""}</span> · {r?.name} · punkt {s.sequence}
          </>
        }
        actions={<Pill tone={s.status === "delivered" ? "success" : ["refused", "absent", "complaint"].includes(s.status) ? "danger" : "warning"}>{STOP_STATUS_LABELS[s.status as StopStatus] ?? s.status}</Pill>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Przebieg na punkcie" flush>
            <ol className="divide-y divide-border text-sm">
              {events.length === 0 && <li className="px-5 py-3 text-muted">Brak zapisów z telefonu.</li>}
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 px-5 py-2.5">
                  <span className="w-12 shrink-0 tabular-nums text-muted">{time(e.occurred_at)}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{e.label}</span>
                    {(e.payload.reason || e.payload.text || e.payload.comment) && (
                      <span className="block text-muted">{e.payload.reason ?? e.payload.text ?? e.payload.comment}</span>
                    )}
                    {e.payload.gps && (
                      <span className="block text-xs text-subtle">
                        GPS {e.payload.gps.lat.toFixed(5)}, {e.payload.gps.lng.toFixed(5)}
                        {e.payload.gps.accuracy ? ` (±${Math.round(e.payload.gps.accuracy)} m)` : ""}
                      </span>
                    )}
                    {new Date(e.received_at).getTime() - new Date(e.occurred_at).getTime() > 5 * 60_000 && (
                      <span className="block text-xs text-subtle">wysłane z opóźnieniem (brak zasięgu) o {time(e.received_at)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Zamówienia i rozliczenie punktu">
            <ul className="flex flex-col gap-1 text-sm">
              {orders.map((o, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <DocRef>{o.external_ref ?? "—"}</DocRef>
                  <span className="text-muted tabular-nums">
                    {o.pallets ? `${Number(o.pallets)} pal · ` : ""}
                    {o.crates} skrz · {Math.round(Number(o.weight_kg))} kg{o.order_value ? ` · ${formatPln(toGrosze(o.order_value))}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid grid-cols-[160px_1fr] gap-y-1 border-t border-border pt-3 text-sm">
              <dt className="text-muted">Pobranie / zebrano</dt>
              <dd>
                {formatPln(orders.reduce((a, o) => a + toGrosze(o.cod_amount), 0))} / {formatPln(cash.reduce((a, c) => a + toGrosze(c.amount), 0))}
              </dd>
              {packaging.map((m, i) => (
                <div key={i} className="contents">
                  <dt className="text-muted">{m.packaging_types?.name}</dt>
                  <dd>
                    {PACKAGING_REASONS[m.reason] ?? m.reason}: {Math.abs(m.qty)}
                  </dd>
                </div>
              ))}
              <dt className="text-muted">Kierowca</dt>
              <dd>
                {r?.drivers ? `${r.drivers.first_name} ${r.drivers.last_name}` : "—"} {r?.vehicles && <Plate>{r.vehicles.registration}</Plate>}
              </dd>
              <dt className="text-muted">Na miejscu / koniec</dt>
              <dd className="tabular-nums">
                {time(s.arrived_at)} / {time(s.completed_at)}
              </dd>
            </dl>
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          <Panel title={`Zdjęcia (${photos.length})`}>
            {photos.length === 0 ? (
              <p className="text-sm text-muted">Brak zdjęć.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((f) =>
                  f.url ? (
                    <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- podpisany link z prywatnego magazynu */}
                      <img src={f.url} alt="Zdjęcie z dostawy" className="aspect-square w-full rounded-lg object-cover" />
                    </a>
                  ) : (
                    <span key={f.id} className="flex aspect-square items-center justify-center rounded-lg bg-surface-2 text-xs text-muted">
                      zdjęcie (brak klucza serwera)
                    </span>
                  ),
                )}
              </div>
            )}
          </Panel>
          <Panel title="Podpis odbiorcy">
            {signature?.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- podpisany link z prywatnego magazynu
              <img src={signature.url} alt="Podpis odbiorcy" className="max-h-40 rounded-lg border border-border bg-white" />
            ) : (
              <p className="text-sm text-muted">{signature ? "Podpis zapisany (podgląd wymaga klucza serwera)." : "Brak podpisu."}</p>
            )}
          </Panel>
          {gps && (
            <Panel title="Gdzie potwierdzono">
              <a
                href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline"
              >
                <MapPin className="size-4" /> {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} — otwórz w mapach
              </a>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
