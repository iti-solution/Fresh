import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/panel/module-placeholder";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Audyt tras" };

export default async function Page() {
  await requireAccess("/audyt");
  return (
    <ModulePlaceholder
      title="Audyt tras"
      milestone="M2"
      scope={[
        "Upload pliku tras prospekta",
        "Porównanie km i czasu: jak jest vs po optymalizacji",
        "Raport PDF z oszczędnością w zł/miesiąc",
      ]}
    />
  );
}
