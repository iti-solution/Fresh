-- Test szablonów tras: kierowca zastępczy — LOKALNA baza testowa (po rls_isolation.sql)
do $$
declare v_tenant uuid; t1 record; t2 uuid; d_alt uuid; v_date date := current_date + 30; n int; v_drv uuid;
begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  select m.tenant_id into v_tenant from memberships m where m.user_id = auth.uid() and m.role = 'admin' limit 1;
  if extract(isodow from v_date) = 7 then v_date := v_date + 1; end if;
  select id, default_driver_id into t1 from route_templates where tenant_id = v_tenant order by name limit 1;
  select id into t2 from route_templates where tenant_id = v_tenant and id <> t1.id order by name limit 1;
  select id into d_alt from drivers where tenant_id = v_tenant
    and id not in (select default_driver_id from route_templates where tenant_id = v_tenant and default_driver_id is not null) limit 1;

  -- szablon 2 ma tego samego kierowcę wstępnego co szablon 1 (jedzie już trasą 1) → bierze zastępczego
  update route_templates set default_driver_id = t1.default_driver_id, alt_driver_id = d_alt where id = t2;
  perform create_day_routes(v_tenant, v_date);
  select driver_id into v_drv from routes where template_id = t2 and route_date = v_date;
  if v_drv is distinct from d_alt then raise exception 'Oczekiwano kierowcy zastępczego %, jest %', d_alt, v_drv; end if;

  -- ten sam kierowca nie może być wstępnym i zastępczym
  begin
    update route_templates set alt_driver_id = default_driver_id where id = t2;
    raise exception 'Powinno być odrzucone';
  exception when check_violation then null;
  end;

  -- kolejność punktów: przesunięcie w górę i sortowanie wg okien nie gubią punktów
  select count(*) into n from route_template_points where template_id = t1.id;
  perform move_template_point(t1.id, (select delivery_point_id from route_template_points where template_id = t1.id order by sequence desc limit 1), -1);
  perform sort_template_by_window(t1.id);
  if (select count(*) from route_template_points where template_id = t1.id) <> n then raise exception 'Zgubione punkty szablonu'; end if;
  reset role;
end $$;
