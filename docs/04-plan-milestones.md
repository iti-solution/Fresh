# Fresh — plan budowy MVP (kamienie milowe)

Szacunki przy pracy jednej osoby z Claude Code, ~15–20 h tygodniowo. Każdy kamień kończy się czymś, co da się **pokazać** klientowi lub prospektowi.

Jak pracować: otwórz Claude Code w folderze `Fresh` i napisz np. *"Zrealizuj M1.2 zgodnie z docs/04-plan-milestones.md. Najpierw pokaż plan."* Po każdym zadaniu: testy zielone, commit, odhacz `[x]` tutaj.

```
M0 Fundament ─► M1 Kartoteki+import ─► M2 Audyt tras ─► M3 Planowanie ─► M4 Aplikacja kierowcy ─► M5 Opakowania+rozliczenia ─► M6 Pilot
   (1 tydz.)       (2 tydz.)              (1,5 tydz.)       (3 tydz.)          (3 tydz.)                 (2 tydz.)                  (2 tydz.)
                                            ▲ od tu startuje sprzedaż (audyty u prospektów)
```
Razem: ~15–16 tygodni do pilota (po warsztatach: +gotówka, skrzynki, PIN, GPS). Audyt tras jest gotowy po ~4,5 tygodnia — sprzedaż rusza, zanim produkt jest skończony.

---

## M0 — Fundament (1 tydz.) ✅ zakończony 2026-10-25
- [x] M0.1 Repo: Next.js 16 (App Router, TS strict), Tailwind, komponenty UI, ESLint/Prettier, Vitest, Playwright; struktura `src/modules/*` wg `01-architektura.md` §5
- [x] M0.2 Supabase (region EU): projekt **dev** + migracje `0001`, `0002`; typy TS wygenerowane ze schematu ✅ — *produkcyjny projekt Supabase przesunięty do M6*
- [x] M0.3 Auth: logowanie linkiem e-mail, wybór/zakładanie firmy, proxy z sesją, dostęp według roli
- [x] M0.4 Dane demo: funkcja `create_demo_tenant()` + przycisk „Utwórz firmę demo” (40 punktów Bielsko/Żywiec z oknami, 6 pojazdów, 6 kierowców, 3 typy opakowań, 5 szablonów tras, święta)
- [x] M0.5 CI (GitHub Actions: lint, typy, testy, build, e2e) ✅ + deploy Vercel — *Sentry przesunięty do M4*

