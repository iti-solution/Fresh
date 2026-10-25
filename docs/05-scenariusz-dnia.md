# Fresh — scenariusz dnia (pilot)

Źródło: notatki z warsztatów z firmą pilotażową (ERP: WF-Mag, WMS przed TMS, terminale Zebra, GPS Consalnet, trasy stałe: Kraków Zachód, Zakopane, Tarnów…). Wersja 0.1, 2026-10-25.

> Czasy trwania kroków „dziś” **nie zostały jeszcze zmierzone** — to pierwsze zadanie tygodnia obserwacji u pilota (pomiar „przed”, `02-zakres-mvp.md` §4).

## Role
| Rola | Kto | Narzędzie w Fresh |
|---|---|---|
| Dyspozytor / planista | układa trasy, pilnuje realizacji | panel web: Tablica planowania, Centrum operacyjne |
| Kierowca | realizuje trasę, rozlicza się na koniec zmiany | aplikacja na terminalu Zebra (PWA) |
| BOK | przyjmuje zgłoszenia klientów, reklamacje | panel web (podgląd statusu dostawy) |
| Kierownik transportu / właściciel | koszty, rozliczenia, opakowania | panel web: Rozliczenia, Opakowania |
| Magazyn (WMS) | kompletuje, potwierdza gotowość | poza Fresh — przekazuje gotowe zamówienia |

## Główny wniosek z warsztatów
Problemem nie jest brak aplikacji dla kierowcy, tylko **brak centralnego modelu danych i kontroli procesu**: wiedza o trasach siedzi w głowach dyspozytorów, a komunikacja w telefonach i na WhatsAppie. Fresh ma być jednym miejscem, w którym zamówienie, trasa, kierowca, opakowania, gotówka i rozliczenie są tym samym procesem.

## Dzień krok po kroku

| # | Moment | Dziś | W Fresh (MVP) | Etap |
|---|---|---|---|---|
| 1 | Zamówienia (D-1) | Zamówienie trafia do WF-Mag. | Zamówienia wchodzą importem z pliku lub przez API (uniwersalna struktura, bez konektora WF-Mag w MVP). Każde ma: nr, kontrahenta, **oddział**, wartość, kg, m³, palety, **skrzynki**, okno, **uwagi handlowe i logistyczne**. | M1 |
| 2 | Kompletacja | Magazyn kompletuje, WMS potwierdza gotowość; dopiero wtedy zamówienie idzie do planowania. | Zamówienie ma status z magazynu: **Do realizacji → Skompletowane**. Dyspozytor może planować wcześniej (wstępnie), ale przekazanie trasy do załadunku z zamówieniem „Do realizacji” daje ostrzeżenie. Trasa gotowa ma status **„Gotowa do załadunku”**. | M1 / M3 |
| 3 | Jakość adresów | Błędne adresy w ERP, brak kontroli. Kierowca „wie”, gdzie jechać. | Każdy oddział ma pinezkę na mapie. Import z ERP **nie nadpisuje** poprawionej ręcznie lokalizacji. Kolejka „adresy do poprawy” przed planowaniem. | M1 |
| 4 | Planowanie | Trasy stałe (Kraków Zachód, Zakopane, Tarnów) układane z pamięci doświadczonego dyspozytora. **Okna 6–8, 8–10, 12–14 nie są wspierane** — największy problem operacyjny. Brak optymalizacji kolejności. | Dzień tworzony z **szablonów tras stałych**. Zamówienia same trafiają na trasę wg przypisania oddziału. Pasek obciążenia: **kg / palety / skrzynki / m³ w %**. **„Ułóż kolejność”** liczy kolejność pod okna czasowe. Alerty: brak kierowcy, brak pojazdu, zamówienie bez trasy, przekroczona masa/objętość. | M3 |
| 5 | Zmiany po zaplanowaniu | Dochodzą zamówienia, reklamacje, dowózki — telefonami. | Nowe zamówienie po wydaniu trasy pojawia się jako alert „nieprzydzielone”. Dyspozytor dopisuje je do trasy, kierowca dostaje zmianę w aplikacji przy następnej synchronizacji. Dowózka = osobny kurs typu „dowózka”. | M3 / M4 |
| 6 | Start zmiany | Kierowca loguje się na Zebrze **numerem rejestracyjnym**. | Logowanie **kierowca + PIN**, wybór pojazdu, **licznik start**. Trasa pobierana w całości do pamięci terminala. | M4 |
| 7 | Dostawa na punkcie | Kierowca dzwoni z prywatnego telefonu, uwagi zna z pamięci. | Ekran punktu: okno, telefon, **opiekun handlowy**, **uwagi stałe** (gdzie dzwonić, wjazd, piętro, strefa rozładunku) i **tymczasowe** (remont, zamknięta droga, zmiana godzin). Status: **w realizacji → dostarczono / częściowo / reklamacja / brak odbioru**. Zdjęcie jako dowód, GPS przy potwierdzeniu. | M4 |
| 8 | Opakowania i gotówka | Liczone „na kartce”. | Na punkcie: **wydano / zwrot** palet, skrzynek, skrzyniopalet. Przy pobraniu: kwota do pobrania vs **pobrano**. | M4 / M5 |
| 9 | Brak zasięgu | Aplikacja nie działa, kierowca nie wydrukuje raportu. | Wszystko działa offline, synchronizacja po odzyskaniu sieci. Raport zmiany dostępny offline. | M4 |
| 10 | Problem w trasie | Telefon, WhatsApp. | MVP: „Zgłoś problem / opóźnienie” ze zdjęciem i komentarzem, widoczne w Centrum operacyjnym. Pełny komunikator — Etap 2. | M4 (komunikator: P1) |
| 11 | Monitoring | Dyspozytor dzwoni do kierowców. | **Centrum operacyjne**: zamówienia nieprzydzielone / przypisane / dostarczone, trasy aktywne / opóźnione, alerty. Pozycja kierowcy z aplikacji co kilka minut (gdy aplikacja jest otwarta) → opóźnienia vs okno. | M6 |
| 12 | Koniec zmiany | Ręczne zestawienie. | **Raport zmiany** w aplikacji: punkty, przebieg (licznik stop − start), obrót, gotówka, palety, skrzynki, wynagrodzenie za dzień. Dyspozytor zamyka trasę i przyjmuje gotówkę oraz opakowania. | M5 |
| 13 | Rozliczenia | Ręcznie, różne modele. | Silnik reguł: **etatowy** (dniówka + premia), **dowózkowy** (obrót trasy, punkty, wartość dostaw). Saldo opakowań: klient, kierowca, trasa; raport zalegających. Przewoźnik — osobny model (P1). | M5 |

