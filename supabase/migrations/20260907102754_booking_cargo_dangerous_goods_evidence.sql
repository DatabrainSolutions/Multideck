begin;
set local lock_timeout = '5s';

-- Supplied operational evidence only. No classification, transport approval,
-- compliance certification, Quote mutation, or reinterpretation of legacy data.
alter table public."Job_CargoDangerousGoods"
  alter column "JobCargoDG_MarinePollutant" drop not null,
  alter column "JobCargoDG_MarinePollutant" drop default,
  alter column "JobCargoDG_LimitedQuantity" drop not null,
  alter column "JobCargoDG_LimitedQuantity" drop default,
  add column "JobCargoDG_Source" text not null default 'legacy',
  add column "JobCargoDG_SourceReference" varchar(500),
  add column "JobCargoDG_Status" text not null default 'recorded',
  add column "JobCargoDG_CreatedBy" uuid references public."cmp_Users"("User_ID"),
  add column "JobCargoDG_UpdatedBy" uuid references public."cmp_Users"("User_ID"),
  add column "JobCargoDG_UpdatedAt" timestamptz not null default now(),
  add constraint booking_dg_source check ("JobCargoDG_Source" in ('legacy','operator')),
  add constraint booking_dg_status check ("JobCargoDG_Status" in ('recorded','voided'));
create index booking_dg_cargo_identity on public."Job_CargoDangerousGoods" ("JobCargoDG_JobCargoID","JobCargoDG_ID");
alter table public."Job_CargoDangerousGoods" enable row level security;
revoke all on public."Job_CargoDangerousGoods" from public, anon, authenticated, service_role;

create function booking_api.cargo_dangerous_goods_values(item public."Job_CargoDangerousGoods")
returns jsonb language sql stable set search_path = '' set timezone = 'UTC' as $$
  select jsonb_build_object(
    'id',item."JobCargoDG_ID",'cargoId',item."JobCargoDG_JobCargoID",
    'unNumber',item."JobCargoDG_UNNumber",'properShippingName',item."JobCargoDG_ProperShippingName",
    'class',item."JobCargoDG_Class",'packingGroup',item."JobCargoDG_PackingGroup",
    'flashPoint',item."JobCargoDG_FlashPoint",'marinePollutant',item."JobCargoDG_MarinePollutant",
    'limitedQuantity',item."JobCargoDG_LimitedQuantity",'emergencyContact',item."JobCargoDG_EmergencyContact",
    'notes',item."JobCargoDG_Notes",'source',item."JobCargoDG_Source",
    'sourceReference',item."JobCargoDG_SourceReference",'status',item."JobCargoDG_Status",
    'createdAt',item."JobCargoDG_CreatedAt",'createdBy',item."JobCargoDG_CreatedBy",
    'updatedAt',item."JobCargoDG_UpdatedAt",'updatedBy',item."JobCargoDG_UpdatedBy",
    'operatorEditable',item."JobCargoDG_Source"='operator' and item."JobCargoDG_CreatedBy" is not null
      and item."JobCargoDG_Status"='recorded');
$$;

