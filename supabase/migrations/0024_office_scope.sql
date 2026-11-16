-- Etap „biuro” — kartoteki floty i kierowców (R6, R7), rola „monitor” (R8), jednorazowe okno dostawy (R3).

-- ── R6: kartoteka pojazdu ─────────────────────────────────────────────
alter table vehicles
  add column if not exists trailer_registration text,                       -- nr rej. przyczepy
  add column if not exists length_m             numeric(5,2),               -- gabaryty zewnętrzne
  add column if not exists width_m              numeric(5,2),
  add column if not exists height_m             numeric(5,2),
  add column if not exists odometer_km          int,                        -- stan licznika (kartoteka)
  add column if not exists capacity_box_pallets int not null default 0,     -- skrzyniopalety
  add column if not exists required_licenses    text[] not null default '{}'; -- wymagane kategorie prawa jazdy

alter table vehicles drop constraint if exists vehicles_required_licenses_chk;
alter table vehicles add constraint vehicles_required_licenses_chk
  check (required_licenses <@ array['B','B+E','C1','C1+E','C','C+E']::text[]);

-- ── R7: kartoteka kierowcy ────────────────────────────────────────────
alter table drivers
  add column if not exists email              text,
  add column if not exists license_categories text[] not null default '{}', -- posiadane kategorie
  add column if not exists standby            boolean not null default false; -- stand-by (inne warunki zatrudnienia)

alter table drivers drop constraint if exists drivers_license_categories_chk;
alter table drivers add constraint drivers_license_categories_chk
  check (license_categories <@ array['B','B+E','C1','C1+E','C','C+E']::text[]);

-- ── R8: rola „monitor” — tylko odczyt tabel, z których rysuje się Monitor tras ──
do $$
declare t text;
begin
  foreach t in array array[
    'customers','delivery_points','delivery_point_windows','delivery_point_exceptions',
    'vehicles','drivers','orders','route_templates','routes','route_stops','route_stop_orders'
  ] loop
    execute format('drop policy if exists %I on %I', t||'_read_monitor', t);
    execute format($p$create policy %I on %I for select using (has_role(tenant_id, array['monitor']::member_role[]))$p$, t||'_read_monitor', t);
  end loop;
end $$;

-- ── R3: jednorazowe okno dostawy dla punktu trasy dziennej ────────────
-- Okno zapisujemy na zamówieniach tego postoju (orders.window_start/end) — to pole czytają już
-- tablica, monitor, BOK, sortowanie wg okien i aplikacja kierowcy. Zamówienie dotyczy jednego dnia,
-- więc zmiana nie rusza kartoteki adresu ani trasy stałej. Puste godziny = powrót do okna z kartoteki.
create or replace function set_stop_window(p_stop uuid, p_from time, p_to time) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_tenant uuid;
  v_status stop_status;
begin
  select tenant_id, status into v_tenant, v_status from route_stops where id = p_stop;
  if v_tenant is null or not has_role(v_tenant, array['admin','dispatcher']::member_role[]) then
    raise exception 'STOP_NO_ACCESS';
  end if;
  if v_status not in ('pending', 'arrived', 'in_progress') then raise exception 'STOP_DONE'; end if;
  if (p_from is null) <> (p_to is null) then raise exception 'WINDOW_INCOMPLETE'; end if;
  if p_from is not null and p_to <= p_from then raise exception 'WINDOW_ORDER'; end if;
  update orders o set window_start = p_from, window_end = p_to
    from route_stop_orders so
   where so.stop_id = p_stop and so.order_id = o.id and o.tenant_id = v_tenant;
end $$;
