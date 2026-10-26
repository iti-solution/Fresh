-- Fresh — historia firmy demo: ~4 tygodnie zrealizowanych tras + dzisiejszy dzień „w trakcie”.
-- Cel: zestawienia BOK / dyspozytora / zarządu mają na pokazie realne liczby (terminowość, wyjątki,
-- gotówka, opakowania, trend sprzedaży). Dane są deterministyczne (hashtext), więc każdy reset daje
-- podobny obraz. Działa wyłącznie dla firmy demo, w której wywołujący jest administratorem.
-- Zapisy realizacji (delivery_events, packaging_movements, cash_movements) są dopisywane, nigdy zmieniane.

create or replace function seed_demo_history(p_tenant uuid, p_days int default 24)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_today    date := (now() at time zone 'Europe/Warsaw')::date;
  v_dates    date[] := '{}';
  v_d        date;
  v_dow      smallint;
  v_idx      int := 0;
  v_total    int;
  v_depot    uuid;
  v_crates   uuid;
  v_pallet   uuid;
  pt         record;
  r          record;
  s          record;
  o          record;
  v_h        int;
  v_value    numeric;
  v_km       int;
  v_odo      int;
  v_t        timestamptz;
  v_open     timestamptz;
  v_close    timestamptz;
  v_arr      timestamptz;
  v_done     timestamptz;
  v_status   text;
  v_ostatus  text;
  v_reason   text;
  v_cash     numeric;
  v_route_cash numeric;
  v_back     int;
  v_issue    int;
  v_g        uuid;
  v_cust     uuid;
  v_is_today boolean;
  v_prev     date;
  v_nstops   int;
  v_started  boolean;
  v_all_done boolean;
  v_last     timestamptz;
  v_route    uuid;
  v_order    uuid;
  v_ret_crates int;
  v_out_crates int;
  v_out_pal  int;
  v_ret_pal  int;
  v_orders   int := 0;
  v_routes   int := 0;
  complaint_reasons text[] := array['Zgniłe pomidory w 2 skrzynkach', 'Sałata zwiędnięta — klient nie przyjął części', 'Uszkodzone opakowanie, rozsypane jabłka', 'Banany zbyt dojrzałe'];
  refuse_reasons    text[] := array['Klient zamknięty — remont kuchni', 'Odmowa: zamówienie zdublowane', 'Kierownik zmiany nie potwierdził zamówienia'];
  dowozka_reasons   text[] := array['Brak towaru w porannej dostawie', 'Reklamacja — wymiana towaru', 'Zamówienie dosłane po wydaniu trasy'];
