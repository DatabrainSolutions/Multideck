-- Staged operational editor. Release only with source preservation and legacy
-- bulk-write guards; this file deliberately grants no external access.
begin;
set local lock_timeout='5s';

create function booking_api.operational_charge_values(line jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'id',line->>'JobCostingLine_ID',
  'code',coalesce(line#>>'{JobCostingLine_SourceMetadataJSON,bookingCharge,code}',line#>>'{JobCostingLine_SourceMetadataJSON,planningCharge,code}',line#>>'{JobCostingLine_SourceMetadataJSON,quoteCharge,code}',''),
  'description',line->>'JobCostingLine_Description',
  'supplierId',line->'JobCostingLine_SupplierID',
  'customerId',coalesce(line#>'{JobCostingLine_SourceMetadataJSON,bookingCharge,customerId}',line#>'{JobCostingLine_SourceMetadataJSON,planningCharge,customerId}','null'),
  'cost',line->'JobCostingLine_CostAmountCurrency','sell',line->'JobCostingLine_RevenueAmountCurrency',
  'costCurrency',coalesce(line#>>'{JobCostingLine_SourceMetadataJSON,bookingCharge,costCurrency}',line#>>'{JobCostingLine_SourceMetadataJSON,planningCharge,costCurrency}',line#>>'{JobCostingLine_SourceMetadataJSON,quoteCharge,costCurrency}'),
  'sellCurrency',coalesce(line#>>'{JobCostingLine_SourceMetadataJSON,bookingCharge,sellCurrency}',line#>>'{JobCostingLine_SourceMetadataJSON,planningCharge,sellCurrency}',line#>>'{JobCostingLine_SourceMetadataJSON,quoteCharge,sellCurrency}'),
  'costRoe',line->'JobCostingLine_CostROE','sellRoe',line->'JobCostingLine_RevenueROE',
  'quantity',coalesce(line#>'{JobCostingLine_SourceMetadataJSON,bookingCharge,quantity}',line#>'{JobCostingLine_SourceMetadataJSON,planningCharge,quantity}',line#>'{JobCostingLine_SourceMetadataJSON,quoteCharge,quantity}','1'),
  'calculationBasis',coalesce(line#>'{JobCostingLine_SourceMetadataJSON,bookingCharge,calculationBasis}',line#>'{JobCostingLine_SourceMetadataJSON,planningCharge,calculationBasis}',line#>'{JobCostingLine_SourceMetadataJSON,quoteCharge,calculationBasis}','null'));
$$;
revoke all on function booking_api.operational_charge_values(jsonb) from public,anon,authenticated,service_role;

create function booking_api.validate_operational_charge(value jsonb,context jsonb) returns void
language plpgsql set search_path='' as $$
declare field text; amount numeric; base text:=context->>'baseCurrency';
begin
 if jsonb_typeof(value) is distinct from 'object' or exists(select 1 from jsonb_object_keys(value) k where k not in
  ('id','code','description','supplierId','customerId','cost','sell','costCurrency','sellCurrency','costRoe','sellRoe','quantity','calculationBasis')) then
  raise exception 'Unsupported charge fields.' using errcode='22023';end if;
 if coalesce(value->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  or jsonb_typeof(value->'description') is distinct from 'string' or length(btrim(value->>'description')) not between 1 and 240
  or jsonb_typeof(value->'code') is distinct from 'string' or length(value->>'code')>80
  or (value ? 'calculationBasis' and (jsonb_typeof(value->'calculationBasis') not in ('string','null') or length(value->>'calculationBasis')>80)) then
  raise exception 'Each charge needs a valid identifier, code and description.' using errcode='22023';end if;
 foreach field in array array['cost','sell','costRoe','sellRoe','quantity'] loop
  if jsonb_typeof(value->field) is distinct from 'number' then raise exception 'Charge values must be numbers.' using errcode='22023';end if;
  amount:=(value->>field)::numeric;
  if amount<0 or amount>1000000000000 or (field in ('costRoe','sellRoe') and (amount<0.00001 or amount<>round(amount,5))) then
   raise exception 'Charge amounts or exchange rates are outside the supported range.' using errcode='22023';end if;
 end loop;
 foreach field in array array['costCurrency','sellCurrency'] loop
  if not exists(select 1 from jsonb_array_elements(context->'currencies') c(currency) where c.currency->>'code'=value->>field) then
   raise exception 'Choose an active charge currency.' using errcode='22023';end if;
 end loop;
 if (value->>'costCurrency'=base and (value->>'costRoe')::numeric<>1)
  or (value->>'sellCurrency'=base and (value->>'sellRoe')::numeric<>1) then
  raise exception 'The base-currency exchange rate must be 1.' using errcode='22023';end if;
 if (value->>'cost')::numeric/(value->>'costRoe')::numeric>=100000000000000
  or (value->>'sell')::numeric/(value->>'sellRoe')::numeric>=100000000000000 then
  raise exception 'The converted charge amount exceeds the supported range.' using errcode='22023';end if;
 perform booking_api.validate_planning_charge_parties(jsonb_build_array(value),context->'parties');
end $$;
revoke all on function booking_api.validate_operational_charge(jsonb,jsonb) from public,anon,authenticated,service_role;

create function booking_api.operational_charge_workspace(caller_auth_user_id uuid,requested_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; job public."Job_Header"%rowtype; lines jsonb; reason text; base text;
begin
 -- Reuse the real read/tenant boundary and currency/account catalogues, not the
 -- planning status decision. Operational editing has its own strict status gate.
 context:=booking_api.planning_charge_workspace(caller_auth_user_id,requested_job_id);
 select * into strict job from public."Job_Header" where "Job_ID"=requested_job_id;
 select upper(e."LegalEntity_BaseCurrencyCodeSnapshot") into base
 from public."cmp_LegalEntities" e join public."cmp_Offices" o on o."Company_ID"=e."Company_ID"
 where e."LegalEntity_ID"=job."Job_LegalEntityID" and e."LegalEntity_IsActive"
 and o."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID");
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then reason:='You have read-only access to this Booking.';
 elsif coalesce(lower(job."Job_Status"),'') not in ('open','in_progress') then reason:='Operational charges are only editable while In progress.';
 elsif base is null or not exists(select 1 from jsonb_array_elements(context->'currencies') c where c->>'code'=base) then
  reason:='Choose an active Booking legal entity and enable its base currency before editing charges.';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c."JobCostingLine_ID",'snapshot',to_jsonb(c),
  'values',booking_api.operational_charge_values(to_jsonb(c)),
  'blockedReason',case when booking_api.charge_has_financial_evidence(c."JobCostingLine_ID") then 'Financial evidence exists; a separate correction review is required.'
   when nullif(to_jsonb(c)->>'JobCostingLine_CostCurrencyID','') is not null or nullif(to_jsonb(c)->>'JobCostingLine_RevenueCurrencyID','') is not null or nullif(to_jsonb(c)->>'JobCostingLine_ChargeCodeID','') is not null then 'This legacy charge uses financial catalogue identifiers and needs a separate correction review.'
   when booking_api.operational_charge_values(to_jsonb(c))->>'costCurrency' is null or booking_api.operational_charge_values(to_jsonb(c))->>'sellCurrency' is null then 'Historical currencies need explicit review before this line can be edited.'
   when not exists(select 1 from booking_api.charge_origins o where o.costing_line_id=c."JobCostingLine_ID")
    and c."JobCostingLine_SourceTable" is distinct from 'booking_api.planning_charge_sets' then 'Confirm the historical charge origin before editing this line.' end)
  order by c."JobCostingLine_Number",c."JobCostingLine_ID"),'[]') into lines
 from public."Job_Costing_Lines" c where c."Job_ID"=requested_job_id and c."JobCostingLine_DomainCode"='freight';
 return jsonb_build_object('supported',true,'jobId',requested_job_id,'editable',reason is null,'blockedReason',reason,
  'baseCurrency',base,'currencies',context->'currencies','parties',context->'parties','lines',lines,
  'bookingUpdatedAt',job."Job_UpdatedAt");
end $$;
revoke all on function booking_api.operational_charge_workspace(uuid,uuid) from public,anon,authenticated,service_role;

create function booking_api.save_operational_charges(caller_auth_user_id uuid,requested_job_id uuid,
 expected_updated_at timestamptz,requested_operations jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; actor public."cmp_Users"%rowtype; job public."Job_Header"%rowtype;
 op jsonb; value jsonb; line public."Job_Costing_Lines"%rowtype; before_row jsonb; after_row jsonb;
 line_id uuid; line_number integer; reason text;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then
  raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
 select * into strict actor from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
 select j.* into strict job from public."Job_Header" j join public."cmp_Offices" o
 on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" and o."Company_ID"=actor."Company_ID" for update of j;
 if expected_updated_at is null or expected_updated_at is distinct from job."Job_UpdatedAt" then
  raise exception 'The Booking changed. Reload before saving charges.' using errcode='40001';end if;
 context:=booking_api.operational_charge_workspace(caller_auth_user_id,requested_job_id);
 if not (context->>'editable')::boolean then raise exception '%',context->>'blockedReason' using errcode='55000';end if;
 if jsonb_typeof(requested_operations) is distinct from 'array' or jsonb_array_length(requested_operations)>200
  or octet_length(requested_operations::text)>524288 then raise exception 'Invalid charge changes.' using errcode='22023';end if;
 if (select count(distinct (x->>'id')::uuid) from jsonb_array_elements(requested_operations) x)<>jsonb_array_length(requested_operations) then
  raise exception 'Choose only one action per charge.' using errcode='22023';end if;
 for op in select * from jsonb_array_elements(requested_operations) loop
  line_id:=(op->>'id')::uuid; value:=op->'after'; reason:=btrim(op->>'reason'); before_row:=null; after_row:=null;
  if reason is null or length(reason) not between 1 and 2000 or coalesce(op->>'action','') not in ('add','update','remove') then
   raise exception 'Each change needs a supported action and reason.' using errcode='22023';end if;
  if op->>'action'='add' then
   if exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=line_id)
    or exists(select 1 from booking_api.charge_origins where costing_line_id=line_id) then
    raise exception 'Charge identity already exists. Removed lines require explicit review.' using errcode='40001';end if;
  else
   select * into strict line from public."Job_Costing_Lines" where "JobCostingLine_ID"=line_id and "Job_ID"=requested_job_id
    and "JobCostingLine_DomainCode"='freight' for update;
   before_row:=to_jsonb(line);
   if op->'before' is distinct from before_row then raise exception 'A charge changed. Reload before saving.' using errcode='40001';end if;
   if exists(select 1 from jsonb_array_elements(context->'lines') x where x->>'id'=line_id::text and x->>'blockedReason' is not null) then
    raise exception 'This charge needs a separate review before editing.' using errcode='55000';end if;
   -- Recheck after acquiring the charge lock, not only from workspace evidence.
   if booking_api.charge_has_financial_evidence(line_id) then raise exception 'This charge now has financial evidence.' using errcode='55000';end if;
   if not exists(select 1 from booking_api.charge_origins where costing_line_id=line_id) then
    -- Known planning source is independently verified against its immutable release.
    if line."JobCostingLine_SourceTable"<>'booking_api.planning_charge_sets' or not exists(
      select 1 from booking_api.planning_charge_releases r where r.job_id=requested_job_id and line_id=any(r.costing_line_ids)) then
     raise exception 'Confirm the charge origin before editing.' using errcode='55000';end if;
    perform booking_api.record_charge_origin(caller_auth_user_id,requested_job_id,line_id,before_row,'booking',null,null,'Verified planning release');
   end if;
  end if;
  if op->>'action'='remove' then
   perform booking_api.remove_operational_charge(caller_auth_user_id,requested_job_id,line_id,before_row,reason);
   continue; -- The removal transaction already writes its full audit receipt.
  else
   if value->>'id' is distinct from line_id::text then raise exception 'Charge identity mismatch.' using errcode='22023';end if;
   perform booking_api.validate_operational_charge(value,context);
   if op->>'action'='add' then
    select coalesce(max("JobCostingLine_Number"),0)+1 into line_number from public."Job_Costing_Lines" where "Job_ID"=requested_job_id;
    insert into public."Job_Costing_Lines"("JobCostingLine_ID","Job_ID","JobCostingLine_Number","JobCostingLine_Description",
      "JobCostingLine_DomainCode","JobCostingLine_CreatedBy","JobCostingLine_UpdatedBy")
    values(line_id,requested_job_id,line_number,value->>'description','freight',actor."User_ID",actor."User_ID");
   end if;
   update public."Job_Costing_Lines" set
    "JobCostingLine_Description"=btrim(value->>'description'),"JobCostingLine_SupplierID"=(value->>'supplierId')::uuid,
    "JobCostingLine_CostAmountCurrency"=(value->>'cost')::numeric,"JobCostingLine_RevenueAmountCurrency"=(value->>'sell')::numeric,
    "JobCostingLine_CostROE"=(value->>'costRoe')::numeric,"JobCostingLine_RevenueROE"=(value->>'sellRoe')::numeric,
    "JobCostingLine_CostAmountLocal"=round((value->>'cost')::numeric/(value->>'costRoe')::numeric,4),
    "JobCostingLine_RevenueAmountLocal"=round((value->>'sell')::numeric/(value->>'sellRoe')::numeric,4),
    "JobCostingLine_SourceMetadataJSON"=coalesce("JobCostingLine_SourceMetadataJSON",'{}')||jsonb_build_object('bookingCharge',value,'baseCurrency',context->>'baseCurrency'),
    "JobCostingLine_UpdatedBy"=actor."User_ID","JobCostingLine_UpdatedAt"=clock_timestamp()
   where "JobCostingLine_ID"=line_id returning to_jsonb("Job_Costing_Lines") into after_row;
   if op->>'action'='add' then
    perform booking_api.record_charge_origin(caller_auth_user_id,requested_job_id,line_id,after_row,'booking',null,null,reason);
   end if;
  end if;
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
  values(actor."Company_ID",requested_job_id,'operational_charge_saved',case op->>'action' when 'add' then 'Booking charge added' when 'remove' then 'Booking charge deleted' else 'Booking charge changed' end,
   jsonb_build_object('reason',reason,'before',before_row,'after',after_row,'costingLineId',line_id,
    'planningHistory',jsonb_build_object('beforeRows',case when before_row is null then '[]'::jsonb else jsonb_build_array(booking_api.operational_charge_values(before_row)) end,
     'afterRows',case when after_row is null then '[]'::jsonb else jsonb_build_array(booking_api.operational_charge_values(after_row)) end)),actor."User_ID");
 end loop;
 if jsonb_array_length(requested_operations)>0 then
  update public."Job_Header" set "Job_UpdatedAt"=clock_timestamp(),"Job_UpdatedBy"=actor."User_ID" where "Job_ID"=requested_job_id;
 end if;
 return booking_api.operational_charge_workspace(caller_auth_user_id,requested_job_id);
exception when no_data_found or too_many_rows then
 raise exception 'The Booking, charge or identity is unavailable in this workspace.' using errcode='42501';
end $$;
revoke all on function booking_api.save_operational_charges(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;
commit;
