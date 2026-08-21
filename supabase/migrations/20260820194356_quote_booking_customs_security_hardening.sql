-- Security hardening for Customs workspace access and public/operator document uploads.
-- Uploads reserve bounded capacity first, then finalise catalogue + business state in
-- one database transaction. Storage paths alternate between two fixed slots so a
-- booking or public response link cannot create unbounded orphan objects.

begin;

-- Generic operational roles are not tenant-wide Customs roles. Administrators,
-- company managers and operations managers retain their explicit permissions;
-- mapped Customs-department members gain the same permission through membership.
delete from public."sys_UserRole_Permissions" role_permission
using public."sys_UserRoles" role, public."sys_Permissions" permission
where role_permission."sys_UserRole_ID" = role."sys_UserRole_ID"
  and role_permission."sys_Permission_ID" = permission."sys_Permission_ID"
  and lower(role."sys_UserRole_Name") in ('company user', 'operator')
  and permission."sys_Permission_Value" in ('Customs.Read', 'Customs.Write');

create or replace function booking_api.has_permission(
  caller_auth_user_id uuid,
  permission_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."cmp_Users" app_user
    where app_user."Auth_User_ID" = caller_auth_user_id
      and coalesce(app_user."User_AccessStatus", 'active') = 'active'
      and (
        exists (
          select 1
          from public."cmp_Users_Roles" user_role
          join public."sys_UserRole_Permissions" role_permission
            on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
          join public."sys_Permissions" permission
            on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
          where user_role."User_ID" = app_user."User_ID"
            and permission."sys_Permission_Value" = permission_value
        )
        or (
          permission_value in ('Customs.Read', 'Customs.Write')
          and exists (
            select 1
            from public."cmp_Users_Departments" membership
            join public."cmp_Departments" department
              on department."Department_ID" = membership."Department_ID"
            join booking_api.office_customs_departments customs_department
              on customs_department.department_id = department."Department_ID"
             and customs_department.company_id = app_user."Company_ID"
            where membership."User_ID" = app_user."User_ID"
              and department."Department_IsActive"
          )
        )
      )
  )
$$;

revoke all on function booking_api.has_permission(uuid, text) from public, anon, authenticated;

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
      and (
        declaration."CUST_AssignedUserID" = caller."User_ID"
        or (
          declaration."CUST_OwnerDepartmentID" is not null
          and exists (
            select 1
            from public."cmp_Users_Departments" membership
            join public."cmp_Departments" department
              on department."Department_ID" = membership."Department_ID"
            where membership."User_ID" = caller."User_ID"
              and membership."Department_ID" = declaration."CUST_OwnerDepartmentID"
              and department."Company_ID" = caller."Company_ID"
              and department."Department_IsActive"
          )
        )
        or (
          booking_api.has_permission(
            caller_auth_user_id,
            case when require_write then 'Customs.Write' else 'Customs.Read' end
          )
          and exists (
            select 1
            from public."cmp_Users_Roles" user_role
            join public."sys_UserRoles" role
              on role."sys_UserRole_ID" = user_role."sys_UserRole_ID"
            where user_role."User_ID" = caller."User_ID"
              and lower(role."sys_UserRole_Name") in ('administrator', 'company manager', 'operations manager')
          )
        )
      )
  )
$$;

revoke all on function booking_api.customs_access(uuid, uuid, boolean) from public, anon, authenticated;

-- Repair any pre-existing duplicate current rows before enforcing the invariant.
with ranked as (
  select document."JobDoc_ID",
         row_number() over (
           partition by document."JobDoc_JobID", lower(document."JobDoc_DocTypeCodeSnapshot")
           order by document."JobDoc_UpdatedAt" desc, document."JobDoc_CreatedAt" desc, document."JobDoc_ID" desc
         ) as position
  from public."Job_Documents" document
  where document."JobDoc_IsCurrentVersion" and not document."JobDoc_IsDeleted"
)
update public."Job_Documents" document
set "JobDoc_IsCurrentVersion" = false,
    "JobDoc_UpdatedAt" = now()
