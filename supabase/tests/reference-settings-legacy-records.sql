-- Set test.reference_actor to an existing tenant administrator auth UUID before running.
-- Run against an existing tenant in a transaction; all changes are rolled back.
begin;
do $test$
declare
  actor_id uuid;
  company_id_value uuid;
  settings jsonb;
  result jsonb;
  changed integer;
begin
  select u."Auth_User_ID", u."Company_ID" into strict actor_id, company_id_value
  from public."cmp_Users" u
  where u."Auth_User_ID" = current_setting('test.reference_actor')::uuid
    and u."User_AccessStatus" = 'active';
  settings := public.quote_workflow_get_reference_settings(actor_id);
  create temp table reference_before on commit drop as
    select j."Job_ID", j."Job_BookingReference", j."Job_Direction"
    from public."Job_Header" j
    join public."cmp_Offices" o on o."Office_ID" = coalesce(j."Job_OrgOfficeID", j."Job_OfficeID")
    where o."Company_ID" = company_id_value and not j."Job_IsDeleted";
  create temp table customer_reference_before on commit drop as
    select p."CRMAccount_OrgID", o."Org_AccCode"
    from public."CRM_AccountProfiles" p
    join public."Org_Master" o on o."Org_id" = p."CRMAccount_OrgID"
    where p."CRMAccount_CompanyID" = company_id_value
      and not p."CRMAccount_IsDeleted"
      and coalesce(p."CRMAccount_ReferenceSequenceValue", 0) < 1;
  result := public.quote_workflow_save_reference_settings(
    actor_id, settings->>'quotePattern', (settings->>'quoteNextNumber')::bigint,
    settings->'bookingPatterns', settings->>'customerPattern', (settings->>'customerNextNumber')::bigint
  );
  select count(*) into changed from reference_before b
  join public."Job_Header" j on j."Job_ID" = b."Job_ID"
  where coalesce(b."Job_Direction", 'unknown') in ('unknown', '')
    and j."Job_BookingReference" is distinct from b."Job_BookingReference";
  if changed <> 0 then raise exception 'Undirected references changed'; end if;
  if exists (select 1 from customer_reference_before b
    join public."Org_Master" o on o."Org_id" = b."CRMAccount_OrgID"
    where o."Org_AccCode" is distinct from b."Org_AccCode") then
    raise exception 'Imported customer codes changed';
  end if;
  if result->>'quotePattern' is distinct from settings->>'quotePattern'
    or result->>'customerPattern' is distinct from settings->>'customerPattern' then
    raise exception 'Reference recipes changed unexpectedly';
  end if;
  -- The allocation renderer must still reject missing direction for new references.
  begin
    perform quote_api.render_reference_pattern('J{DIRECTION:1}{NUMBER:7}', 1, company_id_value, null);
    raise exception 'Missing direction was accepted';
  exception when invalid_parameter_value then null;
  end;
  if quote_api.render_reference_pattern('J{DIRECTION:1}{NUMBER:7}', 1, company_id_value, 'export') <> 'JE0000001' then
    raise exception 'Known direction did not render';
  end if;
end;
$test$;
rollback;

