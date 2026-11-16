# Driver — system wizualny (v5, 2026-11-16 — granat + pomarańcz)

> Nazwa produktu jest robocza i ustawiona w jednym miejscu: `src/lib/brand.ts`. v5 zastępuje butelkową zieleń (v4) paletą granatu i pomarańczu — decyzja właściciela produktu.

Cel: aplikacja wygląda jak jedno narzędzie, a nie zbiór ekranów. Dyspozytor pracuje na dużym monitorze o 5 rano, BOK odbiera telefony, zarząd ogląda raport na laptopie, kierowca trzyma terminal jedną ręką.

## Zasady
1. **Marka: granat + pomarańcz.** Granat (#14275a, `ink`) to boczne menu i struktura, kobalt (#1f55b5, `primary-strong`) to linki, aktywne zakładki i tekst akcentowy, pomarańcz (#f28c1e, `primary`) to główne przyciski i znacznik aktywnej pozycji. Pomarańcz **nie** oznacza statusu. Na pomarańczu zawsze ciemny tekst (`primary-foreground` #2a1500). Górny pasek jest jasny — ciemne zostaje tylko menu boczne, żeby ekran nie był ciężki.
1a. **Statusy są znaczeniowe:** zieleń = w oknie / dostarczono / zapisano, bursztyn = uwaga, czerwień = alarm, turkus = w trasie / teraz, śliwka = reklamacje i zwroty. Wypełnienia „zwykłe” (ładowność) w stalowym błękicie (`steel`).
2. **Liczba przed etykietą.** Kafelki (`StatTile`) pokazują wartość dużą, opis mały pod spodem; zmiana r/r jako `Delta` (zielona, gdy dobra — także „w dół” dla kosztów i reklamacji).
3. **Wersaliki tylko w logotypie i nazwach grup menu.** Etykiety, przyciski i nagłówki tabel zwykłymi literami.
4. **Gęsto, ale czytelnie:** tabele z `tabular-nums`, nagłówek tabeli na tle `surface-2`, akcje w wierszu pojawiają się mocniej po najechaniu.
5. **Znaki z branży:** tablica rejestracyjna (`Plate`) zamiast samego tekstu, trasa jako „linia metra” (`RouteStrip`) z kropką na każdy punkt.

## Tokeny (`src/app/globals.css`)
`background` #f1f4fa · `surface` #fff · `foreground` #13203a · `muted` #55627a · `border` #dfe5ef · `primary` #f28c1e (przyciski) / `primary-hover` #dd7b10 / `primary-strong` #1f55b5 (tekst i linki) · `accent` #e8f0fc / `accent-hover` #d3e2f8 · `ink` #14275a (menu) · `steel` #2f5fa8 · statusy: `success` `warning` `danger` `info` `plum` + wersje `-soft`.
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
