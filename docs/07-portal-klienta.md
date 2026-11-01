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

## Zamówienia z wiadomości — „Do sprawdzenia” (v0.2, 2026-11-01)
Wzorowane na Fresho OrderPilot: klient zamawia jak dotąd (SMS, e-mail, WhatsApp, telefon), a **człowiek zawsze sprawdza** zamówienie, zanim trafi do „Zamówień”.

1. Dyspozytor wkleja wiadomość w *Operacje → Do sprawdzenia* (później: bramka SMS i skrzynka e-mail wpiszą je same). Klient jest rozpoznawany po telefonie oddziału albo e-mailu konta w portalu.
2. Automat odczytuje pozycje: najpierw **słownik klienta** (jak ten klient nazywał produkty wcześniej), potem nazwy z katalogu; z `ANTHROPIC_API_KEY` — model Claude. Dzień dostawy z „jutro / na piątek”, inaczej najbliższy dzień dostaw oddziału. Uwagi („zostawcie w chłodni”) idą do pola uwag.
3. Ekran sprawdzenia: po lewej wiadomość z podkreślonymi fragmentami (zielony — pewne, bursztyn — sprawdź, czerwony — nie wiem), po prawej propozycja do poprawy. **Wprowadź zamówienie** albo **Odrzuć**.
4. Zatwierdzenie zapisuje dla każdej pozycji wynik: **trafione / poprawione / dodane / usunięte** i uczy słownik klienta. Z tego liczona jest **skuteczność** (30 dni): % zamówień bez poprawek i % pozycji trafionych — łącznie i per wersja rozpoznawania (`rules`, `claude:<model>`), żeby porównać wersje.

Model danych (migracja 0013): `inbound_messages`, `order_drafts`, `order_draft_lines` (propozycja + decyzja + wynik), `product_aliases` (słownik), `customer_favorites`; `products.pack_label`, `is_special`, `image_url`; `orders.source = 'ai'`. Zatwierdzenie w jednej transakcji: `intake_approve_draft`. Test: `supabase/tests/intake.sql`.

Portal: zakładka **★ Ulubione** (gwiazdka przy produkcie; kto ma ulubione, zaczyna od nich), oznaczenie **Promocja**, opis opakowania („Skrzynka (18 szt.)”) i zdjęcie produktu.

## Klient pisze lub nagrywa, BOK zatwierdza (v0.3, 2026-11-01)
Główny przepływ wiadomości: **klient sam** wpisuje albo nagrywa zamówienie w portalu (*Napisz lub nagraj zamówienie*), wybiera adres i dzień. Przeglądarka dyktuje tekst na żywo (rozpoznawanie mowy w Chrome/Safari/Edge), klient widzi go i może poprawić; nagranie też jest wysyłane. Klient widzi status „BOK sprawdza” → „Zamówienie przyjęte” (link) albo „Nie przyjęto”.

**BOK** (rola *Obsługa klienta*) w *Do sprawdzenia* widzi wiadomość, odsłuchuje nagranie i dostaje gotową propozycję zamówienia. Zanim wprowadzi, zaznacza „Sprawdziłem: zamówienie jest kompletne”; na ekranie widzi skuteczność odczytu tego zamówienia na żywo („4 z 5 pozycji bez poprawek”). Wklejanie SMS-ów i notatek z telefonu zostaje jako kanał pomocniczy.

Technicznie: kanał `portal`, nagrania w prywatnym buckecie `order-audio` (BOK dostaje podpisany link na godzinę), BOK ma prawo zatwierdzać (`intake_approve_draft`, polityki — migracja 0015), klient widzi status swoich wiadomości, ale nie robocze pozycje ani słownik. Limit nagrania: 2 minuty.
