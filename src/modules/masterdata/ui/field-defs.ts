// Konfiguracja formularzy kartotek (bez logiki — tylko pola i wartości domyślne).
import type { FieldOption, SectionDef } from "@/components/forms/form-renderer";
import { BRANCH_TYPES } from "../domain/schemas";
import { BRANCH_LABELS } from "../domain/format";

type Row = Record<string, unknown> | null | undefined;
const s = (row: Row, key: string) => (row?.[key] as string | null | undefined) ?? "";
const n = (row: Row, key: string) => (row?.[key] as number | string | null | undefined) ?? "";

export function customerSections(c?: Row): SectionDef[] {
  return [
    {
      title: "Dane klienta",
      fields: [
        { kind: "text", name: "name", label: "Nazwa", defaultValue: s(c, "name"), span: 2, required: true },
        { kind: "text", name: "external_code", label: "Kod w ERP", defaultValue: s(c, "external_code"), hint: "np. K0142" },
        { kind: "text", name: "nip", label: "NIP", defaultValue: s(c, "nip") },
        {
          kind: "text",
          name: "category",
          label: "Kategoria",
          defaultValue: s(c, "category"),
          placeholder: "restauracja, hotel, stołówka…",
        },
        { kind: "checkbox", name: "is_active", label: "Aktywny", defaultChecked: c ? Boolean(c.is_active) : true },
      ],
    },
    {
      title: "Opiekun handlowy",
      description: "Kierowca zobaczy go na ekranie punktu i zadzwoni jednym przyciskiem.",
      fields: [
        { kind: "text", name: "sales_rep_name", label: "Imię i nazwisko", defaultValue: s(c, "sales_rep_name"), span: 2 },
        { kind: "tel", name: "sales_rep_phone", label: "Telefon", defaultValue: s(c, "sales_rep_phone") },
        { kind: "textarea", name: "notes", label: "Notatka wewnętrzna", defaultValue: s(c, "notes"), span: 3 },
      ],
    },
  ];
}

const branchOptions: FieldOption[] = BRANCH_TYPES.map((b) => ({ value: b, label: BRANCH_LABELS[b] }));

export function pointSections(
  p: Row,
  windows: { window1_from: string; window1_to: string; window2_from: string; window2_to: string },
): SectionDef[] {
  return [
    {
      title: "Oddział",
      description:
        "Każde miejsce dostawy klienta (restauracja, kuchnia, bar, magazyn) to osobny oddział z własnym adresem i godzinami.",
      fields: [
        {
          kind: "text",
          name: "name",
          label: "Nazwa oddziału",
          defaultValue: s(p, "name") || "Lokal główny",
          span: 1,
          required: true,
        },
        {
          kind: "select",
          name: "branch_type",
          label: "Typ",
          defaultValue: s(p, "branch_type") || "restaurant",
          options: branchOptions,
        },
        { kind: "text", name: "external_code", label: "Kod w ERP", defaultValue: s(p, "external_code") },
        {
          kind: "text",
          name: "address_line",
          label: "Ulica i numer",
          defaultValue: s(p, "address_line"),
          span: 2,
          required: true,
        },
        { kind: "text", name: "postal_code", label: "Kod pocztowy", defaultValue: s(p, "postal_code"), placeholder: "00-000" },
        { kind: "text", name: "city", label: "Miejscowość", defaultValue: s(p, "city"), required: true },
        { kind: "tel", name: "contact_phone", label: "Telefon odbiorcy", defaultValue: s(p, "contact_phone") },
        { kind: "checkbox", name: "is_active", label: "Aktywny", defaultChecked: p ? Boolean(p.is_active) : true },
      ],
    },
    {
      title: "Kiedy przyjmuje dostawy",
      fields: [
        {
          kind: "weekdays",
          name: "delivery_weekdays",
          label: "Dni dostaw",
          defaultValue: (p?.delivery_weekdays as number[] | undefined) ?? [1, 2, 3, 4, 5, 6],
          span: 3,
        },
        {
          kind: "timerange",
          name: "window1_from",
          nameTo: "window1_to",
          label: "Okno przyjęć",
          defaultFrom: windows.window1_from,
          defaultTo: windows.window1_to,
          hint: "np. 06:00–08:00",
        },
        {
          kind: "timerange",
          name: "window2_from",
          nameTo: "window2_to",
          label: "Drugie okno (opcjonalnie)",
          defaultFrom: windows.window2_from,
          defaultTo: windows.window2_to,
        },
        {
          kind: "number",
          name: "service_minutes",
          label: "Czas rozładunku",
          defaultValue: n(p, "service_minutes") || 10,
          suffix: "min",
        },
        {
          kind: "date",
          name: "active_from",
          label: "Sezon od (opcjonalnie)",
          defaultValue: s(p, "active_from"),
          hint: "dla klientów sezonowych",
        },
        { kind: "date", name: "active_to", label: "Sezon do", defaultValue: s(p, "active_to") },
      ],
    },
    {
      title: "Stałe uwagi dla kierowcy",
      description: "Widoczne przy każdej dostawie. Uwagi tymczasowe (remont, zamknięta droga) dodasz na karcie klienta.",
      fields: [
        {
          kind: "text",
          name: "call_instructions",
          label: "Gdzie / do kogo dzwonić",
          defaultValue: s(p, "call_instructions"),
          span: 2,
        },
        { kind: "text", name: "floor", label: "Piętro / poziom", defaultValue: s(p, "floor") },
        {
          kind: "text",
          name: "access_instructions",
          label: "Jak wjechać",
          defaultValue: s(p, "access_instructions"),
          span: 2,
          placeholder: "brama, kod, parking",
        },
        { kind: "text", name: "unloading_zone", label: "Strefa rozładunku", defaultValue: s(p, "unloading_zone") },
        {
          kind: "textarea",
          name: "driver_instructions",
          label: "Inne uwagi",
          defaultValue: s(p, "driver_instructions"),
          span: 3,
        },
      ],
    },
  ];
}

