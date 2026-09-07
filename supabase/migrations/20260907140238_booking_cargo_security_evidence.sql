begin;
set local lock_timeout = '5s';

-- Supplied operational evidence, independent of AWB issuance and Customs.
-- No inferred screening, clearance, regulated-agent validation or certification.
create table booking_api.cargo_security_evidence (
  id uuid primary key,
  cargo_id uuid not null references public."Job_Cargo"("JobCargo_ID"),
  record_status text not null default 'recorded' check (record_status in ('recorded','voided')),
  security_status varchar(80),
  screening_method varchar(80),
  screened_by_name varchar(180),
  agent_reference varchar(80),
  screened_at timestamptz,
  source_reference varchar(500) not null check (btrim(source_reference)<>''),
  notes varchar(8000),
  created_at timestamptz not null,
  created_by uuid not null references public."cmp_Users"("User_ID"),
  updated_at timestamptz not null,
  updated_by uuid not null references public."cmp_Users"("User_ID"),
  check (security_status is not null or screening_method is not null or screened_at is not null)
);
create index cargo_security_evidence_cargo on booking_api.cargo_security_evidence(cargo_id,created_at,id);
create index cargo_security_evidence_creator on booking_api.cargo_security_evidence(created_by);
create index cargo_security_evidence_updater on booking_api.cargo_security_evidence(updated_by);
alter table booking_api.cargo_security_evidence enable row level security;
revoke all on booking_api.cargo_security_evidence from public,anon,authenticated,service_role;

create function booking_api.cargo_security_evidence_values(item booking_api.cargo_security_evidence)
returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
  select jsonb_build_object('id',item.id,'cargoId',item.cargo_id,'recordStatus',item.record_status,
    'securityStatus',item.security_status,'screeningMethod',item.screening_method,
    'screenedByName',item.screened_by_name,'agentReference',item.agent_reference,
    'screenedAt',item.screened_at,'sourceReference',item.source_reference,'notes',item.notes,
    'source','operator','createdAt',item.created_at,'createdBy',item.created_by,
    'updatedAt',item.updated_at,'updatedBy',item.updated_by,'operatorEditable',item.record_status='recorded');
$$;

