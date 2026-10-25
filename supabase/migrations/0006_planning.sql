-- Fresh — logika planowania tras (M3)
-- Funkcje działają z uprawnieniami wywołującego (security invoker) — RLS decyduje, kto może planować.
-- Każda operacja jest jedną transakcją: przeniesienie zamówienia nigdy nie zostawi danych w połowie.

-- jedna trasa stała na dzień (ochrona przed podwójnym kliknięciem „Utwórz dzień”)
create unique index if not exists routes_template_day_uniq on routes (template_id, route_date) where template_id is not null;

-- Przenumerowanie postojów trasy 1..n bez dziur
create or replace function resequence_route(p_route uuid)
returns void language plpgsql as $$
begin
  update route_stops s set sequence = x.rn
  from (select id, row_number() over (order by sequence, id) as rn from route_stops where route_id = p_route) x
  where s.id = x.id and s.sequence <> x.rn;
end $$;

-- Każda zmiana na trasie „Gotowej do załadunku” cofa ją do szkicu — dyspozytor potwierdza ponownie
create or replace function touch_route(p_route uuid)
returns void language plpgsql as $$
begin
  update routes set status = 'draft' where id = p_route and status = 'planned';
end $$;

create or replace function unassign_order(p_order uuid)
returns void language plpgsql as $$
declare v_stop uuid; v_route uuid;
begin
  delete from route_stop_orders where order_id = p_order returning stop_id into v_stop;
  if v_stop is null then return; end if;
  select route_id into v_route from route_stops where id = v_stop;
  if not exists (select 1 from route_stop_orders where stop_id = v_stop) then
    delete from route_stops where id = v_stop;
  end if;
  update orders set status = 'new' where id = p_order and status = 'planned';
  perform resequence_route(v_route);
  perform touch_route(v_route);
end $$;

create or replace function assign_order_to_route(p_order uuid, p_route uuid)
returns void language plpgsql as $$
declare
  v_point  uuid;
  v_tenant uuid;
  v_rt     uuid;
  v_status route_status;
  v_stop   uuid;
  v_seq    int;
begin
  select delivery_point_id, tenant_id into v_point, v_tenant from orders where id = p_order;
  if v_point is null then raise exception 'Zamówienie nie istnieje albo nie ma przypisanego oddziału'; end if;
  select tenant_id, status into v_rt, v_status from routes where id = p_route;
  if v_rt is null or v_rt <> v_tenant then raise exception 'Trasa nie istnieje'; end if;
  if v_status in ('in_progress', 'completed', 'closed', 'cancelled') then
    raise exception 'Trasa jest już w realizacji albo zamknięta';
  end if;

  -- już na tej trasie? nic nie rób
  if exists (select 1 from route_stop_orders so join route_stops s on s.id = so.stop_id
             where so.order_id = p_order and s.route_id = p_route) then
    return;
  end if;

  perform unassign_order(p_order);

  select id into v_stop from route_stops where route_id = p_route and delivery_point_id = v_point;
  if v_stop is null then
    select coalesce(max(sequence), 0) + 1 into v_seq from route_stops where route_id = p_route;
    insert into route_stops (tenant_id, route_id, delivery_point_id, sequence)
    values (v_tenant, p_route, v_point, v_seq) returning id into v_stop;
  end if;

  insert into route_stop_orders (tenant_id, stop_id, order_id) values (v_tenant, v_stop, p_order);
  update orders set status = 'planned' where id = p_order and status = 'new';
  perform touch_route(p_route);
end $$;

