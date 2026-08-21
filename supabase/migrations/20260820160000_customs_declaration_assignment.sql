-- Give every authorised Customs declaration one visible, transferable operator.
-- Assignment is company-scoped, audited, permission-aware and exposed to
-- Dexter reads/watches without giving Dexter a generic user-management write.

begin;

alter table public."Customs_Declarations"
  add column if not exists "CUST_AssignedUserID" uuid references public."cmp_Users"("User_ID") on delete set null;

create index if not exists "IX_Customs_Declarations_assigned_user"
  on public."Customs_Declarations" ("CUST_AssignedUserID", "CUST_UpdatedAt" desc)
  where not "CUST_IsDeleted";

-- Existing declarations start with their creator as the responsible operator.
-- This backfill deliberately preserves CUST_UpdatedAt.
update public."Customs_Declarations" declaration
set "CUST_AssignedUserID" = creator."User_ID"
from public."cmp_Users" creator
where declaration."CUST_AssignedUserID" is null
  and creator."Auth_User_ID" = declaration."CUST_CreatedBy"
  and coalesce(creator."User_AccessStatus", 'active') = 'active';

create or replace function public._multideck_customs_default_assignee()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new."CUST_AssignedUserID" is null and new."CUST_CreatedBy" is not null then
    select workspace_user."User_ID" into new."CUST_AssignedUserID"
    from public."cmp_Users" workspace_user
    where workspace_user."Auth_User_ID" = new."CUST_CreatedBy"
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
    order by workspace_user."User_ID"
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public._multideck_customs_default_assignee() from public, anon, authenticated;
drop trigger if exists "TR_Customs_Declarations_default_assignee" on public."Customs_Declarations";
create trigger "TR_Customs_Declarations_default_assignee"
before insert on public."Customs_Declarations"
for each row execute function public._multideck_customs_default_assignee();

-- Preserve the existing creator/department boundaries and add an exact
-- assignee route. Job-related assignees still need the normal Customs
-- permission, so assigning responsibility never grants product access.
create or replace function booking_api.customs_access(
  caller_auth_user_id uuid,
  requested_declaration_id uuid,
  require_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."Customs_Declarations" declaration
    join public."cmp_Users" declaration_creator
      on declaration_creator."Auth_User_ID" = declaration."CUST_CreatedBy"
    join public."cmp_Users" caller
      on caller."Auth_User_ID" = caller_auth_user_id
    where declaration."CUST_id" = requested_declaration_id
      and not declaration."CUST_IsDeleted"
      and caller."Company_ID" is not null
      and caller."Company_ID" = declaration_creator."Company_ID"
      and coalesce(caller."User_AccessStatus", 'active') = 'active'
      and coalesce(declaration_creator."User_AccessStatus", 'active') <> 'deleted'
      and booking_api.has_permission(
        caller_auth_user_id,
        case when require_write then 'Customs.Write' else 'Customs.Read' end
      )
  )
$$;

