import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/panel/module-placeholder";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Ustawienia" };

export default async function Page() {
  await requireAccess("/ustawienia");
  return (
    <ModulePlaceholder
      title="Ustawienia"
      milestone="M1"
      scope={["Dane firmy i parametry kosztowe", "Użytkownicy i role", "Klucze API dla ERP"]}
    />
  );
}