**Gotowe gdy:** logujesz się na adresie z Vercela (https://fresh-drab.vercel.app), tworzysz firmę demo i widzisz w kartotekach 40 punktów, 6 pojazdów, 6 kierowców i 5 szablonów tras.

## M1 — Kartoteki i import zleceń (2,5 tydz.)
- [ ] M1.0 Migracja `0003` wg `02-zakres-mvp.md` §2a (skrzynki, oddziały, uwagi stałe/tymczasowe, opiekun, gotowość, przewoźnicy, koszty pojazdu, PIN, pozycje GPS, gotówka) + typy TS + testy RLS nowych tabel
- [ ] M1.1 Klienci i punkty dostaw: lista z wyszukiwaniem, formularz, wiele punktów na klienta, okna per dzień tygodnia, dni dostaw, sezonowość, instrukcje dla kierowcy
- [ ] M1.1a Typ oddziału (restauracja/kuchnia/bar/magazyn), uwagi stałe (dzwonić, wjazd, piętro, strefa rozładunku), uwagi tymczasowe z datą ważności, opiekun handlowy
- [ ] M1.2 Geokodowanie: adapter `GeocodingProvider` (Google), geokodowanie przy zapisie i wsadowo, status `ambiguous/failed` → kolejka "do poprawy", **ręczne przesunięcie pinezki na mapie**
- [ ] M1.3 Wyjątki i święta: kalendarz świąt PL (wbudowany) + zamknięcia per punkt
- [ ] M1.4 Pojazdy i kierowcy: CRUD, pojemności, status, domyślne przypisania; zaproszenie kierowcy (konto do PWA)
- [ ] M1.4a Przewoźnicy, pojemność skrzynek, koszty pojazdu (km, kierowca, dzień)
- [ ] M1.5 Import zleceń CSV/XLSX: upload → podgląd → mapowanie kolumn (zapamiętane per tenant) → dopasowanie do punktu po `external_code`, potem po adresie → raport: OK / niedopasowane; ekran ręcznego dopasowania
- [ ] M1.5a Pola zamówienia z warsztatów: wartość, skrzynki, uwagi handlowe/logistyczne, okno na zamówieniu, **status gotowości z WMS**; import nie nadpisuje zablokowanej pinezki
- [ ] M1.6 API `POST /api/v1/orders` z kluczem API tenanta (te same reguły co import)
- [ ] M1.7 Import kartoteki klientów/punktów z Excela (to samo narzędzie mapowania) — skraca onboarding klienta z dni do godzin
- [ ] M1.8 Dane demo przeniesione w okolice Krakowa (kierunki jak u pilota: Kraków Zachód, Zakopane, Tarnów…) — lepsze pokazy

**Gotowe gdy:** wgrywasz eksport zamówień z ERP i widzisz zlecenia na jutro, każde przypięte do punktu na mapie.

## M2 — Audyt tras: silnik wzrostu (1,5 tydz.)
- [ ] M2.1 Adapter `RoutingProvider`: macierz czasów/odległości + optymalizacja VRP z oknami czasowymi i pojemnościami (start: OpenRouteService lub GraphHopper)
- [ ] M2.2 Kreator audytu: upload Excela prospekta (adres, trasa/kierowca, kolejność, okno, opcjonalnie palety), mapowanie kolumn, geokodowanie
- [ ] M2.3 Obliczenie "jak jest" (kolejność z pliku) i "jak mogłoby być" (VRP), konflikty okien
- [ ] M2.4 Raport: strona web + PDF — km i godziny przed/po, oszczędność zł/mies. (parametry: koszt km, koszt godziny kierowcy, dni robocze), mapa przed/po, top 5 obserwacji
- [ ] M2.5 Publiczna strona "Sprawdź, ile kilometrów tracą Twoje trasy" z formularzem leada → `route_audits`; powiadomienie mailem do Ciebie

**Gotowe gdy:** z pliku prospekta w 10 minut masz PDF z liczbą "tracicie X km i Y godzin dziennie".
**Sprzedaż:** od tego momentu każde pierwsze spotkanie (SellWise) zaczyna się od audytu.

## M3 — Planowanie tras (3 tydz.)
- [ ] M3.1 Szablony tras: lista, przypisanie punktów z domyślną kolejnością, dni tygodnia, domyślny pojazd/kierowca
- [ ] M3.2 "Utwórz dzień": z szablonów na datę D powstają trasy, zlecenia dnia automatycznie trafiają na trasy wg przypisania punktu; reszta w kolumnie "niezaplanowane"
- [ ] M3.3 Tablica planowania: kolumny tras + lista niezaplanowanych + mapa; drag & drop zleceń między trasami, zmiana kolejności, podział/łączenie postojów
- [ ] M3.4 Walidacje na żywo (czyste funkcje + testy): palety/kg/m³/**skrzynki** vs pojazd z paskiem % obciążenia, brak kierowcy/pojazdu, zamówienie bez trasy, niegotowe zamówienie z WMS (alarm przeciążenia), ETA vs okno (konflikt), punkt zamknięty w dniu/święto, zlecenie priorytetowe
- [ ] M3.5 "Ułóż kolejność" dla trasy (VRP jednej trasy z oknami) + przeliczenie ETA, km, czasu
- [ ] M3.6 Kursy dodatkowe: drugi kurs, **dowózka (z przyczyną)**, ekspres/awaryjny/weekendowy; zamówienia dodane po wydaniu trasy jako alert „nieprzydzielone”
- [ ] M3.7 Kopiowanie dnia / trasy, wydanie tras (`dispatched`), wydruk listy załadunkowej (PDF, kolejność odwrotna do dostaw)

**Gotowe gdy:** dyspozytor z danymi demo planuje jutro (40 punktów, 6 aut) w < 15 minut, a system nie pozwala wydać przeciążonej trasy bez świadomego potwierdzenia.

## M4 — Aplikacja kierowcy PWA (3 tydz.)
- [ ] M4.1 PWA na terminalu Zebra: logowanie **kierowca + PIN** (współdzielone urządzenie), wybór pojazdu, licznik start, wybór trasy dnia, pobranie całej trasy do IndexedDB
- [ ] M4.2 Kolejka zdarzeń offline + `POST /api/driver/sync` (idempotencja po `client_event_id`, walidacja przynależności trasy do kierowcy)
- [ ] M4.2a Pozycja GPS co kilka minut przy otwartej trasie (`driver_positions`), wysyłana w paczkach przy synchronizacji
- [ ] M4.3 Ekran trasy: lista punktów, nawigacja (otwarcie Google Maps / Waze), start trasy z licznikiem km
- [ ] M4.4 Ekran punktu: okno, telefon, opiekun, uwagi stałe i **aktualne tymczasowe**; status w realizacji → dostarczono / częściowo / **reklamacja (zdjęcie + przyczyna)** / brak odbioru, zdjęcie, podpis palcem, GPS w momencie potwierdzenia, komentarz
- [ ] M4.5 Opakowania na punkcie: wydane i odebrane per typ (domyślnie podpowiedź z salda klienta)
- [ ] M4.6 "Zgłoś problem / opóźnienie" (zdjęcie + opis); **gotówka: kwota do pobrania vs pobrano** na punkcie
- [ ] M4.7 **Raport zmiany** (dostępny offline): punkty, przebieg (licznik stop − start), obrót, gotówka, palety, skrzynki, wynagrodzenie za dzień
- [ ] M4.8 Test terenowy: tryb samolotowy na całej trasie, potem synchronizacja — zero utraconych zdarzeń

**Gotowe gdy:** przejeżdżasz realną trasę testową z telefonem w trybie offline i po powrocie wszystko jest w panelu ze zdjęciami.

## M5 — Opakowania i rozliczenia kierowców (2 tydz.)
- [ ] M5.1 Księga opakowań: zamknięcie trasy generuje ruchy (podwójny zapis klient ↔ kierowca ↔ magazyn), salda klienta i kierowcy, historia ruchów per klient
- [ ] M5.2 Korekty z powodem (uszkodzenie, inwentaryzacja), raport różnic: kierowca zdał mniej niż odebrał
- [ ] M5.2a **Gotówka**: księga ruchów (pobranie → kierowca → dyspozytor), przyjęcie gotówki przy zamknięciu trasy, różnice kasowe, saldo kierowcy
- [ ] M5.2b Raporty opakowań: zalegające u klientów, stan klienta, kierowcy, trasy
- [ ] M5.3 Silnik reguł wynagrodzeń (czyste funkcje + pełne testy): **etatowy** (dniówka + premia), **dowózkowy** (obrót trasy, za punkt, od wartości dostaw), km z progiem, kurs dodatkowy, dodatki ręczne; reguły wersjonowane w czasie
- [ ] M5.4 Rozliczenie dzienne (przy zamknięciu trasy) i miesięczne (zatwierdzenie przez kierownika), eksport XLSX dla kadr
- [ ] M5.5 Zamykanie trasy przez dyspozytora: checklista (wszystkie punkty potwierdzone? km wpisane? opakowania zdane?)

**Gotowe gdy:** za miesiąc demo generujesz rozliczenie 6 kierowców jednym kliknięciem, a każda pozycja ma "skąd się wzięła".

## M6 — Centrum operacyjne i pilot (2 tydz.)
- [ ] M6.1 Dashboard dnia (Realtime): mapa tras, postęp % per trasa, punkty spóźnione vs okno, trasy nierozpoczęte, brak potwierdzeń, podgląd zdjęć/podpisów
- [ ] M6.2 Mini-KPI: terminowość dostaw, km/punkt, punkty/trasę, czas obsługi punktu — dzień/tydzień
- [ ] M6.3 Onboarding klienta: kreator (firma → import punktów → pojazdy → kierowcy → szablony tras) — cel: nowy klient gotowy w 1 dzień
- [ ] M6.4 Hardening: kopie zapasowe, logi audytu zmian tras/rozliczeń, testy RLS (tenant A nie widzi B), test obciążenia 5 000 punktów/dzień
- [ ] M6.5 Uruchomienie pilota: pomiar "przed" (tydzień), szkolenie dyspozytora i kierowców, 10 dni bez Excela (Definicja gotowości w `02-zakres-mvp.md` §5)

---

## Backlog P1 (po pilocie, kolejność wg feedbacku)
Reklamacje z decyzją (odrzucenie/uznanie/dowózka) · Analiza dowózek (przyczyna, odpowiedzialność, koszt, wpływ na premię) · KPI pustych przebiegów · Wydruk raportu na drukarce Zebra (jeśli potrzebny) · Zwroty (pełne/częściowe, przyczyny, zdjęcia) · Reklamacje · Rozliczenia przewoźników (punktowe, km, strefowe, ryczałt) · Gotówka (przyjęcie, rozliczenie, różnice kasowe) · Alerty (push/mail) · Integracja GPS Consalnet · Natywny konektor WF-Mag / WMS · Komunikator BOK/dyspozytor ↔ kierowca (+ ETA dla klienta)

## Backlog P2
Auto-planowanie całej floty (VRP multi-vehicle z przydziałem) · AI asystent dyspozytora ("przenieś punkty z chorego kierowcy") · KPI rentowności (koszt km, trasy, punktu) · Portal przewoźnika · Prognozowanie wolumenów · Samoobsługa kierowców