revoke all on function booking_api.customs_access(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.multideck_customs_assignment_users_page(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, booking_api
as $$
declare
  v_actor record;
  v_search text := left(lower(btrim(coalesce(p_search, ''))), 200);
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_result jsonb;
begin
  select workspace_user."User_ID", workspace_user."Company_ID"
  into v_actor
  from public."cmp_Users" workspace_user
  where workspace_user."Auth_User_ID" = auth.uid()
    and coalesce(workspace_user."User_AccessStatus", 'active') = 'active';

  if v_actor."User_ID" is null or not (
    booking_api.has_permission(auth.uid(), 'Customs.Read')
    or booking_api.has_permission(auth.uid(), 'Customs.Write')
  ) then
    raise exception 'You do not have permission to view Customs assignees.' using errcode = '42501';
  end if;

  v_pattern := '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  with eligible as materialized (
    select
      workspace_user."User_ID" as id,
      workspace_user."User_Firstname"::text as first_name,
      workspace_user."User_Lastname"::text as last_name,
      coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email",
        'Unnamed user'
      ) as display_name,
      workspace_user."User_Email"::text as email,
      workspace_user."User_JobTitle"::text as job_title,
      workspace_user."User_ProfilePhotoBucket"::text as photo_bucket,
      workspace_user."User_ProfilePhotoPath"::text as photo_path,
      workspace_user."User_ProfilePhotoMimeType"::text as photo_mime_type,
      workspace_user."User_ProfilePhotoSizeBytes" as photo_size_bytes,
      workspace_user."User_ProfilePhotoUpdatedAt" as photo_updated_at,
      booking_api.has_permission(workspace_user."Auth_User_ID", 'Customs.Write') as can_work_customs
    from public."cmp_Users" workspace_user
    where workspace_user."Company_ID" = v_actor."Company_ID"
      and workspace_user."Auth_User_ID" is not null
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
      and (
        v_search = ''
        or lower(coalesce(workspace_user."User_Firstname", '') || ' ' || coalesce(workspace_user."User_Lastname", '')) like v_pattern escape E'\\'
        or lower(coalesce(workspace_user."User_Email", '')) like v_pattern escape E'\\'
      )
  ), page as materialized (
    select eligible.* from eligible
    order by lower(eligible.display_name), lower(eligible.email), eligible.id
    offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', page.id,
      'displayName', page.display_name,
      'firstName', page.first_name,
      'lastName', page.last_name,
      'email', page.email,
      'jobTitle', page.job_title,
      'canWorkCustoms', page.can_work_customs,
      'profilePhoto', case when page.photo_path is null then null else jsonb_build_object(
        'bucket', page.photo_bucket,
        'path', page.photo_path,
        'mimeType', page.photo_mime_type,
        'sizeBytes', page.photo_size_bytes,
        'updatedAt', page.photo_updated_at
      ) end
    )) order by lower(page.display_name), lower(page.email), page.id) from page), '[]'::jsonb),
    'total', (select count(*) from eligible),
    'limit', v_limit,
    'offset', v_offset
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.multideck_customs_assignees_by_ids(p_user_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, booking_api
as $$
declare
  v_actor record;
  v_ids uuid[] := coalesce(p_user_ids, '{}'::uuid[]);
  v_result jsonb;
begin
  if cardinality(v_ids) > 50 then
    raise exception 'Choose up to 50 Customs assignees.' using errcode = '22023';
  end if;
  select workspace_user."User_ID", workspace_user."Company_ID" into v_actor
  from public."cmp_Users" workspace_user
  where workspace_user."Auth_User_ID" = auth.uid()
    and coalesce(workspace_user."User_AccessStatus", 'active') = 'active';
  if v_actor."User_ID" is null or not (
    booking_api.has_permission(auth.uid(), 'Customs.Read')
    or booking_api.has_permission(auth.uid(), 'Customs.Write')
  ) then raise exception 'You do not have permission to view Customs assignees.' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', workspace_user."User_ID",
    'displayName', coalesce(nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''), workspace_user."User_Email", 'Unnamed user'),
    'firstName', workspace_user."User_Firstname",
    'lastName', workspace_user."User_Lastname",
    'email', workspace_user."User_Email",
    'jobTitle', workspace_user."User_JobTitle",
    'canWorkCustoms', booking_api.has_permission(workspace_user."Auth_User_ID", 'Customs.Write'),
    'profilePhoto', case when workspace_user."User_ProfilePhotoPath" is null then null else jsonb_build_object(
      'bucket', workspace_user."User_ProfilePhotoBucket", 'path', workspace_user."User_ProfilePhotoPath",
      'mimeType', workspace_user."User_ProfilePhotoMimeType", 'sizeBytes', workspace_user."User_ProfilePhotoSizeBytes",
      'updatedAt', workspace_user."User_ProfilePhotoUpdatedAt"
    ) end
  )) order by workspace_user."User_ID"), '[]'::jsonb) into v_result
  from public."cmp_Users" workspace_user
  where workspace_user."Company_ID" = v_actor."Company_ID"
    and workspace_user."User_ID" = any(v_ids)
    and coalesce(workspace_user."User_AccessStatus", 'active') <> 'deleted';
  return v_result;
