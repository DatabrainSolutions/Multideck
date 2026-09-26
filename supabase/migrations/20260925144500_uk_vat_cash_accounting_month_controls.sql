begin;

-- A Cash timing bridge must name the current, separately approved monthly
-- ledger controls for every day of its VAT period. This remains a preview.
alter function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  rename to _multideck_uk_vat_cash_control_source_inventory_before_months;
revoke all on function public._multideck_uk_vat_cash_control_source_inventory_before_months(
  uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_control_source_inventory(
  p_actor uuid,p_entity uuid,p_period uuid,p_projection uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_source jsonb; v_start date; v_end date; v_days integer;
  v_periods jsonb; v_count integer; v_unverified integer; v_controls jsonb;
  v_digest text;
begin
  v_source:=public._multideck_uk_vat_cash_control_source_inventory_before_months(
    p_actor,p_entity,p_period,p_projection);
  if v_source->>'truncated'='true' then
    return v_source||jsonb_build_object('accountingControls',null,'sourceDigest',null);
  end if;
  v_start:=(v_source#>>'{context,periodStart}')::date;
  v_end:=(v_source#>>'{context,periodEnd}')::date;
  if v_start is null or v_end is null or v_start>v_end or v_end-v_start>366 then
    raise exception 'Cash VAT period dates are invalid for monthly controls.' using errcode='22023';
  end if;
  -- Count a day only when exactly one accounting period owns it. A missing
  -- month or overlapping accounting periods cannot be mistaken for approval.
  select count(*) filter (where covered<>1)::integer into v_days
  from (select v_start+day.day_index, count(period."FINPeriod_ID") covered
    from generate_series(0,v_end-v_start) day(day_index)
    left join public."FIN_Periods" period
      on period."FINPeriod_LegalEntityID"=p_entity
      and v_start+day.day_index between period."FINPeriod_StartDate" and period."FINPeriod_EndDate"
    group by day.day_index) coverage;
  with controls as materialized (
    select period."FINPeriod_ID" id,
      period."FINPeriod_StartDate" starts,
      period."FINPeriod_EndDate" ends,
      public.multideck_finance_accounting_vat_control_status(
        p_actor,p_entity,period."FINPeriod_ID") control
    from public."FIN_Periods" period
    where period."FINPeriod_LegalEntityID"=p_entity
      and period."FINPeriod_StartDate"<=v_end
      and period."FINPeriod_EndDate">=v_start
  )
  select count(*)::integer,
    count(*) filter (where control->>'status' is distinct from 'verified')::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'periodId',id,'startDate',starts,'endDate',ends,
      'status',control->>'status','sourceDigest',control->>'sourceDigest',
      'approvalId',control->>'approvalId','reviewId',control->>'reviewId')
      order by starts,id),'[]'::jsonb)
    into v_count,v_unverified,v_periods from controls;
  v_controls:=jsonb_build_object(
    'periodCount',v_count,'uncoveredOrOverlappingDays',v_days,
    'unverifiedPeriods',v_unverified,'periods',v_periods,
    'status',case when v_days=0 and v_count>0 and v_unverified=0
      then 'verified' else 'blocked' end);
  v_digest:=encode(sha256(convert_to(v_controls::text,'UTF8')),'hex');
  v_controls:=v_controls||jsonb_build_object('digest',v_digest);
  return v_source||jsonb_build_object(
    'accountingControls',v_controls,
    'sourceDigest',case when v_source->>'sourceDigest' is null then null else
      encode(sha256(convert_to(jsonb_build_object(
        'priorSourceDigest',v_source->>'sourceDigest',
        'accountingControlsDigest',v_digest)::text,'UTF8')),'hex') end,
    'status','cash_control_source_only','returnReady',false);
end; $$;
revoke all on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  to service_role;

commit;
