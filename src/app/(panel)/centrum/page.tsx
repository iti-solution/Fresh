import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/panel/module-placeholder";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Centrum operacyjne" };

export default async function Page() {
  await requireAccess("/centrum");
  return (
    <ModulePlaceholder
      title="Centrum operacyjne"
      milestone="M6"
      scope={[
        "Mapa tras na żywo",
        "Status tras i punktów, spóźnienia względem okna",
        "Trasy nierozpoczęte, brak potwierdzeń",
        "Podgląd zdjęć i podpisów",
      ]}
    />
  );
}
