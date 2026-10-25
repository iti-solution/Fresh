# Fresh — zakres MVP

## 1. Teza MVP

**Dyspozytor hurtowni HoReCa planuje dzień w 30 minut zamiast 2–3 godzin, kierowca potwierdza każdą dostawę i opakowania w telefonie, a rozliczenie kierowców i skrzynek na koniec miesiąca robi się samo.**

Wszystko, co nie skraca planowania, nie zamyka pętli potwierdzenia albo nie automatyzuje rozliczeń — wypada z MVP.

## 2. Co zmieniłem względem listy P0 i dlaczego

Lista P0 z warsztatów ma 9 pozycji i każda jest "duża". Jako MVP to 6–9 miesięcy pracy. Tniemy **w głąb każdej pozycji**, nie usuwamy pozycji — pętla dnia musi zostać zamknięta.

| P0 z warsztatów | W MVP | Poza MVP (P1+) |
|---|---|---|
| Kartoteki | klienci, wiele punktów dostaw, geolokalizacja z ręczną korektą pinezki, okna przyjęć per dzień tygodnia, dni dostaw, wyjątki/święta, sezonowość (aktywny od–do), przypisanie punktu do szablonu trasy; pojazdy (palety, kg, m³, typ zabudowy, status, własny/obcy); kierowcy (dane, typ zatrudnienia, domyślny pojazd) | kategorie klientów z regułami, historia wykorzystania pojazdu jako raport, ocena efektywności kierowcy |
| Integracja ERP | **import CSV/XLSX z mapowaniem kolumn + REST API** | natywny konektor ERP |
| Zarządzanie trasami | tworzenie, edycja, szablony, kopiowanie dnia, zamykanie, kursy (1., 2., dodatkowy, ekspres jako typ kursu) | archiwizacja z regułami retencji, planowanie tygodniowe/cykliczne poza szablonami |
| Planowanie dostaw | tablica dnia: niezaplanowane zlecenia ↔ trasy ↔ mapa; przeciąganie, przenoszenie między trasami, zmiana kolejności, **"Ułóż kolejność" (VRP jednej trasy)**; walidacja palet/kg/m³ i okien czasowych, alarm przeciążenia | auto-przydział zleceń do całej floty (P2), planowanie sezonowe |
| Aplikacja kierowcy | PWA offline: trasa dnia, start/koniec, przyjazd na punkt, dostarczone/częściowo/odmowa/brak klienta, zdjęcie, podpis, GPS w momencie potwierdzenia, komentarz, "zgłoś problem" | czat z dyspozytorem, tracking GPS w tle, reklamacje jako proces |
| Potwierdzanie dostaw | zdarzenia + załączniki, widok potwierdzenia dla dyspozytora | e-potwierdzenie mailem do odbiorcy |
| Obsługa opakowań | typy opakowań, wydanie/odbiór na punkcie, **saldo klienta i kierowcy z księgi ruchów**, korekta z powodem, raport różnic | saldo przewoźnika, dokumenty opakowań do ERP |
| Rozliczenie kierowców | silnik reguł: stawka dzienna, kilometrówka, za punkt, za paletę, za kurs dodatkowy, dodatki ręczne; rozliczenie dzienne i miesięczne; eksport XLSX | premie warunkowe, wartość dostaw, integracja z kadrami |
| Dashboard transportowy | mapa i lista tras dnia, status punktów, spóźnienia vs okno, trasy nierozpoczęte, brak potwierdzeń | alerty push/mail, KPI kosztowe |

**Dodane do MVP (nie było w P0): Audyt tras** — narzędzie sprzedażowe na tym samym silniku. Uzasadnienie w `01-architektura.md` §6.3.

Poza MVP w całości (P1): zwroty, reklamacje jako proces z decyzją, analiza dowózek, rozliczenia przewoźników, komunikator, alerty push/mail, integracja GPS Consalnet, natywne konektory ERP/WMS, portal przewoźnika, KPI rentowności, AI planowanie floty.

## 2a. Zmiany po warsztatach z pilotem (2026-10-25)

Pełny scenariusz: `05-scenariusz-dnia.md`. Pilot: ERP WF-Mag → WMS → TMS, kierowcy na terminalach Zebra, trasy stałe w okolicach Krakowa.