-- Zamiana miejscami z sąsiednim postojem (p_dir = -1 w górę, +1 w dół)
create or replace function move_stop(p_stop uuid, p_dir int)
returns void language plpgsql as $$
declare v_route uuid; v_seq int; v_other uuid; v_other_seq int;
begin
  select route_id, sequence into v_route, v_seq from route_stops where id = p_stop;
  if v_route is null then return; end if;
  select id, sequence into v_other, v_other_seq from route_stops
  where route_id = v_route and (case when p_dir < 0 then sequence < v_seq else sequence > v_seq end)
  order by case when p_dir < 0 then -sequence else sequence end
  limit 1;
  if v_other is null then return; end if;
  update route_stops set sequence = v_other_seq where id = p_stop;
  update route_stops set sequence = v_seq where id = v_other;
  perform touch_route(v_route);
end $$;

-- Kolejność wg początku okna przyjęć (okno z zamówienia ma pierwszeństwo przed oknem oddziału).
-- Uczciwy zamiennik optymalizacji, dopóki nie mamy współrzędnych adresów.
create or replace function sort_route_by_window(p_route uuid)
returns void language plpgsql as $$
declare v_date date; v_dow int;
begin
  select route_date into v_date from routes where id = p_route;
  if v_date is null then return; end if;
  v_dow := extract(isodow from v_date);
  update route_stops s set sequence = x.rn
  from (
    select st.id, row_number() over (
      order by coalesce(
        (select min(o.window_start) from route_stop_orders so join orders o on o.id = so.order_id where so.stop_id = st.id),
        (select min(w.opens_at) from delivery_point_windows w where w.delivery_point_id = st.delivery_point_id and w.weekday = v_dow)
      ) nulls last, st.sequence) as rn
    from route_stops st where st.route_id = p_route
  ) x
  where s.id = x.id and s.sequence <> x.rn;
  perform touch_route(p_route);
end $$;

-- Dzień z tras stałych: tworzy brakujące trasy i przypisuje do nich zamówienia wg oddziałów szablonu
create or replace function create_day_routes(p_tenant uuid, p_date date)
returns json language plpgsql as $$
declare
  t record;
  r record;
  o record;
  v_route uuid;
  v_created int := 0;
  v_assigned int := 0;
begin
  for t in
    select * from route_templates
    where tenant_id = p_tenant and is_active and extract(isodow from p_date)::smallint = any (weekdays)
      and not exists (select 1 from routes rr where rr.template_id = route_templates.id and rr.route_date = p_date)
    order by name
  loop
    insert into routes (tenant_id, route_date, name, kind, course_no, template_id, depot_id, vehicle_id, driver_id, planned_start, status)
    values (p_tenant, p_date, t.name, 'regular', 1, t.id, t.depot_id, t.default_vehicle_id, t.default_driver_id,
            case when t.planned_start is not null then (p_date + t.planned_start) at time zone 'Europe/Warsaw' end, 'draft');
    v_created := v_created + 1;
  end loop;

  for r in select id, template_id from routes where tenant_id = p_tenant and route_date = p_date and template_id is not null loop
    for o in
      select ord.id
      from orders ord
      join route_template_points rtp on rtp.delivery_point_id = ord.delivery_point_id and rtp.template_id = r.template_id
      where ord.tenant_id = p_tenant and ord.delivery_date = p_date and ord.status not in ('cancelled', 'delivered', 'failed')
        and not exists (select 1 from route_stop_orders so where so.order_id = ord.id)
      order by rtp.sequence, ord.external_ref
    loop
      perform assign_order_to_route(o.id, r.id);
      v_assigned := v_assigned + 1;
    end loop;
  end loop;

  return json_build_object('routes_created', v_created, 'orders_assigned', v_assigned);
end $$;

revoke all on function resequence_route(uuid), touch_route(uuid), unassign_order(uuid), assign_order_to_route(uuid, uuid),
  move_stop(uuid, int), sort_route_by_window(uuid), create_day_routes(uuid, date) from public, anon;
grant execute on function resequence_route(uuid), touch_route(uuid), unassign_order(uuid), assign_order_to_route(uuid, uuid),
  move_stop(uuid, int), sort_route_by_window(uuid), create_day_routes(uuid, date) to authenticated;
