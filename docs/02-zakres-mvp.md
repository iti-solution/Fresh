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

Poza MVP w całości (P1): zwroty, reklamacje jako proces, rozliczenia przewoźników, gotówka/pobrania (w MVP tylko pole "kwota pobrania" na zleceniu i potwierdzenie "pobrano/nie pobrano"), alerty, portal przewoźnika, KPI rentowności, AI planowanie floty.

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

## 6. Otwarte pytania (do zamknięcia przed M3)

- Który ERP ma pierwszy klient pilotażowy i jaki eksport zamówień daje (kolumny, kody klientów)?
- Jak dziś wyglądają szablony tras — stałe trasy per dzień tygodnia czy per strefa?
- Jakie składniki wynagrodzenia kierowcy faktycznie stosuje pilotażowy klient (żeby silnik reguł nie był przeprojektowany)?
- Czy kierowcy mają telefony służbowe (Android?) — wpływa na PWA i zdjęcia.
