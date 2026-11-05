-- Driver — po przeglądzie kodu (2026-11-05): zasady, które dotąd pilnowała tylko aplikacja, teraz pilnuje też baza.
-- 1) Księgi append-only: delivery_events, packaging_movements, cash_movements — pracownicy mogą tylko dopisywać.
-- 2) Stawki kierowców zmienia tylko administrator.
-- 3) Zatwierdzenie / cofnięcie zatwierdzenia rozliczenia — tylko administrator.

do $$
declare t text;
begin
  foreach t in array array['delivery_events', 'packaging_movements', 'cash_movements'] loop
    execute format('drop policy if exists %I on %I', t || '_write_staff', t);
    execute format('drop policy if exists %I on %I', t || '_insert_staff', t);
    execute format($p$create policy %I on %I for insert with check (has_role(tenant_id, array['admin','dispatcher']::member_role[]))$p$, t || '_insert_staff', t);
  end loop;
end $$;

drop policy if exists driver_pay_rules_write_staff on driver_pay_rules;
drop policy if exists driver_pay_rules_write_admin on driver_pay_rules;
create policy driver_pay_rules_write_admin on driver_pay_rules for all
  using (has_role(tenant_id, array['admin']::member_role[]))
  with check (has_role(tenant_id, array['admin']::member_role[]));

create or replace function settlements_approval_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status
     and (new.status in ('approved', 'exported') or old.status in ('approved', 'exported'))
     and auth.uid() is not null
     and not has_role(new.tenant_id, array['admin']::member_role[]) then
    raise exception 'Rozliczenie zatwierdza administrator';
  end if;
  return new;
end $$;
drop trigger if exists settlements_approval_guard on driver_settlements;
create trigger settlements_approval_guard before update on driver_settlements for each row execute function settlements_approval_guard();
revoke execute on function settlements_approval_guard() from public, anon, authenticated;
