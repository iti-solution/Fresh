-- Driver — test obciążenia M6.4: 5 000 adresów i 5 000 zamówień na jeden dzień, 50 tras stałych.
-- Wszystko w jednej transakcji, wycofywanej na końcu (raise exception zwraca czasy) — można uruchomić na bazie dev.

do $$
declare
  v_t uuid;
  v_day date := current_date + 30;
  t0 timestamptz;
  out text := '';
  v_res json;
  n int;
begin
  insert into tenants (name, settings) values ('LOAD TEST', '{}'::jsonb) returning id into v_t;

  t0 := clock_timestamp();
  insert into customers (tenant_id, external_code, name)
  select v_t, 'LC' || g, 'Klient testowy ' || g from generate_series(1, 1000) g;
  insert into delivery_points (tenant_id, customer_id, external_code, name, address_line, city, delivery_weekdays)
  select v_t, c.id, c.external_code || '-' || k, 'Adres ' || k, 'ul. Testowa ' || (row_number() over ()), 'Kraków', '{1,2,3,4,5,6,7}'
  from customers c cross join generate_series(1, 5) k where c.tenant_id = v_t;
  insert into delivery_point_windows (tenant_id, delivery_point_id, weekday, opens_at, closes_at)
  select v_t, p.id, extract(isodow from v_day)::int, time '06:00' + (random() * interval '4 hours'), time '11:00' from delivery_points p where p.tenant_id = v_t;
  out := out || format('kartoteka 5000 adresów: %s ms', round(extract(epoch from clock_timestamp() - t0) * 1000));

  insert into route_templates (tenant_id, name, weekdays, planned_start)
  select v_t, 'Trasa ' || g, '{1,2,3,4,5,6,7}', time '05:30' from generate_series(1, 50) g;
  insert into route_template_points (tenant_id, template_id, delivery_point_id, sequence)
  select v_t, t.id, p.id, p.rn
  from (select id, row_number() over (order by name) - 1 as idx from route_templates where tenant_id = v_t) t
  join (select id, row_number() over (order by external_code) as rn, (row_number() over (order by external_code) - 1) % 50 as bucket from delivery_points where tenant_id = v_t) p
    on p.bucket = t.idx;

  t0 := clock_timestamp();
  insert into orders (tenant_id, external_ref, delivery_point_id, delivery_date, weight_kg, pallets, crates, order_value, status)
  select v_t, 'LOAD-' || p.external_code, p.id, v_day, 50 + random() * 200, 0.5, (random() * 10)::int, 500 + random() * 3000, 'new'
  from delivery_points p where p.tenant_id = v_t;
  out := out || format(' | 5000 zamówień: %s ms', round(extract(epoch from clock_timestamp() - t0) * 1000));

  analyze customers; analyze delivery_points; analyze delivery_point_windows; analyze orders;
  analyze route_templates; analyze route_template_points;
  t0 := clock_timestamp();
  v_res := create_day_routes(v_t, v_day);
  out := out || format(' | „Utwórz dzień” (%s): %s ms', v_res, round(extract(epoch from clock_timestamp() - t0) * 1000));

  analyze routes; analyze route_stops; analyze route_stop_orders;
  t0 := clock_timestamp();
  select count(*) into n from (
    select o.id, s.sequence, w.opens_at
    from orders o
    join route_stop_orders so on so.order_id = o.id
    join route_stops s on s.id = so.stop_id
    join routes r on r.id = s.route_id
    left join delivery_point_windows w on w.delivery_point_id = o.delivery_point_id and w.weekday = extract(isodow from v_day)
    where o.tenant_id = v_t and o.delivery_date = v_day and r.route_date = v_day
  ) x;
  out := out || format(' | odczyt tablicy planowania (%s wierszy): %s ms', n, round(extract(epoch from clock_timestamp() - t0) * 1000));

  raise exception 'LOAD TEST (wycofane): %', out;
end $$;
