-- Test historii demo — LOKALNA baza testowa (uruchamiać jako ostatni — po rls_isolation, planning i driver; admin A ma firmę demo)
do $$
declare v_tenant uuid; v_res json; n int; m int;
begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  select m.tenant_id into v_tenant from memberships m where m.user_id = auth.uid() and m.role = 'admin' limit 1;
  v_res := seed_demo_history(v_tenant, 10);
  if (v_res->>'routes')::int = 0 then raise exception 'Brak tras w historii: %', v_res; end if;
  -- ponowne wywołanie nic nie dubluje
  v_res := seed_demo_history(v_tenant, 10);
  if (v_res->>'skipped')::boolean is not true then raise exception 'Historia zdublowana: %', v_res; end if;
  -- księgi bilansują się (podwójny zapis)
  select coalesce(sum(qty), 0) into n from packaging_movements where tenant_id = v_tenant;
  select coalesce(sum(amount), 0) into m from cash_movements where tenant_id = v_tenant;
  if n <> 0 or m <> 0 then raise exception 'Księgi nie bilansują się: opakowania %, gotówka %', n, m; end if;
  reset role;

  -- BOK nie może generować historii
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  set local role authenticated;
  begin
    perform seed_demo_history(v_tenant, 5);
    raise exception 'BOK nie powinien móc generować historii';
  exception when others then
    if sqlerrm not like '%Brak uprawnień%' then raise; end if;
  end;
  reset role;
end $$;
