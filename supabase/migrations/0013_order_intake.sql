-- Fresh TMS — przyjęcie zamówień z wiadomości (SMS, e-mail, WhatsApp, nagranie) z obowiązkowym sprawdzeniem
-- przez człowieka. Każda pozycja pamięta, co zaproponował automat i co zatwierdził dyspozytor —
-- z tego liczymy skuteczność rozpoznawania i uczymy słownik nazw klienta.
-- Do tego: ulubione produkty klienta, promocje i opis opakowania w katalogu.

-- =========================================================
-- KATALOG: opakowanie, promocja, zdjęcie
-- =========================================================
alter table products
  add column if not exists pack_label text,                          -- „Skrzynka (18 szt.)”, „Worek 15 kg”
  add column if not exists is_special boolean not null default false, -- promocja / polecane
  add column if not exists image_url  text;

-- Ulubione produkty klienta (gwiazdka w portalu)
create table customer_favorites (
  tenant_id    uuid not null references tenants(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (customer_id, product_id)
);
create index on customer_favorites (tenant_id, customer_id);

-- Zamówienia z rozpoznanych wiadomości mają własne źródło
alter table orders drop constraint if exists orders_source_check;
alter table orders add constraint orders_source_check check (source in ('panel', 'import', 'api', 'portal', 'ai'));

-- =========================================================
-- WIADOMOŚCI I SZKICE
-- =========================================================
create type intake_channel as enum ('sms', 'email', 'whatsapp', 'voice', 'phone', 'photo', 'other');
create type draft_status as enum ('needs_review', 'approved', 'rejected');

create table inbound_messages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  channel      intake_channel not null,
  sender       text,                    -- numer telefonu, e-mail, nazwa z komunikatora
  body         text not null,           -- treść albo transkrypcja nagrania
  audio_path   text,                    -- nagranie w Storage (kanał głosowy, później)
  received_at  timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on inbound_messages (tenant_id, received_at desc);

create table order_drafts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  message_id        uuid not null references inbound_messages(id) on delete cascade,
  customer_id       uuid references customers(id),        -- rozpoznany po nadawcy albo wybrany ręcznie
  delivery_point_id uuid references delivery_points(id),
  delivery_date     date,
  note              text,                                   -- uwagi wyłapane z wiadomości
  status            draft_status not null default 'needs_review',
  parser            text not null,                          -- 'rules' | 'claude:<model>' — do porównania skuteczności
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  order_id          uuid references orders(id),
  created_at        timestamptz not null default now()
);
create index on order_drafts (tenant_id, status, created_at desc);

-- Pozycja szkicu: propozycja automatu → decyzja człowieka.
-- outcome: accepted (bez zmian) | corrected (inny produkt lub ilość) | added (automat przeoczył) | removed (zbędna)
create table order_draft_lines (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  draft_id             uuid not null references order_drafts(id) on delete cascade,
  line_no              int not null,
  phrase               text,            -- fragment wiadomości („10 skrzynek awokado”)
  alias_key            text,            -- znormalizowana nazwa produktu z tej frazy („awokado”) → słownik
  span_start           int,             -- pozycja frazy w treści (podświetlenie)
  span_end             int,
  proposed_product_id  uuid references products(id) on delete set null,
  proposed_qty         numeric(10,3),
  confidence           numeric(4,3),
  final_product_id     uuid references products(id) on delete set null,
  final_qty            numeric(10,3),
  outcome              text check (outcome in ('accepted', 'corrected', 'added', 'removed')),
  created_at           timestamptz not null default now()
);
create index on order_draft_lines (tenant_id, draft_id);

-- Słownik: jak klient nazywa produkty („pomidorki” → Pomidor koktajlowy). customer_id null = dla wszystkich klientów.
create table product_aliases (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  customer_id   uuid references customers(id) on delete cascade,
  alias_key     text not null,
  product_id    uuid not null references products(id) on delete cascade,
  hits          int not null default 1,
  last_used_at  timestamptz not null default now(),
  unique nulls not distinct (tenant_id, customer_id, alias_key)
);

-- =========================================================
-- ZATWIERDZENIE SZKICU (jedna transakcja)
-- p_lines: [{"product_id": uuid, "qty": 10, "draft_line_id": uuid|null}, …]
-- Tworzy zamówienie z pozycjami, zapisuje wynik każdej pozycji i uczy słownik klienta.
-- =========================================================
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
  if d.id is null or not has_role(d.tenant_id, array['admin','dispatcher']::member_role[]) then raise exception 'INTAKE_NO_ACCESS'; end if;
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

revoke all on function intake_approve_draft(uuid, uuid, date, jsonb, text) from public, anon;
grant execute on function intake_approve_draft(uuid, uuid, date, jsonb, text) to authenticated;

-- =========================================================
-- RLS
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['customer_favorites', 'inbound_messages', 'order_drafts', 'order_draft_lines', 'product_aliases'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select using (has_role(tenant_id, array['admin','dispatcher','viewer','customer_service','management']::member_role[]))$p$, t||'_read_staff', t);
    execute format($p$create policy %I on %I for all using (has_role(tenant_id, array['admin','dispatcher']::member_role[])) with check (has_role(tenant_id, array['admin','dispatcher']::member_role[]))$p$, t||'_write_staff', t);
  end loop;
end $$;

-- Klient zarządza swoimi ulubionymi
create policy favorites_portal_read on customer_favorites for select using (customer_id in (select portal_customer_ids()));
create policy favorites_portal_insert on customer_favorites for insert with check (
  customer_id in (select portal_customer_ids())
  and has_role(tenant_id, array['customer']::member_role[])
  and product_id in (select p.id from products p where p.tenant_id = customer_favorites.tenant_id and p.is_active));
create policy favorites_portal_delete on customer_favorites for delete using (customer_id in (select portal_customer_ids()));
