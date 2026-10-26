# Fresh — system wizualny (v2, 2026-10-26)

Cel: aplikacja wygląda jak jedno narzędzie, a nie zbiór ekranów. Dyspozytor pracuje na dużym monitorze o 5 rano, BOK odbiera telefony, zarząd ogląda raport na laptopie, kierowca trzyma terminal jedną ręką.

## Zasady
1. **Kolor znaczy coś.** Zieleń liścia = w oknie / dostarczono, cytrus = uwaga, pomidor = alarm, niebo = w trasie / teraz, śliwka = reklamacje i zwroty. Nie używamy kolorów dekoracyjnie.
2. **Liczba przed etykietą.** Kafelki (`StatTile`) pokazują wartość dużą, opis mały pod spodem; zmiana r/r jako `Delta` (zielona, gdy dobra — także „w dół” dla kosztów i reklamacji).
3. **Bez WIELKICH LITER** w etykietach i nagłówkach tabel. Zdania zwykłe, krótkie, w języku użytkownika.
4. **Gęsto, ale czytelnie:** tabele z `tabular-nums`, nagłówek tabeli na tle `surface-2`, akcje w wierszu pojawiają się mocniej po najechaniu.
5. **Znaki z branży:** tablica rejestracyjna (`Plate`) zamiast samego tekstu, trasa jako „linia metra” (`RouteStrip`) z kropką na każdy punkt.

## Tokeny (`src/app/globals.css`)
`background` #f3f5f4 · `surface` #fff · `foreground` #14201b · `muted` #5b6963 · `border` #e1e6e3 · `primary` #1f7a4d · `ink` #0f241c (nawigacja) · statusy: `success` `warning` `danger` `info` `plum` + wersje `-soft` na tła.
Czcionka: IBM Plex Sans (zmienna), IBM Plex Mono tylko dla tablic i numerów dokumentów.

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