| # | Zmiana | Decyzja | Etap |
|---|---|---|---|
| D1 | **Integracja ERP/WMS** — pilot ma ją w swoim etapie 1 | Zostaje **uniwersalna struktura**: import pliku + REST API + status gotowości z WMS. Bez konektora WF-Mag w MVP. **Ryzyko:** pilot może oczekiwać automatycznej synchronizacji — trzeba to ustalić przed startem (eksport z WF-Mag do pliku raz/kilka razy dziennie albo prosty skrypt po ich stronie wołający API). | M1 |
| D2 | **Gotówka** — pilot w etapie 1 | **Wchodzi do MVP** w wersji podstawowej: kwota pobrania na zamówieniu, kwota pobrana na punkcie, saldo gotówki kierowcy w raporcie zmiany, przyjęcie gotówki i różnica przy zamknięciu trasy. Bez kasy/KP i integracji z księgowością. | M4 / M5 |
| D3 | **Geolokalizacja** — pilot w etapie 1 | Pozycja z aplikacji kierowcy co kilka minut, gdy trasa jest otwarta, + GPS przy każdym potwierdzeniu. Wystarcza do opóźnień vs okno i historii realizacji. Consalnet — Etap 3. | M4 / M6 |
| D4 | **Skrzynki** jako wymiar ładowności | Pojemność skrzynkowa pojazdu, skrzynki na zamówieniu, walidacja i pasek obciążenia obok kg/palet/m³. | M1 / M3 |
| D5 | **Oddziały kontrahenta** (restauracja, kuchnia, bar, magazyn) | Oddział = punkt dostawy z własnym adresem, uwagami i ograniczeniami (model już to wspiera). Dodajemy **typ oddziału**. | M1 |
| D6 | **Uwagi stałe i tymczasowe** | Stałe: ustrukturyzowane (gdzie dzwonić, jak wjechać, piętro, strefa rozładunku). Tymczasowe: tekst + **ważne od–do** (remont, zamknięta droga, zmiana godzin) — kierowca widzi tylko aktualne. | M1 / M4 |
| D7 | **Opiekun handlowy** | Imię i telefon opiekuna na kontrahencie, widoczne dla kierowcy. | M1 |
| D8 | **Jakość adresów** | Ręcznie poprawiona pinezka jest „zablokowana” — import jej nie nadpisuje. Kolejka „adresy do poprawy”. | M1 |
| D9 | **Logowanie kierowcy** | Współdzielone terminale Zebra → **kierowca + PIN** (nie magic link), wybór pojazdu, licznik start/stop. | M4 |
| D10 | **Statusy punktu** | nie rozpoczęty · w realizacji · dostarczono · częściowo · **reklamacja** · brak odbioru (+ odmowa jako przyczyna). Reklamacja w MVP = status + zdjęcie + przyczyna; proces decyzji — P1. | M4 |
| D11 | **Modele wynagrodzeń** | Etatowy: dniówka + premia. Dowózkowy: % / stawka od **obrotu trasy**, za punkt, od **wartości dostaw**. Wymaga wartości zamówienia (D12). Przewoźnik — P1. | M5 |
| D12 | **Pola zamówienia** | + wartość zamówienia, skrzynki, uwagi handlowe, uwagi logistyczne, okno dostawy na zamówieniu (nadpisuje okno oddziału), status gotowości. | M1 |
| D13 | **Flota** | + przewoźnik, typ pojazdu, pojemność skrzynek, koszt km, koszt kierowcy, koszt dzienny. KPI pustych przebiegów — dane zbieramy w MVP (licznik + km planowane), raport w P1. | M1 |
| D14 | **Dynamiczne zmiany** | Zamówienie dodane po wydaniu trasy = alert „nieprzydzielone”; zmiana trasy trafia do kierowcy przy synchronizacji; dowózka/drugi kurs = typ kursu z przyczyną. | M3 / M4 |

