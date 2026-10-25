import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/panel/module-placeholder";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Opakowania" };

export default async function Page() {
  await requireAccess("/opakowania");
  return (
    <ModulePlaceholder
      title="Opakowania"
      milestone="M5"
      scope={["Księga ruchów opakowań", "Saldo klienta i kierowcy", "Korekty z powodem, raport różnic"]}
    />
  );
}
