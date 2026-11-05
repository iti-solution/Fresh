-- Driver — M3.7: kopiowanie dnia albo jednej trasy na inny dzień.
-- Kopia trasy = ta sama nazwa, rodzaj, kurs, szablon, auto i kierowca (gdy wolni tego dnia), godzina wyjazdu.
-- Zamówienia dnia docelowego trafiają na kopię, jeśli ich adres był na trasie źródłowej (w tej samej kolejności).
-- Działa z uprawnieniami wywołującego (RLS) — jak pozostałe funkcje planowania.

create or replace function copy_day_routes(p_tenant uuid, p_from date, p_to date, p_route uuid default null)
returns json language plpgsql as $$
declare
  src record;
  v_new uuid;
  v_driver uuid;
  v_vehicle uuid;
  v_created int := 0;
  v_assigned int := 0;
  o record;
begin
  if p_from = p_to then raise exception 'Wybierz inny dzień niż źródłowy'; end if;
  if not has_role(p_tenant, array['admin','dispatcher']::member_role[]) then raise exception 'Brak uprawnień'; end if;

  for src in
    select * from routes
    where tenant_id = p_tenant and route_date = p_from and status <> 'cancelled'
      and (p_route is null or id = p_route)
      -- nie dubluj: na dzień docelowy jest już trasa z tą nazwą i kursem
      and not exists (select 1 from routes x where x.tenant_id = p_tenant and x.route_date = p_to and x.status <> 'cancelled'
                      and x.name = routes.name and x.course_no = routes.course_no)
    order by course_no, name
  loop
    v_driver := null;
    if src.driver_id is not null
       and exists (select 1 from drivers d where d.id = src.driver_id and d.is_active)
       and not exists (select 1 from routes x where x.tenant_id = p_tenant and x.route_date = p_to and x.course_no = src.course_no
                       and x.status <> 'cancelled' and x.driver_id = src.driver_id) then
      v_driver := src.driver_id;
    end if;
    v_vehicle := null;
    if src.vehicle_id is not null
       and exists (select 1 from vehicles v where v.id = src.vehicle_id and v.status = 'active')
       and not exists (select 1 from routes x where x.tenant_id = p_tenant and x.route_date = p_to and x.course_no = src.course_no
                       and x.status <> 'cancelled' and x.vehicle_id = src.vehicle_id) then
      v_vehicle := src.vehicle_id;
    end if;

    insert into routes (tenant_id, route_date, name, kind, course_no, template_id, depot_id, vehicle_id, driver_id,
                        carrier_id, planned_start, extra_reason, status)
    values (p_tenant, p_to, src.name, src.kind, src.course_no, src.template_id, src.depot_id, v_vehicle, v_driver,
            src.carrier_id,
            case when src.planned_start is not null
                 then ((p_to + (src.planned_start at time zone 'Europe/Warsaw')::time) at time zone 'Europe/Warsaw') end,
            src.extra_reason, 'draft')
    returning id into v_new;
    v_created := v_created + 1;

    for o in
      select ord.id
      from route_stops s
      join orders ord on ord.delivery_point_id = s.delivery_point_id
      where s.route_id = src.id
        and ord.tenant_id = p_tenant and ord.delivery_date = p_to
        and ord.status not in ('cancelled', 'delivered', 'failed')
        and not exists (select 1 from route_stop_orders so where so.order_id = ord.id)
      order by s.sequence, ord.external_ref
    loop
      perform assign_order_to_route(o.id, v_new);
      v_assigned := v_assigned + 1;
    end loop;
  end loop;

  return json_build_object('routes_created', v_created, 'orders_assigned', v_assigned);
end $$;

revoke all on function copy_day_routes(uuid, date, date, uuid) from public, anon;
grant execute on function copy_day_routes(uuid, date, date, uuid) to authenticated;
