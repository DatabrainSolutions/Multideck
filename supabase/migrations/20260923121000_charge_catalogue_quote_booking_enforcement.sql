begin;

-- Only managed, active codes may enter a newly saved operational charge line.
create function public.multideck_resolve_operational_charge(
  p_code text, p_kind text, p_direction text, p_mode text
) returns uuid language plpgsql volatile set search_path=pg_catalog,public as $$
declare
  charge public."RATE_ChargeCodes";
  direction_code text := lower(regexp_replace(coalesce(p_direction,''),'[^a-z]+','_','g'));
  mode_label text := lower(btrim(coalesce(p_mode,'')));
  mode_code text;
begin
  perform pg_advisory_xact_lock(hashtext('multideck-charge-catalogue'));
  if p_kind not in ('quote','booking') then raise exception 'Choose a quote or booking charge context.' using errcode='22023'; end if;
  if direction_code not in ('import','export','cross_trade') then direction_code:='other'; end if;
  mode_code:=case when mode_label ~ '^(multi|mix)' then 'mix'
    when mode_label ~ '^(sea|ocean)' then 'sea'
    when mode_label ~ '^air' then 'air'
    when mode_label ~ '^road' then 'road' else 'other' end;
  select * into charge from public."RATE_ChargeCodes"
    where upper("RATECharge_Code")=upper(btrim(p_code)) and "RATECharge_IsActive" for share;
  if not found then raise exception 'Choose an active Multideck charge code.' using errcode='22023'; end if;
  if charge."RATECharge_ScopeConfigured" and not exists (
    select 1 from public."RATE_ChargeApplicability" a
    where a.charge_id=charge."RATECharge_ID" and a.record_kind=p_kind
      and a.direction=direction_code and a.mode=mode_code
  ) then raise exception 'This charge code does not apply to the selected direction and mode.' using errcode='22023'; end if;
  return charge."RATECharge_ID";
end; $$;
revoke all on function public.multideck_resolve_operational_charge(text,text,text,text) from public,anon,authenticated;
grant execute on function public.multideck_resolve_operational_charge(text,text,text,text) to service_role;

