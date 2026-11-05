# Driver — system wizualny (v4, 2026-11-05 — butelkowa zieleń + limonka)

> Nazwa produktu jest robocza i ustawiona w jednym miejscu: `src/lib/brand.ts`. v4 celowo odchodzi od barw ExpertWMS (granat + pomarańcz), żeby produkt nie wyglądał jak jego część.

Cel: aplikacja wygląda jak jedno narzędzie, a nie zbiór ekranów. Dyspozytor pracuje na dużym monitorze o 5 rano, BOK odbiera telefony, zarząd ogląda raport na laptopie, kierowca trzyma terminal jedną ręką.

## Zasady
1. **Marka: butelkowa zieleń + limonka.** Butelkowa zieleń (#12332b) to nawigacja i struktura, limonka (#6bbf2a) to akcje (przyciski, aktywna zakładka, aktywna pozycja menu) i wykresy sprzedaży. Limonka **nie** oznacza statusu. Na limonce zawsze ciemny tekst (`primary-foreground` #0d2a20) — biały ma za słaby kontrast. Tekst i linki na jasnym tle w `primary-strong` (#3b7a12).
1a. **Statusy są znaczeniowe:** zieleń = w oknie / dostarczono / zapisano, bursztyn = uwaga, czerwień = alarm, błękit = w trasie / teraz, śliwka = reklamacje i zwroty. Wypełnienia „zwykłe” (ładowność) w stalowej zieleni (`steel`).
2. **Liczba przed etykietą.** Kafelki (`StatTile`) pokazują wartość dużą, opis mały pod spodem; zmiana r/r jako `Delta` (zielona, gdy dobra — także „w dół” dla kosztów i reklamacji).
3. **Wersaliki tylko w logotypie i nazwach grup menu.** Etykiety, przyciski i nagłówki tabel zwykłymi literami.
4. **Gęsto, ale czytelnie:** tabele z `tabular-nums`, nagłówek tabeli na tle `surface-2`, akcje w wierszu pojawiają się mocniej po najechaniu.
5. **Znaki z branży:** tablica rejestracyjna (`Plate`) zamiast samego tekstu, trasa jako „linia metra” (`RouteStrip`) z kropką na każdy punkt.

## Tokeny (`src/app/globals.css`)
`background` #f3f6f2 · `surface` #fff · `foreground` #13241f · `muted` #546660 · `border` #dfe7e2 · `primary` #6bbf2a (wypełnienia) / `primary-hover` #5daa22 / `primary-strong` #3b7a12 (tekst i linki — kontrast) · `accent` #eef7e3 / `accent-hover` #dcefc6 · `ink` #12332b (nawigacja) · `steel` #2f6b5a (paski ładowności, okna godzinowe na `steel-soft`) · statusy: `success` `warning` `danger` `info` `plum` + wersje `-soft`.
Czcionka: IBM Plex Sans (cyfry tabelaryczne), IBM Plex Mono tylko dla tablic i numerów dokumentów.

## Menu
Zwarte (32 px na pozycję), grupy: Operacje, Zestawienia (stale rozwinięte), Kartoteki i Rozliczenia (zwijane, rozwinięte gdy jesteś w środku). Ustawienia w stopce, wybór firmy w górnym pasku. Menu mieści się bez przewijania na laptopie 1366×768.

## Komponenty
| Komponent | Plik | Do czego |
|---|---|---|
| `PageHeader` | `components/panel/page.tsx` | tytuł, jedno zdanie opisu, akcje po prawej |
| `Panel` | jw. | sekcja z nagłówkiem; `flush` dla tabel i list |
| `StatTile`, `Delta` | jw. | KPI z porównaniem |
| `Meter` | jw. | ładowność, postęp (kolor rośnie z ryzykiem) |
| `Segmented` | jw. | filtry w adresie URL |
| `EmptyState`, `Notice` | jw. | pusty stan z następnym krokiem, komunikat |
| `Pill`, `Dot`, `Plate`, `DocRef` | `components/ui/status.tsx` | statusy, tablica, nr dokumentu |
| `BarChart`, `LineChart` | `components/panel/charts.tsx` | wykresy SVG renderowane na serwerze (jedna seria, podpowiedź po najechaniu) |
| `RouteStrip`, `StopStatusPill` | `modules/ops/ui/route-strip.tsx` | linia trasy, status punktu z terminowością |
| `AutoRefresh` | `components/panel/auto-refresh.tsx` | odświeżanie ekranu „na żywo” |

## Zestawienia
- `/centrum` — dyspozytor (strona robocza dnia), `/bok` — obsługa klienta (start roli BOK), `/raport` — zarząd (start roli Zarząd).
- Logika liczb w `modules/ops/domain/reports.ts` (czyste funkcje, testy), dane z `modules/ops/server/queries.ts`.
