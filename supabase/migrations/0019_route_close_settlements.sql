-- Driver — M5: księga opakowań i gotówki przy zamknięciu trasy, korekty, rozliczenia kierowców.
-- Księgi są append-only: zamknięcie i korekty tylko dopisują ruchy (podwójny zapis: każda strona ± ta sama ilość).
-- Strona „depot” = magazyn firmy (party_id = id firmy), strona „office” = kasa biura.

alter table packaging_movements add column if not exists route_id uuid references routes(id);
create index if not exists packaging_movements_route_idx on packaging_movements (tenant_id, route_id);
create index if not exists packaging_movements_party_idx on packaging_movements (tenant_id, party_type, party_id, created_at);

alter table routes add column if not exists close_report jsonb;  -- co sprawdzono i przyjęto przy zamknięciu

alter table driver_settlements
  add column if not exists approved_at timestamptz,
  add column if not exists exported_at timestamptz,
  add column if not exists note text;
create unique index if not exists driver_settlements_period_uq on driver_settlements (tenant_id, driver_id, period_start, period_end);

alter table driver_settlement_lines
  add column if not exists code       text,               -- daily_rate | per_km | … | manual
  add column if not exists label      text,
  add column if not exists is_manual  boolean not null default false,
  add column if not exists created_by uuid references auth.users(id);

-- Zatwierdzone rozliczenie jest zamrożone (tylko odczyt) — zmiany wymagają cofnięcia zatwierdzenia przez admina.
create or replace function settlement_lines_guard() returns trigger language plpgsql as $$
declare v_status settlement_status;
begin
  select status into v_status from driver_settlements where id = coalesce(new.settlement_id, old.settlement_id);
  if v_status in ('approved', 'exported') then raise exception 'Rozliczenie jest zatwierdzone — najpierw cofnij zatwierdzenie'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists settlement_lines_guard on driver_settlement_lines;
create trigger settlement_lines_guard before insert or update or delete on driver_settlement_lines
  for each row execute function settlement_lines_guard();

-- =========================================================
-- ZAMKNIĘCIE TRASY (M5.5) — atomowo: ruchy opakowań, przyjęcie gotówki, status.
-- p_packaging: [{ "type_id": "...", "received": 12 }] — ile opakowań kierowca zdał do magazynu.
-- =========================================================
create or replace function close_route(
  p_route uuid,
  p_cash_received numeric,
  p_packaging jsonb,
  p_odometer_end int default null,
  p_note text default null,
  p_report jsonb default '{}'::jsonb
) returns json language plpgsql as $$
declare
  r record;
  t record;
  v_out int;
  v_recv int;
  v_group uuid;
  v_cash numeric;
  v_open int;
begin
  select * into r from routes where id = p_route for update;
  if r.id is null or not has_role(r.tenant_id, array['admin','dispatcher']::member_role[]) then raise exception 'CLOSE_NO_ACCESS'; end if;
  if r.status = 'closed' then raise exception 'CLOSE_ALREADY_CLOSED'; end if;
  if r.status not in ('in_progress', 'completed') then raise exception 'CLOSE_NOT_STARTED'; end if;
  if r.driver_id is null then raise exception 'CLOSE_NO_DRIVER'; end if;

  -- kierowca nie zakończył zmiany w telefonie: dyspozytor wpisuje licznik i zamyka za niego
  if r.status = 'in_progress' then
    if p_odometer_end is null or (r.odometer_start is not null and p_odometer_end < r.odometer_start) then raise exception 'CLOSE_ODOMETER'; end if;
    update routes set odometer_end = p_odometer_end, actual_km = p_odometer_end - coalesce(r.odometer_start, p_odometer_end) where id = p_route;
    update route_stops set status = 'skipped' where route_id = p_route and status in ('pending', 'arrived', 'in_progress');
  end if;
  select count(*) into v_open from route_stops where route_id = p_route and status in ('pending', 'arrived', 'in_progress');

  -- opakowania: załadunek (magazyn → kierowca) = to, co kierowca wydał klientom; zdanie (kierowca → magazyn) = przyjęte
  for t in select id from packaging_types where tenant_id = r.tenant_id loop
    select coalesce(-sum(m.qty), 0) into v_out
    from packaging_movements m join route_stops s on s.id = m.stop_id
    where s.route_id = p_route and m.party_type = 'driver' and m.reason = 'issue' and m.packaging_type_id = t.id;
    if v_out > 0 and not exists (select 1 from packaging_movements where route_id = p_route and reason = 'load' and packaging_type_id = t.id) then
      v_group := gen_random_uuid();
      insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, route_id, note, created_by) values
        (r.tenant_id, v_group, t.id, 'depot', r.tenant_id, -v_out, 'load', p_route, 'załadunek na trasę', auth.uid()),
        (r.tenant_id, v_group, t.id, 'driver', r.driver_id, v_out, 'load', p_route, 'załadunek na trasę', auth.uid());
    end if;
    select coalesce((e.value->>'received')::int, 0) into v_recv
    from jsonb_array_elements(coalesce(p_packaging, '[]'::jsonb)) e where (e.value->>'type_id')::uuid = t.id;
    if coalesce(v_recv, 0) < 0 then raise exception 'CLOSE_BAD_QTY'; end if;
    if coalesce(v_recv, 0) > 0 then
      v_group := gen_random_uuid();
      insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, route_id, note, created_by) values
        (r.tenant_id, v_group, t.id, 'driver', r.driver_id, -v_recv, 'handover', p_route, 'zdane do magazynu', auth.uid()),
        (r.tenant_id, v_group, t.id, 'depot', r.tenant_id, v_recv, 'handover', p_route, 'zdane do magazynu', auth.uid());
    end if;
  end loop;

  -- gotówka: przyjęta w kasie od kierowcy
  v_cash := round(coalesce(p_cash_received, 0), 2);
  if v_cash < 0 then raise exception 'CLOSE_BAD_CASH'; end if;
  if v_cash > 0 then
    v_group := gen_random_uuid();
    insert into cash_movements (tenant_id, movement_group, party_type, party_id, amount, reason, route_id, note, created_by) values
      (r.tenant_id, v_group, 'driver', r.driver_id, -v_cash, 'handover', p_route, 'przyjęcie gotówki przy zamknięciu trasy', auth.uid()),
      (r.tenant_id, v_group, 'office', null, v_cash, 'handover', p_route, 'przyjęcie gotówki przy zamknięciu trasy', auth.uid());
  end if;

  update routes set status = 'closed', closed_at = now(), closed_by = auth.uid(),
    close_report = coalesce(p_report, '{}'::jsonb) || jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''), 'cash_received', v_cash, 'packaging', coalesce(p_packaging, '[]'::jsonb))
  where id = p_route;

  insert into audit_log (tenant_id, user_id, entity, entity_id, action, diff)
  values (r.tenant_id, auth.uid(), 'route', p_route, 'close', jsonb_build_object('cash_received', v_cash, 'packaging', p_packaging, 'note', p_note));

  return json_build_object('ok', true, 'driver_id', r.driver_id, 'route_date', r.route_date, 'open_stops', v_open);
end $$;

revoke all on function close_route(uuid, numeric, jsonb, int, text, jsonb) from public, anon;
grant execute on function close_route(uuid, numeric, jsonb, int, text, jsonb) to authenticated;
