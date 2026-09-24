begin;

-- Preserve existing classifications; never reinterpret historical balances from
-- a CargoWise (or tenant-defined) numbering convention.
create or replace function public._multideck_finance_derive_report_category()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new."FINNom_ReportCategoryCode" is not null then return new; end if;
  new."FINNom_ReportCategoryCode":=case lower(btrim(new."FINNom_AccountTypeCode"))
    when 'bank' then 'asset'
    when 'receivable' then 'asset'
    when 'current asset' then 'asset'
    when 'fixed asset' then 'asset'
    when 'payable' then 'liability'
    when 'current liability' then 'liability'
    when 'long term liability' then 'liability'
    when 'equity' then 'equity'
    when 'income account' then 'income'
    when 'cost of goods sold' then 'direct_cost'
    when 'expense account' then 'expense'
    else null end;
  if new."FINNom_ReportCategoryCode" is null then
    raise exception 'Choose an explicit report category for this nominal account.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_derive_report_category() from public,anon,authenticated;

-- Extend the existing atomic, permissioned and audited administration writer.
-- Fail closed if its source has changed rather than silently dropping the field.
do $patch$
declare definition text; original text; segment text; revised text; start_at integer; finish_at integer;
begin
  definition:=pg_get_functiondef('public.multideck_finance_save_administration(uuid,uuid,uuid,jsonb,text)'::regprocedure);
  start_at:=strpos(definition,'  for v_item in select value from jsonb_array_elements(coalesce(p_settings->''nominalAccounts''');
  finish_at:=strpos(definition,'  for v_item in select value from jsonb_array_elements(coalesce(p_settings->''banks''');
  if start_at=0 or finish_at<=start_at then raise exception 'Finance nominal writer has changed; review the classification migration.'; end if;
  segment:=substring(definition from start_at for finish_at-start_at); original:=segment;
  segment:=replace(segment,'"FINNom_Code","FINNom_Name","FINNom_AccountTypeCode",','"FINNom_Code","FINNom_Name","FINNom_ReportCategoryCode","FINNom_AccountTypeCode",');
  segment:=replace(segment,'values(v_code,coalesce(nullif(btrim(v_item->>''name''),''''),v_code),','values(v_code,coalesce(nullif(btrim(v_item->>''name''),''''),v_code),nullif(v_item->>''reportCategoryCode'',''''),');
  segment:=replace(segment,'"FINNom_Name"=excluded."FINNom_Name",','"FINNom_Name"=excluded."FINNom_Name","FINNom_ReportCategoryCode"=case when v_item ? ''reportCategoryCode'' then excluded."FINNom_ReportCategoryCode" else "FIN_NominalAccounts"."FINNom_ReportCategoryCode" end,');
  segment:=replace(segment,'set "FINNom_Code"=v_code,','set "FINNom_Code"=v_code,"FINNom_ReportCategoryCode"=case when v_item ? ''reportCategoryCode'' then nullif(v_item->>''reportCategoryCode'','''') else "FINNom_ReportCategoryCode" end,');
  if segment=original or strpos(segment,'nullif(v_item->>''reportCategoryCode'','''')')=0 then raise exception 'Report classification was not added to the finance writer.'; end if;
  revised:=overlay(definition placing segment from start_at for finish_at-start_at);
  execute revised;
end; $patch$;
commit;
