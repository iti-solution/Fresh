-- Fresh — onboarding firmy i firma demo
-- create_tenant(name): zalogowany użytkownik zakłada firmę i zostaje jej adminem
-- create_demo_tenant(): zakłada "Hurtownię Demo Bielsko" z danymi przykładowymi (1 na użytkownika)

create or replace function create_tenant(p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'tenant name required';
  end if;
  insert into tenants (name) values (trim(p_name)) returning id into v_tenant;
  insert into memberships (tenant_id, user_id, role) values (v_tenant, auth.uid(), 'admin');
  return v_tenant;
end $$;

create or replace function create_demo_tenant()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_depot   uuid;
  v_cust    uuid;
  v_point   uuid;
  v_tpl     uuid;
  i         int;
  w         int;
  v_area    int;
  v_open    time;
  -- obszary: nazwa, miasto, kod, szerokość, długość
  areas     text[][] := array[
    array['Bielsko Centrum',        'Bielsko-Biała',       '43-300', '49.8224', '19.0444'],
    array['Bielsko Północ',         'Bielsko-Biała',       '43-300', '49.8420', '19.0300'],
    array['Żywiec',                 'Żywiec',              '34-300', '49.6856', '19.1925'],
    array['Szczyrk – Wilkowice',    'Szczyrk',             '43-370', '49.7180', '19.0300'],
    array['Czechowice – Kęty',      'Czechowice-Dziedzice','43-502', '49.9120', '19.0060']
  ];
  categories text[] := array['Restauracja', 'Bistro', 'Pizzeria', 'Hotel', 'Stołówka', 'Kawiarnia', 'Catering', 'Pensjonat'];
  drivers_fn text[] := array['Jan', 'Piotr', 'Tomasz', 'Marek', 'Krzysztof', 'Paweł'];
  drivers_ln text[] := array['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski'];
  v_vehicles uuid[] := '{}';
  v_drivers  uuid[] := '{}';
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- jedna firma demo na użytkownika
  select t.id into v_tenant
  from tenants t join memberships m on m.tenant_id = t.id
  where m.user_id = v_uid and (t.settings->>'is_demo')::boolean is true
  limit 1;
  if v_tenant is not null then
    return v_tenant;
  end if;

  insert into tenants (name, settings)
  values ('Hurtownia Demo Bielsko',
          jsonb_build_object('is_demo', true, 'cost_per_km_pln', 1.6, 'driver_cost_per_hour_pln', 45, 'default_service_minutes', 10))
  returning id into v_tenant;
  insert into memberships (tenant_id, user_id, role) values (v_tenant, v_uid, 'admin');

  insert into depots (tenant_id, name, address, location)
  values (v_tenant, 'Magazyn główny', 'ul. Przykładowa 1, 43-300 Bielsko-Biała',
          st_setsrid(st_makepoint(19.0200, 49.8000), 4326)::geography)
  returning id into v_depot;

  -- typy opakowań
  insert into packaging_types (tenant_id, code, name, deposit_value) values
    (v_tenant, 'EUR',      'Paleta EURO',             60),
    (v_tenant, 'SKRZ-PL',  'Skrzynka plastikowa',     12),
    (v_tenant, 'SKRZ-PAL', 'Skrzyniopaleta',          180);

  -- pojazdy i kierowcy
  for i in 1..6 loop
    insert into vehicles (tenant_id, registration, name, body_type, capacity_pallets, capacity_kg, capacity_m3, is_own)
    values (v_tenant, 'SB ' || (1000 + i) || 'D', 'Auto ' || i,
            case when i <= 4 then 'chłodnia' else 'izoterma' end,
            case when i <= 2 then 18 when i <= 4 then 10 else 6 end,
            case when i <= 2 then 9000 when i <= 4 then 3500 else 1400 end,
            case when i <= 2 then 45 when i <= 4 then 22 else 12 end,
            i <> 6)
    returning id into v_id;
    v_vehicles := v_vehicles || v_id;

    insert into drivers (tenant_id, first_name, last_name, phone, employment_type, default_vehicle_id)
    values (v_tenant, drivers_fn[i], drivers_ln[i], '+48 600 000 00' || i,
            case when i = 6 then 'B2B' else 'UoP' end, v_id)
    returning id into v_id;
    v_drivers := v_drivers || v_id;
  end loop;
  for i in 1..6 loop
    update vehicles set default_driver_id = v_drivers[i] where id = v_vehicles[i];
  end loop;

  -- 5 szablonów tras × 8 punktów = 40 punktów
  for v_area in 1..5 loop
    insert into route_templates (tenant_id, name, weekdays, depot_id, default_vehicle_id, default_driver_id, planned_start)
    values (v_tenant, areas[v_area][1], '{1,2,3,4,5,6}', v_depot, v_vehicles[v_area], v_drivers[v_area], '05:30')
    returning id into v_tpl;

    for i in 1..8 loop
      insert into customers (tenant_id, external_code, name, category)
      values (v_tenant, 'K' || lpad(((v_area - 1) * 8 + i)::text, 4, '0'),
              categories[1 + ((v_area * 3 + i) % 8)] || ' Demo ' || lpad(((v_area - 1) * 8 + i)::text, 2, '0'),
              categories[1 + ((v_area * 3 + i) % 8)])
      returning id into v_cust;

      insert into delivery_points (tenant_id, customer_id, external_code, name, address_line, postal_code, city,
                                   location, geocode_status, service_minutes, delivery_weekdays,
                                   active_from, active_to, driver_instructions, contact_phone)
      values (v_tenant, v_cust, 'P' || lpad(((v_area - 1) * 8 + i)::text, 4, '0'),
              'Lokal ' || areas[v_area][1] || ' ' || i,
              'ul. Przykładowa ' || (10 + i * 3),
              areas[v_area][3], areas[v_area][2],
              st_setsrid(st_makepoint(areas[v_area][5]::float8 + (((i * 37) % 17) - 8) * 0.0025,
                                      areas[v_area][4]::float8 + (((i * 53) % 13) - 6) * 0.0020), 4326)::geography,
              'manual', 8 + (i % 3) * 5,
              case when i % 4 = 0 then '{1,3,5}'::smallint[] else '{1,2,3,4,5,6}'::smallint[] end,
              -- punkt sezonowy w każdym obszarze (np. ogródek letni / stok zimą)
              case when i = 8 then make_date(extract(year from current_date)::int, 5, 1) end,
              case when i = 8 then make_date(extract(year from current_date)::int, 9, 30) end,
              case when i % 3 = 0 then 'Wejście od zaplecza, dzwonek przy rampie' end,
              '+48 33 000 0' || lpad(((v_area - 1) * 8 + i)::text, 3, '0'))
      returning id into v_point;

      -- okna przyjęć: pon–sob, część punktów z dwoma oknami
      v_open := case i % 3 when 0 then '06:00'::time when 1 then '07:00'::time else '08:00'::time end;
      for w in 1..6 loop
        insert into delivery_point_windows (tenant_id, delivery_point_id, weekday, opens_at, closes_at)
        values (v_tenant, v_point, w, v_open, v_open + interval '3 hours');
        if i % 5 = 0 then
          insert into delivery_point_windows (tenant_id, delivery_point_id, weekday, opens_at, closes_at)
          values (v_tenant, v_point, w, '14:00', '16:00');
        end if;
      end loop;

      insert into route_template_points (tenant_id, template_id, delivery_point_id, sequence)
      values (v_tenant, v_tpl, v_point, i);
    end loop;
  end loop;

  -- święta (dotyczą wszystkich punktów)
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

revoke all on function create_tenant(text) from public, anon;
revoke all on function create_demo_tenant() from public, anon;
grant execute on function create_tenant(text) to authenticated;
grant execute on function create_demo_tenant() to authenticated;
