-- Przykładowe stawki kierowców w firmie demo, żeby ekran „Rozliczenia" od razu pokazywał, jak to działa.
-- Reguła domyślna (dniówka + km + punkty + palety + premia) oraz jedna reguła „dowózkowa" dla pierwszego kierowcy.
create or replace function seed_demo_pay_rules(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_from date := (date_trunc('month', current_date) - interval '2 months')::date;
  v_driver uuid;
begin
  if exists (select 1 from driver_pay_rules where tenant_id = p_tenant) then return; end if;
  insert into driver_pay_rules (tenant_id, driver_id, valid_from, components) values
    (p_tenant, null, v_from, jsonb_build_object(
      'name', 'Etat: dniówka + km + punkty', 'model', 'employee',
      'daily_rate', 25000, 'per_km', 50, 'km_threshold', 120, 'per_stop', 200, 'per_pallet', 150,
      'per_extra_route', 8000, 'turnover_bp', 0, 'delivered_value_bp', 0,
      'on_time_bonus', 5000, 'on_time_threshold_pct', 95));
  select id into v_driver from drivers where tenant_id = p_tenant and is_active order by last_name limit 1;
  if v_driver is not null then
    insert into driver_pay_rules (tenant_id, driver_id, valid_from, components) values
      (p_tenant, v_driver, v_from, jsonb_build_object(
        'name', 'Dowózka: dniówka + % obrotu', 'model', 'delivery',
        'daily_rate', 12000, 'per_km', 0, 'km_threshold', 0, 'per_stop', 0, 'per_pallet', 0,
        'per_extra_route', 8000, 'turnover_bp', 120, 'delivered_value_bp', 0,
        'on_time_bonus', 0, 'on_time_threshold_pct', 95));
  end if;
end $$;
revoke all on function seed_demo_pay_rules(uuid) from public, anon;

-- seed_demo_history dostaje na końcu wywołanie powyższego (dotychczasowa treść bez zmian: seed_demo_history_core).
alter function seed_demo_history(uuid, int) rename to seed_demo_history_core;
revoke all on function seed_demo_history_core(uuid, int) from public, anon, authenticated;
create or replace function seed_demo_history(p_tenant uuid, p_days int default 24)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  v := seed_demo_history_core(p_tenant, p_days);
  perform seed_demo_pay_rules(p_tenant);
  return v;
end $$;
revoke all on function seed_demo_history(uuid, int) from public, anon;
grant execute on function seed_demo_history(uuid, int) to authenticated;

-- firma demo, która już istnieje
select seed_demo_pay_rules(id) from tenants where settings->>'is_demo' = 'true';
