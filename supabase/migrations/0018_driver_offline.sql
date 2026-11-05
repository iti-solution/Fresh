-- Driver — M4 część 2: aplikacja kierowcy offline.
-- Zdjęcia i podpisy w prywatnym buckecie (zapis wyłącznie przez serwer po sprawdzeniu, że trasa należy do kierowcy;
-- biuro ogląda przez podpisane linki). Ponowne wysłanie tego samego pliku z telefonu nie tworzy duplikatu.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-photos', 'delivery-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

alter table attachments
  add column if not exists route_id       uuid references routes(id),
  add column if not exists client_file_id uuid,            -- UUID pliku z telefonu = idempotencja
  add column if not exists content_type   text,
  add column if not exists size_bytes     int;
create unique index if not exists attachments_client_file_uq on attachments (tenant_id, client_file_id);
create index if not exists attachments_stop_idx on attachments (tenant_id, stop_id);

create index if not exists delivery_events_route_idx on delivery_events (tenant_id, route_id, occurred_at);

-- Pozycje GPS z telefonu: ta sama pozycja wysłana drugi raz (po zerwanym połączeniu) jest pomijana
create unique index if not exists driver_positions_dedupe_uq on driver_positions (driver_id, recorded_at);

-- Kierowca widzi zdjęcia/podpisy ze swoich tras (lista na ekranie punktu)
drop policy if exists attachments_driver_read on attachments;
create policy attachments_driver_read on attachments for select using (route_id in (select driver_route_ids()));
