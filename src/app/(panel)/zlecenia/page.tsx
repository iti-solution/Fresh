import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/panel/module-placeholder";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Zlecenia" };

export default async function Page() {
  await requireAccess("/zlecenia");
  return (
    <ModulePlaceholder
      title="Zlecenia"
      milestone="M1"
      scope={[
        "Import zleceń z pliku CSV/XLSX z zapamiętanym mapowaniem kolumn",
        "Dopasowanie zleceń do punktów dostaw",
        "Ręczne zlecenia, podział, łączenie, anulowanie",
        "API dla ERP",
      ]}
    />
  );
}
