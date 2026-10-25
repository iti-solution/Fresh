import type { Metadata } from "next";
import { Badge, Card } from "@/components/ui/primitives";
import { signOut } from "@/modules/tenancy/server/actions";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Kierowca" };

export default async function DriverHome() {
  const ctx = await requireAccess("/driver");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <span className="text-xl font-semibold text-primary">Fresh</span>
        <form action={signOut}>
          <button className="h-12 px-3 text-sm text-muted">Wyloguj</button>
        </form>
      </header>
      <Card className="space-y-2">
        <Badge>W budowie · M4</Badge>
        <p className="font-medium">{ctx.tenantName}</p>
        <p className="text-sm text-muted">
          Tu kierowca zobaczy trasę dnia, potwierdzi dostawy ze zdjęciem i podpisem oraz wpisze opakowania — także bez zasięgu.
        </p>
      </Card>
    </main>
  );
}
