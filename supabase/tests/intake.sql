-- Test przyjęcia zamówień z wiadomości — baza testowa (po 0013 i danych demo).
-- Sprawdza: zatwierdzenie szkicu tworzy zamówienie, każda pozycja dostaje wynik
-- (trafiona / poprawiona / dodana / usunięta), słownik klienta się uczy, podgląd nie zatwierdza,
-- a klient portalu zarządza tylko swoimi ulubionymi.
insert into auth.users (id) values ('c0000000-0000-0000-0000-0000000000c1') on conflict do nothing;

do $$
declare
  v_admin uuid; v_tenant uuid; v_customer uuid; v_other uuid; v_point uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  v_msg uuid; v_draft uuid; l1 uuid; l2 uuid; l3 uuid; v_order uuid; n int;
begin
  select m.user_id, m.tenant_id into v_admin, v_tenant from memberships m where m.role = 'admin' order by m.tenant_id limit 1;
  select c.id into v_customer from customers c join delivery_points p on p.customer_id = c.id
    where c.tenant_id = v_tenant order by c.id limit 1;
  select id into v_other from customers where tenant_id = v_tenant and id <> v_customer limit 1;
  select id into v_point from delivery_points where customer_id = v_customer limit 1;

  insert into products (tenant_id, code, name, unit, unit_weight_kg, price) values (v_tenant, 'T-AWO', 'Awokado test', 'skrz', 4, 80) returning id into p1;
  insert into products (tenant_id, code, name, unit, unit_weight_kg, price) values (v_tenant, 'T-BAN', 'Banany test', 'kg', 1, 6) returning id into p2;
  insert into products (tenant_id, code, name, unit, unit_weight_kg, price) values (v_tenant, 'T-BAZ', 'Bazylia test', 'pecz', 0.1, 3) returning id into p3;
  insert into products (tenant_id, code, name, unit, unit_weight_kg, price) values (v_tenant, 'T-POM', 'Pomidor test', 'kg', 1, 9) returning id into p4;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  insert into inbound_messages (tenant_id, channel, sender, body)
  values (v_tenant, 'sms', '+48 600 100 200', 'Na jutro 10 skrzynek awokado, 5 kg bananów, 6 pęczków bazylii, i ziemniaki') returning id into v_msg;
  insert into order_drafts (tenant_id, message_id, customer_id, delivery_point_id, parser)
  values (v_tenant, v_msg, v_customer, v_point, 'rules') returning id into v_draft;
  insert into order_draft_lines (tenant_id, draft_id, line_no, phrase, alias_key, proposed_product_id, proposed_qty, confidence)
  values (v_tenant, v_draft, 1, '10 skrzynek awokado', 'awokado', p1, 10, 0.9) returning id into l1;
  insert into order_draft_lines (tenant_id, draft_id, line_no, phrase, alias_key, proposed_product_id, proposed_qty, confidence)
  values (v_tenant, v_draft, 2, '5 kg bananów', 'banan', p2, 5, 0.9) returning id into l2;
  insert into order_draft_lines (tenant_id, draft_id, line_no, phrase, alias_key, proposed_product_id, proposed_qty, confidence)
  values (v_tenant, v_draft, 3, 'ziemniaki', 'ziemniak', p4, 1, 0.3) returning id into l3;

  -- człowiek: awokado OK, banany 5 → 6, „ziemniaki” to nie pomidor (usuwa), dodaje bazylię
  v_order := intake_approve_draft(v_draft, v_point, (now() at time zone 'Europe/Warsaw')::date + 1, jsonb_build_array(
    jsonb_build_object('product_id', p1, 'qty', 10, 'draft_line_id', l1),
    jsonb_build_object('product_id', p2, 'qty', 6, 'draft_line_id', l2),
    jsonb_build_object('product_id', p3, 'qty', 6)), 'zostawić w chłodni');

  select count(*) into n from orders where id = v_order and source = 'ai' and status = 'new' and weight_kg = 46.6 and crates = 10
    and order_value = 854 and customer_note = 'zostawić w chłodni';
  if n <> 1 then raise exception 'Zamówienie z AI zapisane z błędnymi sumami'; end if;
  if (select count(*) from order_lines where order_id = v_order) <> 3 then raise exception 'Zamówienie powinno mieć 3 pozycje'; end if;
  if (select outcome from order_draft_lines where id = l1) <> 'accepted' then raise exception 'Awokado powinno być trafione'; end if;
  if (select outcome from order_draft_lines where id = l2) <> 'corrected' then raise exception 'Banany powinny być poprawione'; end if;
  if (select outcome from order_draft_lines where id = l3) <> 'removed' then raise exception 'Ziemniaki powinny być usunięte'; end if;
  if (select count(*) from order_draft_lines where draft_id = v_draft and outcome = 'added') <> 1 then raise exception 'Bazylia powinna być dodana'; end if;
  if (select status from order_drafts where id = v_draft) <> 'approved' then raise exception 'Szkic powinien być zatwierdzony'; end if;
  -- słownik: tylko pozycje zatwierdzone z frazą
  if (select product_id from product_aliases where tenant_id = v_tenant and customer_id = v_customer and alias_key = 'awokado') <> p1 then
    raise exception 'Słownik nie nauczył się „awokado”';
  end if;
  if exists (select 1 from product_aliases where tenant_id = v_tenant and alias_key = 'ziemniak') then
    raise exception 'Usunięta pozycja nie może uczyć słownika';
  end if;
  begin
    perform intake_approve_draft(v_draft, v_point, (now() at time zone 'Europe/Warsaw')::date + 1,
      jsonb_build_array(jsonb_build_object('product_id', p1, 'qty', 1)), null);
    raise exception 'Drugie zatwierdzenie powinno być odrzucone';
  exception when others then if sqlerrm <> 'INTAKE_ALREADY_REVIEWED' then raise; end if;
  end;
  -- ułamek skrzynki odrzucony
  insert into order_drafts (tenant_id, message_id, parser) values (v_tenant, v_msg, 'rules') returning id into v_draft;
  begin
    perform intake_approve_draft(v_draft, v_point, (now() at time zone 'Europe/Warsaw')::date + 1,
      jsonb_build_array(jsonb_build_object('product_id', p1, 'qty', 1.5)), null);
    raise exception 'Ułamek skrzynki powinien być odrzucony';
  exception when others then if sqlerrm <> 'INTAKE_BAD_QTY' then raise; end if;
  end;
  reset role;

  -- klient portalu: ulubione tylko swoje
  insert into memberships (tenant_id, user_id, role) values (v_tenant, 'c0000000-0000-0000-0000-0000000000c1', 'customer');
  insert into customer_portal_users (tenant_id, user_id, customer_id, login_email)
  values (v_tenant, 'c0000000-0000-0000-0000-0000000000c1', v_customer, 'ulubione@klient.example.com');
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c1', true);
  set local role authenticated;
  insert into customer_favorites (tenant_id, customer_id, product_id) values (v_tenant, v_customer, p1);
  if (select count(*) from customer_favorites) <> 1 then raise exception 'Klient powinien widzieć swoje ulubione'; end if;
  begin
    insert into customer_favorites (tenant_id, customer_id, product_id) values (v_tenant, v_other, p1);
    raise exception 'Klient nie może dodać ulubionych innemu klientowi';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from order_drafts;
  if n <> 0 then raise exception 'Klient nie może widzieć szkiców hurtowni'; end if;
  select count(*) into n from product_aliases;
  if n <> 0 then raise exception 'Klient nie może widzieć słownika hurtowni'; end if;
  delete from customer_favorites where product_id = p1;
  if (select count(*) from customer_favorites) <> 0 then raise exception 'Klient powinien móc usunąć ulubiony'; end if;
  reset role;

  raise notice 'Przyjęcie zamówień: wszystkie testy przeszły';
end $$;
