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
  pointTypes: number;
  closures: number;
  products: number;
  carriers: number;
  members: number;
  apiKeys: number;
};

export type Step = {
  key: string;
  title: string;
  detail: string;
  /** Co dokładnie trzeba zrobić na tym kroku (proste polecenia dla użytkownika). */
  todo: string[];
  href: string;
  done: boolean;
  optional?: boolean;
};

export function onboardingSteps(c: OnboardingCounts): Step[] {
  return [
    {
      key: "customers",
      todo: ["Przygotuj plik Excel/CSV: jeden wiersz = jeden adres dostawy (nazwa, ulica, miasto, telefon).", "Wgraj go w „Import kartoteki” i sprawdź dopasowanie kolumn.", "Po imporcie adresy dostaną współrzędne na mapie."],
      title: "Klienci i adresy dostaw",
      detail: c.points
        ? `${c.customers} klientów, ${c.points} adresów`
        : "Zaimportuj kartotekę z Excela — jeden wiersz = jeden adres",
      href: "/kartoteki/klienci/import",
      done: c.points > 0,
    },
    {
      key: "vehicles",
      todo: ["Dodaj każdy pojazd: numer rejestracyjny, ładowność (kg), liczbę palet i skrzynek.", "Uzupełnij koszty (paliwo, amortyzacja), jeśli chcesz liczyć rentowność tras."],
      title: "Pojazdy",
      detail: c.vehicles ? `${c.vehicles} pojazdów` : "Ładowność (kg, palety, skrzynki) i koszty",
      href: "/kartoteki/pojazdy",
      done: c.vehicles > 0,
    },
    {
      key: "drivers",
      todo: ["Dodaj kierowców i przypisz im pojazdy.", "Nadaj każdemu PIN — kierowca loguje się nim na telefonie lub terminalu."],
      title: "Kierowcy i PIN-y",
      detail: c.drivers
        ? `${c.drivers} kierowców, ${c.driversWithPin} z PIN-em`
        : "Każdy kierowca loguje się na terminalu PIN-em",
      href: "/kartoteki/kierowcy",
      done: c.drivers > 0 && c.driversWithPin === c.drivers,
    },
    {
      key: "packaging",
      todo: ["Wejdź w Ustawienia → Opakowania.", "Dodaj typy opakowań zwrotnych (paleta EURO, skrzynka, keg) i kaucję za sztukę."],
      title: "Opakowania zwrotne",
      detail: c.packagingTypes ? `${c.packagingTypes} typów` : "Palety, skrzynki, kegi — z kaucją",
      href: "/ustawienia/opakowania",
      done: c.packagingTypes > 0,
      optional: true,
    },
    {
      key: "templates",
      todo: ["Utwórz trasy stałe: nazwa, dni tygodnia, godzina wyjazdu.", "Dopisz do nich adresy w kolejności rozwozu — z nich powstają trasy na każdy dzień."],
      title: "Trasy stałe (szablony)",
      detail: c.templates
        ? `${c.templates} tras, ${c.templatePoints} przypisanych adresów`
        : "Kierunki, dni, godzina wyjazdu i kolejność adresów",
      href: "/kartoteki/szablony",
      done: c.templates > 0 && c.templatePoints > 0,
    },
    {
      key: "pay",
      todo: ["Wejdź w Rozliczenia → Stawki.", "Dodaj regułę wynagrodzenia: dniówka, stawka za km, za punkt albo % od obrotu."],
      title: "Stawki kierowców",
      detail: c.payRules ? `${c.payRules} reguł` : "Dniówka, km, punkty albo % od obrotu",
      href: "/rozliczenia/stawki",
      done: c.payRules > 0,
    },
    {
      key: "orders",
      todo: ["Zaimportuj zamówienia z pliku z ERP albo wygeneruj klucz API (Ustawienia → Ustawienia API).", "Możesz też dodać zamówienie ręcznie w Zamówieniach."],
      title: "Pierwsze zamówienia",
      detail: c.orders ? `${c.orders} zamówień` : "Import z pliku ERP albo klucz API",
      href: "/zlecenia/import",
      done: c.orders > 0,
    },
    {
      key: "plan",
      todo: ["W Planowaniu wybierz dzień i kliknij „Utwórz dzień” z tras stałych.", "Przypisz kierowców i pojazdy do tras, sprawdź przeciążenia i przekaż trasy do załadunku."],
      title: "Pierwszy dzień na trasach",
      detail: c.routes ? `${c.routes} tras zaplanowanych` : "„Utwórz dzień” z tras stałych i przekaż do załadunku",
      href: "/planowanie",
      done: c.routes > 0,
    },
    {
      key: "pointTypes",
      title: "Typy adresów dostaw",
      detail: c.pointTypes ? `${c.pointTypes} typów` : "Sklep, lokal, zakład, budowa, adres prywatny",
      todo: ["Wejdź w Ustawienia → Typy adresów dostaw.", "Dopasuj listę do swoich odbiorców i oznacz typy tymczasowe (np. budowa)."],
      href: "/ustawienia/adresy",
      done: c.pointTypes > 0,
      optional: true,
    },
    {
      key: "closures",
      title: "Dni wolne i zamknięcia firmy",
      detail: c.closures ? `${c.closures} dni oznaczonych` : "Święta są wpisane — dodaj własne dni bez dostaw",
      todo: ["Wejdź w Ustawienia → Dni wolne.", "Zaznacz, które święta jednak pracujecie, i dopisz własne zamknięcia (np. inwentaryzacja)."],
      href: "/ustawienia/dni-wolne",
      done: c.closures > 0,
      optional: true,
    },
    {
      key: "products",
      title: "Produkty",
      detail: c.products ? `${c.products} produktów` : "Katalog potrzebny do portalu klienta i wag zamówień",
      todo: ["Dodaj produkty w Kartotekach → Produkty (lub zaimportuj z pliku).", "Podaj jednostkę i wagę — z nich liczy się obciążenie pojazdu."],
      href: "/kartoteki/produkty",
      done: c.products > 0,
      optional: true,
    },
    {
      key: "carriers",
      title: "Przewoźnicy zewnętrzni",
      detail: c.carriers ? `${c.carriers} przewoźników` : "Tylko jeśli korzystasz z obcych pojazdów",
      todo: ["Dodaj przewoźnika w Kartotekach → Przewoźnicy.", "Wpisz sposób rozliczenia (punkt, km lub ryczałt)."],
      href: "/kartoteki/przewoznicy",
      done: c.carriers > 0,
      optional: true,
    },
    {
      key: "staff",
      title: "Dostęp dla pracowników",
      detail: c.members > 1 ? `${c.members} kont w firmie` : "Do tej pory jest tylko Twoje konto",
      todo: ["Sprawdź w Ustawieniach, kto ma dostęp i co widzi jego rola.", "Zaproś dyspozytora, BOK lub zarząd — każdy zobaczy tylko swoje ekrany."],
      href: "/ustawienia/pracownicy",
      done: c.members > 1,
      optional: true,
    },
    {
      key: "api",
      title: "Integracja API z ERP/WMS",
      detail: c.apiKeys ? `${c.apiKeys} kluczy` : "Opcjonalnie — automatyczne wysyłanie zamówień z ERP",
      todo: ["Wejdź w Ustawienia → Ustawienia API i wygeneruj klucz.", "Przekaż go firmie, która obsługuje Twój ERP."],
      href: "/ustawienia/api",
      done: c.apiKeys > 0,
      optional: true,
    },
  ];
}

export function onboardingProgress(steps: Step[]) {
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return {
    done,
    total: required.length,
    pct: Math.round((done / required.length) * 100),
    next: steps.find((s) => !s.done) ?? null,
  };
}
