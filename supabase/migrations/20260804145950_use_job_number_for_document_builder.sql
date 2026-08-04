-- The Document Builder accepts the operator-facing Job_Header.Job_Number.
-- Resolution to the internal UUID stays inside the service-role-only database
-- API and preserves the existing company, office, and permission boundary.

create or replace function document_api.resolve_authorised_job_id_by_number(
  caller_auth_user_id uuid,
  requested_job_number integer
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app_user record;
  resolved_job_id uuid;
begin
  if caller_auth_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if requested_job_number is null or requested_job_number <= 0 then
    raise exception 'invalid job number' using errcode = '22023';
  end if;

  select user_row."User_ID", user_row."Company_ID"
  into strict app_user
  from public."cmp_Users" user_row
  where user_row."Auth_User_ID" = caller_auth_user_id;

  if app_user."Company_ID" is null
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Generate') then
    raise exception 'document generation is not authorised' using errcode = '42501';
  end if;

  select job_row."Job_ID"
  into strict resolved_job_id
  from public."Job_Header" job_row
  join public."cmp_Offices" office
    on office."Office_ID" = job_row."Job_OrgOfficeID"
   and office."Company_ID" = app_user."Company_ID"
   and office."Office_IsActive" = true
  join public."cmp_Users_Offices" user_office
    on user_office."Office_ID" = office."Office_ID"
   and user_office."User_ID" = app_user."User_ID"
  where job_row."Job_Number" = requested_job_number
    and job_row."Job_IsDeleted" = false;

  return resolved_job_id;
exception
  when no_data_found then
    raise exception 'no authorised job matches the requested job number' using errcode = 'MD404';
  when too_many_rows then
    raise exception 'more than one authorised job matches the requested job number' using errcode = 'MD409';
end;
$$;

create or replace function document_api.prepare_job_render(
  caller_auth_user_id uuid,
  requested_template_code text,
  requested_job_number integer,
  requested_output_format text,
  requested_reason text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select document_api.prepare_job_render(
    caller_auth_user_id => caller_auth_user_id,
    requested_template_code => requested_template_code,
    requested_job_id => document_api.resolve_authorised_job_id_by_number(
      caller_auth_user_id,
      requested_job_number
    ),
    requested_output_format => requested_output_format,
    requested_reason => requested_reason
  );
$$;

create or replace function document_api.prepare_studio_job_session(
  caller_auth_user_id uuid,
  requested_template_code text,
  requested_job_number integer,
  requested_content_sections text[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select document_api.prepare_studio_job_session(
    caller_auth_user_id => caller_auth_user_id,
    requested_template_code => requested_template_code,
    requested_job_id => document_api.resolve_authorised_job_id_by_number(
      caller_auth_user_id,
      requested_job_number
    ),
    requested_content_sections => requested_content_sections
  );
$$;

revoke all on function document_api.resolve_authorised_job_id_by_number(uuid, integer) from public, anon, authenticated;
revoke all on function document_api.prepare_job_render(uuid, text, integer, text, text) from public, anon, authenticated;
revoke all on function document_api.prepare_studio_job_session(uuid, text, integer, text[]) from public, anon, authenticated;

grant execute on function document_api.prepare_job_render(uuid, text, integer, text, text) to service_role;
grant execute on function document_api.prepare_studio_job_session(uuid, text, integer, text[]) to service_role;