begin
  if auth.uid() is null or not has_role(p_tenant, array['admin']::member_role[]) then
    raise exception 'Brak uprawnień';
  end if;
  if not exists (select 1 from tenants where id = p_tenant and (settings->>'is_demo')::boolean is true) then
    raise exception 'Historia demo tylko dla firmy demo';
  end if;
  if exists (select 1 from routes where tenant_id = p_tenant and route_date <= v_today) then
    return json_build_object('skipped', true);
  end if;

  select id into v_depot from depots where tenant_id = p_tenant order by created_at limit 1;
  select id into v_crates from packaging_types where tenant_id = p_tenant and code = 'SKRZ-PL';
  select id into v_pallet from packaging_types where tenant_id = p_tenant and code = 'EUR';

  -- dni robocze wstecz (pon–sob, bez świąt) + dziś
  v_d := v_today - 1;
  while coalesce(array_length(v_dates, 1), 0) < p_days loop
    if extract(isodow from v_d) <> 7
       and not exists (select 1 from delivery_point_exceptions e where e.tenant_id = p_tenant and e.delivery_point_id is null and e.date = v_d and e.is_closed) then
      v_dates := v_d || v_dates;
    end if;
    v_d := v_d - 1;
  end loop;
  if extract(isodow from v_today) <> 7 then v_dates := v_dates || v_today; end if;
  v_total := array_length(v_dates, 1);
  v_prev := (select max(x) from unnest(v_dates) x where x < v_today); -- poprzedni dzień roboczy: trasy czekają na zamknięcie

  -- liczniki aut startują z realistycznych stanów
  create temp table if not exists _odo (vehicle_id uuid primary key, km int) on commit drop;
  delete from _odo;
  insert into _odo select id, 118000 + (abs(hashtext(id::text)) % 90000) from vehicles where tenant_id = p_tenant;

  foreach v_d in array v_dates loop
    v_idx := v_idx + 1;
    v_dow := extract(isodow from v_d);
    v_is_today := v_d = v_today;

    -- 1. zamówienia dnia (wolumen lekko rośnie w czasie — trend na raporcie zarządu)
    for pt in
      select p.id, p.customer_id, p.delivery_weekdays, p.active_from, p.active_to, rtp.template_id,
             row_number() over (order by p.external_code) as n
      from delivery_points p join route_template_points rtp on rtp.delivery_point_id = p.id
      where p.tenant_id = p_tenant
    loop
      continue when not (v_dow = any (pt.delivery_weekdays));
      continue when pt.active_from is not null and not (v_d between pt.active_from and coalesce(pt.active_to, v_d));
      v_h := abs(hashtext(pt.id::text || v_d::text)) % 100;
      continue when v_h >= case when v_dow = 6 then 55 else 88 end;
      v_value := round((320 + (abs(hashtext(pt.id::text)) % 2400)) * (0.75 + (v_h % 50) / 100.0) * (0.9 + v_idx * 0.006), 2);
      insert into orders (tenant_id, external_ref, delivery_point_id, type, delivery_date, priority,
                          pallets, weight_kg, volume_m3, crates, order_value, cod_amount, readiness, status)
      values (p_tenant, 'ZK/' || to_char(v_d, 'MMDD') || '/' || lpad(pt.n::text, 3, '0'), pt.id, 'delivery', v_d,
              case when v_h % 23 = 0 then 1 else 0 end,
              case when v_h % 4 = 0 then 1 else 0 end,
              round(v_value / 9.5, 2), round((v_value / 1400)::numeric, 2), greatest(2, (v_value / 130)::int),
              v_value,
              case when abs(hashtext(pt.customer_id::text)) % 5 = 0 then v_value end,
              'ready', 'new');
      v_orders := v_orders + 1;
    end loop;

    -- 2. trasy z szablonów + kolejność według okien
    perform create_day_routes(p_tenant, v_d);
    for r in select id from routes where tenant_id = p_tenant and route_date = v_d loop
      perform sort_route_by_window(r.id);
    end loop;

    -- 3. dowózka co ~3 dni (po południu, przewoźnik)
    if not v_is_today and v_idx % 3 = 0 then
      select o2.delivery_point_id, o2.id into pt from orders o2
        where o2.tenant_id = p_tenant and o2.delivery_date = v_d
        order by abs(hashtext(o2.id::text)) limit 1;
      insert into routes (tenant_id, route_date, name, kind, course_no, depot_id, vehicle_id, driver_id, planned_start, status, extra_reason)
      select p_tenant, v_d, 'Dowózka', 'dowozka', 2, v_depot, v.id, v.default_driver_id,
             (v_d + time '11:30') at time zone 'Europe/Warsaw', 'draft',
             dowozka_reasons[1 + v_idx % 3]
      from vehicles v where v.tenant_id = p_tenant and not v.is_own limit 1
      returning id into v_route;
      insert into orders (tenant_id, external_ref, delivery_point_id, type, delivery_date, pallets, weight_kg, volume_m3, crates, order_value, readiness, status)
      values (p_tenant, 'DW/' || to_char(v_d, 'MMDD'), pt.delivery_point_id, 'delivery', v_d, 0, 40, 0.3, 4, 280, 'ready', 'new')
      returning id into v_order;
      perform assign_order_to_route(v_order, v_route);
    end if;

    -- 4. realizacja tras
    for r in
      select rt.id, rt.name, rt.kind, rt.vehicle_id, rt.driver_id, rt.planned_start,
             row_number() over (order by rt.name) as rn
      from routes rt where rt.tenant_id = p_tenant and rt.route_date = v_d order by rt.name
    loop
      v_routes := v_routes + 1;
      -- dziś: pierwsza trasa alfabetycznie jeszcze nie wyjechała (alarm „trasa nierozpoczęta”)
      if v_is_today and r.rn = 1 then
        update routes set status = 'planned' where id = r.id;
        continue;
      end if;
      v_started := not v_is_today or coalesce(r.planned_start, now()) <= now();
      if not v_started then
        update routes set status = 'planned' where id = r.id;
        continue;
      end if;

      select km into v_odo from _odo where vehicle_id = r.vehicle_id;
      v_km := case when r.name like 'Zakopane%' then 232 when r.name like 'Tarnów%' then 196 when r.name like 'Wieliczka%' then 94
                   when r.kind = 'dowozka' then 58 else 72 end + (abs(hashtext(r.id::text)) % 24) - 8;
      update routes set status = 'in_progress', odometer_start = v_odo,
                        planned_km = round(v_km * 0.94), planned_minutes = 360
      where id = r.id;
      insert into delivery_events (tenant_id, client_event_id, route_id, driver_id, type, payload, occurred_at)
      values (p_tenant, gen_random_uuid(), r.id, r.driver_id, 'route_started', json_build_object('odometer_start', v_odo)::jsonb, r.planned_start);

      v_t := r.planned_start + interval '35 minutes' + case when r.name like 'Zakopane%' or r.name like 'Tarnów%' then interval '60 minutes' else interval '0' end;
      v_all_done := true;
      v_route_cash := 0;
      v_out_crates := 0; v_ret_crates := 0; v_out_pal := 0; v_ret_pal := 0;
      v_last := v_t;
      select count(*) into v_nstops from route_stops where route_id = r.id;

      for s in
        select st.id, st.sequence, st.delivery_point_id, dp.customer_id,
               (select min(w.opens_at) from delivery_point_windows w where w.delivery_point_id = st.delivery_point_id and w.weekday = v_dow) as opens_at,
               (select max(w.closes_at) from delivery_point_windows w where w.delivery_point_id = st.delivery_point_id and w.weekday = v_dow) as closes_at
        from route_stops st join delivery_points dp on dp.id = st.delivery_point_id
        where st.route_id = r.id order by st.sequence
      loop
        v_h := abs(hashtext(s.id::text)) % 1000;
        v_open := case when s.opens_at is not null then (v_d + s.opens_at) at time zone 'Europe/Warsaw' end;
        v_close := case when s.closes_at is not null then (v_d + s.closes_at) at time zone 'Europe/Warsaw' end;
        v_t := v_t + make_interval(mins => 18 + v_h % 17);
        if v_h % 11 = 0 then v_t := v_t + make_interval(mins => 35 + v_h % 50); end if; -- korek / czekanie na odbiorcę
        v_arr := case when v_open is not null and v_t < v_open - interval '15 minutes' then v_open - interval '15 minutes' else v_t end;
        v_done := v_arr + make_interval(mins => 7 + v_h % 12);
        v_t := v_done;

        update route_stops set window_start = v_open, window_end = v_close where id = s.id;

        -- dziś: druga trasa zawsze ma 2 ostatnie punkty w realizacji (widok „na żywo” o każdej porze)
        if v_is_today and (v_done > now() or (r.rn = 2 and s.sequence > v_nstops - 2)) then
          v_all_done := false;
          continue;
        end if;

        v_status := case when v_h < 25 then 'partial' when v_h < 45 then 'complaint' when v_h < 60 then 'absent'
                         when v_h < 68 then 'refused' else 'delivered' end;
        v_ostatus := case v_status when 'delivered' then 'delivered' when 'absent' then 'failed' when 'refused' then 'failed' else 'partial' end;
        v_reason := case v_status when 'complaint' then complaint_reasons[1 + v_h % 4]
                                  when 'refused' then refuse_reasons[1 + v_h % 3] end;

        update route_stops set status = v_status::stop_status, arrived_at = v_arr, completed_at = v_done where id = s.id;
        update orders set status = v_ostatus::order_status
          where id in (select order_id from route_stop_orders where stop_id = s.id) and status <> 'cancelled';
        insert into delivery_events (tenant_id, client_event_id, route_id, stop_id, driver_id, type, payload, occurred_at)
        values (p_tenant, gen_random_uuid(), r.id, s.id, r.driver_id, 'stop_in_progress', '{"source":"route_list"}', v_arr),
               (p_tenant, gen_random_uuid(), r.id, s.id, r.driver_id, 'stop_' || v_status,
                case when v_reason is not null then json_build_object('source', 'stop_screen', 'reason', v_reason)::jsonb else '{"source":"route_list"}'::jsonb end,
                v_done);
        if v_status in ('delivered', 'partial') and v_h % 37 = 0 then
          insert into delivery_events (tenant_id, client_event_id, route_id, stop_id, driver_id, type, payload, occurred_at)
          values (p_tenant, gen_random_uuid(), r.id, s.id, r.driver_id, 'return_recorded',
                  json_build_object('text', '2 skrz. ogórków — klient zwrócił z poprzedniej dostawy')::jsonb, v_done);
        end if;
        v_last := v_done;

        -- gotówka z pobrania
        if v_ostatus <> 'failed' then
          select coalesce(sum(o2.cod_amount), 0) into v_cash from orders o2 join route_stop_orders so on so.order_id = o2.id where so.stop_id = s.id;
          if v_cash > 0 then
            if v_ostatus = 'partial' then v_cash := round(v_cash * 0.7, 2); end if;
            v_g := gen_random_uuid();
            insert into cash_movements (tenant_id, movement_group, party_type, party_id, amount, reason, route_id, stop_id, created_at)
            values (p_tenant, v_g, 'driver', r.driver_id, v_cash, 'cod_collected', r.id, s.id, v_done),
                   (p_tenant, v_g, 'customer', s.customer_id, -v_cash, 'cod_collected', r.id, s.id, v_done);
            v_route_cash := v_route_cash + v_cash;
          end if;

          -- opakowania: wydane skrzynki/palety i zwroty z poprzednich dostaw
          select coalesce(sum(o2.crates), 0), coalesce(sum(o2.pallets), 0)::int into v_issue, v_back
            from orders o2 join route_stop_orders so on so.order_id = o2.id where so.stop_id = s.id;
          if v_issue > 0 then
            v_g := gen_random_uuid();
            insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, stop_id, created_at)
            values (p_tenant, v_g, v_crates, 'customer', s.customer_id, v_issue, 'issue', s.id, v_done),
                   (p_tenant, v_g, v_crates, 'driver', r.driver_id, -v_issue, 'issue', s.id, v_done);
            v_out_crates := v_out_crates + v_issue;
            -- część klientów oddaje mniej skrzynek, niż dostaje (zalegające saldo)
            v_issue := (v_issue * (case when abs(hashtext(s.customer_id::text)) % 4 = 0 then 55 else 92 end + v_h % 8) / 100)::int;
            if v_issue > 0 then
              v_g := gen_random_uuid();
              insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, stop_id, created_at)
              values (p_tenant, v_g, v_crates, 'customer', s.customer_id, -v_issue, 'return', s.id, v_done),
                     (p_tenant, v_g, v_crates, 'driver', r.driver_id, v_issue, 'return', s.id, v_done);
              v_ret_crates := v_ret_crates + v_issue;
            end if;
          end if;
          if v_back > 0 then
            v_g := gen_random_uuid();
            insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, stop_id, created_at)
            values (p_tenant, v_g, v_pallet, 'customer', s.customer_id, v_back, 'issue', s.id, v_done),
                   (p_tenant, v_g, v_pallet, 'driver', r.driver_id, -v_back, 'issue', s.id, v_done);
            v_out_pal := v_out_pal + v_back;
            if v_h % 3 <> 0 then
              v_g := gen_random_uuid();
              insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, stop_id, created_at)
              values (p_tenant, v_g, v_pallet, 'customer', s.customer_id, -v_back, 'return', s.id, v_done),
                     (p_tenant, v_g, v_pallet, 'driver', r.driver_id, v_back, 'return', s.id, v_done);
              v_ret_pal := v_ret_pal + v_back;
            end if;
          end if;
        end if;
      end loop;

      -- załadunek w magazynie (kierowca bierze opakowania, które wyda) — rejestrujemy z datą startu
      if v_out_crates > 0 then
        v_g := gen_random_uuid();
        insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, created_at, note)
        values (p_tenant, v_g, v_crates, 'depot', v_depot, -v_out_crates, 'load', r.planned_start, 'załadunek'),
               (p_tenant, v_g, v_crates, 'driver', r.driver_id, v_out_crates, 'load', r.planned_start, 'załadunek');
      end if;
      if v_out_pal > 0 then
        v_g := gen_random_uuid();
        insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, created_at, note)
        values (p_tenant, v_g, v_pallet, 'depot', v_depot, -v_out_pal, 'load', r.planned_start, 'załadunek'),
               (p_tenant, v_g, v_pallet, 'driver', r.driver_id, v_out_pal, 'load', r.planned_start, 'załadunek');
      end if;

      if v_is_today and not v_all_done then
        continue; -- trasa w trakcie: licznik końcowy, gotówka i opakowania jeszcze u kierowcy
      end if;

      v_done := v_last + interval '50 minutes';
      update routes set status = case when v_d >= v_prev then 'completed' else 'closed' end::route_status,
                        odometer_end = v_odo + v_km, actual_km = v_km,
                        closed_at = case when v_d < v_prev then v_done + interval '40 minutes' end
      where id = r.id;
      update _odo set km = v_odo + v_km + 3 where vehicle_id = r.vehicle_id;
      insert into delivery_events (tenant_id, client_event_id, route_id, driver_id, type, payload, occurred_at)
      values (p_tenant, gen_random_uuid(), r.id, r.driver_id, 'route_finished', json_build_object('odometer_end', v_odo + v_km)::jsonb, v_done);

      -- rozliczenie przy zamknięciu: trasy z poprzedniego dnia roboczego i z dziś czekają na dyspozytora (gotówka u kierowcy)
      if v_d < v_prev then
        if v_route_cash > 0 then
          v_g := gen_random_uuid();
          -- jedna różnica kasowa w historii (tydzień temu, pierwsza trasa)
          v_cash := case when v_idx = v_total - 6 and r.rn = 2 then v_route_cash - 20 else v_route_cash end;
          insert into cash_movements (tenant_id, movement_group, party_type, party_id, amount, reason, route_id, created_at, note)
          values (p_tenant, v_g, 'driver', r.driver_id, -v_cash, 'handover', r.id, v_done + interval '40 minutes', null),
                 (p_tenant, v_g, 'office', null, v_cash, 'handover', r.id, v_done + interval '40 minutes',
                  case when v_cash <> v_route_cash then 'różnica kasowa −20,00 zł' end);
        end if;
        if v_ret_crates > 0 then
          v_back := v_ret_crates - case when v_idx = v_total - 4 and r.rn = 3 then 3 else 0 end; -- kierowca zdał mniej
          v_g := gen_random_uuid();
          insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, created_at, note)
          values (p_tenant, v_g, v_crates, 'driver', r.driver_id, -v_back, 'handover', v_done + interval '40 minutes', 'zdanie na magazyn'),
                 (p_tenant, v_g, v_crates, 'depot', v_depot, v_back, 'handover', v_done + interval '40 minutes', 'zdanie na magazyn');
        end if;
        if v_ret_pal > 0 then
          v_g := gen_random_uuid();
          insert into packaging_movements (tenant_id, movement_group, packaging_type_id, party_type, party_id, qty, reason, created_at, note)
          values (p_tenant, v_g, v_pallet, 'driver', r.driver_id, -v_ret_pal, 'handover', v_done + interval '40 minutes', 'zdanie na magazyn'),
                 (p_tenant, v_g, v_pallet, 'depot', v_depot, v_ret_pal, 'handover', v_done + interval '40 minutes', 'zdanie na magazyn');
        end if;
      end if;
    end loop;
  end loop;

  return json_build_object('days', v_total, 'orders', v_orders, 'routes', v_routes);
end $$;

revoke all on function seed_demo_history(uuid, int) from public, anon;
grant execute on function seed_demo_history(uuid, int) to authenticated;
