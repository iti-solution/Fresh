-- Fresh TMS — portal zamówień klienta (restauracja zamawia sama, hurtownia obsługuje w panelu).
-- Klient loguje się e-mailem i hasłem nadanym przez hurtownię (rola 'customer').
-- Klient NIE pisze bezpośrednio do tabel: zamówienie składa i anuluje wyłącznie przez funkcje
-- portal_place_order / portal_cancel_order, które sprawdzają dostęp, termin i katalog.

-- =========================================================
-- KATALOG PRODUKTÓW (to, co klient może zamówić)
-- =========================================================
create table products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  code            text,                       -- indeks z ERP (WF-Mag)
  name            text not null,
  category        text,                       -- warzywa, owoce, zioła…
  unit            text not null default 'kg' check (unit in ('kg', 'szt', 'skrz', 'opak', 'pecz')),
  unit_weight_kg  numeric(8,3) not null default 0 check (unit_weight_kg >= 0), -- waga 1 jednostki (do ładowności)
  price           numeric(10,2) check (price is null or price >= 0),            -- cena netto, informacyjnie
  is_active       boolean not null default true,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  unique (tenant_id, code)
);
create index on products (tenant_id, is_active, category);

-- =========================================================
-- ZAMÓWIENIA: źródło i pozycje
-- =========================================================
alter table orders
  add column if not exists source        text not null default 'panel' check (source in ('panel', 'import', 'api', 'portal')),
  add column if not exists placed_by     uuid references auth.users(id),
  add column if not exists placed_at     timestamptz,
  add column if not exists customer_note text;   -- uwaga klienta z portalu

create table order_lines (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  line_no         int not null,
  product_id      uuid references products(id),
  product_code    text,                       -- kopia z chwili zamówienia (katalog może się zmienić)
  product_name    text not null,
  unit            text not null,
  qty             numeric(10,3) not null check (qty > 0),
  unit_weight_kg  numeric(8,3) not null default 0,
  unit_price      numeric(10,2),
  created_at      timestamptz not null default now(),
  unique (order_id, line_no)
);
create index on order_lines (tenant_id, order_id);

