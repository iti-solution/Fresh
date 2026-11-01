-- Test portalu zamówień klienta — LOKALNA baza testowa (po migracjach 0011–0012 i danych demo).
-- Klient widzi tylko swoje oddziały, zamówienia i katalog swojej hurtowni; składa i anuluje zamówienie
-- wyłącznie przez funkcje portal_*; nie może pisać do tabel bezpośrednio.
insert into auth.users (id) values ('c0000000-0000-0000-0000-00000000000c') on conflict do nothing;
insert into auth.users (id) values ('c0000000-0000-0000-0000-0000000000cc') on conflict do nothing;

do $$
declare
  v_tenant uuid; v_customer uuid; v_other_customer uuid; v_point uuid; v_product uuid; v_kg_product uuid;
  v_date date; v_order uuid; n int; d date;
begin
  select c.tenant_id, c.id into v_tenant, v_customer
  from customers c join delivery_points p on p.customer_id = c.id and p.is_active
  where c.is_active group by c.tenant_id, c.id order by c.tenant_id, c.id limit 1;
  select id into v_other_customer from customers where tenant_id = v_tenant and id <> v_customer limit 1;
  select id into v_point from delivery_points where customer_id = v_customer and is_active limit 1;

  insert into products (tenant_id, code, name, category, unit, unit_weight_kg, price)
  values (v_tenant, 'T-SKRZ', 'Pomidor test (skrzynka)', 'warzywa', 'skrz', 6, 42.50) returning id into v_product;
  insert into products (tenant_id, code, name, category, unit, unit_weight_kg, price)
  values (v_tenant, 'T-KG', 'Cebula test', 'warzywa', 'kg', 1, 2.10) returning id into v_kg_product;
  insert into products (tenant_id, code, name, unit, is_active) values (v_tenant, 'T-OFF', 'Wycofany', 'kg', false);

  insert into memberships (tenant_id, user_id, role) values (v_tenant, 'c0000000-0000-0000-0000-00000000000c', 'customer');
  insert into customer_portal_users (tenant_id, user_id, customer_id, login_email)
  values (v_tenant, 'c0000000-0000-0000-0000-00000000000c', v_customer, 'test@klient.example.com');
  -- drugi klient tej samej hurtowni
  insert into memberships (tenant_id, user_id, role) values (v_tenant, 'c0000000-0000-0000-0000-0000000000cc', 'customer');
  insert into customer_portal_users (tenant_id, user_id, customer_id, login_email)
  values (v_tenant, 'c0000000-0000-0000-0000-0000000000cc', v_other_customer, 'inny@klient.example.com');

  -- pierwszy dozwolony termin dla oddziału
  for i in 0..14 loop
    d := (now() at time zone 'Europe/Warsaw')::date + i;
    if portal_date_allowed(v_point, d) then v_date := d; exit; end if;
  end loop;
  if v_date is null then raise exception 'Brak dozwolonej daty dla oddziału testowego'; end if;
  if portal_date_allowed(v_point, (now() at time zone 'Europe/Warsaw')::date - 1) then raise exception 'Data wsteczna nie może być dozwolona'; end if;

  -- ===== klient =====
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', true);
  set local role authenticated;

  select count(*) into n from customers;
  if n <> 1 then raise exception 'Klient powinien widzieć tylko siebie, widzi % klientów', n; end if;
  select count(*) into n from delivery_points where customer_id <> v_customer;
  if n <> 0 then raise exception 'Klient widzi cudze oddziały'; end if;
  select count(*) into n from products where tenant_id <> v_tenant or not is_active;
  if n <> 0 then raise exception 'Klient widzi produkty nieaktywne lub innej firmy'; end if;
  select count(*) into n from routes;
  if n <> 0 then raise exception 'Klient nie powinien widzieć tras'; end if;
  select count(*) into n from drivers;
  if n <> 0 then raise exception 'Klient nie powinien widzieć kierowców'; end if;

  -- bezpośredni zapis zablokowany
  begin
    insert into orders (tenant_id, delivery_point_id, delivery_date) values (v_tenant, v_point, v_date);
    raise exception 'Klient nie może wstawiać zamówień bezpośrednio';
  exception when insufficient_privilege then null;
  end;

  -- złe dane
  begin
    perform portal_place_order(v_point, v_date, '[]'::jsonb, null);
    raise exception 'Puste zamówienie powinno być odrzucone';
  exception when others then if sqlerrm <> 'PORTAL_EMPTY' then raise; end if;
  end;
  begin
    perform portal_place_order(v_point, v_date, jsonb_build_array(jsonb_build_object('product_id', v_product, 'qty', 1.5)), null);
    raise exception 'Ułamek skrzynki powinien być odrzucony';
  exception when others then if sqlerrm <> 'PORTAL_BAD_QTY' then raise; end if;
  end;
  begin
    perform portal_place_order(v_point, (now() at time zone 'Europe/Warsaw')::date - 1,
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'qty', 1)), null);
    raise exception 'Data wsteczna powinna być odrzucona';
  exception when others then if sqlerrm <> 'PORTAL_DATE_NOT_ALLOWED' then raise; end if;
  end;

  -- poprawne zamówienie: 3 skrzynki × 6 kg + 12,5 kg cebuli
  v_order := portal_place_order(v_point, v_date, jsonb_build_array(
    jsonb_build_object('product_id', v_product, 'qty', 3),
    jsonb_build_object('product_id', v_kg_product, 'qty', 12.5)), '  Proszę od zaplecza  ');
  select count(*) into n from orders where id = v_order and source = 'portal' and status = 'new'
    and weight_kg = 30.5 and crates = 3 and order_value = 153.75 and customer_note = 'Proszę od zaplecza'
    and readiness = 'awaiting_warehouse';
  if n <> 1 then raise exception 'Zamówienie z portalu zapisane z błędnymi sumami'; end if;
  select count(*) into n from order_lines where order_id = v_order;
  if n <> 2 then raise exception 'Klient powinien widzieć 2 pozycje, widzi %', n; end if;
  select count(*) into n from orders o join delivery_points p on p.id = o.delivery_point_id where p.customer_id <> v_customer;
  if n <> 0 then raise exception 'Klient widzi cudze zamówienia'; end if;

  reset role;

  -- ===== inny klient nie widzi i nie anuluje =====
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000cc', true);
  set local role authenticated;
  select count(*) into n from orders where id = v_order;
  if n <> 0 then raise exception 'Inny klient widzi cudze zamówienie'; end if;
  begin
    perform portal_cancel_order(v_order);
    raise exception 'Inny klient nie może anulować';
  exception when others then if sqlerrm <> 'PORTAL_NO_ACCESS' then raise; end if;
  end;
  begin
    perform portal_place_order(v_point, v_date, jsonb_build_array(jsonb_build_object('product_id', v_product, 'qty', 1)), null);
    raise exception 'Inny klient nie może zamawiać na cudzy oddział';
  exception when others then if sqlerrm <> 'PORTAL_NO_ACCESS' then raise; end if;
  end;
  reset role;

  -- ===== właściciel anuluje =====
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', true);
  set local role authenticated;
  perform portal_cancel_order(v_order);
  if (select status from orders where id = v_order) <> 'cancelled' then raise exception 'Anulowanie nie zadziałało'; end if;
  begin
    perform portal_cancel_order(v_order);
    raise exception 'Drugie anulowanie powinno być odrzucone';
  exception when others then if sqlerrm <> 'PORTAL_CANNOT_CANCEL' then raise; end if;
  end;
  reset role;

  -- wyłączony dostęp = brak widoczności
  update customer_portal_users set is_active = false where user_id = 'c0000000-0000-0000-0000-00000000000c';
  set local role authenticated;
  select count(*) into n from orders;
  if n <> 0 then raise exception 'Po wyłączeniu dostępu klient nadal widzi zamówienia'; end if;
  reset role;

  raise notice 'Portal klienta: wszystkie testy przeszły';
end $$;