from ranked
where ranked."JobDoc_ID" = document."JobDoc_ID"
  and ranked.position > 1;

create unique index if not exists "UX_Job_Documents_job_type_one_current"
  on public."Job_Documents" ("JobDoc_JobID", lower("JobDoc_DocTypeCodeSnapshot"))
  where "JobDoc_IsCurrentVersion" and not "JobDoc_IsDeleted";

create table if not exists booking_api.document_upload_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  actor_user_id uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  job_id uuid not null references public."Job_Header"("Job_ID") on delete cascade,
  document_type varchar(40) not null,
  idempotency_key uuid not null,
  blob_name varchar(1024) not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 20971520),
  status_code varchar(20) not null default 'reserved' check (status_code in ('reserved','completed','cancelled','expired')),
  document_id uuid references public."Job_Documents"("JobDoc_ID") on delete set null,
  stored_object_id uuid references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete set null,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  completed_at timestamptz,
  unique (actor_user_id, idempotency_key)
);
create unique index if not exists booking_document_upload_one_pending_idx
  on booking_api.document_upload_reservations (job_id, document_type)
  where status_code = 'reserved';
create index if not exists booking_document_upload_rate_idx
  on booking_api.document_upload_reservations (actor_user_id, reserved_at desc);
revoke all on table booking_api.document_upload_reservations from public, anon, authenticated;
grant select, insert, update, delete on table booking_api.document_upload_reservations to service_role;

create or replace function public.booking_workflow_reserve_document_upload(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  requested_document_type text,
  requested_idempotency_key uuid,
  requested_file_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, booking_api
as $$
declare
  actor record;
  current_blob text;
  reservation record;
  blob_value text;
  document_value text := lower(btrim(coalesce(requested_document_type, '')));
begin
  if document_value not in ('commercial_invoice', 'packing_list') then
    raise exception 'Choose a commercial invoice or packing list.' using errcode = '22023';
  end if;
  if requested_idempotency_key is null then
    raise exception 'A document upload request key is required.' using errcode = '22023';
  end if;
  if requested_file_size_bytes is null or requested_file_size_bytes <= 0 or requested_file_size_bytes > 20971520 then
    raise exception 'Booking documents can be up to 20 MB.' using errcode = '22023';
  end if;

  select app_user."User_ID", app_user."Company_ID" into actor
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id
    and coalesce(app_user."User_AccessStatus", 'active') = 'active';
  if actor."User_ID" is null or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') then
    raise exception 'You are not authorised to attach booking documents.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    where job."Job_ID" = requested_job_id and not job."Job_IsDeleted" and office."Company_ID" = actor."Company_ID"
  ) then
    raise exception 'That booking is outside this workspace.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(requested_job_id::text || ':' || document_value, 0));
  update booking_api.document_upload_reservations
  set status_code = 'expired'
  where status_code = 'reserved' and expires_at <= now();

  select * into reservation
  from booking_api.document_upload_reservations
  where actor_user_id = actor."User_ID" and idempotency_key = requested_idempotency_key;
  if found then
    return jsonb_build_object(
      'reservationId', reservation.reservation_id,
      'blobName', reservation.blob_name,
      'completed', reservation.status_code = 'completed',
      'documentId', reservation.document_id,
      'storedObjectId', reservation.stored_object_id
    );
  end if;
  if exists (
    select 1 from booking_api.document_upload_reservations
    where job_id = requested_job_id and document_type = document_value and status_code = 'reserved'
  ) then
    raise exception 'A document upload is already in progress for this booking.' using errcode = '22023';
  end if;
  if (select count(*) from booking_api.document_upload_reservations
      where actor_user_id = actor."User_ID" and reserved_at >= now() - interval '15 minutes') >= 12 then
    raise exception 'Too many document uploads. Wait a few minutes and try again.' using errcode = '22023';
  end if;
  if coalesce((
    select sum(stored."DOCStoredObject_FileSizeBytes")
    from public."DOC_StoredObjects" stored
    where stored."DOCStoredObject_StatusCode" = 'active'
      and stored."DOCStoredObject_BlobName" like actor."Company_ID"::text || '/%'
  ), 0) + requested_file_size_bytes > 5368709120 then
    raise exception 'This workspace has reached its document storage allowance.' using errcode = '22023';
  end if;

  select document."JobDoc_FilePath" into current_blob
  from public."Job_Documents" document
  where document."JobDoc_JobID" = requested_job_id
    and lower(document."JobDoc_DocTypeCodeSnapshot") = document_value
    and document."JobDoc_IsCurrentVersion" and not document."JobDoc_IsDeleted"
  for update;
  blob_value := actor."Company_ID"::text || '/bookings/' || requested_job_id::text || '/' || document_value ||
    case when coalesce(current_blob, '') like '%/slot-a' then '/slot-b' else '/slot-a' end;

  insert into booking_api.document_upload_reservations (
    company_id, actor_user_id, job_id, document_type, idempotency_key, blob_name, file_size_bytes
  ) values (
    actor."Company_ID", actor."User_ID", requested_job_id, document_value,
    requested_idempotency_key, blob_value, requested_file_size_bytes
  ) returning * into reservation;
  return jsonb_build_object('reservationId', reservation.reservation_id, 'blobName', blob_value, 'completed', false);
