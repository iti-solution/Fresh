import type { Metadata } from "next";
import { Card } from "@/components/ui/primitives";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logowanie" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const failed = params.error === "link";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight">
            <span className="text-primary">Fresh</span>
          </p>
          <h1 className="text-lg font-medium">Zaloguj się</h1>
          <p className="text-sm text-muted">Bez hasła — wyślemy Ci link na e-mail.</p>
        </div>
        {failed && (
          <p className="rounded-md bg-danger/10 p-3 text-sm text-danger" role="alert">
            Link wygasł albo został już użyty. Wyślij nowy.
          </p>
        )}
        <LoginForm next={next} />
      </Card>
    </main>
  );
}
