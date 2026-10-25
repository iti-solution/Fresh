-- Fresh TMS — schemat początkowy MVP
-- Postgres 15+ (Supabase), PostGIS
-- Zasady: tenant_id w każdej tabeli biznesowej, RLS włączony wszędzie,
-- realizacja i opakowania jako księgi append-only.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- =========================================================
-- TENANCY
-- =========================================================
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  nip           text,
  settings      jsonb not null default '{}'::jsonb, -- np. koszt km, domyślny czas obsługi punktu
  created_at    timestamptz not null default now()
);

create type member_role as enum ('admin', 'dispatcher', 'driver', 'viewer');

create table memberships (
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          member_role not null,
  created_at    timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Funkcje pomocnicze do RLS
create or replace function is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.tenant_id = t and m.user_id = auth.uid());
$$;

create or replace function has_role(t uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.tenant_id = t and m.user_id = auth.uid() and m.role = any(roles));
$$;

-- =========================================================
-- KARTOTEKI
-- =========================================================
create table depots (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  address       text not null,
  location      geography(point, 4326),
  created_at    timestamptz not null default now()
);

create table customers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  external_code text,                      -- kod klienta w ERP
  name          text not null,
  nip           text,
  category      text,                      -- np. restauracja, hotel, sklep
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (tenant_id, external_code)
);

create type geocode_status as enum ('pending', 'ok', 'ambiguous', 'failed', 'manual');

create table delivery_points (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  customer_id         uuid not null references customers(id) on delete cascade,
  external_code       text,               -- kod punktu/adresu w ERP
  name                text not null,
  address_line        text not null,
  postal_code         text,
  city                text,
  location            geography(point, 4326),
  geocode_status      geocode_status not null default 'pending',
  service_minutes     int not null default 10,     -- czas rozładunku
  delivery_weekdays   smallint[] not null default '{1,2,3,4,5,6}', -- ISO: 1=pon … 7=nd
  active_from         date,               -- sezonowość
  active_to           date,
  driver_instructions text,               -- "wejście od zaplecza, kod 1234"
  contact_phone       text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (tenant_id, external_code)
);
create index on delivery_points using gist (location);
create index on delivery_points (tenant_id, customer_id);

-- Okna przyjęć per dzień tygodnia (może być kilka okien dziennie)
create table delivery_point_windows (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  delivery_point_id uuid not null references delivery_points(id) on delete cascade,
  weekday           smallint not null check (weekday between 1 and 7),
  opens_at          time not null,
  closes_at         time not null check (closes_at > opens_at)
);

-- Wyjątki: święta, zamknięcia, zmienione godziny w konkretny dzień
create table delivery_point_exceptions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  delivery_point_id uuid references delivery_points(id) on delete cascade, -- null = dotyczy wszystkich (święto)
  date              date not null,
  is_closed         boolean not null default true,
  opens_at          time,
  closes_at         time,
  reason            text
);

create type vehicle_status as enum ('active', 'service', 'inactive');

create table vehicles (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  registration    text not null,
  name            text,
  body_type       text,                  -- chłodnia, izoterma, plandeka
  capacity_pallets numeric(6,2) not null default 0,
  capacity_kg     numeric(10,2) not null default 0,
  capacity_m3     numeric(8,2) not null default 0,
  is_own          boolean not null default true,
  status          vehicle_status not null default 'active',
  default_driver_id uuid,
  created_at      timestamptz not null default now(),
  unique (tenant_id, registration)
);

create table drivers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  user_id         uuid references auth.users(id),  -- konto do PWA
  first_name      text not null,
  last_name       text not null,
  phone           text,
  employment_type text,                  -- UoP, B2B, zlecenie
  default_vehicle_id uuid references vehicles(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
alter table vehicles add constraint vehicles_default_driver_fk
  foreign key (default_driver_id) references drivers(id);

-- =========================================================
-- ZLECENIA
-- =========================================================
create type order_type as enum ('delivery', 'pickup');
create type order_status as enum ('new', 'unmatched', 'planned', 'in_progress', 'delivered', 'partial', 'failed', 'cancelled');

create table order_imports (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  file_path     text,
  source        text not null default 'file', -- file | api
  column_mapping jsonb,
  rows_total    int, rows_ok int, rows_unmatched int,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create table orders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  import_id         uuid references order_imports(id),
  external_ref      text,                -- nr WZ / zamówienia w ERP
  delivery_point_id uuid references delivery_points(id),  -- null = niedopasowane
  raw_address       text,                -- z importu, do ręcznego dopasowania
  type              order_type not null default 'delivery',
  delivery_date     date not null,
  priority          smallint not null default 0, -- >0 = priorytet
  pallets           numeric(6,2) not null default 0,
  weight_kg         numeric(10,2) not null default 0,
  volume_m3         numeric(8,2) not null default 0,
  cod_amount        numeric(12,2),       -- pobranie (MVP: tylko informacja)
  notes             text,
  status            order_status not null default 'new',
  parent_order_id   uuid references orders(id), -- po podziale zlecenia
  created_at        timestamptz not null default now(),
  unique (tenant_id, external_ref, delivery_date)
);
create index on orders (tenant_id, delivery_date, status);

-- =========================================================
-- PLANOWANIE
-- =========================================================
create table route_templates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,           -- "Bielsko Centrum", "Żywiec poniedziałek"
  weekdays      smallint[] not null default '{1,2,3,4,5}',
  depot_id      uuid references depots(id),
  default_vehicle_id uuid references vehicles(id),
  default_driver_id  uuid references drivers(id),
  planned_start time,
  is_active     boolean not null default true
);

