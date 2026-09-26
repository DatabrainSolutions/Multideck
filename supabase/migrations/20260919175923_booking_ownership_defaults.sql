begin;
set local lock_timeout = '5s';

-- Private helpers: the existing authenticated creation functions remain the entry points.
-- Do not change existing Bookings, Quotes, user assignments or tenant configuration.
create function booking_api.default_booking_office(requested_user_id uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare company uuid; candidates uuid[];
begin
  select "Company_ID" into company from public."cmp_Users"
  where "User_ID"=requested_user_id and "User_AccessStatus"='active';
  if company is null then raise exception 'Booking creation is not authorised.' using errcode='42501'; end if;

  -- An explicit security assignment takes precedence over legacy team assignments.
  -- Expired, disabled or denied assignments must not fall through to company-wide access.
  if exists(select 1 from public."SEC_UserOfficeAccess" where "SECUserOffice_UserID"=requested_user_id) then
    select array_agg(o."Office_ID" order by a."SECUserOffice_IsDefault" desc,o."Office_ID") into candidates
    from public."SEC_UserOfficeAccess" a join public."cmp_Offices" o on o."Office_ID"=a."SECUserOffice_OrgOfficeID"
    where a."SECUserOffice_UserID"=requested_user_id and a."SECUserOffice_StatusCode"='active'
      and a."SECUserOffice_CanView" and a."SECUserOffice_CanCreateJobs"
      and now()>=a."SECUserOffice_EffectiveFrom" and (a."SECUserOffice_EffectiveTo" is null or now()<a."SECUserOffice_EffectiveTo")
      and o."Company_ID"=company and o."Office_IsActive"
      and (a."SECUserOffice_IsDefault" or not exists(
        select 1 from public."SEC_UserOfficeAccess" d where d."SECUserOffice_UserID"=requested_user_id and d."SECUserOffice_IsDefault"));
  elsif exists(select 1 from public."cmp_Users_Offices" where "User_ID"=requested_user_id) then
    select array_agg(o."Office_ID") into candidates from public."cmp_Users_Offices" a
    join public."cmp_Offices" o on o."Office_ID"=a."Office_ID"
    where a."User_ID"=requested_user_id and o."Company_ID"=company and o."Office_IsActive";
  else
    -- A single company branch is unambiguous. Multiple branches need a user assignment.
    select array_agg("Office_ID") into candidates from public."cmp_Offices"
    where "Company_ID"=company and "Office_IsActive";
  end if;
  if coalesce(cardinality(candidates),0)<>1 then
    raise exception 'Set one active default branch for this user before creating a Booking.' using errcode='22023';
  end if;
  return candidates[1];
end $$;

create function booking_api.default_booking_legal_entity(requested_office_id uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare office public."cmp_Offices"%rowtype; candidates uuid[]; chosen uuid; currency text;
begin
  select * into office from public."cmp_Offices" where "Office_ID"=requested_office_id and "Office_IsActive";
  if not found then raise exception 'Choose an active Booking branch.' using errcode='22023'; end if;
  if office."Office_LegalEntityID" is not null then
    chosen:=office."Office_LegalEntityID";
  else
    select array_agg("LegalEntity_ID") into candidates from public."cmp_LegalEntities"
    where "Company_ID"=office."Company_ID" and "LegalEntity_IsActive" and "LegalEntity_IsDefault";
    if coalesce(cardinality(candidates),0)=0 then
      select array_agg("LegalEntity_ID") into candidates from public."cmp_LegalEntities"
      where "Company_ID"=office."Company_ID" and "LegalEntity_IsActive";
    end if;
    if coalesce(cardinality(candidates),0)<>1 then
      raise exception 'Configure one billing entity for this Booking branch before continuing.' using errcode='22023';
    end if;
    chosen:=candidates[1];
  end if;
  select "LegalEntity_BaseCurrencyCodeSnapshot" into currency from public."cmp_LegalEntities"
  where "LegalEntity_ID"=chosen and "Company_ID"=office."Company_ID" and "LegalEntity_IsActive";
  if not found or currency is null or currency !~ '^[A-Z]{3}$' then
    raise exception 'The Booking branch needs an active billing entity in this company with a base currency.' using errcode='22023';
  end if;
  return chosen;
end $$;

revoke all on function booking_api.default_booking_office(uuid),booking_api.default_booking_legal_entity(uuid)
from public,anon,authenticated,service_role;

-- Patch only creation anchors in the installed functions, preserving colleague changes.
-- An unexpected definition stops the transaction rather than replacing it wholesale.
do $patch$
declare definition text; before_text text; after_text text; signature text;
begin
  signature:='booking_api.open_booking(uuid,uuid,text,text)';
  definition:=pg_get_functiondef(signature::regprocedure);
  before_text:=$old$select office."Office_ID" into office_id from public."cmp_Offices" office
    where office."Company_ID"=app_user."Company_ID" and office."Office_IsActive" order by office."Office_ID" limit 1;$old$;
  after_text:='office_id:=booking_api.default_booking_office(app_user."User_ID");';
  if position(before_text in definition)=0 then raise exception 'Booking opener changed: review ownership migration.'; end if;
  definition:=replace(definition,before_text,after_text);
  before_text:='"Job_OfficeID","Job_OrgOfficeID","Job_Status"';
  if position(before_text in definition)=0 then raise exception 'Booking insertion changed.'; end if;
  definition:=replace(definition,before_text,'"Job_OfficeID","Job_OrgOfficeID","Job_LegalEntityID","Job_Status"');
  before_text:='null,office_id,office_id,''draft''';
  if position(before_text in definition)=0 then raise exception 'Booking values changed.'; end if;
  definition:=replace(definition,before_text,'null,office_id,office_id,booking_api.default_booking_legal_entity(office_id),''draft''');
  before_text:=') returning "Job_ID" into job_id;';
  after_text:=before_text||$audit$
  insert into booking_api.events(company_id,job_id,event_type,summary,actor_user_id,metadata)
    select o."Company_ID",j."Job_ID",'ownership_assigned','Booking branch and billing entity assigned.',j."Job_CreatedBy",
      jsonb_build_object('officeId',j."Job_OrgOfficeID",'legalEntityId',j."Job_LegalEntityID",'source','creation_defaults')
    from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=j."Job_OrgOfficeID" where j."Job_ID"=job_id;
$audit$;
  if position(before_text in definition)=0 then raise exception 'Booking creation audit anchor changed.'; end if;
  definition:=replace(definition,before_text,after_text);
  execute definition;

  signature:='booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid)';
  definition:=pg_get_functiondef(signature::regprocedure);
  before_text:='"Job_OfficeID", "Job_OrgOfficeID", "Job_Status"';
  if position(before_text in definition)=0 then raise exception 'Quote conversion insertion changed.'; end if;
  definition:=replace(definition,before_text,'"Job_OfficeID", "Job_OrgOfficeID", "Job_LegalEntityID", "Job_Status"');
  before_text:='office_id, office_id, job_status, direction_code, mode_code';
  if position(before_text in definition)=0 then raise exception 'Quote conversion values changed.'; end if;
  definition:=replace(definition,before_text,'office_id, office_id, booking_api.default_booking_legal_entity(office_id), job_status, direction_code, mode_code');
  before_text:=') returning "Job_ID" into job_id;';
  if position(before_text in definition)=0 then raise exception 'Quote conversion audit anchor changed.'; end if;
  definition:=replace(definition,before_text,after_text);
  execute definition;
end $patch$;

-- Ownership is set only at creation and is not an operator/Dexter reassignment capability.
comment on function booking_api.default_booking_office(uuid) is
'Creation-only default resolution. Not a public or Dexter write API; explicit office reassignment and ownership watches are unsupported in this microstep.';
commit;