end;
$$;

create or replace function public.assign_customs_declaration(
  p_declaration_id uuid,
  p_assigned_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, booking_api
as $$
declare
  v_actor record;
  v_target record;
  v_old_assigned_user_id uuid;
  v_reference text;
begin
  if auth.uid() is null or not booking_api.customs_access(auth.uid(), p_declaration_id, true) then
    raise exception 'This Customs declaration is unavailable or cannot be reassigned.' using errcode = '42501';
  end if;
  select workspace_user."User_ID", workspace_user."Company_ID" into strict v_actor
  from public."cmp_Users" workspace_user
  where workspace_user."Auth_User_ID" = auth.uid()
    and coalesce(workspace_user."User_AccessStatus", 'active') = 'active';

  if p_assigned_user_id is not null then
    select workspace_user."User_ID", workspace_user."Auth_User_ID" into v_target
    from public."cmp_Users" workspace_user
    where workspace_user."User_ID" = p_assigned_user_id
      and workspace_user."Company_ID" = v_actor."Company_ID"
      and workspace_user."Auth_User_ID" is not null
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active';
    if v_target."User_ID" is null then
      raise exception 'Choose an active user from this workspace.' using errcode = '22023';
    end if;
    if not booking_api.has_permission(v_target."Auth_User_ID", 'Customs.Write') then
      raise exception 'That user does not have permission to work on Customs declarations.' using errcode = '22023';
    end if;
  end if;

  select declaration."CUST_AssignedUserID", coalesce(declaration."CUST_LocalReferenceNumber", declaration."CUST_id"::text)
  into v_old_assigned_user_id, v_reference
  from public."Customs_Declarations" declaration
  where declaration."CUST_id" = p_declaration_id and not declaration."CUST_IsDeleted"
  for update;

  if v_old_assigned_user_id is not distinct from p_assigned_user_id then
    return jsonb_build_object('declarationId', p_declaration_id, 'assignedUserId', p_assigned_user_id, 'reference', v_reference, 'unchanged', true);
  end if;

  update public."Customs_Declarations" set
    "CUST_AssignedUserID" = p_assigned_user_id,
    "CUST_UpdatedAt" = clock_timestamp(),
    "CUST_UpdatedBy" = auth.uid()
  where "CUST_id" = p_declaration_id;

  insert into public."Customs_AuditLog" (
    "CUSTAU_CustomsID", "CUSTAU_Action", "CUSTAU_TableName", "CUSTAU_RecordID",
    "CUSTAU_ChangedBy", "CUSTAU_OldValues", "CUSTAU_NewValues", "CUSTAU_Source", "CUSTAU_Notes"
  ) values (
    p_declaration_id, 'declaration_assigned', 'Customs_Declarations', p_declaration_id,
    auth.uid(), jsonb_build_object('assignedUserId', v_old_assigned_user_id), jsonb_build_object('assignedUserId', p_assigned_user_id),
    'multideck_app', case when p_assigned_user_id is null then 'The declaration was left unassigned.' else 'Responsibility for the declaration changed.' end
  );

  return jsonb_build_object('declarationId', p_declaration_id, 'assignedUserId', p_assigned_user_id, 'reference', v_reference, 'unchanged', false);
end;
$$;

revoke all on function public.multideck_customs_assignment_users_page(text, integer, integer) from public, anon;
revoke all on function public.multideck_customs_assignees_by_ids(uuid[]) from public, anon;
revoke all on function public.assign_customs_declaration(uuid, uuid) from public, anon;
grant execute on function public.multideck_customs_assignment_users_page(text, integer, integer) to authenticated, service_role;
grant execute on function public.multideck_customs_assignees_by_ids(uuid[]) to authenticated, service_role;
grant execute on function public.assign_customs_declaration(uuid, uuid) to authenticated, service_role;

comment on function public.multideck_customs_assignment_users_page(text, integer, integer) is
  'Company-scoped, searchable, maximum-50-row Customs assignee selector. Returns every active workspace user and whether Customs work is permitted.';
comment on function public.assign_customs_declaration(uuid, uuid) is
  'Changes one exact authorised declaration assignee, enforces same-company active Customs access, and records a Customs audit event.';

create or replace function public.multideck_customs_declaration_register_page(
  p_direction text,
  p_scope text,
  p_search text default null,
  p_status text default null,
  p_destination text default null,
  p_sort text default 'lastSaved',
  p_sort_direction text default 'desc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_direction text := lower(coalesce(nullif(btrim(p_direction), ''), ''));
  v_scope text := lower(coalesce(nullif(btrim(p_scope), ''), ''));
  v_search text := nullif(btrim(p_search), '');
  v_status text := nullif(btrim(p_status), '');
  v_destination text := upper(nullif(btrim(p_destination), ''));
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'lastSaved');
  v_sort_direction text := lower(coalesce(nullif(btrim(p_sort_direction), ''), 'desc'));
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if v_direction not in ('export', 'import') then raise exception 'Choose a valid declaration direction.' using errcode = '22023'; end if;
  if v_scope not in ('standalone', 'job-related') then raise exception 'Choose a valid declaration scope.' using errcode = '22023'; end if;
  if v_sort_direction not in ('asc', 'desc') then raise exception 'Choose a valid sort direction.' using errcode = '22023'; end if;
  if v_sort not in ('assignedTo','submittedBy','reference','jobReference','status','traderReference','items','destination','value','lastSaved') then
    raise exception 'Choose a valid declaration sort.' using errcode = '22023';
  end if;

  with scoped as materialized (
    select
      declaration."CUST_id" as id,
      declaration."CUST_CreatedBy"::text as submitted_by,
      declaration."CUST_AssignedUserID" as assigned_user_id,
      declaration."CUST_JobID" as job_id,
      booking."Job_Reference"::text as job_reference,
      booking."Booking_Reference"::text as booking_reference,
      booking."Customer_Name"::text as customer_name,
      booking."Route"::text as route,
      coalesce(declaration."CUST_LocalReferenceNumber", declaration."CUST_id"::text) as reference,
      declaration."CUST_TraderReference"::text as trader_reference,
      declaration."CUST_Status"::text as status,
      declaration."CUST_CountryOfDestinationCodeSnapshot"::text as destination_country,
      declaration."CUST_InvoiceAmount" as amount,
      declaration."CUST_InvoiceCurrencyCodeSnapshot"::text as currency,
      case when jsonb_typeof(declaration."CUST_GenericPayloadJSON" -> 'items') = 'array'
        then jsonb_array_length(declaration."CUST_GenericPayloadJSON" -> 'items') else 0 end as item_count,
      declaration."CUST_CreatedAt" as created_at,
      declaration."CUST_UpdatedAt" as updated_at
    from public."Customs_Declarations" declaration
    left join public."App_Live_Bookings" booking on booking."Job_ID" = declaration."CUST_JobID"
    where declaration."CUST_Direction" = v_direction
      and declaration."CUST_DeclarationKind" = 'cds_' || v_direction
      and not declaration."CUST_IsDeleted"
      and case when v_scope = 'standalone' then declaration."CUST_JobID" is null else declaration."CUST_JobID" is not null end
  ), searchable as materialized (
    select scoped.*, concat_ws(' ', reference, job_reference, booking_reference, customer_name, route, trader_reference, status, destination_country, currency, amount::text) as search_text
    from scoped
  ), filtered as materialized (
    select * from searchable
    where (v_status is null or status = v_status)
      and (v_destination is null or destination_country = v_destination)
      and (v_search is null or strpos(lower(search_text), lower(v_search)) > 0)
  ), ranked as materialized (
    select *, row_number() over (
      order by
        case when v_sort_direction = 'asc' then case v_sort
          when 'assignedTo' then assigned_user_id::text when 'submittedBy' then lower(submitted_by) when 'reference' then lower(reference)
          when 'jobReference' then lower(coalesce(job_reference, job_id::text)) when 'status' then lower(status)
          when 'traderReference' then lower(trader_reference) when 'destination' then lower(destination_country) end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort
          when 'assignedTo' then assigned_user_id::text when 'submittedBy' then lower(submitted_by) when 'reference' then lower(reference)
          when 'jobReference' then lower(coalesce(job_reference, job_id::text)) when 'status' then lower(status)
          when 'traderReference' then lower(trader_reference) when 'destination' then lower(destination_country) end end desc nulls last,
        case when v_sort_direction = 'asc' then case v_sort when 'items' then item_count when 'value' then amount end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort when 'items' then item_count when 'value' then amount end end desc nulls last,
        case when v_sort_direction = 'asc' and v_sort = 'lastSaved' then updated_at end asc nulls last,
        case when v_sort_direction = 'desc' and v_sort = 'lastSaved' then updated_at end desc nulls last,
        updated_at desc, id
    ) as ordinal from filtered
  ), page as materialized (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'submittedBy', submitted_by, 'assignedUserId', assigned_user_id, 'jobId', job_id, 'jobReference', job_reference,
      'bookingReference', booking_reference, 'customerName', customer_name, 'route', route,
      'reference', reference, 'traderReference', trader_reference, 'status', status,
      'destinationCountry', destination_country, 'amount', amount, 'currency', currency,
      'itemCount', item_count, 'createdAt', created_at, 'updatedAt', updated_at
    ) order by ordinal) from page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'availableTotal', (select count(*) from scoped),
    'facets', jsonb_build_object(
      'statuses', coalesce((select jsonb_agg(status order by status) from (select distinct status from scoped where nullif(btrim(status), '') is not null) valueset), '[]'::jsonb),
      'destinations', coalesce((select jsonb_agg(destination_country order by destination_country) from (select distinct destination_country from scoped where nullif(btrim(destination_country), '') is not null) valueset), '[]'::jsonb)
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.multideck_customs_declaration_register_page(text,text,text,text,text,text,text,integer,integer) from public, anon;
grant execute on function public.multideck_customs_declaration_register_page(text,text,text,text,text,text,text,integer,integer) to authenticated, service_role;

-- Assignment changes are meaningful watch evidence. The existing deterministic
-- trigger performs no LLM work; including the assignee simply enriches its old
-- and new payloads and lets one exact watch fire once for the database update.
create or replace function public._multideck_dexter_customs_declaration_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company_id uuid; v_old jsonb:='{}'::jsonb; v_new jsonb;
begin
  if new."CUST_JobID" is not null then
    select office."Company_ID" into v_company_id from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") where job."Job_ID"=new."CUST_JobID";
  else
    select actor."Company_ID" into v_company_id from public."cmp_Users" actor where actor."Auth_User_ID"=new."CUST_CreatedBy" order by actor."User_ID" limit 1;
  end if;
  if v_company_id is null then return new; end if;
  perform public._multideck_dexter_pause_unauthorised_customs_watches(v_company_id, new."CUST_id");
  if tg_op<>'INSERT' then v_old:=jsonb_build_object(
    'assignedUserId',old."CUST_AssignedUserID",'status',old."CUST_Status",'iCustomsStatus',old."CUST_iCustomsStatusSnapshot",
    'customsReference',old."CUST_CustomsReferenceNumber",'mrn',old."CUST_MasterReferenceNumber",
    'destinationCountry',old."CUST_CountryOfDestinationCodeSnapshot",'invoiceAmount',old."CUST_InvoiceAmount",
    'currency',old."CUST_InvoiceCurrencyCodeSnapshot",'updatedAt',old."CUST_UpdatedAt"); end if;
  v_new:=jsonb_build_object(
    'reference',coalesce(new."CUST_LocalReferenceNumber",new."CUST_id"::text),'sourceType',case when new."CUST_JobID" is null then 'standalone' else 'job_related' end,
    'jobId',new."CUST_JobID",'assignedUserId',new."CUST_AssignedUserID",'status',new."CUST_Status",'iCustomsStatus',new."CUST_iCustomsStatusSnapshot",
    'customsReference',new."CUST_CustomsReferenceNumber",'mrn',new."CUST_MasterReferenceNumber",
    'destinationCountry',new."CUST_CountryOfDestinationCodeSnapshot",'invoiceAmount',new."CUST_InvoiceAmount",
    'currency',new."CUST_InvoiceCurrencyCodeSnapshot",'updatedAt',new."CUST_UpdatedAt");
  if exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company_id
    and watch."AIDexterWatch_CapabilityCode"='customs_declarations' and watch."AIDexterWatch_StatusCode"='active' and watch."AIDexterWatch_TargetID"=new."CUST_id") then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(v_company_id,'customs_declarations',tg_table_name,new."CUST_id",v_old,v_new);
  end if;
  return new;