create function booking_api.save_cargo_security_evidence(caller_auth_user_id uuid, requested_job_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  actor record; job public."Job_Header"; cargo public."Job_Cargo";
  previous booking_api.cargo_security_evidence; item booking_api.cargo_security_evidence;
  record_id uuid; cargo_id uuid; changes jsonb; key text; value jsonb; supplied text;
  is_new boolean; before_values jsonb; after_values jsonb;
begin
  select "User_ID","Company_ID" into actor from public."cmp_Users"
    where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  if not found or booking_api.has_permission(caller_auth_user_id,'Bookings.Read') is not true
    or booking_api.has_permission(caller_auth_user_id,'Bookings.Write') is not true then
    raise exception 'You do not have permission to record Booking screening evidence.' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not(payload ?& array['id','cargoId','expectedUpdatedAt','expectedCargoUpdatedAt','expectedRecordUpdatedAt','changes','reason'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in
      ('id','cargoId','expectedUpdatedAt','expectedCargoUpdatedAt','expectedRecordUpdatedAt','changes','reason'))
    or jsonb_typeof(payload->'reason') is distinct from 'string'
    or nullif(btrim(payload->>'reason'),'') is null or length(payload->>'reason')>2000
    or jsonb_typeof(payload->'changes') is distinct from 'object' then
    raise exception 'Choose exact cargo and supply the evidence changes and reason.' using errcode='22023'; end if;
  if jsonb_typeof(payload->'id') is distinct from 'string' or jsonb_typeof(payload->'cargoId') is distinct from 'string'
    or payload->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or payload->>'cargoId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Choose valid cargo and screening-evidence identities.' using errcode='22023'; end if;
  record_id:=(payload->>'id')::uuid; cargo_id:=(payload->>'cargoId')::uuid; changes:=payload->'changes';
  if changes='{}'::jsonb or exists(select 1 from jsonb_object_keys(changes) k where k not in
    ('securityStatus','screeningMethod','screenedByName','agentReference','screenedAt','sourceReference','notes','recordStatus')) then
    raise exception 'That screening-evidence field is not available for editing.' using errcode='22023'; end if;
  select j.* into job from public."Job_Header" j
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    where j."Job_ID"=requested_job_id and o."Company_ID"=actor."Company_ID" and not j."Job_IsDeleted" for update of j;
  if not found then raise exception 'That Booking is outside this workspace.' using errcode='42501'; end if;
  select * into cargo from public."Job_Cargo"
    where "JobCargo_ID"=cargo_id and "JobCargo_JobID"=requested_job_id and not "JobCargo_IsDeleted" for update;
  if not found then raise exception 'Choose active cargo from this Booking.' using errcode='42501'; end if;
  if booking_api.parse_milestone_time(payload->'expectedUpdatedAt') is null
    or job."Job_UpdatedAt" is distinct from booking_api.parse_milestone_time(payload->'expectedUpdatedAt')
    or booking_api.parse_milestone_time(payload->'expectedCargoUpdatedAt') is null
    or cargo."JobCargo_UpdatedAt" is distinct from booking_api.parse_milestone_time(payload->'expectedCargoUpdatedAt') then
    raise exception 'The Booking or cargo changed. Reload before recording screening evidence.' using errcode='PT409'; end if;
  select * into previous from booking_api.cargo_security_evidence where id=record_id for update;
  is_new:=not found;
  if is_new then
    if payload->'expectedRecordUpdatedAt'<>'null'::jsonb then
      raise exception 'That evidence no longer exists. Reload the Booking.' using errcode='PT409'; end if;
    item.id:=record_id; item.cargo_id:=cargo_id; item.record_status:='recorded';
    item.created_by:=actor."User_ID"; item.created_at:=clock_timestamp();
  else
    if previous.cargo_id<>cargo_id then
      raise exception 'That evidence belongs to different cargo.' using errcode='42501'; end if;
    if previous.updated_at is distinct from booking_api.parse_milestone_time(payload->'expectedRecordUpdatedAt') then
      raise exception 'This evidence changed. Reload before correcting it.' using errcode='PT409'; end if;
    if previous.record_status='voided' then
      raise exception 'Voided evidence is read-only. Record a new entry instead.' using errcode='22023'; end if;
    item:=previous;
  end if;
  for key,value in select * from jsonb_each(changes) loop
    if key='screenedAt' then item.screened_at:=booking_api.parse_milestone_time(value); continue; end if;
    if jsonb_typeof(value) not in ('string','null') then
      raise exception 'Screening evidence must be supplied text or an explicit clear.' using errcode='22023'; end if;
    -- Keep supplied text verbatim. Only blank/whitespace-only input becomes unknown.
    supplied:=case when nullif(btrim(value#>>'{}'),'') is null then null else value#>>'{}' end;
    if length(supplied)>(case key when 'screenedByName' then 180 when 'sourceReference' then 500
      when 'notes' then 8000 when 'recordStatus' then 20 else 80 end) then
      raise exception 'That screening-evidence value exceeds its supported length.' using errcode='22023'; end if;
    case key
      when 'securityStatus' then item.security_status:=supplied;
      when 'screeningMethod' then item.screening_method:=supplied;
      when 'screenedByName' then item.screened_by_name:=supplied;
      when 'agentReference' then item.agent_reference:=supplied;
      when 'sourceReference' then item.source_reference:=supplied;
      when 'notes' then item.notes:=supplied;
      when 'recordStatus' then
        if supplied is null or supplied not in ('recorded','voided') or (is_new and supplied<>'recorded') then
          raise exception 'Record supplied evidence or void an existing entry.' using errcode='22023'; end if;
        item.record_status:=supplied;
    end case;
  end loop;
  if item.source_reference is null or (item.security_status is null and item.screening_method is null and item.screened_at is null) then
    raise exception 'Record the source and at least one supplied status, method or screening time. This is not clearance.' using errcode='22023'; end if;
  if item.record_status='voided' and changes<>'{"recordStatus":"voided"}'::jsonb then
    raise exception 'Void the retained entry without rewriting its supplied evidence.' using errcode='22023'; end if;
  before_values:=case when is_new then null else booking_api.cargo_security_evidence_values(previous) end;
  if not is_new and before_values=booking_api.cargo_security_evidence_values(item) then return before_values; end if;
  item.updated_at:=clock_timestamp(); item.updated_by:=actor."User_ID";
  if is_new then insert into booking_api.cargo_security_evidence select (item).*;
  else
    update booking_api.cargo_security_evidence set record_status=item.record_status,security_status=item.security_status,
      screening_method=item.screening_method,screened_by_name=item.screened_by_name,agent_reference=item.agent_reference,
      screened_at=item.screened_at,source_reference=item.source_reference,notes=item.notes,
      updated_at=item.updated_at,updated_by=item.updated_by where id=record_id;
  end if;
  update public."Job_Header" set "Job_UpdatedAt"=item.updated_at,"Job_UpdatedBy"=actor."User_ID" where "Job_ID"=requested_job_id;
  after_values:=booking_api.cargo_security_evidence_values(item);
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    values(actor."Company_ID",requested_job_id,'cargo_security_evidence_recorded',
      case when is_new then 'Screening evidence recorded' when item.record_status='voided' then 'Screening evidence voided'
        else 'Screening evidence corrected' end,
      jsonb_build_object('cargoId',cargo_id,'evidenceId',record_id,'before',before_values,'after',after_values,
        'reason',payload->>'reason','source','operator'),actor."User_ID");
  return after_values;
end $$;

-- Enrich only cargo returned by the established permission-checked workspace.
alter function booking_api.workspace_extended(uuid,text) rename to workspace_before_security_evidence_20260907;
create function booking_api.workspace_extended(caller_auth_user_id uuid, requested_reference text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; cargo jsonb; job_id uuid;
begin
  result:=booking_api.workspace_before_security_evidence_20260907(caller_auth_user_id,requested_reference);
  job_id:=nullif(result#>>'{booking,jobId}','')::uuid;
  if job_id is null then return result; end if;
  select coalesce(jsonb_agg(line||jsonb_build_object('securityEvidence',(
    select coalesce(jsonb_agg(booking_api.cargo_security_evidence_values(e) order by e.created_at,e.id),'[]'::jsonb)
    from booking_api.cargo_security_evidence e where e.cargo_id=c."JobCargo_ID"
  )) order by ordinal),'[]'::jsonb) into cargo
  from jsonb_array_elements(coalesce(result->'cargo','[]'::jsonb)) with ordinality entries(line,ordinal)
  join public."Job_Cargo" c on c."JobCargo_ID"::text=line->>'id' and c."JobCargo_JobID"=job_id and not c."JobCargo_IsDeleted";
  return jsonb_set(result,'{cargo}',cargo)||jsonb_build_object('securityEvidenceSupported',true);
end $$;
create function public.booking_workflow_save_security_evidence(caller_auth_user_id uuid, requested_job_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reference text;
begin
  perform booking_api.save_cargo_security_evidence(caller_auth_user_id,requested_job_id,payload);
  select "Job_BookingReference" into reference from public."Job_Header" where "Job_ID"=requested_job_id;
  return booking_api.workspace_with_document_groups(caller_auth_user_id,reference);
end $$;
revoke all on function booking_api.cargo_security_evidence_values(booking_api.cargo_security_evidence),
  booking_api.save_cargo_security_evidence(uuid,uuid,jsonb),booking_api.workspace_before_security_evidence_20260907(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function booking_api.workspace_extended(uuid,text),public.booking_workflow_save_security_evidence(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function booking_api.workspace_extended(uuid,text),public.booking_workflow_save_security_evidence(uuid,uuid,jsonb) to service_role;
commit;
