-- Fresh — model danych po warsztatach z pilotem (docs/02-zakres-mvp.md §2a, D1–D19)

-- =========================================================
-- KONTRAHENCI I ODDZIAŁY (D5–D8)
-- =========================================================
alter table customers
  add column if not exists sales_rep_name  text,   -- opiekun handlowy
  add column if not exists sales_rep_phone text;

create type branch_type as enum ('restaurant', 'kitchen', 'bar', 'warehouse', 'hotel', 'other');

alter table delivery_points
  add column if not exists branch_type         branch_type not null default 'other',
  add column if not exists location_locked     boolean not null default false, -- ręcznie poprawiona pinezka: import jej nie nadpisuje
  add column if not exists call_instructions   text,   -- gdzie / do kogo dzwonić
  add column if not exists access_instructions text,   -- jak wjechać, kod bramy
  add column if not exists floor               text,   -- piętro / poziom
  add column if not exists unloading_zone      text;   -- strefa rozładunku

-- Uwagi tymczasowe z datą ważności (remont, zamknięta droga, zmiana godzin)
create table delivery_point_notes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  delivery_point_id uuid not null references delivery_points(id) on delete cascade,
  text              text not null,
  valid_from        date not null default current_date,
  valid_to          date,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index on delivery_point_notes (tenant_id, delivery_point_id, valid_from);

-- =========================================================
-- ZAMÓWIENIA (D1, D12)
-- =========================================================
create type order_readiness as enum ('awaiting_warehouse', 'ready'); -- UI: „Do realizacji” / „Skompletowane”

alter table orders
  add column if not exists order_value     numeric(12,2),   -- wartość zamówienia (raport zarządu, wynagrodzenie dowózkowych)
  add column if not exists crates          int not null default 0,
  add column if not exists notes_sales     text,            -- uwagi handlowe
  add column if not exists notes_logistics text,            -- uwagi logistyczne
  add column if not exists window_start    time,            -- okno na zamówieniu (nadpisuje okno oddziału)
  add column if not exists window_end      time,
  -- domyślnie 'ready': gdy źródło nie podaje statusu z WMS, zamówienie nie blokuje planowania
  add column if not exists readiness       order_readiness not null default 'ready';
alter table orders add constraint orders_window_chk
  check ((window_start is null and window_end is null) or (window_start is not null and window_end is not null and window_end > window_start));

-- =========================================================
-- FLOTA I PRZEWOŹNICY (D13)
-- =========================================================
create table carriers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  nip         text,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table vehicles
  add column if not exists carrier_id          uuid references carriers(id),
  add column if not exists vehicle_type        text,
  add column if not exists capacity_crates     int not null default 0,
  add column if not exists cost_per_km         numeric(10,2),
  add column if not exists driver_cost_per_day numeric(10,2),
  add column if not exists fixed_cost_per_day  numeric(10,2);

alter table routes
  add column if not exists carrier_id     uuid references carriers(id),
  add column if not exists odometer_start int,
  add column if not exists odometer_end   int,
  add column if not exists extra_reason   text;   -- przyczyna dowózki / kursu dodatkowego
alter table routes add constraint routes_odometer_chk
  check (odometer_end is null or odometer_start is null or odometer_end >= odometer_start);

-- =========================================================
-- KIEROWCY: PIN i POZYCJE GPS (D3, D9)
-- =========================================================
alter table drivers add column if not exists pin_hash text; -- hash PIN-u (bcrypt), nigdy jawny PIN

create table driver_positions (
  id           bigserial primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  driver_id    uuid not null references drivers(id),
  route_id     uuid references routes(id),
  location     geography(point, 4326) not null,
  accuracy_m   numeric(8,1),
  recorded_at  timestamptz not null,       -- czas z urządzenia
  received_at  timestamptz not null default now()
);
create index on driver_positions (tenant_id, route_id, recorded_at desc);

-- =========================================================
-- GOTÓWKA (D2) — księga append-only, podwójny zapis jak opakowania
-- =========================================================
create type cash_party as enum ('customer', 'driver', 'office');

create table cash_movements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  movement_group  uuid not null,              -- łączy oba zapisy jednego ruchu
  party_type      cash_party not null,
  party_id        uuid,                       -- null dla 'office'
  amount          numeric(12,2) not null,     -- + przybyło u strony, − ubyło
  reason          text not null,              -- cod_collected | handover | correction
  route_id        uuid references routes(id),
  stop_id         uuid references route_stops(id),
  order_id        uuid references orders(id),
  source_event_id uuid references delivery_events(id),
  note            text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index on cash_movements (tenant_id, party_type, party_id);

create view cash_balances with (security_invoker = true) as
  select tenant_id, party_type, party_id, sum(amount) as balance
  from cash_movements
  group by tenant_id, party_type, party_id;

-- =========================================================
-- RLS
-- =========================================================
do $$
declare t text;
begin
  -- nowe tabele: ten sam wzór co w 0001
  foreach t in array array['delivery_point_notes', 'carriers', 'driver_positions', 'cash_movements'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select using (has_role(tenant_id, array['admin','dispatcher','viewer']::member_role[]))$p$, t||'_read_staff', t);
    execute format($p$create policy %I on %I for all using (has_role(tenant_id, array['admin','dispatcher']::member_role[])) with check (has_role(tenant_id, array['admin','dispatcher']::member_role[]))$p$, t||'_write_staff', t);
  end loop;

  -- BOK i zarząd: odczyt wszystkich tabel firmy (bez zapisu)
  foreach t in array array[
    'depots','customers','delivery_points','delivery_point_windows','delivery_point_exceptions',
    'vehicles','drivers','order_imports','orders','route_templates','route_template_points',
    'routes','route_stops','route_stop_orders','delivery_events','attachments',
    'packaging_types','packaging_movements','driver_pay_rules','driver_settlements',
    'driver_settlement_lines','audit_log',
    'delivery_point_notes','carriers','driver_positions','cash_movements'
  ] loop
    execute format($p$create policy %I on %I for select using (has_role(tenant_id, array['customer_service','management']::member_role[]))$p$, t||'_read_office', t);
  end loop;
end $$;

-- Kierowca widzi aktualne uwagi tymczasowe punktów ze swoich tras
create policy point_notes_driver_read on delivery_point_notes for select using (
  delivery_point_id in (
    select s.delivery_point_id from route_stops s join routes r on r.id = s.route_id
    where r.driver_id in (select current_driver_ids()) and r.route_date between current_date - 1 and current_date + 1)
  and valid_from <= current_date + 1
  and (valid_to is null or valid_to >= current_date - 1)
);
-- Pozycje i gotówkę kierowca zapisuje wyłącznie przez serwerowy endpoint sync (service_role).