create function public.multideck_assign_booking_charge_codes(p_job uuid,p_charges jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  job public."Job_Header";
  line record;
  costing_line public."Job_Costing_Lines";
  mapping public."FIN_ChargeNominalMappings";
  v_charge_id uuid;
  entity_id uuid;
  cost_nominal uuid;
  revenue_nominal uuid;
begin
  select * into job from public."Job_Header" where "Job_ID"=p_job for update;
  if not found then raise exception 'Booking not found.' using errcode='22023'; end if;
  entity_id:=public._multideck_finance_resolve_job_legal_entity(p_job);
  for line in select value->>'code' as code,ordinality::integer as number
    from jsonb_array_elements(coalesce(p_charges,'[]'::jsonb)) with ordinality
  loop
    if nullif(btrim(line.code),'') is not null then
      v_charge_id:=public.multideck_resolve_operational_charge(line.code,'booking',job."Job_Direction",job."Job_TransportModeSummary");
      select * into costing_line from public."Job_Costing_Lines"
        where "Job_ID"=p_job and "JobCostingLine_Number"=line.number for update;
      if not found then raise exception 'A booking charge line is missing.' using errcode='22023'; end if;
      if entity_id is null then raise exception 'Choose a legal entity for this booking before applying charges.' using errcode='22023'; end if;
      select * into mapping from public."FIN_ChargeNominalMappings" mapped
        where mapped.legal_entity_id=entity_id and mapped.charge_id=v_charge_id for share;
      if not found then raise exception 'Configure the charge code nominal mapping for this legal entity before applying booking charges.' using errcode='22023'; end if;
      cost_nominal:=null;
      revenue_nominal:=null;
      if coalesce(costing_line."JobCostingLine_CostAmountCurrency",0)<>0 then
        if mapping.cost_group_id is null then raise exception 'Configure a cost nominal group for this charge code.' using errcode='22023'; end if;
        cost_nominal:=(public._multideck_validate_nominal_group(entity_id,mapping.cost_group_id,'cost')#>>'{actual,id}')::uuid;
      end if;
      if coalesce(costing_line."JobCostingLine_RevenueAmountCurrency",0)<>0 then
        if mapping.revenue_group_id is null then raise exception 'Configure a revenue nominal group for this charge code.' using errcode='22023'; end if;
        revenue_nominal:=(public._multideck_validate_nominal_group(entity_id,mapping.revenue_group_id,'revenue')#>>'{actual,id}')::uuid;
      end if;
      update public."Job_Costing_Lines" set "JobCostingLine_ChargeCodeID"=v_charge_id,
        "JobCostingLine_CostNominalAccountID"=coalesce(cost_nominal,"JobCostingLine_CostNominalAccountID"),
        "JobCostingLine_RevenueNominalAccountID"=coalesce(revenue_nominal,"JobCostingLine_RevenueNominalAccountID")
        where "JobCostingLine_ID"=costing_line."JobCostingLine_ID";
    end if;
  end loop;
end; $$;
revoke all on function public.multideck_assign_booking_charge_codes(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_assign_booking_charge_codes(uuid,jsonb) to service_role;

alter table public."CusQuote_Lines" add constraint "CusQuote_Lines_managed_charge_fkey"
  foreign key("CusQuoteLine_ChargeCodeID") references public."RATE_ChargeCodes"("RATECharge_ID") not valid;

-- The current quote writer already guards tenant, role, version and lifecycle.
-- Wrap it in the same transaction so a failed charge check rolls back the save.
alter function public.quote_workflow_save_quote(uuid,uuid,jsonb)
  rename to quote_workflow_save_before_managed_charges_20260923;
revoke all on function public.quote_workflow_save_before_managed_charges_20260923(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function quote_api.save_quote(uuid,uuid,jsonb) from service_role;
create function public.quote_workflow_save_quote(caller_auth_user_id uuid,requested_quote_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  saved jsonb;
  line jsonb;
  line_number integer:=0;
  quote_id uuid;
  charge_id uuid;
begin
  saved:=public.quote_workflow_save_before_managed_charges_20260923(caller_auth_user_id,requested_quote_id,payload);
  quote_id:=(saved->>'quoteId')::uuid;
  if quote_id is null then raise exception 'The saved quote identity is missing.' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(coalesce(payload->'charges','[]'::jsonb)) loop
    if quote_api.jsonb_has_content(line-array['showToCustomer','quantity','costRoe','sellRoe']) then
      line_number:=line_number+1;
      charge_id:=public.multideck_resolve_operational_charge(line->>'code','quote',payload->>'direction',payload->>'mode');
      update public."CusQuote_Lines" set "CusQuoteLine_ChargeCodeID"=charge_id
        where "CusQuoteHeader_ID"=quote_id and "CusQuoteLine_Number"=line_number;
      if not found then raise exception 'A saved quote charge line is missing.' using errcode='22023'; end if;
    end if;
  end loop;
  return saved;
end; $$;
revoke all on function public.quote_workflow_save_quote(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.quote_workflow_save_quote(uuid,uuid,jsonb) to service_role;

-- A booking created from an accepted quote carries the same charge identities.
alter function booking_api.convert_accepted_quote(uuid,uuid,uuid)
  rename to convert_accepted_quote_before_managed_charges_20260923;
revoke all on function booking_api.convert_accepted_quote_before_managed_charges_20260923(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function booking_api.convert_accepted_quote(requested_quote_id uuid,requested_actor_user_id uuid default null,requested_response_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  converted jsonb;
  job public."Job_Header";
begin
  converted:=booking_api.convert_accepted_quote_before_managed_charges_20260923(requested_quote_id,requested_actor_user_id,requested_response_id);
  if coalesce((converted->>'reused')::boolean,false) or coalesce((converted->>'outOfSync')::boolean,false) then return converted; end if;
  select * into job from public."Job_Header" where "Job_ID"=(converted->>'jobId')::uuid;
  if not found then return converted; end if;
  if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job."Job_ID") then
    perform public.multideck_assign_booking_charge_codes(job."Job_ID",job."Job_SourceSnapshotJSON"#>'{acceptedSnapshot,quote,charges}');
  end if;
  return converted;
end; $$;
revoke all on function booking_api.convert_accepted_quote(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function booking_api.convert_accepted_quote(uuid,uuid,uuid) to service_role;

-- Quote revision application writes its charge lines through the existing
-- approval workflow. Complete the identities in that same transaction.
alter function public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean)
  rename to booking_workflow_apply_quote_sync_before_managed_charges_20260923;
revoke all on function public.booking_workflow_apply_quote_sync_before_managed_charges_20260923(uuid,uuid,uuid,jsonb,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.booking_workflow_apply_quote_sync_confirmed(uuid,uuid,uuid,jsonb,boolean) from service_role;
revoke all on function public.booking_workflow_apply_quote_sync(uuid,uuid,uuid,jsonb) from service_role;
create function public.booking_workflow_apply_quote_sync_v2(
  caller_auth_user_id uuid,requested_job_id uuid,requested_review_id uuid,
  requested_fields jsonb,expected_review_token text,confirm_mode_change boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare applied jsonb; charges jsonb;
begin
  applied:=public.booking_workflow_apply_quote_sync_before_managed_charges_20260923(
    caller_auth_user_id,requested_job_id,requested_review_id,requested_fields,expected_review_token,confirm_mode_change);
  if coalesce((applied->>'reused')::boolean,false) or not (requested_fields ? 'charges') then return applied; end if;
  select proposed_snapshot->'charges' into charges from booking_api.quote_sync_reviews where review_id=requested_review_id and job_id=requested_job_id;
  perform public.multideck_assign_booking_charge_codes(requested_job_id,charges);
  return applied;
end; $$;
revoke all on function public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean) to service_role;

-- Provisional bookings release accepted-quote charges only when progressing.
-- PostgreSQL runs this trigger after the existing provisional release trigger.
create function booking_api.attach_provisional_managed_charge_codes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if lower(old."Job_Status") in ('draft','provisional')
    and booking_api.lifecycle_label(new."Job_Status")='In progress'
    and new."Job_SourceQuoteID" is not null
    and exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=new."Job_ID") then
    perform public.multideck_assign_booking_charge_codes(new."Job_ID",new."Job_SourceSnapshotJSON"#>'{acceptedSnapshot,quote,charges}');
  end if;
  return new;
end; $$;
create trigger zz_managed_quote_charge_codes after update of "Job_Status" on public."Job_Header"
for each row execute function booking_api.attach_provisional_managed_charge_codes();
revoke all on function booking_api.attach_provisional_managed_charge_codes() from public,anon,authenticated,service_role;

commit;
