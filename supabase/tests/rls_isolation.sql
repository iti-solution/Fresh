-- Test izolacji danych (RLS) — uruchamiany na LOKALNEJ bazie testowej, nigdy na produkcji.
-- Wymaga: migracje 0001–0004 oraz atrapa auth (auth.users + auth.uid() czytające request.jwt.claim.sub).
-- Każde sprawdzenie kończy się błędem (raise exception), jeśli izolacja nie działa.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id) values
  ('a0000000-0000-0000-0000-00000000000a'),  -- admin firmy A
  ('b0000000-0000-0000-0000-00000000000b'),  -- BOK firmy A
  ('c0000000-0000-0000-0000-00000000000c')   -- obcy użytkownik
on conflict do nothing;

-- Admin A zakłada firmę demo
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000a';
set role authenticated;
select create_demo_tenant();
reset role;

-- BOK dołączony do firmy A
insert into memberships (tenant_id, user_id, role)
select t.id, 'b0000000-0000-0000-0000-00000000000b', 'customer_service'
from tenants t join memberships m on m.tenant_id = t.id
where m.user_id = 'a0000000-0000-0000-0000-00000000000a';

do $$
declare n int; expected int;
begin
  select count(*) into expected from delivery_points;
  -- 1. BOK widzi punkty firmy A
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  set local role authenticated;
  select count(*) into n from delivery_points;
  if n <> expected or n = 0 then raise exception 'BOK powinien widzieć % punktów, widzi %', expected, n; end if;
  -- 2. BOK nie może zmieniać danych
  update delivery_points set name = 'X';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'BOK nie powinien móc edytować punktów (zmieniono %)', n; end if;
  reset role;

  -- 3. Obcy użytkownik nie widzi nic z firmy A
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', true);
  set local role authenticated;
  select count(*) into n from delivery_points;
  if n <> 0 then raise exception 'Obcy użytkownik widzi % punktów firmy A', n; end if;
  select count(*) into n from carriers;
  if n <> 0 then raise exception 'Obcy użytkownik widzi przewoźników firmy A'; end if;
  reset role;

  -- 4. Admin A może dodać przewoźnika i uwagę tymczasową
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  insert into carriers (tenant_id, name) select tenant_id, 'Trans-Test' from memberships limit 1;
  insert into delivery_point_notes (tenant_id, delivery_point_id, text, valid_to)
    select tenant_id, id, 'Remont wjazdu', current_date + 5 from delivery_points limit 1;
  reset role;

  raise notice 'RLS: wszystkie testy izolacji przeszły';
end $$;
