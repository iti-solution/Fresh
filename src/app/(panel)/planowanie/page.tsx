import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/panel/module-placeholder";
import { requireAccess } from "@/modules/tenancy/server/context";

export const metadata: Metadata = { title: "Planowanie tras" };

export default async function Page() {
  await requireAccess("/planowanie");
  return (
    <ModulePlaceholder
      title="Planowanie tras"
      milestone="M3"
      scope={[
        "Tworzenie dnia z szablonów tras",
        "Tablica planowania: niezaplanowane zlecenia, trasy, mapa, przeciąganie",
        "Walidacja palet, masy, objętości i okien czasowych",
        "Ułóż kolejność (optymalizacja trasy)",
        "Kursy dodatkowe, kopiowanie dnia, wydanie tras",
      ]}
    />
  );
}