end $$;

revoke all on function public._multideck_dexter_customs_declaration_watch_change() from public, anon, authenticated;
drop trigger if exists "TR_Customs_Declarations_dexter_watch" on public."Customs_Declarations";
create trigger "TR_Customs_Declarations_dexter_watch" after insert or update of
  "CUST_AssignedUserID","CUST_Status","CUST_iCustomsStatusSnapshot","CUST_CustomsReferenceNumber","CUST_MasterReferenceNumber",
  "CUST_CountryOfDestinationCodeSnapshot","CUST_InvoiceAmount","CUST_InvoiceCurrencyCodeSnapshot","CUST_UpdatedAt"
on public."Customs_Declarations" for each row execute function public._multideck_dexter_customs_declaration_watch_change();

create or replace function public.multideck_dexter_domain_customs_declarations(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, sort_updated desc), '[]'::jsonb)
  from (
    select
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', declaration."CUST_id",
        'sourceType', case when declaration."CUST_JobID" is null then 'standalone' else 'job_related' end,
        'jobId', declaration."CUST_JobID",
        'bookingReference', job."Job_BookingReference",
        'reference', coalesce(declaration."CUST_LocalReferenceNumber", declaration."CUST_id"::text),
        'traderReference', declaration."CUST_TraderReference",
        'ucr', declaration."CUST_UCR",
        'status', declaration."CUST_Status",
        'direction', declaration."CUST_Direction",
        'declarationKind', declaration."CUST_DeclarationKind",
        'jurisdiction', declaration."CUST_JurisdictionCode",
        'assignedUserId', declaration."CUST_AssignedUserID",
        'assignedUserName', coalesce(nullif(btrim(concat_ws(' ', assigned_user."User_Firstname", assigned_user."User_Lastname")), ''), assigned_user."User_Email"),
        'assignedUserEmail', assigned_user."User_Email",
        'destinationCountry', declaration."CUST_CountryOfDestinationCodeSnapshot",
        'invoiceAmount', declaration."CUST_InvoiceAmount",
        'currency', declaration."CUST_InvoiceCurrencyCodeSnapshot",
        'itemCount', coalesce(items.item_count, 0),
        'customsReference', declaration."CUST_CustomsReferenceNumber",
        'mrn', coalesce(latest_submission."ICUSS_MRN", declaration."CUST_MasterReferenceNumber"),
        'iCustomsStatus', declaration."CUST_iCustomsStatusSnapshot",
        'submissionStatus', latest_submission."ICUSS_Status",
        'submissionErrorCode', latest_submission."ICUSS_ErrorCode",
        'submissionErrorMessage', latest_submission."ICUSS_ErrorMessage",
        'submittedAt', latest_submission."ICUSS_SubmittedAt",
        'acknowledgedAt', latest_submission."ICUSS_AcknowledgedAt",
        'completedAt', latest_submission."ICUSS_CompletedAt",
        'handoffAt', declaration."CUST_HandoffAt",
        'createdAt', declaration."CUST_CreatedAt",
        'updatedAt', declaration."CUST_UpdatedAt",
        'searchEvidence', evidence.value - 'matched'
      )) as row_data,
      coalesce((evidence.value->>'confidence')::numeric, 0) as search_rank,
      declaration."CUST_UpdatedAt" as sort_updated
    from public."Customs_Declarations" declaration
    left join public."Job_Header" job on job."Job_ID" = declaration."CUST_JobID" and not job."Job_IsDeleted"
    left join public."cmp_Users" assigned_user on assigned_user."User_ID" = declaration."CUST_AssignedUserID"
    left join lateral (
      select count(*)::integer as item_count from public."Customs_Items" item
      where item."CUSTI_CustomsID" = declaration."CUST_id"
    ) items on true
    left join lateral (
      select submission.* from public."ICUS_Submissions" submission
      where submission."ICUSS_CustomsID" = declaration."CUST_id"
      order by submission."ICUSS_CreatedAt" desc, submission."ICUSS_id" desc limit 1
    ) latest_submission on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'recordId', declaration."CUST_id", 'reference', declaration."CUST_LocalReferenceNumber",
        'traderReference', declaration."CUST_TraderReference", 'ucr', declaration."CUST_UCR",
        'status', declaration."CUST_Status", 'direction', declaration."CUST_Direction",
        'assignedUserName', coalesce(nullif(btrim(concat_ws(' ', assigned_user."User_Firstname", assigned_user."User_Lastname")), ''), assigned_user."User_Email"),
        'assignedUserEmail', assigned_user."User_Email",
        'customsReference', declaration."CUST_CustomsReferenceNumber",
        'mrn', coalesce(latest_submission."ICUSS_MRN", declaration."CUST_MasterReferenceNumber"),
        'bookingReference', job."Job_BookingReference"
      ),
      array['recordId', 'reference', 'traderReference', 'ucr', 'assignedUserEmail', 'customsReference', 'mrn', 'bookingReference']::text[]
    ) evidence(value)
    where not declaration."CUST_IsDeleted"
      and booking_api.customs_access(auth.uid(), declaration."CUST_id", false)
      and exists (
        select 1 from public."cmp_Users" actor
        where actor."Auth_User_ID" = auth.uid() and actor."Company_ID" = p_company_id and actor."User_AccessStatus" = 'active'
      )
      and (
        declaration."CUST_JobID" is null or exists (
          select 1 from public."Job_Header" scoped_job
          join public."cmp_Offices" scoped_office on scoped_office."Office_ID" = coalesce(scoped_job."Job_OrgOfficeID", scoped_job."Job_OfficeID")
          where scoped_job."Job_ID" = declaration."CUST_JobID" and scoped_office."Company_ID" = p_company_id and not scoped_job."Job_IsDeleted"
        )
      )
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, declaration."CUST_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) declarations;
$$;

revoke all on function public.multideck_dexter_domain_customs_declarations(uuid, text, integer) from public, anon, authenticated;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Authorised standalone and department-owned job-related UK CDS import and export declarations, including the responsible workspace user, booking provenance and recorded iCustoms filing evidence. Assignment changes must use the declaration profile picker because Dexter does not safely resolve workspace identities for assignment.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'customs_declarations';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Responsible user, status, reference, value and recorded iCustoms changes for one exact authorised standalone or job-related declaration.',
  "AIDexterWatchCapability_FieldsJSON" = case
    when jsonb_typeof("AIDexterWatchCapability_FieldsJSON") = 'array' and not "AIDexterWatchCapability_FieldsJSON" ? 'assignedUserId'
      then "AIDexterWatchCapability_FieldsJSON" || '["assignedUserId"]'::jsonb
    else "AIDexterWatchCapability_FieldsJSON"
  end,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'customs_declarations';

commit;
