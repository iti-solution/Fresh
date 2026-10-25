-- Fresh — aplikacja kierowcy (M4, część 1): PIN z blokadą, uprawnienia kierowcy do odczytu swojej trasy.
-- Zapis realizacji idzie przez serwer (klucz serwerowy) po sprawdzeniu, że trasa należy do kierowcy.

alter table drivers
  add column if not exists pin_failed_count int not null default 0,
  add column if not exists pin_locked_until timestamptz;

-- Ustawienie PIN-u przez admina/dyspozytora (4–6 cyfr, hash bcrypt — jawny PIN nigdzie nie jest zapisywany)
create or replace function set_driver_pin(p_driver uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from drivers where id = p_driver;
  if v_tenant is null or not has_role(v_tenant, array['admin','dispatcher']::member_role[]) then
    raise exception 'Brak uprawnień';
  end if;
  if p_pin !~ '^\d{4,6}$' then raise exception 'PIN musi mieć 4–6 cyfr'; end if;
  update drivers set pin_hash = crypt(p_pin, gen_salt('bf', 8)), pin_failed_count = 0, pin_locked_until = null
  where id = p_driver;
end $$;

-- Weryfikacja PIN-u — wyłącznie serwer (klucz serwerowy). 5 błędnych prób = blokada na 10 minut.
create or replace function verify_driver_pin(p_driver uuid, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare d record;
begin
  select id, pin_hash, pin_failed_count, pin_locked_until, is_active into d from drivers where id = p_driver for update;
  if d.id is null or not d.is_active then return 'no_driver'; end if;
  if d.pin_hash is null then return 'no_pin'; end if;
  if d.pin_locked_until is not null and d.pin_locked_until > now() then return 'locked'; end if;
  if crypt(p_pin, d.pin_hash) = d.pin_hash then
    update drivers set pin_failed_count = 0, pin_locked_until = null where id = p_driver;
    return 'ok';
  end if;
  update drivers
    set pin_failed_count = case when d.pin_failed_count + 1 >= 5 then 0 else d.pin_failed_count + 1 end,
        pin_locked_until = case when d.pin_failed_count + 1 >= 5 then now() + interval '10 minutes' else null end
  where id = p_driver;
  return case when d.pin_failed_count + 1 >= 5 then 'locked' else 'bad' end;
end $$;

revoke all on function set_driver_pin(uuid, text) from public, anon;
grant execute on function set_driver_pin(uuid, text) to authenticated;
revoke all on function verify_driver_pin(uuid, text) from public, anon, authenticated;

-- =========================================================
-- Odczyt dla kierowcy: jego trasy od wczoraj do +3 dni (weekend → poniedziałek)
-- =========================================================
create or replace function driver_route_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from routes r
  where r.driver_id in (select d.id from drivers d where d.user_id = auth.uid())
    and r.route_date between current_date - 1 and current_date + 3
    and r.status in ('planned', 'dispatched', 'in_progress', 'completed');
$$;

drop policy if exists routes_driver_read on routes;
create policy routes_driver_read on routes for select using (id in (select driver_route_ids()));

drop policy if exists stops_driver_read on route_stops;
create policy stops_driver_read on route_stops for select using (route_id in (select driver_route_ids()));

drop policy if exists points_driver_read on delivery_points;
create policy points_driver_read on delivery_points for select using (
  id in (select s.delivery_point_id from route_stops s where s.route_id in (select driver_route_ids())));

drop policy if exists point_notes_driver_read on delivery_point_notes;
create policy point_notes_driver_read on delivery_point_notes for select using (
  delivery_point_id in (select s.delivery_point_id from route_stops s where s.route_id in (select driver_route_ids())));

create policy windows_driver_read on delivery_point_windows for select using (
  delivery_point_id in (select s.delivery_point_id from route_stops s where s.route_id in (select driver_route_ids())));

create policy customers_driver_read on customers for select using (
  id in (select p.customer_id from delivery_points p join route_stops s on s.delivery_point_id = p.id
         where s.route_id in (select driver_route_ids())));

create policy stop_orders_driver_read on route_stop_orders for select using (
  stop_id in (select s.id from route_stops s where s.route_id in (select driver_route_ids())));

create policy orders_driver_read on orders for select using (
  id in (select so.order_id from route_stop_orders so join route_stops s on s.id = so.stop_id
         where s.route_id in (select driver_route_ids())));

create policy events_driver_read on delivery_events for select using (route_id in (select driver_route_ids()));

create policy drivers_self_read on drivers for select using (user_id = auth.uid());
create policy vehicles_driver_read on vehicles for select using (has_role(tenant_id, array['driver']::member_role[]));

create policy packaging_driver_read on packaging_movements for select using (
  party_type = 'driver' and party_id in (select d.id from drivers d where d.user_id = auth.uid()));
create policy cash_driver_read on cash_movements for select using (
  party_type = 'driver' and party_id in (select d.id from drivers d where d.user_id = auth.uid()));

revoke all on function driver_route_ids() from public, anon;
grant execute on function driver_route_ids() to authenticated;

-- weryfikację PIN-u wywołuje wyłącznie serwer aplikacji
grant execute on function verify_driver_pin(uuid, text) to service_role;
