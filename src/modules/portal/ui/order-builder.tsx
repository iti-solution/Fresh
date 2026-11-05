"use client";

import { Minus, Plus, Search, Star, X } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/primitives";
import { formatPln, toGrosze, type FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { isFractionalUnit, mergeCart, parseQty, stepQty, summarizeCart, unitLabel, type CatalogItem } from "../domain/portal";
import { placePortalOrder, toggleFavorite } from "../server/actions";

export type BuilderPoint = { id: string; name: string; address: string; window: string | null; dates: string[] };
export type BuilderProduct = {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  unit: string;
  unit_weight_kg: number | string | null;
  price: number | string | null;
  pack_label?: string | null;
  is_special?: boolean;
  image_url?: string | null;
};

const ALL = "__all__";
const IN_CART = "__cart__";
const FAVS = "__fav__";

function fmtQty(n: number, unit: string): string {
  return isFractionalUnit(unit) ? n.toLocaleString("pl-PL", { maximumFractionDigits: 3 }) : String(Math.round(n));
}

export function OrderBuilder({
  points,
  products,
  initialQty,
  initialPointId,
  notice,
  favorites: initialFavorites = [],
}: {
  points: BuilderPoint[];
  products: BuilderProduct[];
  initialQty: Record<string, number>;
  initialPointId?: string;
  notice?: string;
  favorites?: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(placePortalOrder, {});
  const [pointId, setPointId] = useState(() => (points.some((p) => p.id === initialPointId) ? initialPointId! : points[0]?.id));
  const point = points.find((p) => p.id === pointId) ?? points[0];
  const [date, setDate] = useState(point?.dates[0] ?? "");
  const [qty, setQty] = useState<Record<string, number>>(initialQty);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // to, co klient właśnie wpisuje w pole ilości
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(() => new Set(initialFavorites));
  const [, startFav] = useTransition();
  // jak u Fresho: kto ma ulubione, zaczyna od nich; „Zamów to samo” — od koszyka
  const [category, setCategory] = useState(Object.keys(initialQty).length ? IN_CART : initialFavorites.length ? FAVS : ALL);

  const catalog = useMemo(() => new Map<string, CatalogItem>(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category ?? "Inne"))], [products]);
  const lines = useMemo(() => mergeCart(Object.entries(qty).map(([product_id, q]) => ({ product_id, qty: q }))), [qty]);
  const summary = summarizeCart(lines, catalog);

  const q = query.trim().toLocaleLowerCase("pl");
  const visible = products.filter((p) => {
    if (category === IN_CART && !(qty[p.id] > 0)) return false;
    if (category === FAVS && !favorites.has(p.id)) return false;
    if (category !== ALL && category !== IN_CART && category !== FAVS && (p.category ?? "Inne") !== category) return false;
    return !q || p.name.toLocaleLowerCase("pl").includes(q) || (p.code ?? "").toLocaleLowerCase("pl").includes(q);
  });

  function choosePoint(id: string) {
    setPointId(id);
    const p = points.find((x) => x.id === id);
    if (p && !p.dates.includes(date)) setDate(p.dates[0] ?? "");
  }

  function flipFavorite(p: BuilderProduct) {
    const on = !favorites.has(p.id);
    setFavorites((cur) => {
      const next = new Set(cur);
      if (on) next.add(p.id);
      else next.delete(p.id);
      return next;
    });
    startFav(() => toggleFavorite(p.id, on));
  }

  function setProductQty(p: BuilderProduct, value: number) {
    setQty((cur) => {
      const next = { ...cur };
      if (value > 0) next[p.id] = value;
      else delete next[p.id];
      return next;
    });
  }

  if (!point) {
    return <p className="text-sm text-muted">Do Twojego konta nie ma przypisanego adresu dostawy. Skontaktuj się z hurtownią.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5 pb-36">
      <input type="hidden" name="delivery_point_id" value={point.id} />
      <input type="hidden" name="delivery_date" value={date} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      {notice && <p className="rounded-lg border border-info/20 bg-info-soft px-4 py-2.5 text-sm text-info">{notice}</p>}

      {/* DOKĄD */}
      <section aria-labelledby="dokad">
        <h2 id="dokad" className="mb-2 px-1 text-[15px] font-semibold">
          Dokąd
        </h2>
        <div className="grid grid-cols-1 gap-2">
          {points.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-panel)] border bg-surface px-4 py-3 transition-colors",
                p.id === point.id ? "border-primary ring-[3px] ring-primary/15" : "border-border hover:border-border-strong",
                points.length === 1 && "cursor-default",
              )}
            >
              <input
                type="radio"
                name="point_choice"
                value={p.id}
                checked={p.id === point.id}
                onChange={() => choosePoint(p.id)}
                className="size-5 accent-[var(--primary)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-sm text-muted">
                  {p.address}
                  {p.window && ` · przyjęcia ${p.window}`}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* KIEDY */}
      <section aria-labelledby="kiedy">
        <h2 id="kiedy" className="mb-2 px-1 text-[15px] font-semibold">
          Kiedy
        </h2>
        {point.dates.length === 0 ? (
          <p className="rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-[#6e4700]">
            Pod ten adres w najbliższych dniach nie ma dostaw. Wybierz inny adres albo zadzwoń do opiekuna.
          </p>
        ) : (
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Dzień dostawy">
            {point.dates.map((d) => {
              const [day, dm] = formatDayLabel(d).split(", ");
              const active = d === date;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDate(d)}
                  className={cn(
                    "flex h-16 min-w-[92px] shrink-0 snap-start flex-col items-center justify-center rounded-xl border px-3 transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface hover:border-border-strong",
                  )}
                >
                  <span className={cn("text-xs capitalize", active ? "text-white/85" : "text-muted")}>{day}</span>
                  <span className="text-lg font-semibold tabular-nums">{dm}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* CO */}
      <section aria-labelledby="co">
        <h2 id="co" className="mb-2 px-1 text-[15px] font-semibold">
          Co zamawiasz
        </h2>
        <div className="sticky top-14 z-20 -mx-4 flex flex-col gap-2 bg-background/95 px-4 pt-1 pb-2 backdrop-blur">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj: pomidor, rukola…"
              aria-label="Szukaj produktu"
              className={cn(inputClass, "h-12 pl-9 text-base")}
            />
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
            {[
              { k: FAVS, l: `★ Ulubione (${favorites.size})` },
              { k: ALL, l: "Wszystko" },
              { k: IN_CART, l: `W koszyku (${summary.items})` },
              ...categories.map((c) => ({ k: c, l: c })),
            ].map((c) => (
              <button
                key={c.k}
                type="button"
                onClick={() => setCategory(c.k)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  category === c.k ? "border-ink bg-ink text-white" : "border-border bg-surface text-muted hover:text-foreground",
                )}
              >
                {c.l}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted">
            {category === IN_CART
              ? "Koszyk jest pusty — dodaj produkty z listy."
              : category === FAVS
                ? "Dodaj ulubione gwiazdką przy produkcie — będą tu na start każdego zamówienia."
                : "Nic nie znaleziono."}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]">
            {visible.map((p) => {
              const value = qty[p.id] ?? 0;
              const inCart = value > 0;
              const draft = drafts[p.id];
              return (
                <li
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0",
                    inCart && "bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => flipFavorite(p)}
                    aria-pressed={favorites.has(p.id)}
                    aria-label={favorites.has(p.id) ? `Usuń z ulubionych: ${p.name}` : `Dodaj do ulubionych: ${p.name}`}
                    className="-ml-2 flex h-11 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2"
                  >
                    <Star className={cn("size-5", favorites.has(p.id) ? "fill-primary text-primary" : "text-subtle")} />
                  </button>
                  {p.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- zdjęcia z katalogu hurtowni, dowolne źródło
                    <img src={p.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium leading-snug">{p.name}</span>
                      {p.is_special && (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                          Promocja
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted">
                      {[
                        p.pack_label ?? unitLabel(p.unit),
                        p.price !== null ? `${formatPln(toGrosze(p.price))} / ${unitLabel(p.unit)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {inCart && (
                      <button
                        type="button"
                        onClick={() => setProductQty(p, stepQty(value, -1, p.unit))}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong bg-surface hover:bg-surface-2"
                        aria-label={`Mniej: ${p.name}`}
                      >
                        <Minus className="size-4" />
                      </button>
                    )}
                    {inCart && (
                      <input
                        inputMode={isFractionalUnit(p.unit) ? "decimal" : "numeric"}
                        value={draft ?? fmtQty(value, p.unit)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                        onBlur={(e) => {
                          setProductQty(p, parseQty(e.target.value, p.unit));
                          setDrafts((d) => {
                            const next = { ...d };
                            delete next[p.id];
                            return next;
                          });
                        }}
                        onFocus={(e) => e.target.select()}
                        aria-label={`Ilość (${unitLabel(p.unit)}): ${p.name}`}
                        className="h-11 w-14 rounded-lg border border-border-strong bg-surface text-center text-base font-semibold tabular-nums outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setProductQty(p, stepQty(value, 1, p.unit))}
                      className={cn(
                        "flex h-11 items-center justify-center rounded-lg font-semibold transition-colors",
                        inCart
                          ? "w-11 border border-border-strong bg-surface hover:bg-surface-2"
                          : "gap-1 bg-accent px-3 text-primary-strong hover:bg-accent-hover",
                      )}
                      aria-label={`Więcej: ${p.name}`}
                    >
                      <Plus className="size-4" />
                      {!inCart && <span className="text-sm">Dodaj</span>}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* UWAGI */}
      <section aria-labelledby="uwagi">
        <h2 id="uwagi" className="mb-2 px-1 text-[15px] font-semibold">
          Uwagi do zamówienia <span className="font-normal text-muted">(opcjonalnie)</span>
        </h2>
        <textarea
          name="note"
          maxLength={500}
          rows={2}
          placeholder="Np. pomidory twardsze, dostawa od zaplecza"
          className={cn(inputClass, "h-auto min-h-20 py-2.5 text-base")}
        />
      </section>

      {/* PODSUMOWANIE */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 shadow-[0_-4px_16px_-8px_rgb(19_36_31/0.18)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-3">
          {state.message && !state.ok && (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <X className="mt-0.5 size-4 shrink-0" /> {state.message}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 text-sm leading-tight">
              <p className="font-semibold">
                {summary.items === 0
                  ? "Koszyk pusty"
                  : `${summary.items} ${summary.items === 1 ? "pozycja" : summary.items < 5 ? "pozycje" : "pozycji"}`}
                {date && <span className="font-normal capitalize text-muted"> · {formatDayLabel(date)}</span>}
              </p>
              {summary.items > 0 && (
                <p className="text-muted">
                  ok. {summary.weightKg.toLocaleString("pl-PL")} kg
                  {summary.valueGrosze > 0 && ` · ${summary.hasUnpriced ? "od " : ""}${formatPln(summary.valueGrosze)} netto`}
                </p>
              )}
            </div>
            <Button type="submit" size="lg" disabled={pending || summary.items === 0 || !date} className="shrink-0">
              {pending ? "Wysyłanie…" : "Zamawiam"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
