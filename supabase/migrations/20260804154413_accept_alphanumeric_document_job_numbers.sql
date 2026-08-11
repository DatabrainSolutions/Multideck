-- Document numbers are operator-facing references and may include tenant-specific
-- alphabetic prefixes such as JE, JI, and JQ. Keep the value as text across the
-- service boundary while resolving the internal UUID inside the protected API.

drop function if exists document_api.prepare_job_render(uuid, text, integer, text, text);
drop function if exists document_api.prepare_studio_job_session(uuid, text, integer, text[]);
drop function if exists document_api.resolve_authorised_job_id_by_number(uuid, integer);

create or replace function document_api.resolve_authorised_job_id_by_number(
  caller_auth_user_id uuid,
  requested_job_number text
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
  normalised_job_number text := upper(btrim(requested_job_number));
begin
  if caller_auth_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if normalised_job_number is null
     or normalised_job_number !~ '^[A-Z0-9][A-Z0-9._/-]{0,49}$' then
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
  where upper(btrim(job_row."Job_Number"::text)) = normalised_job_number
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
  requested_job_number text,
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
  requested_job_number text,
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

revoke all on function document_api.resolve_authorised_job_id_by_number(uuid, text) from public, anon, authenticated;
revoke all on function document_api.prepare_job_render(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function document_api.prepare_studio_job_session(uuid, text, text, text[]) from public, anon, authenticated;

grant execute on function document_api.prepare_job_render(uuid, text, text, text, text) to service_role;
grant execute on function document_api.prepare_studio_job_session(uuid, text, text, text[]) to service_role;