-- Przypisanie punktu dostawy do trasy (szablonu) z domyślną kolejnością
create table route_template_points (
  tenant_id         uuid not null references tenants(id) on delete cascade,
  template_id       uuid not null references route_templates(id) on delete cascade,
  delivery_point_id uuid not null references delivery_points(id) on delete cascade,
  sequence          int not null,
  primary key (template_id, delivery_point_id)
);

create type route_kind as enum ('regular', 'second', 'extra', 'emergency', 'weekend', 'express');
create type route_status as enum ('draft', 'planned', 'dispatched', 'in_progress', 'completed', 'closed', 'cancelled');

create table routes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  route_date      date not null,
  name            text not null,
  kind            route_kind not null default 'regular',
  course_no       smallint not null default 1,  -- 1. / 2. kurs kierowcy
  template_id     uuid references route_templates(id),
  depot_id        uuid references depots(id),
  vehicle_id      uuid references vehicles(id),
  driver_id       uuid references drivers(id),
  planned_start   timestamptz,
  planned_km      numeric(8,2),
  planned_minutes int,
  actual_km       numeric(8,2),            -- licznik z aplikacji (start/koniec)
  geometry        geography(linestring, 4326),
  status          route_status not null default 'draft',
  closed_at       timestamptz,
  closed_by       uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index on routes (tenant_id, route_date);

create type stop_status as enum ('pending', 'arrived', 'delivered', 'partial', 'refused', 'absent', 'skipped');

-- Postój = jeden punkt dostawy na trasie; może obsługiwać kilka zleceń
create table route_stops (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  route_id          uuid not null references routes(id) on delete cascade,
  delivery_point_id uuid not null references delivery_points(id),
  sequence          int not null,
  planned_arrival   timestamptz,
  window_start      timestamptz,             -- okno rozwinięte na konkretną datę
  window_end        timestamptz,
  status            stop_status not null default 'pending',
  arrived_at        timestamptz,
  completed_at      timestamptz,
  unique (route_id, sequence) deferrable initially deferred
);

create table route_stop_orders (
  tenant_id     uuid not null references tenants(id) on delete cascade,
  stop_id       uuid not null references route_stops(id) on delete cascade,
  order_id      uuid not null references orders(id),
  primary key (stop_id, order_id),
  unique (order_id)                          -- zlecenie tylko na jednym postoju
);

-- =========================================================
-- REALIZACJA (append-only)
-- =========================================================
create table delivery_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  client_event_id uuid not null,            -- UUID z telefonu = idempotencja offline
  route_id        uuid not null references routes(id),
  stop_id         uuid references route_stops(id),
  driver_id       uuid references drivers(id),
  type            text not null,            -- route_started, stop_arrived, stop_delivered, stop_partial,
                                            -- stop_refused, stop_absent, problem_reported, cod_collected,
                                            -- packaging_recorded, route_finished, comment
  payload         jsonb not null default '{}'::jsonb,
  location        geography(point, 4326),
  occurred_at     timestamptz not null,     -- czas z telefonu
  received_at     timestamptz not null default now(),
  unique (tenant_id, client_event_id)
);
create index on delivery_events (tenant_id, route_id, occurred_at);

create table attachments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  event_id        uuid references delivery_events(id),
  stop_id         uuid references route_stops(id),
  kind            text not null,            -- photo | signature
  storage_path    text not null,
  created_at      timestamptz not null default now()
);

-- =========================================================
-- OPAKOWANIA (księga ruchów, append-only)
-- =========================================================
create table packaging_types (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  code          text not null,             -- EUR, SKRZ-PL, SKRZ-DREW, KEG30
  name          text not null,
  deposit_value numeric(10,2),             -- wartość kaucji
  is_active     boolean not null default true,
  unique (tenant_id, code)
);

create type party_type as enum ('customer', 'driver', 'carrier', 'depot');

-- Każdy ruch to para zapisów: -qty u jednej strony, +qty u drugiej (podwójny zapis)
create table packaging_movements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  movement_group  uuid not null,            -- łączy oba zapisy jednego ruchu
  packaging_type_id uuid not null references packaging_types(id),
  party_type      party_type not null,
  party_id        uuid not null,
  qty             int not null,             -- + przybyło u strony, - ubyło
  reason          text not null,            -- issue | return | correction | damage | inventory
  source_event_id uuid references delivery_events(id),
  stop_id         uuid references route_stops(id),
  note            text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index on packaging_movements (tenant_id, party_type, party_id, packaging_type_id);

