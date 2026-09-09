begin;

create or replace function public._multideck_finance_ensure_period(
  p_legal_entity_id uuid,p_period_code text,p_user_id uuid
) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_period_id uuid; v_start date; v_year integer; v_month integer; v_currency text;
begin
  if p_period_code !~ '^[0-9]{6}$' then raise exception 'Enter a valid YYYYMM management period.' using errcode='22023'; end if;
  v_year:=left(p_period_code,4)::integer; v_month:=right(p_period_code,2)::integer;
  if v_year not between 2000 and 2200 or v_month not between 1 and 12 then raise exception 'Enter a valid YYYYMM management period.' using errcode='22023'; end if;
  select upper(coalesce("LegalEntity_BaseCurrencyCodeSnapshot",'GBP')) into v_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=p_legal_entity_id;
  if not found then raise exception 'Legal entity not found.' using errcode='P0002'; end if;
  v_start:=make_date(v_year,v_month,1);
  insert into public."FIN_Periods"("FINPeriod_LegalEntityID","FINPeriod_Code","FINPeriod_Name","FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_StatusCode","FINPeriod_BaseCurrencyCode","FINPeriod_CreatedBy")
  values(p_legal_entity_id,p_period_code,to_char(v_start,'Mon YYYY'),v_start,(v_start+interval '1 month'-interval '1 day')::date,'open',v_currency,p_user_id)
  on conflict ("FINPeriod_LegalEntityID","FINPeriod_Code") where "FINPeriod_LegalEntityID" is not null do update set "FINPeriod_Name"=excluded."FINPeriod_Name"
  returning "FINPeriod_ID" into v_period_id;
  return v_period_id;
end; $$;
revoke all on function public._multideck_finance_ensure_period(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_ensure_period(uuid,text,uuid) to service_role;

commit;
