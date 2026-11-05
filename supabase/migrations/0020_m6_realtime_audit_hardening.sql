-- Driver — M6: centrum operacyjne na żywo (Realtime), dziennik audytu tras i rozliczeń, utwardzenie funkcji, indeksy.

-- =========================================================
-- 1. REALTIME — centrum operacyjne odświeża się, gdy kierowca coś potwierdzi (RLS obowiązuje także tutaj)
-- =========================================================
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['delivery_events', 'route_stops', 'routes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =========================================================
-- 2. DZIENNIK AUDYTU (M6.4): kto i kiedy zmienił trasę (auto, kierowca, status) i rozliczenie/stawki
-- =========================================================
create or replace function audit_routes() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb := '{}'::jsonb;
begin
  if new.status is distinct from old.status then d := d || jsonb_build_object('status', jsonb_build_array(old.status, new.status)); end if;
  if new.driver_id is distinct from old.driver_id then d := d || jsonb_build_object('driver_id', jsonb_build_array(old.driver_id, new.driver_id)); end if;
  if new.vehicle_id is distinct from old.vehicle_id then d := d || jsonb_build_object('vehicle_id', jsonb_build_array(old.vehicle_id, new.vehicle_id)); end if;
  if new.odometer_end is distinct from old.odometer_end then d := d || jsonb_build_object('odometer_end', jsonb_build_array(old.odometer_end, new.odometer_end)); end if;
  if d <> '{}'::jsonb then
    insert into audit_log (tenant_id, user_id, entity, entity_id, action, diff) values (new.tenant_id, auth.uid(), 'route', new.id, 'update', d);
  end if;
  return new;
end $$;
drop trigger if exists audit_routes on routes;
create trigger audit_routes after update on routes for each row execute function audit_routes();

create or replace function audit_settlements() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.status is distinct from old.status) then
    insert into audit_log (tenant_id, user_id, entity, entity_id, action, diff)
    values (new.tenant_id, auth.uid(), 'settlement', new.id, 'status', jsonb_build_object('status', jsonb_build_array(old.status, new.status), 'total', new.total_amount));
  end if;
  return new;
end $$;
drop trigger if exists audit_settlements on driver_settlements;
create trigger audit_settlements after update on driver_settlements for each row execute function audit_settlements();

create or replace function audit_pay_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (tenant_id, user_id, entity, entity_id, action, diff)
  values (new.tenant_id, auth.uid(), 'pay_rule', new.id, lower(tg_op),
          jsonb_build_object('driver_id', new.driver_id, 'valid_from', new.valid_from, 'valid_to', new.valid_to, 'components', new.components));
  return new;
end $$;
drop trigger if exists audit_pay_rules on driver_pay_rules;
create trigger audit_pay_rules after insert or update on driver_pay_rules for each row execute function audit_pay_rules();

create index if not exists audit_log_entity_idx on audit_log (tenant_id, entity, entity_id, created_at desc);

-- =========================================================
-- 3. UTWARDZENIE: stały search_path w funkcjach planowania i rozliczeń, bez wywołań funkcji wewnętrznych z API
-- =========================================================
do $$
declare f text;
begin
  foreach f in array array[
    'resequence_route(uuid)', 'touch_route(uuid)', 'unassign_order(uuid)', 'assign_order_to_route(uuid, uuid)',
    'move_stop(uuid, integer)', 'sort_route_by_window(uuid)', 'create_day_routes(uuid, date)',
    'move_template_point(uuid, uuid, integer)', 'sort_template_by_window(uuid)', 'copy_day_routes(uuid, date, date, uuid)',
    'settlement_lines_guard()', 'close_route(uuid, numeric, jsonb, integer, text, jsonb)'
  ] loop
    begin
      execute format('alter function public.%s set search_path = public, extensions', f);
    exception when undefined_function then
      raise notice 'pomijam %', f;
    end;
  end loop;
end $$;

revoke execute on function point_type_for_branch(uuid, text) from public, anon, authenticated;
revoke execute on function delivery_points_default_type() from public, anon, authenticated;
revoke execute on function delivery_points_type_tenant_chk() from public, anon, authenticated;
revoke execute on function tenants_seed_point_types() from public, anon, authenticated;
revoke execute on function audit_routes() from public, anon, authenticated;
revoke execute on function audit_settlements() from public, anon, authenticated;
revoke execute on function audit_pay_rules() from public, anon, authenticated;

-- =========================================================
-- 4. INDEKSY pod 5 000 punktów dziennie (M6.4)
-- =========================================================
create index if not exists route_stops_route_idx on route_stops (route_id);
create index if not exists route_stops_point_idx on route_stops (tenant_id, delivery_point_id);
create index if not exists delivery_point_windows_point_idx on delivery_point_windows (delivery_point_id, weekday);
create index if not exists orders_point_date_idx on orders (tenant_id, delivery_point_id, delivery_date);
create index if not exists orders_unmatched_idx on orders (tenant_id, delivery_date) where delivery_point_id is null;
create index if not exists cash_movements_route_idx on cash_movements (tenant_id, route_id);
create index if not exists routes_driver_date_idx on routes (tenant_id, driver_id, route_date);
