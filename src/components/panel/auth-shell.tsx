import type { ReactNode } from "react";
import { Wordmark } from "./brand";

const STOPS = [
  { t: "06:12", n: "Hotel pod Wawelem", s: "done" },
  { t: "06:41", n: "Bistro Kazimierz", s: "done" },
  { t: "07:20", n: "Stołówka Podgórze", s: "now" },
  { t: "08:00", n: "Pizzeria Nowa Huta", s: "next" },
  { t: "12:00", n: "Kawiarnia Rynek", s: "next" },
] as const;

/** Ekran logowania i wyboru firmy: po lewej świat produktu (trasa poranka), po prawej formularz. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-ink-foreground lg:flex">
        <Wordmark inverted />
        <div className="max-w-md">
          <p className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
            Każda skrzynka na czas, w oknie przyjęć restauracji.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
            Planowanie tras, aplikacja kierowcy, opakowania zwrotne i rozliczenia — dla hurtowni owoców i warzyw obsługujących
            HoReCa.
          </p>
          <ol className="relative mt-10 space-y-4 border-l-2 border-white/10 pl-6">
            {STOPS.map((s) => (
              <li key={s.n} className="relative flex items-baseline gap-4 text-sm">
                <span
                  className={
                    s.s === "done"
                      ? "absolute top-1.5 -left-[31px] h-3 w-3 rounded-full bg-[#3fbf7f]"
                      : s.s === "now"
                        ? "live-dot absolute top-1 -left-[33px] h-4 w-4 rounded-full border-[3px] border-[#7fb3e6] bg-ink"
                        : "absolute top-1.5 -left-[31px] h-3 w-3 rounded-full border-2 border-white/25 bg-ink"
                  }
                  aria-hidden
                />
                <span className="w-11 font-medium text-ink-muted tabular-nums">{s.t}</span>
                <span className={s.s === "next" ? "text-ink-muted" : "text-white"}>{s.n}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-ink-muted">Dane przechowywane w Unii Europejskiej</p>
      </aside>
      <section className="flex items-center justify-center bg-surface p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Wordmark />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
