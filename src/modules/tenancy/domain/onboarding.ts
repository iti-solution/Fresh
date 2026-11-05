// Kreator uruchomienia nowej firmy (M6.3): kolejne kroki od kartotek do pierwszego dnia na trasach.

export type OnboardingCounts = {
  customers: number;
  points: number;
  vehicles: number;
  drivers: number;
  driversWithPin: number;
  packagingTypes: number;
  templates: number;
  templatePoints: number;
  payRules: number;
  orders: number;
  routes: number;
};

export type Step = { key: string; title: string; detail: string; href: string; done: boolean; optional?: boolean };

export function onboardingSteps(c: OnboardingCounts): Step[] {
  return [
    { key: "customers", title: "Klienci i adresy dostaw", detail: c.points ? `${c.customers} klientów, ${c.points} adresów` : "Zaimportuj kartotekę z Excela — jeden wiersz = jeden adres", href: "/kartoteki/klienci/import", done: c.points > 0 },
    { key: "vehicles", title: "Pojazdy", detail: c.vehicles ? `${c.vehicles} pojazdów` : "Ładowność (kg, palety, skrzynki) i koszty", href: "/kartoteki/pojazdy", done: c.vehicles > 0 },
    { key: "drivers", title: "Kierowcy i PIN-y", detail: c.drivers ? `${c.drivers} kierowców, ${c.driversWithPin} z PIN-em` : "Każdy kierowca loguje się na terminalu PIN-em", href: "/kartoteki/kierowcy", done: c.drivers > 0 && c.driversWithPin === c.drivers },
    { key: "packaging", title: "Opakowania zwrotne", detail: c.packagingTypes ? `${c.packagingTypes} typów` : "Palety, skrzynki, kegi — z kaucją", href: "/ustawienia", done: c.packagingTypes > 0, optional: true },
    { key: "templates", title: "Trasy stałe (szablony)", detail: c.templates ? `${c.templates} tras, ${c.templatePoints} przypisanych adresów` : "Kierunki, dni, godzina wyjazdu i kolejność adresów", href: "/kartoteki/szablony", done: c.templates > 0 && c.templatePoints > 0 },
    { key: "pay", title: "Stawki kierowców", detail: c.payRules ? `${c.payRules} reguł` : "Dniówka, km, punkty albo % od obrotu", href: "/rozliczenia/stawki", done: c.payRules > 0 },
    { key: "orders", title: "Pierwsze zamówienia", detail: c.orders ? `${c.orders} zamówień` : "Import z pliku ERP albo klucz API", href: "/zlecenia/import", done: c.orders > 0 },
    { key: "plan", title: "Pierwszy dzień na trasach", detail: c.routes ? `${c.routes} tras zaplanowanych` : "„Utwórz dzień” z tras stałych i przekaż do załadunku", href: "/planowanie", done: c.routes > 0 },
  ];
}

export function onboardingProgress(steps: Step[]) {
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return { done, total: required.length, pct: Math.round((done / required.length) * 100), next: steps.find((s) => !s.done) ?? null };
}