## Co z warsztatów zmienia plan MVP
Szczegóły i decyzje: `02-zakres-mvp.md` §2a.
1. **Gotówka wchodzi do MVP** (pilot ma ją w etapie 1): pobrania, kwota pobrana, rozliczenie gotówki kierowcy przy zamknięciu trasy, różnice.
2. **Skrzynki jako trzeci wymiar ładowności** obok kg i palet (pojazd, zamówienie, walidacja).
3. **Uwagi tymczasowe z datą ważności** i podział oddziałów (restauracja / kuchnia / bar / magazyn = osobne punkty dostaw jednego kontrahenta).
4. **Gotowość z WMS** jako status zamówienia.
5. **Logowanie kierowcy PIN-em na współdzielonym terminalu Zebra** zamiast linku e-mail.
6. **Pozycja GPS z aplikacji przy otwartej trasie** (nie tylko przy potwierdzeniu) — bez integracji Consalnet.
7. **Przewoźnik** jako pole pojazdu/trasy (bez rozliczeń przewoźnika — P1) oraz **koszty pojazdu** (km, kierowca, dzień) pod KPI pustych przebiegów.

## Potwierdzone, że zostaje poza MVP (Etap 2–3 u pilota)
Reklamacje jako proces z decyzją (odrzucenie / uznanie / dowózka) · analiza dowózek (przyczyna, odpowiedzialność, koszt, wpływ na premię) · komunikator BOK/dyspozytor/klient ↔ kierowca · integracja GPS Consalnet · natywne konektory WF-Mag/WMS · AI (sugestia auta/kierowcy, anomalie reklamacji, ocena kierowców) · dashboard zarządczy.

W MVP zbieramy jednak **dane pod te funkcje**: status „reklamacja” ze zdjęciem i przyczyną, kursy typu „dowózka”, licznik km, koszty pojazdu — żeby Etap 2 miał na czym pracować od pierwszego dnia.

## Makiety ekranów
Kluczowe ekrany (tablica planowania, centrum operacyjne, aplikacja kierowcy: trasa, punkt, raport zmiany): https://claude.ai/artifact/Vxxt8r9P9r7cxZ6pcxqkSN