-- =========================================================
-- DOSTĘP KLIENTA DO PORTALU
-- =========================================================
create table customer_portal_users (
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  login_email   text not null,
  is_active     boolean not null default true,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index on customer_portal_users (tenant_id, customer_id);
create index on customer_portal_users (user_id);

-- Klienci, w imieniu których zalogowany użytkownik może zamawiać
create or replace function portal_customer_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select cpu.customer_id
  from customer_portal_users cpu
  join memberships m on m.tenant_id = cpu.tenant_id and m.user_id = cpu.user_id and m.role = 'customer'
  where cpu.user_id = auth.uid() and cpu.is_active;
$$;

-- Wszystkie oddziały tych klientów (także nieaktywne — żeby widzieć historię zamówień)
create or replace function portal_point_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from delivery_points p where p.customer_id in (select portal_customer_ids());
$$;

-- =========================================================
-- TERMINY: godzina graniczna i dni dostaw
-- tenants.settings: portal_cutoff ('20:00'), portal_lead_days (1), portal_horizon_days (14)
-- Ta sama logika w TS: src/modules/portal/domain/portal.ts (testy jednostkowe)
-- =========================================================
create or replace function portal_earliest_date(p_tenant uuid) returns date
language plpgsql stable security definer set search_path = public as $$
declare
  v_settings jsonb;
  v_now timestamp := now() at time zone 'Europe/Warsaw';
  v_cutoff time;
  v_lead int;
  v_date date;
begin
  select settings into v_settings from tenants where id = p_tenant;
  v_cutoff := coalesce(nullif(v_settings->>'portal_cutoff', ''), '20:00')::time;
  v_lead := coalesce((v_settings->>'portal_lead_days')::int, 1);
  v_date := v_now::date + v_lead;
  if v_now::time >= v_cutoff then v_date := v_date + 1; end if;
  return v_date;
end $$;

create or replace function portal_date_allowed(p_point uuid, p_date date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  p record;
  v_horizon int;
begin
  select dp.*, t.settings as tenant_settings into p
  from delivery_points dp join tenants t on t.id = dp.tenant_id where dp.id = p_point;
  if p.id is null then return false; end if;
  v_horizon := coalesce((p.tenant_settings->>'portal_horizon_days')::int, 14);
  if p_date < portal_earliest_date(p.tenant_id) then return false; end if;
  if p_date > (now() at time zone 'Europe/Warsaw')::date + v_horizon then return false; end if;
  if not (extract(isodow from p_date)::smallint = any (p.delivery_weekdays)) then return false; end if;
  if p.active_from is not null and p_date < p.active_from then return false; end if;
  if p.active_to is not null and p_date > p.active_to then return false; end if;
  if exists (
    select 1 from delivery_point_exceptions e
    where e.date = p_date and e.is_closed and e.tenant_id = p.tenant_id
      and (e.delivery_point_id = p.id or e.delivery_point_id is null)
  ) then return false; end if;
  return true;
end $$;

-- Czy zalogowany użytkownik może zamawiać dla tego klienta tej firmy
create or replace function portal_has_access(p_tenant uuid, p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from customer_portal_users cpu
    join memberships m on m.tenant_id = cpu.tenant_id and m.user_id = cpu.user_id and m.role = 'customer'
    where cpu.user_id = auth.uid() and cpu.tenant_id = p_tenant and cpu.customer_id = p_customer and cpu.is_active
  );
$$;

-- =========================================================
-- ZŁOŻENIE ZAMÓWIENIA
-- p_lines: [{"product_id": "<uuid>", "qty": 12.5}, …]
-- Błędy (komunikat = kod, tłumaczony w aplikacji): PORTAL_NO_ACCESS, PORTAL_POINT_INACTIVE,
-- PORTAL_DATE_NOT_ALLOWED, PORTAL_EMPTY, PORTAL_BAD_PRODUCT, PORTAL_BAD_QTY
-- =========================================================
create or replace function portal_place_order(p_point uuid, p_date date, p_lines jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_point record;
  v_order uuid;
  v_line record;
  v_product record;
  v_qty numeric;
  v_now timestamp := now() at time zone 'Europe/Warsaw';
begin
  select dp.id, dp.tenant_id, dp.customer_id, dp.is_active, c.is_active as customer_active into v_point
  from delivery_points dp join customers c on c.id = dp.customer_id where dp.id = p_point;
  if v_point.id is null or not portal_has_access(v_point.tenant_id, v_point.customer_id) then
    raise exception 'PORTAL_NO_ACCESS';
  end if;
  if not v_point.is_active or not v_point.customer_active then raise exception 'PORTAL_POINT_INACTIVE'; end if;
  if not portal_date_allowed(p_point, p_date) then raise exception 'PORTAL_DATE_NOT_ALLOWED'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 150 then
    raise exception 'PORTAL_EMPTY';
  end if;

  insert into orders (tenant_id, delivery_point_id, type, delivery_date, status, readiness, source,
                      placed_by, placed_at, customer_note, external_ref)
  values (v_point.tenant_id, v_point.id, 'delivery', p_date, 'new', 'awaiting_warehouse', 'portal',
          auth.uid(), now(), nullif(left(trim(coalesce(p_note, '')), 500), ''),
          'WWW-' || to_char(v_now, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)))
  returning id into v_order;

  for v_line in select e.value as item, e.ordinality as n from jsonb_array_elements(p_lines) with ordinality e loop
    begin
      select * into v_product from products
      where id = (v_line.item->>'product_id')::uuid and tenant_id = v_point.tenant_id and is_active;
    exception when invalid_text_representation then
      raise exception 'PORTAL_BAD_PRODUCT';
    end;
    if v_product.id is null then raise exception 'PORTAL_BAD_PRODUCT'; end if;
    begin
      v_qty := (v_line.item->>'qty')::numeric;
    exception when others then
      raise exception 'PORTAL_BAD_QTY';
    end;
    if v_qty is null or v_qty <= 0 or v_qty > 10000 or (v_product.unit <> 'kg' and v_qty <> trunc(v_qty)) then
      raise exception 'PORTAL_BAD_QTY';
    end if;
    insert into order_lines (tenant_id, order_id, line_no, product_id, product_code, product_name, unit, qty, unit_weight_kg, unit_price)
    values (v_point.tenant_id, v_order, v_line.n, v_product.id, v_product.code, v_product.name, v_product.unit,
            round(v_qty, 3), v_product.unit_weight_kg, v_product.price);
  end loop;

  -- ładowność i wartość liczone z pozycji (do planowania tras i raportów)
  update orders o set
    weight_kg   = coalesce(s.kg, 0),
    crates      = coalesce(s.crates, 0),
    order_value = s.value
  from (
    select round(sum(qty * unit_weight_kg), 2) as kg,
           sum(case when unit = 'skrz' then qty else 0 end)::int as crates,
           case when count(unit_price) > 0 then round(sum(qty * coalesce(unit_price, 0)), 2) end as value
    from order_lines where order_id = v_order
  ) s
  where o.id = v_order;

  return v_order;
end $$;

-- Anulowanie przez klienta: tylko nowe, niezaplanowane, i przed godziną graniczną dla tej dostawy
create or replace function portal_cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select ord.id, ord.tenant_id, ord.status, ord.delivery_date, dp.customer_id into o
  from orders ord join delivery_points dp on dp.id = ord.delivery_point_id where ord.id = p_order for update of ord;
  if o.id is null or not portal_has_access(o.tenant_id, o.customer_id) then raise exception 'PORTAL_NO_ACCESS'; end if;
  if o.status <> 'new'
     or exists (select 1 from route_stop_orders so where so.order_id = o.id)
     or o.delivery_date < portal_earliest_date(o.tenant_id) then
    raise exception 'PORTAL_CANNOT_CANCEL';
  end if;
  update orders set status = 'cancelled' where id = o.id;
end $$;

revoke all on function portal_customer_ids() from public, anon;
revoke all on function portal_point_ids() from public, anon;
revoke all on function portal_earliest_date(uuid) from public, anon;
revoke all on function portal_date_allowed(uuid, date) from public, anon;
revoke all on function portal_has_access(uuid, uuid) from public, anon;
revoke all on function portal_place_order(uuid, date, jsonb, text) from public, anon;
revoke all on function portal_cancel_order(uuid) from public, anon;
grant execute on function portal_customer_ids() to authenticated;
grant execute on function portal_point_ids() to authenticated;
grant execute on function portal_earliest_date(uuid) to authenticated;
grant execute on function portal_date_allowed(uuid, date) to authenticated;
grant execute on function portal_has_access(uuid, uuid) to authenticated;
grant execute on function portal_place_order(uuid, date, jsonb, text) to authenticated;
grant execute on function portal_cancel_order(uuid) to authenticated;

-- =========================================================
-- RLS
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['products', 'order_lines', 'customer_portal_users'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select using (has_role(tenant_id, array['admin','dispatcher','viewer','customer_service','management']::member_role[]))$p$, t||'_read_staff', t);
    execute format($p$create policy %I on %I for all using (has_role(tenant_id, array['admin','dispatcher']::member_role[])) with check (has_role(tenant_id, array['admin','dispatcher']::member_role[]))$p$, t||'_write_staff', t);
  end loop;
end $$;

-- Klient (portal): tylko odczyt swoich danych; zapis wyłącznie przez funkcje powyżej
create policy portal_users_self_read on customer_portal_users for select using (user_id = auth.uid());
create policy customers_portal_read on customers for select using (id in (select portal_customer_ids()));
create policy points_portal_read on delivery_points for select using (id in (select portal_point_ids()));
create policy windows_portal_read on delivery_point_windows for select using (delivery_point_id in (select portal_point_ids()));
create policy exceptions_portal_read on delivery_point_exceptions for select using (
  delivery_point_id in (select portal_point_ids())
  or (delivery_point_id is null and has_role(tenant_id, array['customer']::member_role[])));
create policy products_portal_read on products for select using (is_active and has_role(tenant_id, array['customer']::member_role[]));
create policy orders_portal_read on orders for select using (delivery_point_id in (select portal_point_ids()));
create policy order_lines_portal_read on order_lines for select using (
  order_id in (select o.id from orders o where o.delivery_point_id in (select portal_point_ids())));
