-- Fresh — nowe wartości słowników po warsztatach z pilotem (2026-10-25)
-- Osobny plik, bo Postgres nie pozwala użyć nowej wartości enuma w tej samej transakcji,
-- w której została dodana (polityki RLS w 0004 z nich korzystają).

alter type member_role add value if not exists 'customer_service'; -- BOK
alter type member_role add value if not exists 'management';       -- zarząd (tylko odczyt)

alter type route_kind add value if not exists 'dowozka';           -- dowózka / drugi kurs z przyczyną

alter type stop_status add value if not exists 'in_progress';      -- „Teraz realizuję”
alter type stop_status add value if not exists 'complaint';        -- reklamacja na punkcie