-- Enrich only cargo already returned by the established permission-checked read.
alter function booking_api.workspace_extended(uuid,text) rename to workspace_before_dangerous_goods_20260907;
create function booking_api.workspace_extended(caller_auth_user_id uuid, requested_reference text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; cargo jsonb; job_id uuid;
begin
  result:=booking_api.workspace_before_dangerous_goods_20260907(caller_auth_user_id,requested_reference);
  job_id:=nullif(result#>>'{booking,jobId}','')::uuid;
  if job_id is null then return result; end if;
  select coalesce(jsonb_agg(line||jsonb_build_object('updatedAt',c."JobCargo_UpdatedAt",'dangerousGoods',(
    select coalesce(jsonb_agg(booking_api.cargo_dangerous_goods_values(d)
      order by d."JobCargoDG_CreatedAt",d."JobCargoDG_ID"),'[]'::jsonb)
    from public."Job_CargoDangerousGoods" d where d."JobCargoDG_JobCargoID"=c."JobCargo_ID"
  )) order by ordinal),'[]'::jsonb) into cargo
  from jsonb_array_elements(coalesce(result->'cargo','[]'::jsonb)) with ordinality entries(line,ordinal)
  join public."Job_Cargo" c on c."JobCargo_ID"::text=line->>'id' and c."JobCargo_JobID"=job_id
    and not c."JobCargo_IsDeleted";
  return jsonb_set(result,'{cargo}',cargo)||jsonb_build_object('dangerousGoodsSupported',true);
end $$;

-- Exact child delta; shared job -> cargo -> evidence lock order. Ordinary cargo
-- saves and accepted Quote updates retain child identities rather than replacing.
create function booking_api.save_cargo_dangerous_goods(caller_auth_user_id uuid, requested_job_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  actor record; job_row public."Job_Header"; cargo_row public."Job_Cargo";
  before_row public."Job_CargoDangerousGoods"; item public."Job_CargoDangerousGoods";
  record_id uuid; cargo_id uuid; changes jsonb; key text; value jsonb; text_value text;
  is_new boolean; before_values jsonb; after_values jsonb;
begin
  select "User_ID","Company_ID" into actor from public."cmp_Users"
    where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  if not found or booking_api.has_permission(caller_auth_user_id,'Bookings.Read') is not true
    or booking_api.has_permission(caller_auth_user_id,'Bookings.Write') is not true then
    raise exception 'You do not have permission to record Booking dangerous goods.' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not(payload ?& array['id','cargoId','expectedUpdatedAt','expectedCargoUpdatedAt','expectedRecordUpdatedAt','changes','reason'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in
      ('id','cargoId','expectedUpdatedAt','expectedCargoUpdatedAt','expectedRecordUpdatedAt','changes','reason'))
    or jsonb_typeof(payload->'reason') is distinct from 'string'
    or nullif(btrim(payload->>'reason'),'') is null or length(payload->>'reason')>2000
    or jsonb_typeof(payload->'changes') is distinct from 'object' then
    raise exception 'Choose the exact cargo record and provide its changes and reason.' using errcode='22023'; end if;
  if jsonb_typeof(payload->'id') is distinct from 'string' or jsonb_typeof(payload->'cargoId') is distinct from 'string'
    or payload->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or payload->>'cargoId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Choose valid cargo and dangerous-goods identities.' using errcode='22023'; end if;
  record_id:=(payload->>'id')::uuid; cargo_id:=(payload->>'cargoId')::uuid; changes:=payload->'changes';
  if changes='{}'::jsonb or exists(select 1 from jsonb_object_keys(changes) k where k not in
    ('unNumber','properShippingName','class','packingGroup','flashPoint','marinePollutant','limitedQuantity',
      'emergencyContact','notes','sourceReference','status')) then
    raise exception 'That dangerous-goods field is not available for editing.' using errcode='22023'; end if;
  select j.* into job_row from public."Job_Header" j
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    where j."Job_ID"=requested_job_id and o."Company_ID"=actor."Company_ID" and not j."Job_IsDeleted" for update of j;
  if not found then raise exception 'That Booking is outside this workspace.' using errcode='42501'; end if;
  select * into cargo_row from public."Job_Cargo"
    where "JobCargo_ID"=cargo_id and "JobCargo_JobID"=requested_job_id and not "JobCargo_IsDeleted" for update;
  if not found then raise exception 'Choose active cargo from this Booking.' using errcode='42501'; end if;
  if booking_api.parse_milestone_time(payload->'expectedUpdatedAt') is null
    or job_row."Job_UpdatedAt" is distinct from booking_api.parse_milestone_time(payload->'expectedUpdatedAt')
    or booking_api.parse_milestone_time(payload->'expectedCargoUpdatedAt') is null
    or cargo_row."JobCargo_UpdatedAt" is distinct from booking_api.parse_milestone_time(payload->'expectedCargoUpdatedAt') then
    raise exception 'The Booking or cargo changed. Reload before recording dangerous goods.' using errcode='PT409'; end if;
  select * into before_row from public."Job_CargoDangerousGoods" where "JobCargoDG_ID"=record_id for update;
  is_new:=not found;
  if is_new then
    if payload->'expectedRecordUpdatedAt'<>'null'::jsonb then
      raise exception 'That dangerous-goods record no longer exists. Reload the Booking.' using errcode='PT409'; end if;
    item."JobCargoDG_ID":=record_id; item."JobCargoDG_JobCargoID":=cargo_id;
    item."JobCargoDG_Source":='operator'; item."JobCargoDG_Status":='recorded';
    item."JobCargoDG_CreatedBy":=actor."User_ID"; item."JobCargoDG_CreatedAt":=clock_timestamp();
  else
    if before_row."JobCargoDG_JobCargoID"<>cargo_id or before_row."JobCargoDG_Source"<>'operator'
      or before_row."JobCargoDG_CreatedBy" is null then
      raise exception 'Keep the original supplied evidence. Record a new operator entry instead.' using errcode='42501'; end if;
    if before_row."JobCargoDG_UpdatedAt" is distinct from booking_api.parse_milestone_time(payload->'expectedRecordUpdatedAt') then
      raise exception 'This dangerous-goods record changed. Reload before correcting it.' using errcode='PT409'; end if;
    if before_row."JobCargoDG_Status"='voided' then
      raise exception 'Voided evidence is read-only. Record a new entry instead.' using errcode='22023'; end if;
    item:=before_row;
  end if;
  for key,value in select * from jsonb_each(changes) loop
    if key in ('marinePollutant','limitedQuantity') then
      if jsonb_typeof(value) not in ('boolean','null') then
        raise exception 'Choose Yes, No or Not recorded for dangerous-goods flags.' using errcode='22023'; end if;
      if key='marinePollutant' then item."JobCargoDG_MarinePollutant":=(value#>>'{}')::boolean;
      else item."JobCargoDG_LimitedQuantity":=(value#>>'{}')::boolean; end if;
      continue;
    end if;
    if jsonb_typeof(value) not in ('string','null') then
      raise exception 'Dangerous-goods values must be supplied text or an explicit clear.' using errcode='22023'; end if;
    text_value:=nullif(btrim(value#>>'{}'),'');
    if length(text_value)>(case key when 'unNumber' then 10 when 'class' then 20 when 'packingGroup' then 20
      when 'flashPoint' then 40 when 'properShippingName' then 240 when 'emergencyContact' then 180
      when 'sourceReference' then 500 when 'notes' then 8000 else 20 end) then
      raise exception 'That dangerous-goods value exceeds its supported length.' using errcode='22023'; end if;
    case key
      when 'unNumber' then item."JobCargoDG_UNNumber":=text_value;
      when 'properShippingName' then item."JobCargoDG_ProperShippingName":=text_value;
      when 'class' then item."JobCargoDG_Class":=text_value;
      when 'packingGroup' then item."JobCargoDG_PackingGroup":=text_value;
      when 'flashPoint' then item."JobCargoDG_FlashPoint":=text_value;
      when 'emergencyContact' then item."JobCargoDG_EmergencyContact":=text_value;
      when 'notes' then item."JobCargoDG_Notes":=text_value;
      when 'sourceReference' then item."JobCargoDG_SourceReference":=text_value;
      when 'status' then
        if text_value is null or text_value not in ('recorded','voided') or (is_new and text_value<>'recorded') then
          raise exception 'Choose Recorded or void an existing record.' using errcode='22023'; end if;
        item."JobCargoDG_Status":=text_value;
    end case;
  end loop;
  if item."JobCargoDG_SourceReference" is null or
    (item."JobCargoDG_UNNumber" is null and item."JobCargoDG_ProperShippingName" is null and item."JobCargoDG_Class" is null) then
    raise exception 'Record the source and at least one supplied UN number, shipping name or class. This does not certify completeness.' using errcode='22023'; end if;
  if item."JobCargoDG_Status"='voided' and changes<>'{"status":"voided"}'::jsonb then
    raise exception 'Void the retained record without rewriting its supplied values.' using errcode='22023'; end if;
  before_values:=case when is_new then null else booking_api.cargo_dangerous_goods_values(before_row) end;
  if not is_new and before_values=booking_api.cargo_dangerous_goods_values(item) then return before_values; end if;
  item."JobCargoDG_UpdatedAt":=clock_timestamp(); item."JobCargoDG_UpdatedBy":=actor."User_ID";
  if is_new then
    insert into public."Job_CargoDangerousGoods" select (item).*;
  else
    update public."Job_CargoDangerousGoods" set
      "JobCargoDG_UNNumber"=item."JobCargoDG_UNNumber","JobCargoDG_ProperShippingName"=item."JobCargoDG_ProperShippingName",
      "JobCargoDG_Class"=item."JobCargoDG_Class","JobCargoDG_PackingGroup"=item."JobCargoDG_PackingGroup",
      "JobCargoDG_FlashPoint"=item."JobCargoDG_FlashPoint","JobCargoDG_MarinePollutant"=item."JobCargoDG_MarinePollutant",
      "JobCargoDG_LimitedQuantity"=item."JobCargoDG_LimitedQuantity","JobCargoDG_EmergencyContact"=item."JobCargoDG_EmergencyContact",
      "JobCargoDG_Notes"=item."JobCargoDG_Notes","JobCargoDG_SourceReference"=item."JobCargoDG_SourceReference",
      "JobCargoDG_Status"=item."JobCargoDG_Status","JobCargoDG_UpdatedAt"=item."JobCargoDG_UpdatedAt",
      "JobCargoDG_UpdatedBy"=item."JobCargoDG_UpdatedBy" where "JobCargoDG_ID"=record_id;
  end if;
  update public."Job_Header" set "Job_UpdatedAt"=item."JobCargoDG_UpdatedAt","Job_UpdatedBy"=actor."User_ID"
    where "Job_ID"=requested_job_id;
  after_values:=booking_api.cargo_dangerous_goods_values(item);
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    values(actor."Company_ID",requested_job_id,'cargo_dangerous_goods_recorded',
      case when is_new then 'Dangerous-goods evidence recorded' when item."JobCargoDG_Status"='voided'
        then 'Dangerous-goods evidence voided' else 'Dangerous-goods evidence corrected' end,
      jsonb_build_object('cargoId',cargo_id,'dangerousGoodsId',record_id,'before',before_values,'after',after_values,
        'reason',btrim(payload->>'reason'),'source','operator'),actor."User_ID");
  return after_values;
end $$;

create function public.booking_workflow_save_dangerous_goods(caller_auth_user_id uuid, requested_job_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare reference text;
begin
  perform booking_api.save_cargo_dangerous_goods(caller_auth_user_id,requested_job_id,payload);
  select "Job_BookingReference" into reference from public."Job_Header" where "Job_ID"=requested_job_id;
  return booking_api.workspace_with_document_groups(caller_auth_user_id,reference);
end $$;
revoke all on function booking_api.cargo_dangerous_goods_values(public."Job_CargoDangerousGoods"),
  booking_api.save_cargo_dangerous_goods(uuid,uuid,jsonb), booking_api.workspace_before_dangerous_goods_20260907(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function booking_api.workspace_extended(uuid,text),public.booking_workflow_save_dangerous_goods(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function booking_api.workspace_extended(uuid,text),public.booking_workflow_save_dangerous_goods(uuid,uuid,jsonb) to service_role;
commit;
