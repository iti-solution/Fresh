-- Fresh — firma demo dopasowana do pilota (okolice Krakowa) + reset firmy demo
-- Zastępuje create_demo_tenant() z 0002. Bez współrzędnych GPS (mapy/pinezki odłożone — decyzja 2026-10-25).

create or replace function create_demo_tenant()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid;
  v_depot    uuid;
  v_carrier  uuid;
  v_cust     uuid;
  v_point    uuid;
  v_tpl      uuid;
  v_area     int;
  i          int;
  b          int;
  w          int;
  n          int := 0;   -- numer klienta
  p          int := 0;   -- numer oddziału
  v_open     time;
  v_branches int;
  v_date     date;
  v_vehicles uuid[] := '{}';
  v_drivers  uuid[] := '{}';
  v_id       uuid;
  -- kierunek, miasto, kod pocztowy
  areas text[][] := array[
    array['Kraków Zachód',              'Kraków',      '30-198'],
    array['Kraków Wschód – Nowa Huta',  'Kraków',      '31-900'],
    array['Kraków Południe – Podgórze', 'Kraków',      '30-415'],
    array['Wieliczka – Niepołomice',    'Wieliczka',   '32-020'],
    array['Zakopane',                   'Zakopane',    '34-500'],
    array['Tarnów',                     'Tarnów',      '33-100']
  ];
  categories text[] := array['Restauracja', 'Hotel', 'Bistro', 'Pizzeria', 'Stołówka', 'Catering', 'Kawiarnia', 'Pensjonat'];
  reps       text[] := array['Anna Zielińska', 'Michał Krawczyk', 'Ewa Dąbrowska'];
  drv_fn     text[] := array['Jan', 'Piotr', 'Tomasz', 'Marek', 'Krzysztof', 'Paweł', 'Adam'];
  drv_ln     text[] := array['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zając'];
  regs       text[] := array['KR 4F201', 'KR 7H330', 'KR 2B118', 'KR 9K004', 'KR 5M712', 'KR 3P550', 'KTA 61022'];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select t.id into v_tenant
  from tenants t join memberships m on m.tenant_id = t.id
  where m.user_id = v_uid and (t.settings->>'is_demo')::boolean is true
  limit 1;
  if v_tenant is not null then return v_tenant; end if;

  insert into tenants (name, settings)
  values ('Hurtownia Demo Kraków',
          jsonb_build_object('is_demo', true, 'cost_per_km_pln', 1.6, 'driver_cost_per_hour_pln', 45,
                             'default_service_minutes', 10, 'packaging_overdue_days', 30))
  returning id into v_tenant;
  insert into memberships (tenant_id, user_id, role) values (v_tenant, v_uid, 'admin');

  insert into depots (tenant_id, name, address)
  values (v_tenant, 'Magazyn główny', 'ul. Przykładowa 1, 32-050 Skawina')
  returning id into v_depot;

  insert into carriers (tenant_id, name, nip, phone)
  values (v_tenant, 'Trans-Przewóz (demo)', '0000000000', '+48 600 200 300')
  returning id into v_carrier;

  insert into packaging_types (tenant_id, code, name, deposit_value) values
    (v_tenant, 'EUR',      'Paleta EURO',         60),
    (v_tenant, 'SKRZ-PL',  'Skrzynka plastikowa', 12),
    (v_tenant, 'SKRZ-PAL', 'Skrzyniopaleta',      180);

  -- 7 pojazdów (ostatni obcy, przewoźnik) i 7 kierowców
  for i in 1..7 loop
    insert into vehicles (tenant_id, registration, name, vehicle_type, body_type,
                          capacity_pallets, capacity_kg, capacity_m3, capacity_crates,
                          is_own, carrier_id, cost_per_km, driver_cost_per_day, fixed_cost_per_day)
    values (v_tenant, regs[i], 'Auto ' || i,
            case when i <= 2 then 'ciężarowy 7,5 t' when i <= 5 then 'dostawczy 3,5 t' else 'dostawczy 3,5 t' end,
            case when i <= 5 then 'chłodnia' else 'izoterma' end,
            case when i <= 2 then 16 else 12 end,
            case when i <= 2 then 4200 else 1300 end,
            case when i <= 2 then 38 else 20 end,
            case when i <= 2 then 160 else 90 end,
            i <> 7, case when i = 7 then v_carrier end,
            case when i <= 2 then 2.10 else 1.40 end, 320, 90)
    returning id into v_id;
    v_vehicles := v_vehicles || v_id;

    insert into drivers (tenant_id, first_name, last_name, phone, employment_type, default_vehicle_id)
    values (v_tenant, drv_fn[i], drv_ln[i], '+48 600 000 0' || lpad(i::text, 2, '0'),
            case when i = 6 then 'dowózkowy (B2B)' when i = 7 then 'przewoźnik' else 'etat (UoP)' end, v_id)
    returning id into v_id;
    v_drivers := v_drivers || v_id;
  end loop;
  for i in 1..7 loop
    update vehicles set default_driver_id = v_drivers[i] where id = v_vehicles[i];
  end loop;

  -- najbliższy dzień roboczy (bez niedzieli) — na niego powstają zamówienia
  v_date := current_date + 1;
  if extract(isodow from v_date) = 7 then v_date := v_date + 1; end if;

  -- 6 kierunków × 6 klientów; co trzeci klient ma 2 oddziały (np. kuchnia + bar)
  for v_area in 1..6 loop
    insert into route_templates (tenant_id, name, weekdays, depot_id, default_vehicle_id, default_driver_id, planned_start)
    values (v_tenant, areas[v_area][1], '{1,2,3,4,5,6}', v_depot,
            v_vehicles[v_area], v_drivers[v_area],
            case when v_area in (5, 6) then '05:00'::time else '05:30'::time end)
    returning id into v_tpl;

    for i in 1..6 loop
      n := n + 1;
      insert into customers (tenant_id, external_code, name, category, sales_rep_name, sales_rep_phone)
      values (v_tenant, 'K' || lpad((100 + n)::text, 4, '0'),
              categories[1 + (n % 8)] || ' Demo ' || lpad(n::text, 2, '0'),
              categories[1 + (n % 8)],
              reps[1 + (n % 3)], '+48 600 100 10' || (1 + (n % 3)))
      returning id into v_cust;

      v_branches := case when n % 3 = 0 then 2 else 1 end;
      for b in 1..v_branches loop
        p := p + 1;
        insert into delivery_points (tenant_id, customer_id, external_code, name, branch_type,
                                     address_line, postal_code, city, geocode_status, service_minutes,
                                     delivery_weekdays, active_from, active_to, contact_phone,
                                     call_instructions, access_instructions, floor, unloading_zone)
        values (v_tenant, v_cust, 'P' || lpad(p::text, 4, '0'),
                case when v_branches = 1 then 'Lokal główny' when b = 1 then 'Kuchnia' else 'Bar' end,
                (case when v_branches = 2 and b = 1 then 'kitchen' when v_branches = 2 then 'bar'
                      when categories[1 + (n % 8)] = 'Hotel' then 'hotel'
                      when categories[1 + (n % 8)] in ('Stołówka', 'Catering') then 'kitchen'
                      else 'restaurant' end)::branch_type,
                'ul. Przykładowa ' || (10 + p), areas[v_area][3], areas[v_area][2], 'pending',
                8 + (p % 3) * 5,
                case when p % 7 = 0 then '{1,3,5}'::smallint[] else '{1,2,3,4,5,6}'::smallint[] end,
                case when p % 17 = 0 then make_date(extract(year from current_date)::int, 5, 1) end,
                case when p % 17 = 0 then make_date(extract(year from current_date)::int, 9, 30) end,
                '+48 12 000 0' || lpad(p::text, 3, '0'),
                case p % 3 when 0 then 'Dzwonić 10 min przed, kuchnia' when 1 then 'Dzwonić do kierownika zmiany' else null end,
                case p % 4 when 0 then 'Brama od zaplecza, kod 1234' when 1 then 'Wjazd od parkingu' else null end,
                case p % 5 when 0 then 'poziom −1 (winda)' else 'parter' end,
                case p % 2 when 0 then 'rampa' else 'wejście kuchenne' end)
        returning id into v_point;

        -- okna jak u pilota: 6–8, 8–10, 12–14
        v_open := case p % 3 when 0 then '06:00'::time when 1 then '08:00'::time else '12:00'::time end;
        for w in 1..6 loop
          insert into delivery_point_windows (tenant_id, delivery_point_id, weekday, opens_at, closes_at)
          values (v_tenant, v_point, w, v_open, v_open + interval '2 hours');
        end loop;

        insert into route_template_points (tenant_id, template_id, delivery_point_id, sequence)
        values (v_tenant, v_tpl, v_point, (i - 1) * 2 + b);

        -- uwagi tymczasowe: kilka aktualnych i jedna wygasła (nie powinna być widoczna jako aktywna)
        if p % 11 = 1 then
          insert into delivery_point_notes (tenant_id, delivery_point_id, text, valid_from, valid_to)
          values (v_tenant, v_point,
                  case (p / 11) % 3 when 0 then 'Remont wjazdu — rozładunek od strony parkingu'
                                    when 1 then 'Zmiana godzin: przyjęcia od 9:00'
                                    else 'Zamknięta droga dojazdowa — objazd przez ul. boczną' end,
                  current_date - 1, current_date + 6);
        elsif p = 5 then
          insert into delivery_point_notes (tenant_id, delivery_point_id, text, valid_from, valid_to)
          values (v_tenant, v_point, 'Inwentaryzacja — brak przyjęć (zakończona)', current_date - 10, current_date - 3);
        end if;

        -- zamówienie na najbliższy dzień roboczy, jeśli oddział tego dnia przyjmuje
        if extract(isodow from v_date)::smallint = any (case when p % 7 = 0 then '{1,3,5}'::smallint[] else '{1,2,3,4,5,6}'::smallint[] end)
           and p % 17 <> 0 then
          insert into orders (tenant_id, external_ref, delivery_point_id, type, delivery_date, priority,
                              pallets, weight_kg, volume_m3, crates, order_value, notes_sales, notes_logistics,
                              readiness, status)
          values (v_tenant, 'ZK/' || to_char(v_date, 'MM') || '/' || lpad((4500 + p)::text, 4, '0'), v_point, 'delivery', v_date,
                  case when p % 13 = 0 then 1 else 0 end,
                  case when p % 4 = 0 then 1 else 0 end,
                  -- typowo 20–180 kg; Tarnów celowo cięższy, żeby było widać alarm przeciążenia
                  20 + (p * 29) % 160 + case when v_area = 6 then 120 else 0 end,
                  round((0.2 + ((p * 13) % 20) / 10.0)::numeric, 2),
                  2 + (p * 7) % 18,
                  round((350 + (p * 173) % 2600)::numeric, 2),
                  case when p % 6 = 0 then 'Sałaty osobno, nie na dnie palety' when p % 9 = 0 then 'Klient prosi o banany mniej dojrzałe' end,
                  case when p % 8 = 0 then 'Dostawa do 7:30 — otwarcie kuchni' end,
                  (case when p % 4 = 1 then 'awaiting_warehouse' else 'ready' end)::order_readiness,
                  'new');
        end if;
      end loop;
    end loop;
  end loop;

  -- święta (wszystkie oddziały)
  insert into delivery_point_exceptions (tenant_id, delivery_point_id, date, is_closed, reason)
  select v_tenant, null, d, true, r
  from (values
    (make_date(extract(year from current_date)::int, 11, 1),  'Wszystkich Świętych'),
    (make_date(extract(year from current_date)::int, 11, 11), 'Święto Niepodległości'),
    (make_date(extract(year from current_date)::int, 12, 24), 'Wigilia'),
    (make_date(extract(year from current_date)::int, 12, 25), 'Boże Narodzenie'),
    (make_date(extract(year from current_date)::int, 12, 26), 'Drugi dzień świąt')
  ) as h(d, r);

  return v_tenant;
end $$;

-- Usuwa firmy demo zalogowanego użytkownika (tylko te, w których jest adminem) i zakłada nową
create or replace function reset_demo_tenant()
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from tenants t
  where (t.settings->>'is_demo')::boolean is true
    and exists (select 1 from memberships m where m.tenant_id = t.id and m.user_id = auth.uid() and m.role = 'admin');
  return create_demo_tenant();
end $$;

revoke all on function reset_demo_tenant() from public, anon;
grant execute on function reset_demo_tenant() to authenticated;
