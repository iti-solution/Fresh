-- Fresh TMS — zamówienie pisane lub nagrywane przez klienta w portalu, sprawdzane przez BOK.
-- 1) Klient wysyła wiadomość (tekst, nagranie + transkrypcja) — serwer tworzy szkic z rozpoznanymi pozycjami.
-- 2) BOK (obsługa klienta) widzi szkic jako konkretne zamówienie, sprawdza kompletność i zatwierdza.
-- 3) Z decyzji BOK liczymy skuteczność rozpoznawania (jak w 0013).

-- Nagrania zamówień: prywatny bucket, dostęp wyłącznie przez serwer (podpisane linki dla BOK)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-audio', 'order-audio', false, 5242880,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a', 'audio/wav'])
on conflict (id) do nothing;

-- BOK może przyjmować i zatwierdzać zamówienia z wiadomości
do $$
declare t text;
begin
  foreach t in array array['inbound_messages', 'order_drafts', 'order_draft_lines', 'product_aliases'] loop
    execute format($p$alter policy %I on %I using (has_role(tenant_id, array['admin','dispatcher','customer_service']::member_role[])) with check (has_role(tenant_id, array['admin','dispatcher','customer_service']::member_role[]))$p$, t||'_write_staff', t);
  end loop;
end $$;

create or replace function intake_approve_draft(p_draft uuid, p_point uuid, p_date date, p_lines jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  d record;
  v_point record;
  v_order uuid;
  v_line record;
  v_product record;
  v_qty numeric;
  v_dl uuid;
  v_now timestamp := now() at time zone 'Europe/Warsaw';
begin
  select * into d from order_drafts where id = p_draft for update;
  if d.id is null or not has_role(d.tenant_id, array['admin','dispatcher','customer_service']::member_role[]) then raise exception 'INTAKE_NO_ACCESS'; end if;
  if d.status <> 'needs_review' then raise exception 'INTAKE_ALREADY_REVIEWED'; end if;

  select dp.id, dp.customer_id into v_point from delivery_points dp where dp.id = p_point and dp.tenant_id = d.tenant_id;
  if v_point.id is null then raise exception 'INTAKE_BAD_POINT'; end if;
  if p_date is null then raise exception 'INTAKE_BAD_DATE'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 150 then
    raise exception 'INTAKE_EMPTY';
  end if;

  insert into orders (tenant_id, delivery_point_id, type, delivery_date, status, readiness, source,
                      placed_by, placed_at, customer_note, external_ref)
  values (d.tenant_id, v_point.id, 'delivery', p_date, 'new', 'awaiting_warehouse', 'ai',
          auth.uid(), now(), nullif(left(trim(coalesce(p_note, '')), 500), ''),
          'AI-' || to_char(v_now, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)))
  returning id into v_order;

  -- pozycje zamówienia + wynik względem propozycji
  for v_line in select e.value as item, e.ordinality as n from jsonb_array_elements(p_lines) with ordinality e loop
    begin
      select * into v_product from products where id = (v_line.item->>'product_id')::uuid and tenant_id = d.tenant_id;
      v_qty := (v_line.item->>'qty')::numeric;
      v_dl := nullif(v_line.item->>'draft_line_id', '')::uuid;
    exception when others then
      raise exception 'INTAKE_BAD_LINE';
    end;
    if v_product.id is null then raise exception 'INTAKE_BAD_LINE'; end if;
    if v_qty is null or v_qty <= 0 or v_qty > 10000 or (v_product.unit <> 'kg' and v_qty <> trunc(v_qty)) then
      raise exception 'INTAKE_BAD_QTY';
    end if;

    insert into order_lines (tenant_id, order_id, line_no, product_id, product_code, product_name, unit, qty, unit_weight_kg, unit_price)
    values (d.tenant_id, v_order, v_line.n, v_product.id, v_product.code, v_product.name, v_product.unit,
            round(v_qty, 3), v_product.unit_weight_kg, v_product.price);

    if v_dl is not null and exists (select 1 from order_draft_lines where id = v_dl and draft_id = d.id and final_product_id is null) then
      update order_draft_lines set
        final_product_id = v_product.id,
        final_qty = round(v_qty, 3),
        outcome = case when proposed_product_id = v_product.id and proposed_qty = round(v_qty, 3) then 'accepted' else 'corrected' end
      where id = v_dl;
    else
      insert into order_draft_lines (tenant_id, draft_id, line_no, final_product_id, final_qty, outcome)
      values (d.tenant_id, d.id, 1000 + v_line.n, v_product.id, round(v_qty, 3), 'added');
    end if;
  end loop;

  -- propozycje, których człowiek nie zostawił
  update order_draft_lines set outcome = 'removed'
  where draft_id = d.id and outcome is null and final_product_id is null;

  -- słownik klienta: fraza → produkt, który zatwierdził człowiek
  insert into product_aliases as a (tenant_id, customer_id, alias_key, product_id)
  select d.tenant_id, v_point.customer_id, l.alias_key, l.final_product_id
  from order_draft_lines l
  where l.draft_id = d.id and l.final_product_id is not null and coalesce(l.alias_key, '') <> ''
  on conflict (tenant_id, customer_id, alias_key)
  do update set product_id = excluded.product_id, hits = a.hits + 1, last_used_at = now();

  update orders o set
    weight_kg   = coalesce(s.kg, 0),
    crates      = coalesce(s.crates, 0),
    order_value = s.value
  from (
    select round(sum(qty * unit_weight_kg), 2) as kg,
           sum(case when unit = 'skrz' then qty else 0 end)::int as crates,
           case when count(unit_price) > 0 then round(sum(qty * coalesce(unit_price, 0)), 2) end as value
    from order_lines where order_id = v_order
  ) s
  where o.id = v_order;

  update order_drafts set
    status = 'approved', order_id = v_order, customer_id = v_point.customer_id, delivery_point_id = v_point.id,
    delivery_date = p_date, reviewed_by = auth.uid(), reviewed_at = now()
  where id = d.id;

  return v_order;
end $$;


-- Klient widzi swoje wysłane wiadomości i ich status (bez pozycji roboczych i słownika hurtowni)
create policy drafts_portal_read on order_drafts for select using (customer_id in (select portal_customer_ids()));
create policy messages_portal_read on inbound_messages for select using (
  id in (select d.message_id from order_drafts d where d.customer_id in (select portal_customer_ids())));
