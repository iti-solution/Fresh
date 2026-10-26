-- Fresh — szablony tras: kierowca wstępny i zastępczy (oba opcjonalne), decyzja 2026-10-26.
-- Przy tworzeniu dnia z szablonu: kierowca wstępny, a gdy jest nieaktywny albo już jedzie inną trasą
-- w tym samym kursie tego dnia — kierowca zastępczy (jeśli wolny). Inaczej trasa zostaje bez kierowcy
-- i dyspozytor przydziela go ręcznie. To samo dla auta: auto z szablonu tylko gdy aktywne i wolne.

alter table route_templates
  add column if not exists alt_driver_id uuid references drivers(id);

alter table route_templates drop constraint if exists route_templates_alt_driver_chk;
alter table route_templates add constraint route_templates_alt_driver_chk
  check (alt_driver_id is null or default_driver_id is null or alt_driver_id <> default_driver_id);

create or replace function create_day_routes(p_tenant uuid, p_date date)
returns json language plpgsql as $$
declare
  t record;
  r record;
  o record;
  v_driver uuid;
  v_vehicle uuid;
  v_created int := 0;
  v_assigned int := 0;
begin
  for t in
    select * from route_templates
    where tenant_id = p_tenant and is_active and extract(isodow from p_date)::smallint = any (weekdays)
      and not exists (select 1 from routes rr where rr.template_id = route_templates.id and rr.route_date = p_date)
    order by name
  loop
    -- kierowca: wstępny, a gdy niedostępny — zastępczy; zajęty = już na innej trasie 1. kursu tego dnia
    v_driver := null;
    if t.default_driver_id is not null
       and exists (select 1 from drivers d where d.id = t.default_driver_id and d.is_active)
       and not exists (select 1 from routes x where x.tenant_id = p_tenant and x.route_date = p_date and x.course_no = 1
                       and x.status <> 'cancelled' and x.driver_id = t.default_driver_id) then
      v_driver := t.default_driver_id;
    elsif t.alt_driver_id is not null
       and exists (select 1 from drivers d where d.id = t.alt_driver_id and d.is_active)
       and not exists (select 1 from routes x where x.tenant_id = p_tenant and x.route_date = p_date and x.course_no = 1
                       and x.status <> 'cancelled' and x.driver_id = t.alt_driver_id) then
      v_driver := t.alt_driver_id;
    end if;

    v_vehicle := null;
    if t.default_vehicle_id is not null
       and exists (select 1 from vehicles v where v.id = t.default_vehicle_id and v.status = 'active')
       and not exists (select 1 from routes x where x.tenant_id = p_tenant and x.route_date = p_date and x.course_no = 1
                       and x.status <> 'cancelled' and x.vehicle_id = t.default_vehicle_id) then
      v_vehicle := t.default_vehicle_id;
    end if;

    insert into routes (tenant_id, route_date, name, kind, course_no, template_id, depot_id, vehicle_id, driver_id, planned_start, status)
    values (p_tenant, p_date, t.name, 'regular', 1, t.id, t.depot_id, v_vehicle, v_driver,
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

-- Zmiana kolejności punktów w szablonie (zamiana z sąsiadem, p_dir = -1 w górę, +1 w dół)
create or replace function move_template_point(p_template uuid, p_point uuid, p_dir int)
returns void language plpgsql as $$
declare v_seq int; v_other uuid; v_other_seq int;
begin
  select sequence into v_seq from route_template_points where template_id = p_template and delivery_point_id = p_point;
  if v_seq is null then return; end if;
  select delivery_point_id, sequence into v_other, v_other_seq from route_template_points
  where template_id = p_template and (case when p_dir < 0 then sequence < v_seq else sequence > v_seq end)
  order by case when p_dir < 0 then -sequence else sequence end limit 1;
  if v_other is null then return; end if;
  update route_template_points set sequence = v_other_seq where template_id = p_template and delivery_point_id = p_point;
  update route_template_points set sequence = v_seq where template_id = p_template and delivery_point_id = v_other;
end $$;

-- Kolejność punktów szablonu według początku okna przyjęć (pierwszy dzień tygodnia trasy)
create or replace function sort_template_by_window(p_template uuid)
returns void language plpgsql as $$
declare v_dow smallint;
begin
  select coalesce(weekdays[1], 1) into v_dow from route_templates where id = p_template;
  update route_template_points tp set sequence = x.rn
  from (
    select p.delivery_point_id, row_number() over (
      order by (select min(w.opens_at) from delivery_point_windows w where w.delivery_point_id = p.delivery_point_id and w.weekday = v_dow) nulls last,
               p.sequence) as rn
    from route_template_points p where p.template_id = p_template
  ) x
  where tp.template_id = p_template and tp.delivery_point_id = x.delivery_point_id;
end $$;

revoke all on function move_template_point(uuid, uuid, int), sort_template_by_window(uuid) from public, anon;
grant execute on function move_template_point(uuid, uuid, int), sort_template_by_window(uuid) to authenticated;