end;
$$;

create or replace function public.booking_workflow_complete_document_upload(
  caller_auth_user_id uuid,
  requested_reservation_id uuid,
  requested_file_name text,
  requested_mime_type text,
  requested_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, booking_api
as $$
declare
  actor record;
  reservation record;
  current_document record;
  stored_id uuid;
  old_stored_id uuid;
  old_blob text;
  document_id_value uuid;
  now_value timestamptz := clock_timestamp();
begin
  select app_user."User_ID", app_user."Company_ID" into actor
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id
    and coalesce(app_user."User_AccessStatus", 'active') = 'active';
  if actor."User_ID" is null or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') then
    raise exception 'You are not authorised to attach booking documents.' using errcode = '42501';
  end if;
  if nullif(btrim(requested_file_name), '') is null or char_length(requested_file_name) > 240
     or nullif(btrim(requested_mime_type), '') is null or char_length(requested_mime_type) > 120
     or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'The uploaded document metadata is invalid.' using errcode = '22023';
  end if;

  select * into reservation from booking_api.document_upload_reservations
  where reservation_id = requested_reservation_id for update;
  if not found or reservation.actor_user_id <> actor."User_ID" or reservation.company_id <> actor."Company_ID" then
    raise exception 'That upload reservation is unavailable.' using errcode = '42501';
  end if;
  if reservation.status_code = 'completed' then
    return jsonb_build_object('documentId', reservation.document_id, 'storedObjectId', reservation.stored_object_id, 'blobName', reservation.blob_name, 'completed', true);
  end if;
  if reservation.status_code <> 'reserved' or reservation.expires_at <= now() then
    raise exception 'That upload reservation has expired.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(reservation.job_id::text || ':' || reservation.document_type, 0));

  select document.* into current_document
  from public."Job_Documents" document
  where document."JobDoc_JobID" = reservation.job_id
    and lower(document."JobDoc_DocTypeCodeSnapshot") = reservation.document_type
    and document."JobDoc_IsCurrentVersion" and not document."JobDoc_IsDeleted"
  for update;
  old_stored_id := current_document."JobDoc_StoredObjectID";
  old_blob := current_document."JobDoc_FilePath";

  insert into public."DOC_StoredObjects" (
    "DOCStoredObject_ConcernCode", "DOCStoredObject_AggregateType", "DOCStoredObject_AggregateID",
    "DOCStoredObject_ProviderCode", "DOCStoredObject_Container", "DOCStoredObject_BlobName",
    "DOCStoredObject_OriginalFileName", "DOCStoredObject_MimeType", "DOCStoredObject_FileSizeBytes",
    "DOCStoredObject_SHA256", "DOCStoredObject_StatusCode", "DOCStoredObject_CreatedAt",
    "DOCStoredObject_CreatedBy", "DOCStoredObject_DeletedAt", "DOCStoredObject_DeletedBy"
  ) values (
    'booking', 'job', reservation.job_id, 'supabase_storage', 'multideck-documents', reservation.blob_name,
    btrim(requested_file_name), btrim(requested_mime_type), reservation.file_size_bytes,
    requested_sha256, 'active', now_value, actor."User_ID", null, null
  ) on conflict ("DOCStoredObject_Container", "DOCStoredObject_BlobName") do update set
    "DOCStoredObject_ConcernCode" = excluded."DOCStoredObject_ConcernCode",
    "DOCStoredObject_AggregateType" = excluded."DOCStoredObject_AggregateType",
    "DOCStoredObject_AggregateID" = excluded."DOCStoredObject_AggregateID",
    "DOCStoredObject_OriginalFileName" = excluded."DOCStoredObject_OriginalFileName",
    "DOCStoredObject_MimeType" = excluded."DOCStoredObject_MimeType",
    "DOCStoredObject_FileSizeBytes" = excluded."DOCStoredObject_FileSizeBytes",
    "DOCStoredObject_SHA256" = excluded."DOCStoredObject_SHA256",
    "DOCStoredObject_StatusCode" = 'active',
    "DOCStoredObject_CreatedAt" = now_value,
    "DOCStoredObject_CreatedBy" = actor."User_ID",
    "DOCStoredObject_DeletedAt" = null,
    "DOCStoredObject_DeletedBy" = null
  returning "DOCStoredObject_ID" into stored_id;

  if current_document."JobDoc_ID" is null then
    insert into public."Job_Documents" (
      "JobDoc_JobID", "JobDoc_DocTypeCodeSnapshot", "JobDoc_Title", "JobDoc_Status", "JobDoc_Source",
      "JobDoc_FileName", "JobDoc_FilePath", "JobDoc_FileMimeType", "JobDoc_FileSizeBytes",
      "JobDoc_IsCurrentVersion", "JobDoc_IsPrimary", "JobDoc_StoredObjectID", "JobDoc_ReceivedAt",
      "JobDoc_MetadataJSON", "JobDoc_CreatedBy", "JobDoc_UpdatedBy"
    ) values (
      reservation.job_id, reservation.document_type,
      case when reservation.document_type = 'commercial_invoice' then 'Commercial invoice' else 'Packing list' end,
      'received', 'booking_workspace', btrim(requested_file_name), reservation.blob_name,
      btrim(requested_mime_type), reservation.file_size_bytes, true, true, stored_id, now_value,
      jsonb_build_object('storageBucket', 'multideck-documents', 'sha256', requested_sha256),
      actor."User_ID", actor."User_ID"
    ) returning "JobDoc_ID" into document_id_value;
  else
    document_id_value := current_document."JobDoc_ID";
    update public."Job_Documents" set
      "JobDoc_FileName" = btrim(requested_file_name),
      "JobDoc_FilePath" = reservation.blob_name,
      "JobDoc_FileMimeType" = btrim(requested_mime_type),
      "JobDoc_FileSizeBytes" = reservation.file_size_bytes,
      "JobDoc_StoredObjectID" = stored_id,
      "JobDoc_ReceivedAt" = now_value,
      "JobDoc_MetadataJSON" = jsonb_build_object('storageBucket', 'multideck-documents', 'sha256', requested_sha256),
      "JobDoc_UpdatedAt" = now_value,
      "JobDoc_UpdatedBy" = actor."User_ID"
    where "JobDoc_ID" = document_id_value;
  end if;

  if old_stored_id is not null and old_stored_id <> stored_id then
    update public."DOC_StoredObjects" set
      "DOCStoredObject_StatusCode" = 'deleted', "DOCStoredObject_DeletedAt" = now_value,
      "DOCStoredObject_DeletedBy" = actor."User_ID"
    where "DOCStoredObject_ID" = old_stored_id;
  end if;
  update booking_api.document_upload_reservations set
    status_code = 'completed', document_id = document_id_value, stored_object_id = stored_id,
    completed_at = now_value
  where reservation_id = reservation.reservation_id;
  return jsonb_build_object(
    'documentId', document_id_value, 'storedObjectId', stored_id, 'blobName', reservation.blob_name,
    'oldBlobName', case when old_blob is distinct from reservation.blob_name then old_blob else null end,
    'fileName', btrim(requested_file_name), 'documentType', reservation.document_type, 'completed', true
  );
end;
$$;

create or replace function public.booking_workflow_cancel_document_upload(
  caller_auth_user_id uuid,
  requested_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, booking_api
as $$
declare actor_id uuid;
begin
  select "User_ID" into actor_id from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and coalesce("User_AccessStatus", 'active') = 'active';
  update booking_api.document_upload_reservations set status_code = 'cancelled'
  where reservation_id = requested_reservation_id and actor_user_id = actor_id and status_code = 'reserved';
  return found;
end;
$$;

-- Public quote response uploads use the same reserve/finalise pattern, scoped to
-- a single token-bound link. Two fixed paths cap retained binary data at 20 MB.
alter table quote_api.customer_response_links
  add column if not exists competitor_document_id uuid
    references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete set null;

create table if not exists quote_api.customer_response_upload_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  response_link_id uuid not null references quote_api.customer_response_links(response_link_id) on delete cascade,
  idempotency_key uuid not null,
  source_ip_hash varchar(64),
  blob_name varchar(1024) not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  status_code varchar(20) not null default 'reserved' check (status_code in ('reserved','completed','cancelled','expired')),
  stored_object_id uuid references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete set null,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  completed_at timestamptz,
  unique (response_link_id, idempotency_key),
  constraint customer_response_upload_ip_hash check (source_ip_hash is null or source_ip_hash ~ '^[0-9a-f]{64}$')
);
create unique index if not exists customer_response_upload_one_pending_idx
  on quote_api.customer_response_upload_reservations (response_link_id)
  where status_code = 'reserved';
create index if not exists customer_response_upload_rate_idx
  on quote_api.customer_response_upload_reservations (response_link_id, reserved_at desc);
revoke all on table quote_api.customer_response_upload_reservations from public, anon, authenticated;
grant select, insert, update, delete on table quote_api.customer_response_upload_reservations to service_role;

create or replace function public.quote_customer_response_reserve_upload(
  requested_token_hash text,
  requested_response_origin text,
  requested_idempotency_key uuid,
  requested_file_size_bytes bigint,
  requested_source_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare link_row record; reservation record; current_blob text; blob_value text;
begin
  if requested_token_hash !~ '^[0-9a-f]{64}$' or requested_idempotency_key is null then
    raise exception 'This quote link is invalid.' using errcode = 'P0002';
  end if;
  if requested_file_size_bytes is null or requested_file_size_bytes <= 0 or requested_file_size_bytes > 10485760 then
    raise exception 'Attach a competitor quote up to 10 MB.' using errcode = '22023';
  end if;
  if requested_source_ip_hash is not null and requested_source_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'The response audit fingerprint is invalid.' using errcode = '22023';
  end if;
  select link.* into link_row from quote_api.customer_response_links link
  where link.token_hash = requested_token_hash for update;
  if not found then raise exception 'This quote link is invalid.' using errcode = 'P0002'; end if;
  if link_row.response_origin is distinct from requested_response_origin then
    raise exception 'This quote link is not available on this workspace.' using errcode = 'P0002';
  end if;
  if link_row.status_code <> 'active' or (link_row.expires_at is not null and link_row.expires_at <= now()) then
    raise exception 'This quote link is no longer active.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(link_row.response_link_id::text, 0));
  update quote_api.customer_response_upload_reservations set status_code = 'expired'
  where status_code = 'reserved' and expires_at <= now();
  select * into reservation from quote_api.customer_response_upload_reservations
  where response_link_id = link_row.response_link_id and idempotency_key = requested_idempotency_key;
  if found then
    return jsonb_build_object('reservationId', reservation.reservation_id, 'blobName', reservation.blob_name,
      'completed', reservation.status_code = 'completed', 'storedObjectId', reservation.stored_object_id);
  end if;
  if exists (select 1 from quote_api.customer_response_upload_reservations
             where response_link_id = link_row.response_link_id and status_code = 'reserved') then
    raise exception 'An attachment upload is already in progress for this quote.' using errcode = '22023';
  end if;
  if (select count(*) from quote_api.customer_response_upload_reservations
      where response_link_id = link_row.response_link_id and reserved_at >= now() - interval '15 minutes') >= 6 then
    raise exception 'Too many attachment uploads. Wait a few minutes and try again.' using errcode = '22023';
  end if;
  if requested_source_ip_hash is not null and (select count(*) from quote_api.customer_response_upload_reservations
      where source_ip_hash = requested_source_ip_hash and reserved_at >= now() - interval '15 minutes') >= 20 then
    raise exception 'Too many attachment uploads. Wait a few minutes and try again.' using errcode = '22023';
  end if;
  select stored."DOCStoredObject_BlobName" into current_blob
  from public."DOC_StoredObjects" stored where stored."DOCStoredObject_ID" = link_row.competitor_document_id;
  blob_value := link_row.company_id::text || '/quote-responses/' || link_row.quote_id::text || '/' || link_row.response_link_id::text ||
    case when coalesce(current_blob, '') like '%/slot-a' then '/slot-b' else '/slot-a' end;
  insert into quote_api.customer_response_upload_reservations (
    response_link_id, idempotency_key, source_ip_hash, blob_name, file_size_bytes
  ) values (
    link_row.response_link_id, requested_idempotency_key, requested_source_ip_hash, blob_value, requested_file_size_bytes
  ) returning * into reservation;
  return jsonb_build_object('reservationId', reservation.reservation_id, 'blobName', blob_value, 'completed', false);
end;
$$;

create or replace function public.quote_customer_response_complete_upload(
  requested_token_hash text,
  requested_response_origin text,
  requested_reservation_id uuid,
  requested_file_name text,
  requested_mime_type text,
  requested_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare link_row record; reservation record; stored_id uuid; old_stored_id uuid; old_blob text; now_value timestamptz := clock_timestamp();
begin
  if nullif(btrim(requested_file_name), '') is null or char_length(requested_file_name) > 255
     or nullif(btrim(requested_mime_type), '') is null or char_length(requested_mime_type) > 160
     or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'The uploaded attachment metadata is invalid.' using errcode = '22023';
  end if;
  select link.* into link_row from quote_api.customer_response_links link
  where link.token_hash = requested_token_hash for update;
  if not found then raise exception 'This quote link is invalid.' using errcode = 'P0002'; end if;
  if link_row.response_origin is distinct from requested_response_origin or link_row.status_code <> 'active'
     or (link_row.expires_at is not null and link_row.expires_at <= now()) then
    raise exception 'This quote link is no longer active.' using errcode = '22023';
  end if;
  select * into reservation from quote_api.customer_response_upload_reservations
  where reservation_id = requested_reservation_id and response_link_id = link_row.response_link_id for update;
  if not found then raise exception 'That upload reservation is unavailable.' using errcode = '42501'; end if;
  if reservation.status_code = 'completed' then
    return jsonb_build_object('documentId', reservation.stored_object_id, 'storedObjectId', reservation.stored_object_id,
      'blobName', reservation.blob_name, 'completed', true);
  end if;
  if reservation.status_code <> 'reserved' or reservation.expires_at <= now() then
    raise exception 'That upload reservation has expired.' using errcode = '22023';
  end if;
  old_stored_id := link_row.competitor_document_id;
  select stored."DOCStoredObject_BlobName" into old_blob from public."DOC_StoredObjects" stored
  where stored."DOCStoredObject_ID" = old_stored_id;
  insert into public."DOC_StoredObjects" (
    "DOCStoredObject_ConcernCode", "DOCStoredObject_AggregateType", "DOCStoredObject_AggregateID",
    "DOCStoredObject_ProviderCode", "DOCStoredObject_Container", "DOCStoredObject_BlobName",
    "DOCStoredObject_OriginalFileName", "DOCStoredObject_MimeType", "DOCStoredObject_FileSizeBytes",
    "DOCStoredObject_SHA256", "DOCStoredObject_StatusCode", "DOCStoredObject_CreatedAt",
    "DOCStoredObject_DeletedAt", "DOCStoredObject_DeletedBy"
  ) values (
    'quote_response', 'quote_customer_response_link', link_row.response_link_id,
    'supabase_storage', 'multideck-documents', reservation.blob_name,
    btrim(requested_file_name), btrim(requested_mime_type), reservation.file_size_bytes,
    requested_sha256, 'active', now_value, null, null
  ) on conflict ("DOCStoredObject_Container", "DOCStoredObject_BlobName") do update set
    "DOCStoredObject_AggregateID" = excluded."DOCStoredObject_AggregateID",
    "DOCStoredObject_OriginalFileName" = excluded."DOCStoredObject_OriginalFileName",
    "DOCStoredObject_MimeType" = excluded."DOCStoredObject_MimeType",
    "DOCStoredObject_FileSizeBytes" = excluded."DOCStoredObject_FileSizeBytes",
    "DOCStoredObject_SHA256" = excluded."DOCStoredObject_SHA256",
    "DOCStoredObject_StatusCode" = 'active',
    "DOCStoredObject_CreatedAt" = now_value,
    "DOCStoredObject_DeletedAt" = null,
    "DOCStoredObject_DeletedBy" = null
  returning "DOCStoredObject_ID" into stored_id;
  update quote_api.customer_response_links set competitor_document_id = stored_id
  where response_link_id = link_row.response_link_id;
  if old_stored_id is not null and old_stored_id <> stored_id then
    update public."DOC_StoredObjects" set "DOCStoredObject_StatusCode" = 'deleted', "DOCStoredObject_DeletedAt" = now_value
    where "DOCStoredObject_ID" = old_stored_id;
  end if;
  update quote_api.customer_response_upload_reservations set
    status_code = 'completed', stored_object_id = stored_id, completed_at = now_value
  where reservation_id = reservation.reservation_id;
  return jsonb_build_object('documentId', stored_id, 'storedObjectId', stored_id, 'blobName', reservation.blob_name,
    'oldBlobName', case when old_blob is distinct from reservation.blob_name then old_blob else null end,
    'fileName', btrim(requested_file_name), 'fileSizeBytes', reservation.file_size_bytes, 'completed', true);
end;
$$;

create or replace function public.quote_customer_response_cancel_upload(
  requested_token_hash text,
  requested_response_origin text,
  requested_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare link_id uuid;
begin
  select response_link_id into link_id from quote_api.customer_response_links
  where token_hash = requested_token_hash and response_origin = requested_response_origin and status_code = 'active';
  update quote_api.customer_response_upload_reservations set status_code = 'cancelled'
  where reservation_id = requested_reservation_id and response_link_id = link_id and status_code = 'reserved';
  return found;
end;
$$;

revoke all on function public.booking_workflow_reserve_document_upload(uuid, uuid, text, uuid, bigint) from public, anon, authenticated;
revoke all on function public.booking_workflow_complete_document_upload(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.booking_workflow_cancel_document_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.quote_customer_response_reserve_upload(text, text, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.quote_customer_response_complete_upload(text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.quote_customer_response_cancel_upload(text, text, uuid) from public, anon, authenticated;
grant execute on function public.booking_workflow_reserve_document_upload(uuid, uuid, text, uuid, bigint) to service_role;
grant execute on function public.booking_workflow_complete_document_upload(uuid, uuid, text, text, text) to service_role;
grant execute on function public.booking_workflow_cancel_document_upload(uuid, uuid) to service_role;
grant execute on function public.quote_customer_response_reserve_upload(text, text, uuid, bigint, text) to service_role;
grant execute on function public.quote_customer_response_complete_upload(text, text, uuid, text, text, text) to service_role;
grant execute on function public.quote_customer_response_cancel_upload(text, text, uuid) to service_role;

commit;
