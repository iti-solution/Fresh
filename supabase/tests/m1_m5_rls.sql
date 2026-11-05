-- Driver — testy RLS i zamknięcia trasy dla migracji 0016–0019 (lokalna baza testowa; po rls_isolation.sql).
-- Każde sprawdzenie kończy się błędem (raise exception), jeśli coś nie działa.

insert into auth.users (id) values ('d0000000-0000-0000-0000-00000000000d') on conflict do nothing; -- obcy

do $$
declare n int; v_tenant uuid;
begin
  select tenant_id into v_tenant from memberships where user_id = 'a0000000-0000-0000-0000-00000000000a' limit 1;

  -- 1. Nowa firma dostaje domyślne typy adresów (w tym budowa jako adres tymczasowy)
  select count(*) into n from point_types where tenant_id = v_tenant;
  if n < 8 then raise exception 'Firma powinna mieć 8 domyślnych typów adresów, ma %', n; end if;
  if not exists (select 1 from point_types where tenant_id = v_tenant and code = 'construction' and is_temporary) then
    raise exception 'Brak typu „Budowa” jako adresu tymczasowego';
  end if;
  -- 2. Każdy adres dostawy ma typ (trigger mapuje starą kolumnę branch_type)
  select count(*) into n from delivery_points where tenant_id = v_tenant and point_type_id is null;
  if n > 0 then raise exception '% adresów bez typu', n; end if;

  -- 3. Obcy użytkownik nie widzi typów, mapowań importu ani kluczy API
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-00000000000d', true);
  set local role authenticated;
  select count(*) into n from point_types;
  if n <> 0 then raise exception 'Obcy widzi % typów adresów', n; end if;
  select count(*) into n from import_mappings;
  if n <> 0 then raise exception 'Obcy widzi mapowania importu'; end if;
  select count(*) into n from tenant_api_keys;
  if n <> 0 then raise exception 'Obcy widzi klucze API'; end if;
  reset role;

  -- 4. BOK nie widzi kluczy API (tylko admin)
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  insert into tenant_api_keys (tenant_id, name, key_prefix, key_hash) values (v_tenant, 'test', 'drv_test', repeat('a', 64));
  reset role;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  set local role authenticated;
  select count(*) into n from tenant_api_keys;
  if n <> 0 then raise exception 'BOK widzi klucze API'; end if;
  reset role;

  -- 5. Typ adresu z innej firmy jest odrzucany
  begin
    update delivery_points set point_type_id = gen_random_uuid() where tenant_id = v_tenant and id = (select id from delivery_points where tenant_id = v_tenant limit 1);
    raise exception 'Przyjęto typ adresu spoza firmy';
  exception when foreign_key_violation or raise_exception then
    if sqlerrm like 'Przyjęto%' then raise; end if;
  end;

  raise notice 'M1–M5 RLS: testy przeszły';
end $$;

-- Zamknięcie trasy: podwójny zapis opakowań i gotówki, druga próba odrzucona
do $$
declare v_route uuid; v_tenant uuid; v_types jsonb; res json; s numeric;
begin
  select r.id, r.tenant_id into v_route, v_tenant from routes r where r.status = 'completed' limit 1;
  if v_route is null then raise notice 'Brak zakończonej trasy w danych testowych — pomijam test zamknięcia'; return; end if;
  perform set_config('request.jwt.claim.sub', (select user_id::text from memberships where tenant_id = v_tenant and role = 'admin' limit 1), true);
  set local role authenticated;
  select jsonb_agg(jsonb_build_object('type_id', id, 'received', 1)) into v_types from packaging_types where tenant_id = v_tenant;
  res := close_route(v_route, 10, v_types);
  if (res->>'ok')::boolean is not true then raise exception 'close_route nie zwrócił ok'; end if;
  select coalesce(sum(qty), 0) into s from packaging_movements where route_id = v_route;
  if s <> 0 then raise exception 'Ruchy opakowań przy zamknięciu nie bilansują się (suma %)', s; end if;
  select coalesce(sum(amount), 0) into s from cash_movements where route_id = v_route and reason = 'handover';
  if s <> 0 then raise exception 'Przyjęcie gotówki nie bilansuje się (suma %)', s; end if;
  begin
    perform close_route(v_route, 0, '[]'::jsonb);
    raise exception 'Druga próba zamknięcia powinna być odrzucona';
  exception when raise_exception then
    if sqlerrm not like '%CLOSE_ALREADY_CLOSED%' then raise; end if;
  end;
  reset role;
  raise notice 'Zamknięcie trasy: testy przeszły';
end $$;