/** Kierowca nie jest przypisany do auta na stałe — przydział robi dyspozytor na każdy dzień (trasa). */
export function vehicleSections(v: Row, carriers: FieldOption[]): SectionDef[] {
  return [
    {
      title: "Pojazd",
      fields: [
        { kind: "text", name: "registration", label: "Numer rejestracyjny", defaultValue: s(v, "registration"), required: true },
        { kind: "text", name: "name", label: "Nazwa robocza", defaultValue: s(v, "name") },
        {
          kind: "select",
          name: "status",
          label: "Status",
          defaultValue: s(v, "status") || "active",
          options: [
            { value: "active", label: "aktywny" },
            { value: "service", label: "serwis" },
            { value: "inactive", label: "nieaktywny" },
          ],
        },
        {
          kind: "text",
          name: "vehicle_type",
          label: "Typ pojazdu",
          defaultValue: s(v, "vehicle_type"),
          placeholder: "dostawczy 3,5 t",
        },
        {
          kind: "text",
          name: "body_type",
          label: "Zabudowa",
          defaultValue: s(v, "body_type"),
          placeholder: "chłodnia, izoterma",
        },
      ],
    },
    {
      title: "Ładowność",
      description: "Na tej podstawie tablica planowania pokaże zajętość auta i ostrzeże przed przeciążeniem.",
      fields: [
        { kind: "number", name: "capacity_kg", label: "Masa", defaultValue: n(v, "capacity_kg"), suffix: "kg" },
        { kind: "number", name: "capacity_pallets", label: "Palety", defaultValue: n(v, "capacity_pallets"), suffix: "szt." },
        { kind: "number", name: "capacity_crates", label: "Skrzynki", defaultValue: n(v, "capacity_crates"), suffix: "szt." },
        { kind: "number", name: "capacity_m3", label: "Objętość", defaultValue: n(v, "capacity_m3"), suffix: "m³" },
      ],
    },
    {
      title: "Własność i koszty",
      fields: [
        { kind: "checkbox", name: "is_own", label: "Pojazd własny", defaultChecked: v ? Boolean(v.is_own) : true },
        {
          kind: "select",
          name: "carrier_id",
          label: "Przewoźnik (gdy obcy)",
          defaultValue: s(v, "carrier_id"),
          options: carriers,
          emptyLabel: "— brak —",
          span: 2,
        },
        { kind: "number", name: "cost_per_km", label: "Koszt kilometra", defaultValue: n(v, "cost_per_km"), suffix: "zł/km" },
        {
          kind: "number",
          name: "driver_cost_per_day",
          label: "Koszt kierowcy",
          defaultValue: n(v, "driver_cost_per_day"),
          suffix: "zł/dzień",
        },
        {
          kind: "number",
          name: "fixed_cost_per_day",
          label: "Koszt stały",
          defaultValue: n(v, "fixed_cost_per_day"),
          suffix: "zł/dzień",
        },
      ],
    },
  ];
}

