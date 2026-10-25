# Fresh — model danych (przegląd)

Pełna definicja: `supabase/migrations/0001_init.sql` (sprawdzona na Postgres 16 + PostGIS).

```mermaid
erDiagram
  tenants ||--o{ memberships : ma
  tenants ||--o{ customers : ma
  customers ||--o{ delivery_points : "ma wiele adresów"
  delivery_points ||--o{ delivery_point_windows : "okna przyjęć"
  delivery_points ||--o{ delivery_point_exceptions : "święta/zamknięcia"
  route_templates ||--o{ route_template_points : "przypisane punkty"
  delivery_points ||--o{ orders : "zlecenia"
  routes ||--o{ route_stops : "postoje"
  route_stops ||--o{ route_stop_orders : ""
  orders ||--|| route_stop_orders : ""
  vehicles ||--o{ routes : ""
  drivers ||--o{ routes : ""
  routes ||--o{ delivery_events : "zdarzenia realizacji"
  delivery_events ||--o{ attachments : "zdjęcia, podpisy"
  delivery_events ||--o{ packaging_movements : "ruchy opakowań"
  packaging_types ||--o{ packaging_movements : ""
  drivers ||--o{ driver_pay_rules : "reguły"
  drivers ||--o{ driver_settlements : "rozliczenia"
  driver_settlements ||--o{ driver_settlement_lines : "pozycje"
```

## Kluczowe decyzje modelu

| Obszar | Decyzja | Konsekwencja |
|---|---|---|
| Klient vs punkt dostawy | Klient (podmiot, NIP, kod ERP) ma wiele punktów dostaw; okna, dni dostaw, sezonowość i instrukcje są na **punkcie** | Sieć restauracji = jeden klient, wiele lokali z różnymi godzinami |
| Postój vs zlecenie | Postój = punkt na trasie; obsługuje 1..n zleceń | Dwie WZ do jednej restauracji to jeden przystanek, nie dwa |
| Szablony tras | `route_templates` + przypisanie punktów z kolejnością | "Przypisanie punktu do trasy" z kartoteki; codzienny plan powstaje z szablonów |
| Kursy | `routes.kind` + `course_no` | Drugi kurs, ekspres, awaryjny bez osobnych tabel; rozliczenie wie, co było kursem dodatkowym |
| Realizacja | `delivery_events` append-only, `client_event_id` unikalny | Offline bez duplikatów; pełna historia "kto, co, kiedy, gdzie" |
| Opakowania | Księga z podwójnym zapisem (`movement_group`), saldo = widok `packaging_balances` | Saldo klienta i kierowcy zawsze się bilansuje; korekty widoczne |
| Wynagrodzenia | Reguły jako JSON komponentów, wersjonowane `valid_from/valid_to`; pozycje rozliczenia z odwołaniem do reguły i trasy | Każda złotówka ma źródło; zmiana stawek nie psuje historii |
| Audyt tras | `route_audits` z `tenant_id` nullable | Prospekt bez konta; po podpisaniu umowy audyt podpinany pod tenanta |
| Izolacja | RLS: personel (admin/dyspozytor/viewer) widzi dane tenanta; kierowca tylko swoje trasy D-1..D+1; zapis kierowcy wyłącznie przez serwerowy endpoint sync | Bezpieczeństwo nie zależy od pamiętania o `WHERE tenant_id` |