### Zmiany w modelu danych (migracja `0003`, start M1)
- `customers`: `sales_rep_name`, `sales_rep_phone`
- `delivery_points`: `branch_type` (restaurant/kitchen/bar/warehouse/other), `location_locked` (bool), stałe uwagi: `call_instructions`, `access_instructions`, `floor`, `unloading_zone`
- nowa `delivery_point_notes` (uwagi tymczasowe): `text`, `valid_from`, `valid_to`, `created_by`
- `orders`: `order_value`, `crates`, `notes_sales`, `notes_logistics`, `window_start`, `window_end`, `readiness` (awaiting_warehouse / ready — w UI: **„Do realizacji” / „Skompletowane”**)
- nowa `carriers` (przewoźnicy); `vehicles`: `carrier_id`, `vehicle_type`, `capacity_crates`, `cost_per_km`, `driver_cost_per_day`, `fixed_cost_per_day`; `routes`: `carrier_id`, `odometer_start`, `odometer_end`, `kind` + `dowozka`, `extra_reason`
- `stop_status`: + `in_progress`, `complaint`; przyczyny (odmowa, brak klienta…) w zdarzeniu
- `drivers`: `pin_hash` (logowanie PIN-em na terminalu)
- nowa `driver_positions` (append-only: kierowca, trasa, punkt GPS, czas)
- gotówka: `cash_movements` (append-only: pobranie na punkcie, przekazanie dyspozytorowi, korekta) + saldo jako widok

## 3. Persony MVP

| Persona | Najważniejsze zadanie | Ekran |
|---|---|---|
| Dyspozytor | Zaplanować jutro do 30 min, reagować dziś na problemy | Tablica planowania, Centrum operacyjne |
| Kierowca | Wiedzieć, gdzie jechać i co zostawić; szybko potwierdzić | PWA: lista punktów, ekran punktu |
| Kierownik/właściciel | Ile kosztują trasy, czy skrzynki wracają, ile wypłacić | Rozliczenia, salda opakowań |
| Handlowiec Fresh (Ty) | Przekonać prospekta liczbą | Audyt tras |

## 4. Mierniki sukcesu pilotażu

Mierzymy **przed** (tydzień obserwacji u klienta) i **po** (4 tygodnie na systemie).

| Miernik | Cel pilotażu |
|---|---|
| Czas planowania dnia (dyspozytor) | −60% |
| % dostaw z potwierdzeniem w aplikacji | ≥ 95% |
| km / punkt dostawy | −8–15% |
| Różnice w saldzie skrzynek wyjaśnione w tygodniu | ≥ 90% |
| Czas przygotowania miesięcznego rozliczenia kierowców | z dni do < 1 godziny |
| Aktywność: dni z planem w systemie / dni robocze | 100% od 2. tygodnia |

Mierniki silnika wzrostu (Audyt tras): liczba audytów / tydzień, % audytów → spotkanie, % spotkań → pilot.

## 5. Definicja "MVP gotowe"

1. Jeden klient pilotażowy planuje i realizuje w Fresh **wszystkie trasy przez 10 kolejnych dni roboczych** bez równoległego Excela.
2. Rozliczenie kierowców za ten okres wygenerowane z systemu i zaakceptowane przez klienta.
3. Salda opakowań per klient zgodne z inwentaryzacją klienta (lub różnice wyjaśnione).
4. Audyt tras wykonany dla min. 10 prospektów.

## 6. Otwarte pytania

Zamknięte po warsztatach: ERP pilota = WF-Mag (w MVP import/API, bez konektora) · trasy stałe per kierunek (Kraków Zachód, Zakopane, Tarnów) · terminale Zebra (Android) · modele wynagrodzeń: etatowy i dowózkowy.

Do ustalenia z pilotem przed M3:
- Jak dokładnie wygląda eksport zamówień z WF-Mag (kolumny, kody kontrahentów i oddziałów) i jak często da się go robić? Czy WMS może oznaczać gotowość w tym samym pliku?
- Konkretne stawki: dniówka, premia (za co?), % od obrotu / stawka za punkt dla dowózkowych.
- Czy trasa stała to ten sam zestaw oddziałów każdego dnia, czy zależy od dnia tygodnia?
- Czy kierowca musi **drukować** raport zmiany (drukarka Zebra), czy wystarczy ekran + PDF dla biura?
- Zebra: model terminala i wersja Androida (PWA, aparat, GPS) — sprawdzić na jednym urządzeniu przed M4.
- Gotówka: czy kierowca rozlicza się z dyspozytorem, czy z kasą/księgowością?
