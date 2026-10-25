import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/panel/module-placeholder";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Rozliczenia kierowców" };

export default async function Page() {
  await requireAccess("/rozliczenia");
  return (
    <ModulePlaceholder
      title="Rozliczenia kierowców"
      milestone="M5"
      scope={[
        "Reguły wynagrodzeń: stawka dzienna, km, punkty, palety, kursy dodatkowe",
        "Rozliczenie dzienne i miesięczne",
        "Eksport XLSX dla kadr",
      ]}
    />
  );
}
