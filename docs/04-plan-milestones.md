# Driver (dawniej Fresh) — plan budowy MVP (kamienie milowe)

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
- [x] M1.0 Migracje `0003` (słowniki) + `0004` (model) wg `02-zakres-mvp.md` §2a (skrzynki, oddziały, uwagi stałe/tymczasowe, opiekun, gotowość, przewoźnicy, koszty pojazdu, PIN, pozycje GPS, gotówka) + typy TS + testy RLS nowych tabel
- [x] M1.1 Klienci i punkty dostaw: lista z wyszukiwaniem, formularz, wiele punktów na klienta, okna per dzień tygodnia, dni dostaw, sezonowość, instrukcje dla kierowcy
- [x] M1.1a Typ oddziału (restauracja/kuchnia/bar/magazyn), uwagi stałe (dzwonić, wjazd, piętro, strefa rozładunku), uwagi tymczasowe z datą ważności, opiekun handlowy
- [ ] ~~M1.2~~ **Odłożone (decyzja 2026-10-25: bez map i pinezek na tym etapie)** — Geokodowanie: adapter `GeocodingProvider` (Google), geokodowanie przy zapisie i wsadowo, status `ambiguous/failed` → kolejka "do poprawy", **ręczne przesunięcie pinezki na mapie**
- [x] M1.3 (2026-11-05) Wyjątki i święta: kalendarz świąt PL wbudowany (także Wigilia od 2025), dni zamknięte firmy i „pracujemy mimo święta” w Ustawieniach, zamknięcia pojedynczego adresu na karcie klienta; planowanie i portal je uwzględniają
- [x] M1.4 Pojazdy i kierowcy: CRUD, pojemności, status, domyślne przypisania; zaproszenie kierowcy (konto do PWA)
- [x] M1.4a Przewoźnicy, pojemność skrzynek, koszty pojazdu (km, kierowca, dzień)
- [x] M1.5-pre Lista zamówień na dzień (grupowanie po trasach stałych, sumy, filtr Skompletowane / Do realizacji, zmiana statusu, anulowanie) + ręczne zamówienie; pulpit z zajętością tras na najbliższy dzień
- [x] M1.5 (2026-11-05, migracja `0016`) Import zamówień CSV/XLSX (`/zlecenia/import`): plik czytany w przeglądarce → przypisanie kolumn (zgadywane, zapamiętane dla firmy) → dopasowanie: kod adresu → kod klienta → adres; ponowny import aktualizuje zamówienie (nie rusza jadących/zakończonych); raport wierszy z błędami; ekran `/zlecenia/dopasuj` z podpowiedziami i „zapamiętaj kod”
- [x] M1.5a Pola zamówienia z warsztatów w imporcie i API: wartość, skrzynki, palety, m³, pobranie, uwagi handlowe/logistyczne, okno (jedna kolumna albo od/do), **gotowość z WMS**, priorytet, dostawa/odbiór
- [x] M1.6 API `POST /api/v1/orders` z kluczem API firmy (`Authorization: Bearer drv_…`, w bazie tylko skrót SHA-256; klucze w Ustawieniach, tylko admin) — te same reguły co import
- [x] M1.7 Import kartoteki klientów i adresów z Excela (`/kartoteki/klienci/import`): grupowanie po kodzie/nazwie klienta, adres po kodzie albo ulicy, dni dostaw („pn-pt”), okna, typ adresu, osoba na miejscu; ponowny import uzupełnia bez dublowania; zablokowana lokalizacja nie zmienia adresu
- [x] M1.8 Dane demo przeniesione w okolice Krakowa (kierunki jak u pilota: Kraków Zachód, Zakopane, Tarnów…) — lepsze pokazy
- [x] M1.9 (2026-11-05, decyzja: produkt dla każdej hurtowni z własnym transportem) **Uniwersalne typy adresów** zamiast „restauracja/kuchnia/bar”: siedziba, sklep, lokal gastronomiczny, magazyn, zakład, **budowa** (adres tymczasowy: czynna od–do + osoba na miejscu), adres prywatny, inny — lista edytowalna przez firmę w Ustawieniach; „oddział” → „adres dostawy” w całym UI

**Gotowe gdy:** wgrywasz eksport zamówień z ERP i widzisz zlecenia na jutro, każde przypięte do adresu dostawy (bez mapy — D20). ✅

