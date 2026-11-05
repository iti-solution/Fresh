import type { Metadata } from "next";
import { Wordmark } from "@/components/panel/brand";
import { PortalLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logowanie" };

export default async function PortalLoginPage({ searchParams }: PageProps<"/portal/login">) {
  const sp = await searchParams;
  const noAccess = sp.blad === "dostep";
  return (
    <main className="flex min-h-screen flex-col">
      <header className="bg-ink px-5 pt-8 pb-16 text-ink-foreground">
        <div className="mx-auto w-full max-w-md">
          <Wordmark inverted />
          <h1 className="mt-8 text-[28px] font-semibold leading-tight tracking-[-0.015em] text-white">Zamów dostawę na jutro</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
            Zamówienia prosto do hurtowni — wybierz produkty, dzień dostawy i gotowe.
          </p>
        </div>
      </header>
      <section className="mx-auto -mt-10 w-full max-w-md flex-1 px-4 pb-10">
        <div className="rounded-[var(--radius-panel)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
          {noAccess && (
            <p className="mb-4 rounded-lg border border-danger/25 bg-danger-soft p-3 text-sm text-danger" role="alert">
              Dostęp do portalu został wyłączony. Skontaktuj się z hurtownią.
            </p>
          )}
          <PortalLoginForm />
        </div>
        <p className="mt-5 px-1 text-center text-sm text-muted">
          Login i hasło dostajesz od swojej hurtowni. Nie pamiętasz hasła? Zadzwoń do opiekuna handlowego — nada nowe.
        </p>
      </section>
    </main>
  );
}
