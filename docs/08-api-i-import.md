# Driver — import, API dla ERP i synchronizacja aplikacji kierowcy

## 1. Import zamówień z pliku (`/zlecenia/import`)
- Pliki **.xlsx** i **.csv** (UTF-8 albo Windows-1250, separator wykrywany sam). Plik czyta przeglądarka; na serwer idą tylko przypisane kolumny (do 5 000 wierszy).
- Kolumny przypisujesz raz — przypisanie zapamiętujemy dla firmy (`import_mappings`). Wymagane: numer zamówienia + (kod adresu **albo** kod klienta **albo** adres).
- Dopasowanie do adresu dostawy (`modules/orders/domain/import.ts`):
  1. kod adresu (`delivery_points.external_code`),
  2. kod klienta — gdy klient ma jeden aktywny adres albo zgadza się ulica i miasto,
  3. sam adres (jednoznaczny).
- Niedopasowane trafiają do `/zlecenia/dopasuj` — wybór adresu z podpowiedziami i „zapamiętaj kod” (kolejny import trafi sam).
- Ten sam numer + dzień = aktualizacja (np. gotowość z WMS). Zamówienia już w trasie/zakończone nie są zmieniane.
- Formaty: liczby z przecinkiem i spacjami („1 234,50 zł”), daty `2026-11-06` / `06.11.2026` / numer Excela, okno `6-8` albo od/do, gotowość `tak/skompletowane` ↔ `nie/do realizacji`.

## 2. API zamówień dla ERP/WMS
```
POST /api/v1/orders
Authorization: Bearer drv_…         (klucz z Ustawień, widoczny raz; w bazie tylko SHA-256)
Content-Type: application/json

{ "orders": [ { "external_ref": "WZ/2026/11/0042", "delivery_date": "2026-11-06",
    "customer_code": "K0142", "point_code": "K0142-01",
    "weight_kg": 180, "pallets": 1, "crates": 12, "order_value": 1840.50, "cod_amount": 0,
    "window_start": "06:00", "window_end": "08:00", "readiness": "awaiting_warehouse" } ] }
```
Odpowiedź: `{ import_id, summary: { total, created, updated, unmatched, skipped, errors }, issues: [{ line, ref, problem }] }`.
Pola jak w imporcie z pliku (`ORDER_FIELDS`). Maks. 2 000 zamówień na żądanie. Błędy: 401 (klucz), 400 (JSON), 413 (za dużo).

## 3. Import kartoteki klientów (`/kartoteki/klienci/import`)
Jeden wiersz = jeden adres dostawy. Klient po kodzie (albo nazwie), adres po kodzie (albo ulicy + mieście). Puste pola w pliku nie kasują danych. Typ adresu po nazwie („budowa”, „sklep”, „restauracja” → lokal gastronomiczny). Dni dostaw: `pn-pt`, `pn,śr,pt`, `1-6`, `codziennie`.

## 4. Aplikacja kierowcy offline
| Zdarzenie | Skutek na serwerze |
|---|---|
| `route_started` | trasa w realizacji, licznik start, auto |
| `stop_quick` | status punktu z listy (jeden „teraz realizuję”) |
| `stop_saved` | wynik dostawy, opakowania i gotówka (stan absolutny → do księgi różnica), zwrot, komentarz, zdjęcia/podpis |
| `problem_reported` | zgłoszenie (problem/opóźnienie) do centrum |
| `route_finished` | trasa zakończona, licznik koniec, km |

- Identyfikator `client_event_id` z telefonu → ponowne wysłanie jest ignorowane (`delivery_events` unikalne).
- Zdarzenie niezgodne ze stanem (np. punkt przeniesiony przez dyspozytora) jest odrzucane z powodem i pokazane kierowcy.
- Pozycje GPS co 3 min w paczkach (`driver_positions`, unikalne po kierowcy i czasie). GPS zapisany też w treści zdarzenia (`payload.gps`).
- Zdjęcia/podpis: `POST /api/driver/upload` po przyjęciu zdarzenia, prywatny bucket `delivery-photos`, biuro widzi przez podpisane linki (1 h).

## 5. Znane ograniczenia (po przeglądzie kodu 2026-11-05)
- **Zamknięcie trasy przed synchronizacją telefonu:** gdy dyspozytor zamknie trasę, a w telefonie czekają jeszcze niewysłane zapisy, serwer je odrzuci (kierowca zobaczy komunikat). Przed zamknięciem trasy upewnij się, że kierowca ma w aplikacji „Wszystko wysłane”.
- **Duże importy kartoteki** (tysiące wierszy) zapisują się wiersz po wierszu — przy ~5 000 wierszy może to trwać kilka minut albo przekroczyć limit czasu na Vercelu. Podziel plik na części po ~1 000 wierszy.
- Skutki zdarzenia kierowcy (status, opakowania, gotówka) nie są jedną transakcją z samym zdarzeniem — przerwany zapis dokończy się przy ponownym wysłaniu z telefonu (skutki są idempotentne).
