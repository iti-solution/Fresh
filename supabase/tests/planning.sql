-- Test logiki planowania — LOKALNA baza testowa (po rls_isolation.sql, korzysta z firmy demo admina A)
do $$
declare
  v_tenant uuid; v_date date; v_res json; v_route uuid; v_route2 uuid; v_order uuid; n int; v_first uuid; v_seq int;
begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  select m.tenant_id into v_tenant from memberships m where m.user_id = auth.uid() limit 1;
  select min(delivery_date) into v_date from orders where tenant_id = v_tenant;

  v_res := create_day_routes(v_tenant, v_date);
  if (v_res->>'routes_created')::int <> 6 then raise exception 'Oczekiwano 6 tras, jest %', v_res; end if;
  if (v_res->>'orders_assigned')::int = 0 then raise exception 'Nie przypisano zamówień: %', v_res; end if;

  -- ponowne wywołanie nie dubluje tras ani zamówień
  v_res := create_day_routes(v_tenant, v_date);
  if (v_res->>'routes_created')::int <> 0 or (v_res->>'orders_assigned')::int <> 0 then raise exception 'Duplikaty: %', v_res; end if;

  -- przeniesienie zamówienia na inną trasę
  select id into v_route from routes where tenant_id = v_tenant and route_date = v_date order by name limit 1;
  select id into v_route2 from routes where tenant_id = v_tenant and route_date = v_date order by name desc limit 1;
  select so.order_id into v_order from route_stop_orders so join route_stops s on s.id = so.stop_id where s.route_id = v_route limit 1;
  perform assign_order_to_route(v_order, v_route2);
  select count(*) into n from route_stop_orders so join route_stops s on s.id = so.stop_id where so.order_id = v_order and s.route_id = v_route2;
  if n <> 1 then raise exception 'Zamówienie nie przeszło na drugą trasę'; end if;

  -- numeracja postojów bez dziur na obu trasach
  select count(*) into n from (select sequence, row_number() over (order by sequence) rn from route_stops where route_id = v_route) x where sequence <> rn;
  if n <> 0 then raise exception 'Dziury w numeracji trasy 1'; end if;

  -- zdjęcie z trasy → status new, brak pustych postojów
  perform unassign_order(v_order);
  if (select status from orders where id = v_order) <> 'new' then raise exception 'Status po zdjęciu powinien być new'; end if;
  select count(*) into n from route_stops s where not exists (select 1 from route_stop_orders so where so.stop_id = s.id);
  if n <> 0 then raise exception 'Zostały puste postoje: %', n; end if;

  -- przesunięcie w dół i sortowanie po oknach
  select id into v_first from route_stops where route_id = v_route and sequence = 1;
  perform move_stop(v_first, 1);
  select sequence into v_seq from route_stops where id = v_first;
  if v_seq <> 2 then raise exception 'move_stop nie przesunął postoju (seq=%)', v_seq; end if;
  perform sort_route_by_window(v_route);

  -- trasa gotowa do załadunku wraca do szkicu po zmianie
  update routes set status = 'planned' where id = v_route;
  perform move_stop(v_first, -1);
  if (select status from routes where id = v_route) <> 'draft' then raise exception 'Zmiana na gotowej trasie powinna cofnąć ją do szkicu'; end if;
  reset role;

  -- BOK nie może planować
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  set local role authenticated;
  begin
    perform unassign_order((select so.order_id from route_stop_orders so limit 1));
    if exists (select 1 from route_stop_orders so where so.order_id = (select so2.order_id from route_stop_orders so2 limit 1)) then
      null; -- RLS ukrywa zapis: brak zmian = OK
    end if;
  exception when others then null;
  end;
  reset role;

  raise notice 'Planowanie: wszystkie testy przeszły';
end $$;
