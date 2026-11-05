-- Driver (dawniej Fresh) — M1 dokończenie (decyzje 2026-11-05):
-- 1) Uniwersalne, edytowalne typy adresów dostawy (nie tylko gastronomia): siedziba, sklep, lokal gastronomiczny,
--    magazyn, zakład, budowa (adres tymczasowy: czynna od–do = active_from/active_to + kierownik budowy), adres prywatny, inny.
--    Stara kolumna delivery_points.branch_type zostaje (zgodność wstecz), ale UI używa point_type_id.
-- 2) Zapamiętane mapowania kolumn importu (zamówienia, kartoteka klientów) per firma.
-- 3) Klucze API firmy do POST /api/v1/orders (w bazie tylko skrót SHA-256, nigdy jawny klucz).
-- 4) Dane z importu potrzebne do ręcznego dopasowania niedopasowanych zamówień.
-- Wszystko addytywne — wdrożona wersja aplikacji działa dalej.

-- =========================================================
-- 1. TYPY ADRESÓW DOSTAWY
-- =========================================================
create table if not exists point_types (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  code          text not null,                    -- stały kod (domyślne typy) albo nadany z nazwy
  name          text not null,                    -- etykieta w UI, np. „Budowa”
  is_temporary  boolean not null default false,   -- adres tymczasowy: pokaż „czynny od–do” i osobę na miejscu
  sort          int not null default 100,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, name)
);

alter table point_types enable row level security;
create policy point_types_read_staff on point_types for select
  using (has_role(tenant_id, array['admin','dispatcher','viewer','customer_service','management','driver']::member_role[]));
create policy point_types_write_staff on point_types for all
  using (has_role(tenant_id, array['admin','dispatcher']::member_role[]))
  with check (has_role(tenant_id, array['admin','dispatcher']::member_role[]));

create or replace function seed_point_types(p_tenant uuid) returns void
language sql security definer set search_path = public as $$
  insert into point_types (tenant_id, code, name, is_temporary, sort) values
    (p_tenant, 'hq',           'Siedziba / biuro',          false, 10),
    (p_tenant, 'shop',         'Sklep / punkt sprzedaży',   false, 20),
    (p_tenant, 'food_service', 'Lokal gastronomiczny',      false, 30),
    (p_tenant, 'warehouse',    'Magazyn',                   false, 40),
    (p_tenant, 'plant',        'Zakład / produkcja',        false, 50),
    (p_tenant, 'construction', 'Budowa',                    true,  60),
    (p_tenant, 'private',      'Adres prywatny',            false, 70),
    (p_tenant, 'other',        'Inny',                      false, 90)
  on conflict (tenant_id, code) do nothing;
$$;
revoke all on function seed_point_types(uuid) from public, anon, authenticated;

-- Każda nowa firma dostaje domyślne typy
create or replace function tenants_seed_point_types() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform seed_point_types(new.id);
  return new;
end $$;
drop trigger if exists tenants_seed_point_types on tenants;
create trigger tenants_seed_point_types after insert on tenants
  for each row execute function tenants_seed_point_types();

-- Istniejące firmy
select seed_point_types(id) from tenants;

alter table delivery_points
  add column if not exists point_type_id       uuid references point_types(id),
  add column if not exists site_manager_name   text,   -- osoba na miejscu (kierownik budowy, magazynier)
  add column if not exists site_manager_phone  text;
create index if not exists delivery_points_type_idx on delivery_points (tenant_id, point_type_id);

-- Mapowanie starego typu oddziału na nowy typ adresu
create or replace function point_type_for_branch(p_tenant uuid, p_branch text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from point_types
  where tenant_id = p_tenant
    and code = case p_branch
      when 'restaurant' then 'food_service' when 'kitchen' then 'food_service'
      when 'bar' then 'food_service' when 'hotel' then 'food_service'
      when 'warehouse' then 'warehouse' else 'other' end;
$$;

update delivery_points set point_type_id = point_type_for_branch(tenant_id, branch_type::text) where point_type_id is null;

-- Zapisy bez typu (np. starsze funkcje demo, wdrożona wersja aplikacji) dostają typ ze starej kolumny
create or replace function delivery_points_default_type() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.point_type_id is null then
    new.point_type_id := point_type_for_branch(new.tenant_id, coalesce(new.branch_type::text, 'other'));
  end if;
  return new;
end $$;
drop trigger if exists delivery_points_default_type on delivery_points;
create trigger delivery_points_default_type before insert or update on delivery_points
  for each row execute function delivery_points_default_type();

-- Typ musi należeć do tej samej firmy co adres
create or replace function delivery_points_type_tenant_chk() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.point_type_id is not null and not exists (
    select 1 from point_types t where t.id = new.point_type_id and t.tenant_id = new.tenant_id) then
    raise exception 'Typ adresu nie należy do tej firmy';
  end if;
  return new;
end $$;
drop trigger if exists delivery_points_type_tenant_chk on delivery_points;
create trigger delivery_points_type_tenant_chk before insert or update of point_type_id on delivery_points
  for each row execute function delivery_points_type_tenant_chk();

-- =========================================================
-- 2. MAPOWANIA KOLUMN IMPORTU
-- =========================================================
create table if not exists import_mappings (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        text not null check (kind in ('orders', 'customers')),
  mapping     jsonb not null,               -- { "pole_systemu": "Nagłówek kolumny w pliku" }
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, kind)
);
alter table import_mappings enable row level security;
create policy import_mappings_read_staff on import_mappings for select
  using (has_role(tenant_id, array['admin','dispatcher','viewer']::member_role[]));
create policy import_mappings_write_staff on import_mappings for all
  using (has_role(tenant_id, array['admin','dispatcher']::member_role[]))
  with check (has_role(tenant_id, array['admin','dispatcher']::member_role[]));

alter table order_imports
  add column if not exists kind          text not null default 'orders',  -- orders | customers
  add column if not exists file_name     text,
  add column if not exists rows_updated  int,
  add column if not exists rows_skipped  int,
  add column if not exists report        jsonb;                           -- wiersze z błędami / niedopasowane

-- Dane z pliku/API, po których dyspozytor ręcznie dopasuje zamówienie do adresu
alter table orders
  add column if not exists raw_customer_code text,
  add column if not exists raw_point_code    text,
  add column if not exists raw_customer_name text;   -- orders.source (0012): panel | file | api | portal | ai

-- =========================================================
-- 3. KLUCZE API FIRMY
-- =========================================================
create table if not exists tenant_api_keys (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,                 -- „WF-Mag — eksport nocny”
  key_prefix    text not null,                 -- pierwsze znaki do rozpoznania na liście, np. drv_live_a1b2
  key_hash      text not null unique,          -- SHA-256 (hex) całego klucza
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
alter table tenant_api_keys enable row level security;
create policy tenant_api_keys_admin on tenant_api_keys for all
  using (has_role(tenant_id, array['admin']::member_role[]))
  with check (has_role(tenant_id, array['admin']::member_role[]));

-- =========================================================
-- 4. ZAMKNIĘCIA: unikalność dnia (święto firmy / zamknięcie adresu)
-- =========================================================
create unique index if not exists delivery_point_exceptions_day_uq
  on delivery_point_exceptions (tenant_id, coalesce(delivery_point_id, '00000000-0000-0000-0000-000000000000'::uuid), date);
