import type { Metadata } from "next";
import { AuthShell } from "@/components/panel/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logowanie" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const failed = params.error === "link";

  return (
    <AuthShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">Zaloguj się do Fresh</h1>
          <p className="text-sm text-muted">Bez hasła. Wyślemy Ci jednorazowy link na e-mail.</p>
        </div>
        {failed && (
          <p className="rounded-lg border border-danger/25 bg-danger-soft p-3 text-sm text-danger" role="alert">
            Link wygasł albo został już użyty. Wyślij nowy.
          </p>
        )}
        <LoginForm next={next} />
        <p className="border-t border-border pt-5 text-xs text-muted">
          Kierowcy logują się na terminalu firmy numerem i PIN-em — nie potrzebują e-maila.
        </p>
      </div>
    </AuthShell>
  );
}