create view packaging_balances with (security_invoker = true) as
  select tenant_id, party_type, party_id, packaging_type_id, sum(qty) as balance
  from packaging_movements
  group by tenant_id, party_type, party_id, packaging_type_id;

-- =========================================================
-- ROZLICZENIA KIEROWCÓW
-- =========================================================
-- Reguły wersjonowane. components np.:
-- [{"type":"daily_rate","amount":250},
--  {"type":"per_km","amount":0.35,"over_km":100},
--  {"type":"per_stop","amount":3},
--  {"type":"per_pallet","amount":2},
--  {"type":"per_extra_course","amount":80}]
create table driver_pay_rules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  driver_id     uuid references drivers(id),   -- null = reguła domyślna tenanta
  valid_from    date not null,
  valid_to      date,
  components    jsonb not null,
  created_at    timestamptz not null default now()
);

create type settlement_status as enum ('draft', 'approved', 'exported');

create table driver_settlements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  driver_id     uuid not null references drivers(id),
  period_start  date not null,
  period_end    date not null,
  total_amount  numeric(12,2) not null default 0,
  status        settlement_status not null default 'draft',
  approved_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create table driver_settlement_lines (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  settlement_id uuid not null references driver_settlements(id) on delete cascade,
  route_id      uuid references routes(id),
  work_date     date not null,
  component     text not null,              -- daily_rate, per_km, per_stop, manual_bonus…
  quantity      numeric(10,2) not null,
  rate          numeric(10,2) not null,
  amount        numeric(12,2) not null,
  rule_id       uuid references driver_pay_rules(id),
  note          text
);

-- =========================================================
-- GROWTH: AUDYT TRAS
-- =========================================================
create table route_audits (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id),  -- null = audyt prospekta (przed założeniem konta)
  company_name    text,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  source_file     text,
  stops_count     int,
  vehicles_count  int,
  baseline_km     numeric(10,2),
  optimized_km    numeric(10,2),
  baseline_minutes int,
  optimized_minutes int,
  window_conflicts int,
  est_monthly_saving_pln numeric(12,2),
  result          jsonb,                    -- trasy przed/po do mapy
  status          text not null default 'processing', -- processing | done | failed
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- =========================================================
-- AUDYT ZMIAN
-- =========================================================
create table audit_log (
  id          bigserial primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid,
  entity      text not null,
  entity_id   uuid,
  action      text not null,
  diff        jsonb,
  created_at  timestamptz not null default now()
);

-- =========================================================
-- RLS
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array[
    'depots','customers','delivery_points','delivery_point_windows','delivery_point_exceptions',
    'vehicles','drivers','order_imports','orders','route_templates','route_template_points',
    'routes','route_stops','route_stop_orders','delivery_events','attachments',
    'packaging_types','packaging_movements','driver_pay_rules','driver_settlements',
    'driver_settlement_lines','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    -- odczyt: każdy członek tenanta (kierowca zawężony niżej dla tras)
    execute format($p$create policy %I on %I for select using (has_role(tenant_id, array['admin','dispatcher','viewer']::member_role[]))$p$, t||'_read_staff', t);
    -- zapis: admin i dyspozytor
    execute format($p$create policy %I on %I for all using (has_role(tenant_id, array['admin','dispatcher']::member_role[])) with check (has_role(tenant_id, array['admin','dispatcher']::member_role[]))$p$, t||'_write_staff', t);
  end loop;
end $$;

alter table tenants enable row level security;
create policy tenants_read on tenants for select using (is_member(id));

alter table memberships enable row level security;
create policy memberships_read_own on memberships for select using (user_id = auth.uid() or has_role(tenant_id, array['admin']::member_role[]));

alter table route_audits enable row level security;
create policy route_audits_staff on route_audits for all
  using (tenant_id is not null and has_role(tenant_id, array['admin','dispatcher']::member_role[]));
-- audyty prospektów (tenant_id null) obsługuje wyłącznie serwer (service_role)

-- Kierowca: widzi tylko swoje trasy z dziś i wczoraj oraz ich postoje i punkty
create or replace function current_driver_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select d.id from drivers d where d.user_id = auth.uid();
$$;

create policy routes_driver_read on routes for select using (
  driver_id in (select current_driver_ids())
  and route_date between current_date - 1 and current_date + 1
  and status in ('dispatched','in_progress','completed')
);
create policy stops_driver_read on route_stops for select using (
  route_id in (select r.id from routes r where r.driver_id in (select current_driver_ids()))
);
create policy points_driver_read on delivery_points for select using (
  id in (select s.delivery_point_id from route_stops s join routes r on r.id = s.route_id
         where r.driver_id in (select current_driver_ids()) and r.route_date between current_date - 1 and current_date + 1)
);
create policy packaging_types_driver_read on packaging_types for select using (has_role(tenant_id, array['driver']::member_role[]));
-- Zapis zdarzeń przez kierowcę idzie WYŁĄCZNIE przez endpoint /api/driver/sync (service_role),
-- który waliduje, że trasa należy do kierowcy. Brak bezpośrednich polityk INSERT dla kierowcy.
