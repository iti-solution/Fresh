# Fresh TMS — portal zamówień klienta (v0.1, 2026-11-01)

## Po co
Restauracja (hotel, sklep) sama składa zamówienie wieczorem na telefonie, zamiast dzwonić lub pisać SMS do handlowca.
Zamówienie trafia od razu do „Zamówienia” w panelu (znacznik **portal**) z wagą liczoną z produktów — dyspozytor planuje je jak każde inne.

## Jak to działa
1. **Hurtownia** w panelu: `Kartoteki → Katalog produktów` — dodaje produkty (albo wczytuje przykładowy katalog). Waga jednostki liczy ładowność trasy; cena jest orientacyjna (fakturuje ERP).
2. **Hurtownia** na karcie klienta: „Portal zamówień” → e-mail → **Utwórz login**. System pokazuje raz adres portalu, login i hasło (przycisk „Kopiuj dane” — do SMS-a / maila). Zgubione hasło: „Nowe hasło”. Koniec współpracy: „Wyłącz dostęp” (historia zostaje).
3. **Klient** na `/portal/login`: e-mail + hasło → widzi najbliższy termin dostawy i do kiedy zamówić → „Nowe zamówienie”: adres (oddział) → dzień → produkty (+/−, wyszukiwarka, kategorie) → uwagi → **Zamawiam**.
4. Klient widzi status: Przyjęte → Zaplanowane → W drodze → Dostarczone. Może anulować do godziny granicznej, dopóki zamówienie nie jest na trasie. „Zamów to samo co ostatnio” wypełnia koszyk.

## Terminy (reguła)
- Dostawa najwcześniej **jutro**; po **20:00** — pojutrze. Tylko w dni dostaw oddziału, w sezonie oddziału, z pominięciem zamknięć i świąt, do 14 dni naprzód.
- Ustawienia firmy (`tenants.settings`): `portal_cutoff` ("20:00"), `portal_lead_days` (1), `portal_horizon_days` (14). Ekran ustawień — do zrobienia.
- Ta sama reguła w bazie (`portal_date_allowed`) i w aplikacji (`modules/portal/domain/portal.ts`) — baza ma ostatnie słowo.

## Bezpieczeństwo
- Klient ma rolę `customer` i widzi wyłącznie: swoją firmę, swoje oddziały, aktywny katalog swojej hurtowni, swoje zamówienia i ich pozycje. Nie widzi tras, kierowców, innych klientów ani panelu.
- Klient nie zapisuje nic bezpośrednio — tylko przez funkcje `portal_place_order` i `portal_cancel_order`, które sprawdzają dostęp, termin, aktywność oddziału i produktu oraz ilości (ułamki tylko dla kg).
- Konta zakłada serwer kluczem `SUPABASE_SECRET_KEY` (jak konta kierowców); hasło nie jest nigdzie zapisywane jawnie.

## Model danych (migracja 0012)
`products` (katalog) · `order_lines` (pozycje z kopią nazwy, jednostki, wagi i ceny z chwili zamówienia) · `customer_portal_users` (kto loguje się za którego klienta) · `orders.source` (`panel` | `import` | `api` | `portal`), `placed_by`, `placed_at`, `customer_note`.
