-- Test aplikacji kierowcy — LOKALNA baza testowa (po planning.sql)
insert into auth.users (id) values ('d0000000-0000-0000-0000-00000000000d') on conflict do nothing;

do $$
declare v_tenant uuid; v_driver uuid; v_other uuid; v_route uuid; r text; n int; i int;
begin
  -- admin ustawia PIN pierwszemu kierowcy i podpina mu konto
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  select m.tenant_id into v_tenant from memberships m where m.user_id = auth.uid() limit 1;
  select id into v_route from routes where tenant_id = v_tenant order by name limit 1;
  select driver_id into v_driver from routes where id = v_route;
  select id into v_other from drivers where tenant_id = v_tenant and id <> v_driver limit 1;
  perform set_driver_pin(v_driver, '4321');
  begin
    perform set_driver_pin(v_driver, '12');
    raise exception 'Za krótki PIN powinien być odrzucony';
  exception when others then
    if sqlerrm not like '%4–6 cyfr%' then raise; end if;
  end;
  update routes set status = 'planned' where id = v_route;
  reset role;

  update drivers set user_id = 'd0000000-0000-0000-0000-00000000000d' where id = v_driver;
  insert into memberships (tenant_id, user_id, role) values (v_tenant, 'd0000000-0000-0000-0000-00000000000d', 'driver');

  -- weryfikacja PIN (serwer) + blokada po 5 błędach
  if verify_driver_pin(v_driver, '4321') <> 'ok' then raise exception 'Poprawny PIN odrzucony'; end if;
  for i in 1..4 loop r := verify_driver_pin(v_driver, '0000'); end loop;
  if r <> 'bad' then raise exception 'Oczekiwano bad, jest %', r; end if;
  if verify_driver_pin(v_driver, '0000') <> 'locked' then raise exception 'Brak blokady po 5 próbach'; end if;
  if verify_driver_pin(v_driver, '4321') <> 'locked' then raise exception 'Zablokowany kierowca nie powinien się zalogować'; end if;
  update drivers set pin_locked_until = null where id = v_driver;

  -- kierowca widzi swoją trasę, jej punkty, zamówienia i klientów — i nic więcej
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-00000000000d', true);
  set local role authenticated;
  select count(*) into n from routes;
  if n <> 1 then raise exception 'Kierowca powinien widzieć 1 trasę, widzi %', n; end if;
  select count(*) into n from route_stops;
  if n = 0 then raise exception 'Kierowca nie widzi punktów swojej trasy'; end if;
  select count(*) into n from orders;
  if n = 0 then raise exception 'Kierowca nie widzi zamówień swojej trasy'; end if;
  if (select count(*) from orders) <> (select count(*) from route_stop_orders) then raise exception 'Kierowca widzi cudze zamówienia'; end if;
  select count(*) into n from customers;
  if n = 0 then raise exception 'Kierowca nie widzi klientów swojej trasy'; end if;
  select count(*) into n from drivers;
  if n <> 1 then raise exception 'Kierowca powinien widzieć tylko siebie (%)', n; end if;
  -- bez prawa zapisu
  update route_stops set status = 'delivered';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Kierowca nie może zapisywać bezpośrednio'; end if;
  begin
    perform verify_driver_pin(v_driver, '4321');
    raise exception 'verify_driver_pin nie może być dostępne dla zalogowanych';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise notice 'Kierowca: wszystkie testy przeszły';
end $$;