## M2 — Audyt tras: silnik wzrostu (1,5 tydz.)
- [ ] M2.1 Adapter `RoutingProvider`: macierz czasów/odległości + optymalizacja VRP z oknami czasowymi i pojemnościami (start: OpenRouteService lub GraphHopper)
- [ ] M2.2 Kreator audytu: upload Excela prospekta (adres, trasa/kierowca, kolejność, okno, opcjonalnie palety), mapowanie kolumn, geokodowanie
- [ ] M2.3 Obliczenie "jak jest" (kolejność z pliku) i "jak mogłoby być" (VRP), konflikty okien
- [ ] M2.4 Raport: strona web + PDF — km i godziny przed/po, oszczędność zł/mies. (parametry: koszt km, koszt godziny kierowcy, dni robocze), mapa przed/po, top 5 obserwacji
- [ ] M2.5 Publiczna strona "Sprawdź, ile kilometrów tracą Twoje trasy" z formularzem leada → `route_audits`; powiadomienie mailem do Ciebie

**Gotowe gdy:** z pliku prospekta w 10 minut masz PDF z liczbą "tracicie X km i Y godzin dziennie".
**Sprzedaż:** od tego momentu każde pierwsze spotkanie (SellWise) zaczyna się od audytu.

## M3 — Planowanie tras (3 tydz.)
- [x] M3.1 (2026-10-26, migracja `0010`) Szablony tras: lista, tworzenie i edycja, przypisanie oddziałów klientów z kolejnością (↑↓, sortowanie wg okien), dni tygodnia, godzina wyjazdu, opcjonalnie auto, kierowca wstępny i zastępczy (zastępczy wchodzi automatycznie, gdy wstępny jest nieaktywny lub zajęty)
- [x] M3.2 "Utwórz dzień": z szablonów na datę D powstają trasy, zlecenia dnia automatycznie trafiają na trasy wg przypisania punktu; reszta w kolumnie "niezaplanowane"
- [x] M3.3 Tablica planowania: kolumny tras + lista nieprzydzielonych (**bez mapy** — decyzja 2026-10-25); drag & drop zleceń między trasami, zmiana kolejności, podział/łączenie postojów
- [x] M3.4 Walidacje na żywo (czyste funkcje + testy): palety/kg/m³/**skrzynki** vs pojazd z paskiem % obciążenia, brak kierowcy/pojazdu, zamówienie bez trasy, niegotowe zamówienie z WMS (alarm przeciążenia), ETA vs okno (konflikt), punkt zamknięty w dniu/święto, zlecenie priorytetowe
- [x] M3.5 (bez map — D20) „Sortuj wg okien” na tablicy planowania i w szablonach; pełna optymalizacja VRP wróci razem z geokodowaniem (M1.2 / M2)
- [x] M3.6 Kursy dodatkowe: drugi kurs, **dowózka (z przyczyną)**, ekspres/awaryjny/weekendowy; zamówienia dodane po wydaniu trasy jako alert „nieprzydzielone”
- [x] M3.7 (2026-11-05, migracja `0017`) „Gotowa do załadunku” z regułami i potwierdzeniem przeciążenia; **kopiowanie dnia** (pusty dzień → „skopiuj plan z dnia…”) i **kopiowanie trasy** na inny dzień; **listy załadunkowe** do druku/PDF (`/druk/zaladunek`, kolejność odwrotna do dostaw, pozycje towaru, sumy, podpisy)

**Gotowe gdy:** dyspozytor z danymi demo planuje jutro (40 punktów, 6 aut) w < 15 minut, a system nie pozwala wydać przeciążonej trasy bez świadomego potwierdzenia.

## M4 — Aplikacja kierowcy PWA (3 tydz.)
- [x] M4.1 PWA na terminalu Zebra: logowanie kierowca + PIN, wybór pojazdu, licznik start, wybór trasy; **manifest, ikony, service worker** (`/driver-sw.js`), trasy dnia zapisywane w telefonie już na liście tras
- [x] M4.2 (2026-11-05) Offline: migawka trasy + kolejka zdarzeń w IndexedDB (Dexie), `POST /api/driver/sync` idempotentny po `client_event_id` (ten sam kod walidacji na telefonie i serwerze), odrzucone zdarzenia pokazane kierowcy; zmiany dyspozytora trafiają do telefonu przy synchronizacji. Sprawdzone w przeglądarce: cała zmiana w trybie samolotowym, potem wysyłka bez strat
- [x] M4.2a Pozycja GPS co 3 minuty przy otwartej trasie (`driver_positions`, paczkami, bez duplikatów) + GPS przy każdym zapisie
- [x] M4.3 Ekran trasy: lista punktów z **szybką zmianą statusu na każdym punkcie** (Nie rozpoczęto · Teraz realizuję · Częściowo · Dostarczono; „Teraz realizuję” tylko na jednym punkcie naraz), start trasy z licznikiem km — *nawigacja odłożona (decyzja: bez map na tym etapie)*
- [x] M4.4 Ekran punktu: okno, telefony (odbiorca, opiekun, **osoba na miejscu**), uwagi, wynik dostawy, reklamacja/zwrot z przyczyną, **zdjęcia** (kompresja w telefonie), **podpis palcem**, GPS, komentarz — zdjęcia/podpis wysyłane po przyjęciu zdarzenia (prywatny bucket `delivery-photos`, migracja `0018`)
- [x] M4.5 Opakowania na punkcie: wydane i odebrane per typ; **podpowiedź „u klienta: N”** z salda klienta
- [x] M4.6 „Zgłoś problem / opóźnienie” (opis + zdjęcia, na punkcie albo całej trasie) → panel „Zgłoszenia z trasy” w centrum; gotówka do pobrania vs pobrano
- [x] M4.7 Raport zmiany (offline): **wynagrodzenie za dziś** ze składnikami i suma miesiąca (bez obrotu — D17), przebieg, punkty, terminowość, gotówka i opakowania do zdania
- [ ] M4.8 Test terenowy na prawdziwym terminalu Zebra: tryb samolotowy na całej trasie, potem synchronizacja — **do zrobienia przez Ciebie z pilotem** (logika sprawdzona w przeglądarce)

**Gotowe gdy:** przejeżdżasz realną trasę testową z telefonem w trybie offline i po powrocie wszystko jest w panelu ze zdjęciami.

## M5 — Opakowania i rozliczenia kierowców (2 tydz.)
- [x] M5.1 (migracja `0019`) Księga opakowań: zamknięcie trasy dopisuje ruchy załadunku (magazyn → kierowca) i zdania (kierowca → magazyn); salda klienta i kierowcy; historia ruchów klienta (`/opakowania`)
- [x] M5.2 Korekty z powodem (inwentaryzacja, uszkodzenie, inna) w parze z magazynem; widok „Różnice u kierowców”
- [x] M5.2a Gotówka: pobranie na punkcie → kierowca → kasa przy zamknięciu trasy, różnice kasowe na zamknięciu, korekta gotówki z opisem
- [x] M5.2b Raporty opakowań: saldo klienta per typ, **zalegające > 30 dni (FIFO)**, kaucja u klientów, różnice u kierowców, historia klienta
- [x] M5.3 Silnik wynagrodzeń (`modules/payroll/domain`, testy): etatowy (dniówka raz dziennie, km ponad próg, premia za terminowość), dowózkowy (za punkt, za paletę, % obrotu trasy, % wartości dostaw), kurs dodatkowy; reguła domyślna + reguły kierowców, **wersje w czasie** (nowa zamyka poprzednią) — `/rozliczenia/stawki`
- [x] M5.4 Rozliczenie dzienne (przy zamknięciu trasy przelicza miesiąc kierowcy) i miesięczne (`/rozliczenia`): pozycje z opisem „skąd się wzięła”, dodatki/potrącenia ręczne, zatwierdzenie przez admina (zamraża), **eksport XLSX** dla kadr
- [x] M5.5 Zamykanie trasy (`/rozliczenia/zamkniecie/[id]`, linki z centrum): checklista, przyjęcie opakowań i gotówki z różnicami, licznik gdy kierowca nie zakończył zmiany — wszystko w jednej transakcji (`close_route`)

**Gotowe gdy:** za miesiąc demo generujesz rozliczenie 6 kierowców jednym kliknięciem, a każda pozycja ma "skąd się wzięła". ✅ (po ustawieniu stawek)

## M6 — Centrum operacyjne i pilot (2 tydz.)
- [x] M6.1 Centrum operacyjne dyspozytora: postęp tras, spóźnienia vs okno, trasy nierozpoczęte, alerty z linkami, **na żywo (Supabase Realtime)**, **zgłoszenia z trasy ze zdjęciami**, potwierdzenie dostawy punktu (`/centrum/punkt/[id]`: oś czasu, GPS, zdjęcia, podpis, opakowania, gotówka), zamykanie tras
- [x] M6.1a (2026-10-26: `/bok`, wyszukiwarka także w górnym pasku; strona startowa roli BOK) Widok **BOK**: wyszukiwarka „Gdzie jest dostawa?” (klient, zamówienie, telefon) → status, ETA vs okno, kierowca z telefonem, historia dnia; lista dostaw dnia z filtrami; rola `customer_service`
- [x] M6.1b Podsumowanie dla zarządu (`/raport`): sprzedaż vs tydzień temu, trend, terminowość, wyjątki, efektywność kierunków, top klienci, opakowania z kaucją i **zalegającymi > 30 dni**, gotówka; układ responsywny (telefon)
- [x] M6.2 Mini-KPI: terminowość, km/punkt, punkty/trasę, **średni czas obsługi punktu** — centrum (dzień) i raport (okres)
- [x] M6.3 Kreator uruchomienia firmy (`/start`): klienci (import) → pojazdy → kierowcy z PIN → opakowania → trasy stałe → stawki → pierwsze zamówienia → pierwszy dzień
- [x] M6.4 Hardening (migracja `0020`): dziennik audytu zmian tras, rozliczeń i stawek; stały `search_path` funkcji; funkcje wewnętrzne niedostępne z API; indeksy; testy RLS nowych tabel (`supabase/tests/m1_m5_rls.sql`); test obciążenia 5 000 adresów/zamówień (`supabase/tests/load_5000.sql`: tablica planowania 10 ms, „Utwórz dzień” ~6 s). Kopie zapasowe: włączyć PITR w Supabase przy przejściu na projekt produkcyjny
- [ ] M6.5 Uruchomienie pilota: pomiar "przed" (tydzień), szkolenie dyspozytora i kierowców, 10 dni bez Excela (Definicja gotowości w `02-zakres-mvp.md` §5) — **po Twojej stronie**

---

## Redesign UI (2026-10-26)
- [x] System wizualny v2 (`docs/06-system-wizualny.md`): IBM Plex Sans, tokeny kolorów statusów, ciemna nawigacja z ikonami, globalna wyszukiwarka dostaw, nowe komponenty (`Panel`, `StatTile`, `Pill`, `Plate`, `Meter`, `Segmented`, wykresy SVG)
- [x] Przebudowane: pulpit, planowanie (tablica 1–2 kolumny zależnie od monitora), zamówienia, kartoteki, formularze, logowanie i wybór firmy, aplikacja kierowcy
- [x] Historia demo (migracja `0008`): ~4 tygodnie zrealizowanych tras + dzień „w trakcie”, żeby zestawienia miały dane na pokazie

## Poprawki 2026-10-26 (wieczór)
- [x] Kierowca nie jest przypisany do auta na stałe: usunięte „domyślne” pary w kartotekach; auto i kierowca są przydzielane do trasy na dany dzień (dyspozytor), kierowca może zmienić auto przy starcie trasy
- [x] **Dziennik przydziałów** (`/kartoteki/pojazdy/dziennik`): kto, którym autem, na jakiej trasie i z jakimi zamówieniami jechał danego dnia; historia 30 dni na karcie auta i kierowcy; „ostatni przydział” na listach
- [x] Planowanie: alarm, gdy to samo auto lub kierowca jest na dwóch trasach w tym samym kursie; przycisk „Przydziel jak ostatnio”
- [x] Demo (migracja `0009`): kierowcy rotują między trasami, raz w tygodniu auto zastępcze
- [x] ~~Barwy ExpertWMS (granat + pomarańcz, Barlow)~~ → zastąpione 2026-11-05: butelkowa zieleń + limonka, IBM Plex Sans (`docs/06-system-wizualny.md` v4)
- [x] BOK według tras: każda trasa z kierowcą, autem, telefonem, „gdzie jest teraz”, listą punktów i szacowanym dojazdem; wyszukiwanie pokazuje klienta w kontekście trasy (ile punktów przed nim, ETA vs okno)
- [x] Raport zarządu: „Dziś / jutro — plan, realizacja i prognoza końca dnia” (sprzedaż, terminowość teraz → prognoza, zagrożone punkty, powroty tras); prognoza ETA w `modules/ops/domain/forecast.ts`
- [ ] Decyzja produktowa: czy trasa stała ma dalej podpowiadać auto/kierowcę przy tworzeniu dnia (dziś: tak, jako propozycja do zmiany)

## Backlog P1 (po pilocie, kolejność wg feedbacku)
Reklamacje z decyzją (odrzucenie/uznanie/dowózka) · Analiza dowózek (przyczyna, odpowiedzialność, koszt, wpływ na premię) · KPI pustych przebiegów · Wydruk raportu na drukarce Zebra (jeśli potrzebny) · Zwroty — obsługa w biurze (decyzja, jakość, dokument) (pełne/częściowe, przyczyny, zdjęcia) · Reklamacje · Rozliczenia przewoźników (punktowe, km, strefowe, ryczałt) · Gotówka (przyjęcie, rozliczenie, różnice kasowe) · Alerty (push/mail) · Integracja GPS Consalnet · Natywny konektor WF-Mag / WMS · Komunikator BOK/dyspozytor ↔ kierowca (+ ETA dla klienta)

## Backlog P2
Auto-planowanie całej floty (VRP multi-vehicle z przydziałem) · AI asystent dyspozytora ("przenieś punkty z chorego kierowcy") · KPI rentowności (koszt km, trasy, punktu) · Portal przewoźnika · Prognozowanie wolumenów · Samoobsługa kierowców

## Portal zamówień klienta (2026-11-01) — szczegóły: `docs/07-portal-klienta.md`
- [x] ~~Nazwa produktu: **Fresh TMS**~~ → 2026-11-05: nazwa robocza **Driver** (jedno miejsce: `src/lib/brand.ts`)
- [x] Baza (migracje `0011`–`0012`): rola `customer`, katalog `products`, pozycje `order_lines`, dostęp `customer_portal_users`, źródło zamówienia (`orders.source`), funkcje `portal_place_order` / `portal_cancel_order` z kontrolą dostępu, terminu i katalogu; test `supabase/tests/portal.sql`
- [x] Panel: **Katalog produktów** (`/kartoteki/produkty`, przykładowy katalog jednym kliknięciem, ukrywanie produktów); na karcie klienta **Portal zamówień** — login + hasło do przekazania, nowe hasło, wyłączenie dostępu
- [x] Zamówienia: znacznik „portal”, uwaga klienta i rozwijana lista pozycji
- [x] Portal (`/portal`, telefon): logowanie e-mail + hasło, najbliższy termin z godziną graniczną, nowe zamówienie (adres → dzień → produkty → uwagi), „Zamów to samo co ostatnio”, szczegóły i anulowanie przed godziną graniczną
- [x] **Do sprawdzenia** (`/do-sprawdzenia`): wiadomość (SMS, e-mail, WhatsApp, notatka z rozmowy) → rozpoznanie (słownik klienta + katalog, opcjonalnie Claude) → ekran sprawdzenia jak „AI Order” u Fresho → zamówienie; wynik każdej pozycji i skuteczność 30 dni; słownik uczy się na poprawkach
- [x] Portal: Ulubione z gwiazdką, Promocja, opis opakowania, zdjęcie produktu
- [x] Portal: **Napisz lub nagraj zamówienie** (dyktowanie na żywo + nagranie), status wiadomości dla klienta; **BOK** odsłuchuje, potwierdza kompletność i zatwierdza, widzi skuteczność zamówienia na żywo
- [ ] Transkrypcja nagrań po stronie serwera (adapter), gdy przeglądarka nie dyktuje
- [ ] Automatyczne wejście wiadomości: bramka SMS (numer zwrotny), skrzynka e-mail (webhook), WhatsApp Business API; nagrania → transkrypcja (adapter)
- [ ] Ostrzeżenie przy ilości nietypowej dla klienta (np. 10× więcej niż zwykle)
- [ ] Decyzje produktowe: godzina graniczna per hurtownia (dziś domyślnie 20:00, dostawa od jutra) — ekran w Ustawieniach; czy klient może **edytować** zamówienie, a nie tylko anulować i złożyć ponownie
- [ ] Import katalogu z ERP (WF-Mag: CSV/XLSX) i przekazanie zamówień z portalu do ERP (eksport / API)
- [ ] Cenniki per klient (dziś jedna cena orientacyjna dla wszystkich), minimum logistyczne zamówienia
- [ ] Powiadomienie dla hurtowni o nowym zamówieniu z portalu (licznik na pulpicie / mail) i dla klienta o statusie „W drodze” z ETA
- [ ] Zmiana hasła przez klienta w portalu