export function driverSections(d: Row): SectionDef[] {
  return [
    {
      title: "Kierowca",
      fields: [
        { kind: "text", name: "first_name", label: "Imię", defaultValue: s(d, "first_name"), required: true },
        { kind: "text", name: "last_name", label: "Nazwisko", defaultValue: s(d, "last_name"), required: true },
        { kind: "tel", name: "phone", label: "Telefon", defaultValue: s(d, "phone") },
        {
          kind: "select",
          name: "employment_type",
          label: "Forma współpracy",
          defaultValue: s(d, "employment_type"),
          emptyLabel: "— wybierz —",
          options: [
            { value: "etat (UoP)", label: "etat (UoP)" },
            { value: "dowózkowy (B2B)", label: "dowózkowy (B2B)" },
            { value: "zlecenie", label: "zlecenie" },
            { value: "przewoźnik", label: "przewoźnik" },
          ],
        },
        { kind: "checkbox", name: "is_active", label: "Aktywny", defaultChecked: d ? Boolean(d.is_active) : true },
      ],
    },
  ];
}

/** Szablon trasy: nazwa, dni, wyjazd oraz opcjonalne propozycje auta i kierowców (dyspozytor może je zmienić w planie dnia). */
export function templateSections(t: Row, vehicles: FieldOption[], drivers: FieldOption[]): SectionDef[] {
  return [
    {
      title: "Trasa stała",
      description:
        "Z szablonu powstaje trasa w planie dnia. Zamówienia oddziałów przypisanych do szablonu trafiają na nią automatycznie.",
      fields: [
        {
          kind: "text",
          name: "name",
          label: "Nazwa trasy",
          defaultValue: s(t, "name"),
          required: true,
          span: 2,
          placeholder: "np. Kraków Zachód",
        },
        { kind: "time", name: "planned_start", label: "Wyjazd z magazynu", defaultValue: s(t, "planned_start").slice(0, 5) },
        {
          kind: "weekdays",
          name: "weekdays",
          label: "Dni, w które jeździ",
          defaultValue: (t?.weekdays as number[] | undefined) ?? [1, 2, 3, 4, 5, 6],
          span: 2,
        },
        { kind: "checkbox", name: "is_active", label: "Aktywna", defaultChecked: t ? Boolean(t.is_active) : true },
      ],
    },
    {
      title: "Propozycja przydziału (opcjonalnie)",
      description:
        "Przy tworzeniu dnia system wstawi kierowcę wstępnego, a gdy jest nieaktywny albo jedzie już inną trasą — zastępczego. Auto tylko gdy jest wolne. Dyspozytor zawsze może to zmienić.",
      fields: [
        {
          kind: "select",
          name: "default_vehicle_id",
          label: "Auto",
          defaultValue: s(t, "default_vehicle_id"),
          options: vehicles,
          emptyLabel: "— bez propozycji —",
        },
        {
          kind: "select",
          name: "default_driver_id",
          label: "Kierowca wstępny",
          defaultValue: s(t, "default_driver_id"),
          options: drivers,
          emptyLabel: "— bez propozycji —",
        },
        {
          kind: "select",
          name: "alt_driver_id",
          label: "Kierowca zastępczy",
          defaultValue: s(t, "alt_driver_id"),
          options: drivers,
          emptyLabel: "— bez propozycji —",
        },
      ],
    },
  ];
}
