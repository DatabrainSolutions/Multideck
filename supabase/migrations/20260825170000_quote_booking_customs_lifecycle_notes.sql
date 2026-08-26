-- Tenant-safe operational notes that follow the real quote -> booking ->
-- Customs lifecycle. Notes are not copied between records: downstream views
-- resolve the same immutable note through the canonical provenance links.

begin;

create table public."OPS_LifecycleNotes" (
  "LifecycleNote_ID" uuid primary key default gen_random_uuid(),
  "LifecycleNote_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "LifecycleNote_SubjectType" text not null check ("LifecycleNote_SubjectType" in ('quote', 'booking', 'customs')),
  "LifecycleNote_SubjectID" uuid not null,
  "LifecycleNote_QuoteID" uuid references public."CusQuote_Header"("CusQuoteHeader_ID"),
  "LifecycleNote_JobID" uuid references public."Job_Header"("Job_ID"),
  "LifecycleNote_CustomsID" uuid references public."Customs_Declarations"("CUST_id"),
  "LifecycleNote_Body" text not null,
  "LifecycleNote_AuthorUserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  "LifecycleNote_AuthorNameSnapshot" text not null,
  "LifecycleNote_CreatedAt" timestamptz not null default now(),
  constraint "CK_OPS_LifecycleNotes_body" check (
    btrim("LifecycleNote_Body") <> '' and char_length("LifecycleNote_Body") <= 4000
  ),
  constraint "CK_OPS_LifecycleNotes_subject" check (
    ("LifecycleNote_SubjectType" = 'quote'
      and "LifecycleNote_SubjectID" = "LifecycleNote_QuoteID"
      and "LifecycleNote_JobID" is null
      and "LifecycleNote_CustomsID" is null)
    or
    ("LifecycleNote_SubjectType" = 'booking'
      and "LifecycleNote_SubjectID" = "LifecycleNote_JobID"
      and "LifecycleNote_CustomsID" is null)
    or
    ("LifecycleNote_SubjectType" = 'customs'
      and "LifecycleNote_SubjectID" = "LifecycleNote_CustomsID")
  )
);

create table public."OPS_LifecycleNoteMentions" (
  "LifecycleNoteMention_ID" uuid primary key default gen_random_uuid(),
  "LifecycleNoteMention_NoteID" uuid not null references public."OPS_LifecycleNotes"("LifecycleNote_ID") on delete cascade,
  "LifecycleNoteMention_TargetType" text not null check ("LifecycleNoteMention_TargetType" in ('user', 'department')),
  "LifecycleNoteMention_TargetID" uuid not null,
  "LifecycleNoteMention_LabelSnapshot" text not null,
  "LifecycleNoteMention_CreatedAt" timestamptz not null default now()
);

create index "IX_OPS_LifecycleNotes_quote_created"
  on public."OPS_LifecycleNotes" ("LifecycleNote_QuoteID", "LifecycleNote_CreatedAt" desc)
  where "LifecycleNote_QuoteID" is not null;
create index "IX_OPS_LifecycleNotes_job_created"
  on public."OPS_LifecycleNotes" ("LifecycleNote_JobID", "LifecycleNote_CreatedAt" desc)
  where "LifecycleNote_JobID" is not null;
create index "IX_OPS_LifecycleNotes_customs_created"
  on public."OPS_LifecycleNotes" ("LifecycleNote_CustomsID", "LifecycleNote_CreatedAt" desc)
  where "LifecycleNote_CustomsID" is not null;
create index "IX_OPS_LifecycleNoteMentions_note"
  on public."OPS_LifecycleNoteMentions" ("LifecycleNoteMention_NoteID");
create unique index "UX_OPS_LifecycleNoteMentions_target"
  on public."OPS_LifecycleNoteMentions" (
    "LifecycleNoteMention_NoteID", "LifecycleNoteMention_TargetType", "LifecycleNoteMention_TargetID"
  );

alter table public."OPS_LifecycleNotes" enable row level security;
alter table public."OPS_LifecycleNoteMentions" enable row level security;
revoke all on public."OPS_LifecycleNotes", public."OPS_LifecycleNoteMentions" from public, anon, authenticated;
grant select, insert on public."OPS_LifecycleNotes", public."OPS_LifecycleNoteMentions" to service_role;

create or replace function public._multideck_lifecycle_note_context(
  p_auth_user_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_write boolean
)
returns table (
  company_id uuid,
  actor_user_id uuid,
  quote_id uuid,
  job_id uuid,
  customs_id uuid,
  reference text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, booking_api, quote_api
as $$
declare
  v_actor record;
  v_company_id uuid;
  v_quote_id uuid;
  v_job_id uuid;
  v_customs_id uuid;
  v_reference text;
  v_subject_type text := lower(btrim(coalesce(p_subject_type, '')));
begin
  select workspace_user."User_ID", workspace_user."Company_ID"
  into strict v_actor
  from public."cmp_Users" workspace_user
  where workspace_user."Auth_User_ID" = p_auth_user_id
    and workspace_user."Company_ID" is not null
    and workspace_user."User_AccessStatus" = 'active'
  order by workspace_user."User_ID"
  limit 1;

  if p_subject_id is null or v_subject_type not in ('quote', 'booking', 'customs') then
    raise exception 'Choose a quote, booking or Customs declaration for this note.' using errcode = '22023';
  end if;

  if v_subject_type = 'quote' then
    if not quote_api.has_permission(p_auth_user_id, case when p_write then 'Quotes.Write' else 'Quotes.Read' end) then
      raise exception 'You do not have permission to % quote notes.', case when p_write then 'add' else 'view' end using errcode = '42501';
    end if;
    select office."Company_ID", quote."CusQuoteHeader_ID", 'Q-' || quote."CusQuoteHeader_Number"
    into v_company_id, v_quote_id, v_reference
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where quote."CusQuoteHeader_ID" = p_subject_id
      and not quote."CusQuoteHeader_IsDeleted";
  elsif v_subject_type = 'booking' then
    if not booking_api.has_permission(p_auth_user_id, case when p_write then 'Bookings.Write' else 'Bookings.Read' end) then
      raise exception 'You do not have permission to % booking notes.', case when p_write then 'add' else 'view' end using errcode = '42501';
    end if;
    select office."Company_ID", job."Job_SourceQuoteID", job."Job_ID",
      coalesce(nullif(btrim(job."Job_BookingReference"), ''), 'MD-' || job."Job_Number")
    into v_company_id, v_quote_id, v_job_id, v_reference
    from public."Job_Header" job
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    where job."Job_ID" = p_subject_id
      and not job."Job_IsDeleted";
  else
    if not booking_api.customs_access(p_auth_user_id, p_subject_id, p_write) then
      raise exception 'You do not have permission to % Customs notes.', case when p_write then 'add' else 'view' end using errcode = '42501';
    end if;
    select
      coalesce(job_office."Company_ID", creator."Company_ID"),
      job."Job_SourceQuoteID",
      declaration."CUST_JobID",
      declaration."CUST_id",
      coalesce(nullif(btrim(declaration."CUST_LocalReferenceNumber"), ''), declaration."CUST_id"::text)
    into v_company_id, v_quote_id, v_job_id, v_customs_id, v_reference
    from public."Customs_Declarations" declaration
    left join public."Job_Header" job
      on job."Job_ID" = declaration."CUST_JobID" and not job."Job_IsDeleted"
    left join public."cmp_Offices" job_office
      on job_office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    left join public."cmp_Users" creator
      on creator."Auth_User_ID" = declaration."CUST_CreatedBy"
    where declaration."CUST_id" = p_subject_id
      and not declaration."CUST_IsDeleted";
  end if;

  if v_company_id is null or v_company_id <> v_actor."Company_ID" then
    raise exception 'That record is outside this Multideck workspace.' using errcode = '42501';
  end if;

  return query select v_company_id, v_actor."User_ID", v_quote_id, v_job_id, v_customs_id, v_reference;
exception
  when no_data_found then
    raise exception 'Your signed-in account is not linked to an active Multideck user.' using errcode = '42501';
end;
$$;

revoke all on function public._multideck_lifecycle_note_context(uuid,text,uuid,boolean) from public, anon, authenticated;

create or replace function public.multideck_lifecycle_note_recipient_authorised(
  p_auth_user_id uuid,
  p_subject_type text,
  p_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, booking_api, quote_api
as $$
  select p_auth_user_id is not null and p_subject_id is not null and case lower(btrim(coalesce(p_subject_type, '')))
    when 'quote' then
      quote_api.has_permission(p_auth_user_id, 'Quotes.Read')
      and exists (
        select 1
        from public."CusQuote_Header" quote
        join public."cmp_Offices" office
          on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
        join public."cmp_Users" recipient
          on recipient."Auth_User_ID" = p_auth_user_id
         and recipient."Company_ID" = office."Company_ID"
         and recipient."User_AccessStatus" = 'active'
        where quote."CusQuoteHeader_ID" = p_subject_id
          and not quote."CusQuoteHeader_IsDeleted"
      )
    when 'booking' then
      booking_api.has_permission(p_auth_user_id, 'Bookings.Read')
      and exists (
        select 1
        from public."Job_Header" job
        join public."cmp_Offices" office
          on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
        join public."cmp_Users" recipient
          on recipient."Auth_User_ID" = p_auth_user_id
         and recipient."Company_ID" = office."Company_ID"
         and recipient."User_AccessStatus" = 'active'
        where job."Job_ID" = p_subject_id
          and not job."Job_IsDeleted"
      )
    when 'customs' then booking_api.customs_access(p_auth_user_id, p_subject_id, false)
    else false
  end;
$$;

revoke all on function public.multideck_lifecycle_note_recipient_authorised(uuid,text,uuid) from public, anon, authenticated;

create or replace function public.multideck_lifecycle_note_targets(
  p_subject_type text,
  p_subject_id uuid,
  p_search text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, booking_api, quote_api
as $$
declare
  v_context record;
  v_search text := nullif(left(btrim(coalesce(p_search, '')), 160), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_result jsonb;
begin
  select * into strict v_context
  from public._multideck_lifecycle_note_context(auth.uid(), p_subject_type, p_subject_id, false);

  with targets as (
    select
      'user'::text as target_type,
      workspace_user."User_ID" as target_id,
      coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email"
      ) as label,
      nullif(btrim(workspace_user."User_JobTitle"), '') as detail,
      0 as target_order
    from public."cmp_Users" workspace_user
    where workspace_user."Company_ID" = v_context.company_id
      and workspace_user."User_AccessStatus" = 'active'
      and workspace_user."Auth_User_ID" is not null
      and public.multideck_lifecycle_note_recipient_authorised(
        workspace_user."Auth_User_ID", p_subject_type, p_subject_id
      )
    union all
    select
      'department'::text,
      department."Department_ID",
      department."Department_Name",
      'Department'::text,
      1
    from public."cmp_Departments" department
    where department."Company_ID" = v_context.company_id
      and department."Department_IsActive"
      and exists (
        select 1
        from public."cmp_Users_Departments" membership
        join public."cmp_Users" member on member."User_ID" = membership."User_ID"
        where membership."Department_ID" = department."Department_ID"
          and member."Company_ID" = v_context.company_id
          and member."User_AccessStatus" = 'active'
          and member."Auth_User_ID" is not null
          and public.multideck_lifecycle_note_recipient_authorised(
            member."Auth_User_ID", p_subject_type, p_subject_id
          )
      )
  ), filtered as (
    select *
    from targets
    where v_search is null
      or concat_ws(' ', label, detail) ilike '%' || v_search || '%'
    order by target_order, lower(label), target_id
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', target_type,
    'id', target_id,
    'label', label,
    'detail', detail
  ) order by target_order, lower(label), target_id), '[]'::jsonb)
  into v_result
  from filtered;

  return v_result;
exception
  when no_data_found then
    raise exception 'Your signed-in account is not linked to an active Multideck user.' using errcode = '42501';
end;
$$;

revoke all on function public.multideck_lifecycle_note_targets(text,uuid,text,integer) from public, anon;
grant execute on function public.multideck_lifecycle_note_targets(text,uuid,text,integer) to authenticated, service_role;

create or replace function public.multideck_lifecycle_notes(
  p_subject_type text,
  p_subject_id uuid,
  p_limit integer default 30,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, booking_api, quote_api
as $$
declare
  v_context record;
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_result jsonb;
  v_can_write boolean;
begin
  select * into strict v_context
  from public._multideck_lifecycle_note_context(auth.uid(), p_subject_type, p_subject_id, false);

  v_can_write := case lower(btrim(p_subject_type))
    when 'quote' then quote_api.has_permission(auth.uid(), 'Quotes.Write')
    when 'booking' then booking_api.has_permission(auth.uid(), 'Bookings.Write')
    else booking_api.customs_access(auth.uid(), p_subject_id, true)
  end;

  with visible as (
    select note.*
    from public."OPS_LifecycleNotes" note
    where note."LifecycleNote_CompanyID" = v_context.company_id
      and (p_before is null or note."LifecycleNote_CreatedAt" < p_before)
      and (
        (lower(btrim(p_subject_type)) = 'quote'
          and note."LifecycleNote_SubjectType" = 'quote'
          and note."LifecycleNote_QuoteID" = v_context.quote_id)
        or
        (lower(btrim(p_subject_type)) = 'booking' and (
          (note."LifecycleNote_SubjectType" = 'quote'
            and v_context.quote_id is not null
            and note."LifecycleNote_QuoteID" = v_context.quote_id)
          or
          (note."LifecycleNote_SubjectType" = 'booking'
            and note."LifecycleNote_JobID" = v_context.job_id)
        ))
        or
        (lower(btrim(p_subject_type)) = 'customs' and (
          (note."LifecycleNote_SubjectType" = 'quote'
            and v_context.quote_id is not null
            and note."LifecycleNote_QuoteID" = v_context.quote_id)
          or
          (note."LifecycleNote_SubjectType" = 'booking'
            and v_context.job_id is not null
            and note."LifecycleNote_JobID" = v_context.job_id)
          or
          (note."LifecycleNote_SubjectType" = 'customs'
            and note."LifecycleNote_CustomsID" = v_context.customs_id)
        ))
      )
    order by note."LifecycleNote_CreatedAt" desc, note."LifecycleNote_ID" desc
    limit v_limit + 1
  ), numbered as (
    select visible.*, row_number() over (order by "LifecycleNote_CreatedAt" desc, "LifecycleNote_ID" desc) as row_number
    from visible
  ), page as (
    select * from numbered where row_number <= v_limit
  ), hydrated as (
    select
      page."LifecycleNote_CreatedAt" as created_at,
      page."LifecycleNote_ID" as note_id,
      jsonb_build_object(
        'id', page."LifecycleNote_ID",
        'subjectType', page."LifecycleNote_SubjectType",
        'subjectId', page."LifecycleNote_SubjectID",
        'body', page."LifecycleNote_Body",
        'author', jsonb_build_object(
          'id', page."LifecycleNote_AuthorUserID",
          'name', page."LifecycleNote_AuthorNameSnapshot"
        ),
        'mentions', coalesce(mentions.value, '[]'::jsonb),
        'createdAt', page."LifecycleNote_CreatedAt"
      ) as value
    from page
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'type', mention."LifecycleNoteMention_TargetType",
        'id', mention."LifecycleNoteMention_TargetID",
        'label', mention."LifecycleNoteMention_LabelSnapshot"
      ) order by mention."LifecycleNoteMention_CreatedAt", mention."LifecycleNoteMention_ID") as value
      from public."OPS_LifecycleNoteMentions" mention
      where mention."LifecycleNoteMention_NoteID" = page."LifecycleNote_ID"
    ) mentions on true
  )
  select jsonb_build_object(
    'notes', coalesce((select jsonb_agg(value order by created_at desc, note_id desc) from hydrated), '[]'::jsonb),
    'hasMore', exists(select 1 from numbered where row_number > v_limit),
    'canWrite', v_can_write,
    'reference', v_context.reference
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_lifecycle_notes(text,uuid,integer,timestamptz) from public, anon;
grant execute on function public.multideck_lifecycle_notes(text,uuid,integer,timestamptz) to authenticated, service_role;

create or replace function public._multideck_add_lifecycle_note(
  p_auth_user_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_body text,
  p_mentions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, booking_api, quote_api
as $$
declare
  v_context record;
  v_note public."OPS_LifecycleNotes";
  v_mention jsonb;
  v_target_id uuid;
  v_target_type text;
  v_label text;
  v_mentions jsonb;
  v_body text := btrim(coalesce(p_body, ''));
  v_action_url text;
  v_target_table text;
  v_direction text;
begin
  select * into strict v_context
  from public._multideck_lifecycle_note_context(p_auth_user_id, p_subject_type, p_subject_id, true);

  if v_body = '' then
    raise exception 'Write a note before adding it.' using errcode = '22023';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Keep the note to 4,000 characters or fewer.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_mentions, '[]'::jsonb)) <> 'array' then
    raise exception 'Note mentions must be a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_mentions, '[]'::jsonb)) > 20 then
    raise exception 'Tag up to 20 people or departments in one note.' using errcode = '22023';
  end if;

  insert into public."OPS_LifecycleNotes" (
    "LifecycleNote_CompanyID", "LifecycleNote_SubjectType", "LifecycleNote_SubjectID",
    "LifecycleNote_QuoteID", "LifecycleNote_JobID", "LifecycleNote_CustomsID",
    "LifecycleNote_Body", "LifecycleNote_AuthorUserID", "LifecycleNote_AuthorNameSnapshot"
  )
  select
    v_context.company_id, lower(btrim(p_subject_type)), p_subject_id,
    v_context.quote_id, v_context.job_id, v_context.customs_id,
    v_body, v_context.actor_user_id,
    coalesce(nullif(btrim(concat_ws(' ', actor."User_Firstname", actor."User_Lastname")), ''), actor."User_Email")
  from public."cmp_Users" actor
  where actor."User_ID" = v_context.actor_user_id
  returning * into v_note;

  for v_mention in select value from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) value loop
    v_target_type := lower(btrim(coalesce(v_mention->>'type', '')));
    begin
      v_target_id := nullif(v_mention->>'id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'One of the note tags is invalid.' using errcode = '22023';
    end;

    if v_target_type = 'user' then
      select coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email"
      ) into v_label
      from public."cmp_Users" workspace_user
      where workspace_user."User_ID" = v_target_id
        and workspace_user."Company_ID" = v_context.company_id
        and workspace_user."User_AccessStatus" = 'active'
        and workspace_user."Auth_User_ID" is not null
        and public.multideck_lifecycle_note_recipient_authorised(
          workspace_user."Auth_User_ID", p_subject_type, p_subject_id
        );
      if v_label is null then
        raise exception 'That person is not active or cannot read this record.' using errcode = '22023';
      end if;
      insert into public."OPS_LifecycleNoteMentions" (
        "LifecycleNoteMention_NoteID", "LifecycleNoteMention_TargetType",
        "LifecycleNoteMention_TargetID", "LifecycleNoteMention_LabelSnapshot"
      ) values (v_note."LifecycleNote_ID", 'user', v_target_id, v_label)
      on conflict do nothing;
    elsif v_target_type = 'department' then
      select department."Department_Name" into v_label
      from public."cmp_Departments" department
      where department."Department_ID" = v_target_id
        and department."Company_ID" = v_context.company_id
        and department."Department_IsActive"
        and exists (
          select 1
          from public."cmp_Users_Departments" membership
          join public."cmp_Users" member on member."User_ID" = membership."User_ID"
          where membership."Department_ID" = department."Department_ID"
            and member."Company_ID" = v_context.company_id
            and member."User_AccessStatus" = 'active'
            and member."Auth_User_ID" is not null
            and public.multideck_lifecycle_note_recipient_authorised(
              member."Auth_User_ID", p_subject_type, p_subject_id
            )
        );
      if v_label is null then
        raise exception 'That department has no active member who can read this record.' using errcode = '22023';
      end if;
      insert into public."OPS_LifecycleNoteMentions" (
        "LifecycleNoteMention_NoteID", "LifecycleNoteMention_TargetType",
        "LifecycleNoteMention_TargetID", "LifecycleNoteMention_LabelSnapshot"
      ) values (v_note."LifecycleNote_ID", 'department', v_target_id, v_label)
      on conflict do nothing;
    else
      raise exception 'Tag a workspace person or department.' using errcode = '22023';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'type', mention."LifecycleNoteMention_TargetType",
    'id', mention."LifecycleNoteMention_TargetID",
    'label', mention."LifecycleNoteMention_LabelSnapshot"
  ) order by mention."LifecycleNoteMention_CreatedAt", mention."LifecycleNoteMention_ID"), '[]'::jsonb)
  into v_mentions
  from public."OPS_LifecycleNoteMentions" mention
  where mention."LifecycleNoteMention_NoteID" = v_note."LifecycleNote_ID";

  if v_note."LifecycleNote_SubjectType" = 'quote' then
    v_target_table := 'CusQuote_Header';
    v_action_url := '/quotes/' || v_context.reference;
  elsif v_note."LifecycleNote_SubjectType" = 'booking' then
    v_target_table := 'Job_Header';
    v_action_url := '/bookings/' || lower(v_context.reference);
  else
    v_target_table := 'Customs_Declarations';
    select lower(coalesce(nullif(btrim(declaration."CUST_Direction"), ''), 'export'))
    into v_direction
    from public."Customs_Declarations" declaration
    where declaration."CUST_id" = v_context.customs_id;
    v_action_url := '/customs/' || case when v_context.job_id is null then 'standalone' else 'job-related' end
      || '/' || v_direction || '/' || v_context.customs_id;
  end if;

  with tagged_recipients as (
    select mention."LifecycleNoteMention_TargetID" as user_id
    from public."OPS_LifecycleNoteMentions" mention
    where mention."LifecycleNoteMention_NoteID" = v_note."LifecycleNote_ID"
      and mention."LifecycleNoteMention_TargetType" = 'user'
    union
    select membership."User_ID"
    from public."OPS_LifecycleNoteMentions" mention
    join public."cmp_Users_Departments" membership
      on membership."Department_ID" = mention."LifecycleNoteMention_TargetID"
    where mention."LifecycleNoteMention_NoteID" = v_note."LifecycleNote_ID"
      and mention."LifecycleNoteMention_TargetType" = 'department'
  ), eligible_recipients as (
    select distinct recipient."User_ID"
    from tagged_recipients tagged
    join public."cmp_Users" recipient on recipient."User_ID" = tagged.user_id
    where recipient."Company_ID" = v_context.company_id
      and recipient."User_ID" <> v_context.actor_user_id
      and recipient."User_AccessStatus" = 'active'
      and recipient."Auth_User_ID" is not null
      and public.multideck_lifecycle_note_recipient_authorised(
        recipient."Auth_User_ID", p_subject_type, p_subject_id
      )
  )
  insert into public."Comm_Notifications" (
    "CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable",
    "CommNotif_TargetID", "CommNotif_MetadataJSON", "CommNotif_CreatedBy"
  )
  select
    recipient."User_ID", 'You were tagged in a note',
    v_note."LifecycleNote_AuthorNameSnapshot" || ' tagged you on ' || v_context.reference || ': ' || left(v_body, 220),
    v_target_table, p_subject_id,
    jsonb_build_object(
      'event_type', 'lifecycle_note_mention',
      'action_url', v_action_url,
      'action_label', 'Open note',
      'eyebrow', 'Operational note',
      'note_id', v_note."LifecycleNote_ID",
      'subject_type', v_note."LifecycleNote_SubjectType",
      'reference', v_context.reference
    ),
    v_context.actor_user_id
  from eligible_recipients recipient;

  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  )
  select distinct
    v_context.company_id, 'lifecycle_notes', 'OPS_LifecycleNotes', watch."AIDexterWatch_TargetID", '{}'::jsonb,
    jsonb_build_object(
      'subjectType', v_note."LifecycleNote_SubjectType",
      'reference', coalesce(
        (select 'Q-' || quote."CusQuoteHeader_Number" from public."CusQuote_Header" quote where quote."CusQuoteHeader_ID" = watch."AIDexterWatch_TargetID"),
        (select coalesce(nullif(btrim(job."Job_BookingReference"), ''), 'MD-' || job."Job_Number") from public."Job_Header" job where job."Job_ID" = watch."AIDexterWatch_TargetID"),
        (select coalesce(nullif(btrim(declaration."CUST_LocalReferenceNumber"), ''), declaration."CUST_id"::text) from public."Customs_Declarations" declaration where declaration."CUST_id" = watch."AIDexterWatch_TargetID"),
        v_context.reference
      ),
      'body', v_body,
      'author', v_note."LifecycleNote_AuthorNameSnapshot",
      'mentionedUsers', coalesce((select jsonb_agg(value->>'label') from jsonb_array_elements(v_mentions) value where value->>'type' = 'user'), '[]'::jsonb),
      'mentionedDepartments', coalesce((select jsonb_agg(value->>'label') from jsonb_array_elements(v_mentions) value where value->>'type' = 'department'), '[]'::jsonb),
      'createdAt', v_note."LifecycleNote_CreatedAt"
    )
  from public."AI_DexterWatches" watch
  where watch."AIDexterWatch_CompanyID" = v_context.company_id
    and watch."AIDexterWatch_CapabilityCode" = 'lifecycle_notes'
    and watch."AIDexterWatch_StatusCode" = 'active'
    and (
      watch."AIDexterWatch_TargetID" = p_subject_id
      or (
        v_note."LifecycleNote_SubjectType" = 'quote'
        and exists (
          select 1
          from public."Job_Header" job
          where job."Job_SourceQuoteID" = v_context.quote_id
            and not job."Job_IsDeleted"
            and (
              watch."AIDexterWatch_TargetID" = job."Job_ID"
              or exists (
                select 1
                from public."Customs_Declarations" declaration
                where declaration."CUST_JobID" = job."Job_ID"
                  and declaration."CUST_id" = watch."AIDexterWatch_TargetID"
                  and not declaration."CUST_IsDeleted"
              )
            )
        )
      )
      or (
        v_note."LifecycleNote_SubjectType" = 'booking'
        and exists (
          select 1
          from public."Customs_Declarations" declaration
          where declaration."CUST_JobID" = v_context.job_id
            and declaration."CUST_id" = watch."AIDexterWatch_TargetID"
            and not declaration."CUST_IsDeleted"
        )
      )
    );

  return jsonb_build_object(
    'id', v_note."LifecycleNote_ID",
    'subjectType', v_note."LifecycleNote_SubjectType",
    'subjectId', v_note."LifecycleNote_SubjectID",
    'body', v_note."LifecycleNote_Body",
    'author', jsonb_build_object('id', v_note."LifecycleNote_AuthorUserID", 'name', v_note."LifecycleNote_AuthorNameSnapshot"),
    'mentions', v_mentions,
    'createdAt', v_note."LifecycleNote_CreatedAt"
  );
end;
$$;

revoke all on function public._multideck_add_lifecycle_note(uuid,text,uuid,text,jsonb) from public, anon, authenticated;

create or replace function public.multideck_add_lifecycle_note(
  p_subject_type text,
  p_subject_id uuid,
  p_body text,
  p_mentions jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
  select public._multideck_add_lifecycle_note(auth.uid(), p_subject_type, p_subject_id, p_body, p_mentions);
$$;

revoke all on function public.multideck_add_lifecycle_note(text,uuid,text,jsonb) from public, anon;
grant execute on function public.multideck_add_lifecycle_note(text,uuid,text,jsonb) to authenticated, service_role;

-- Dexter reads notes through an explicit company-scoped domain. recordId is
-- the lifecycle subject, so any reviewed write remains bound to the exact
-- quote, booking or declaration rather than to a display label.
create or replace function public.multideck_dexter_domain_lifecycle_notes(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth, booking_api, quote_api
as $$
  with rows as (
    select
      note."LifecycleNote_CreatedAt" as created_at,
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', case
          when note."LifecycleNote_SubjectType" = 'quote' and quote_api.has_permission(auth.uid(), 'Quotes.Read')
            then note."LifecycleNote_SubjectID"
          when job."Job_ID" is not null and booking_api.has_permission(auth.uid(), 'Bookings.Read')
            then job."Job_ID"
          else customs_context.primary_id
        end,
        'noteId', note."LifecycleNote_ID",
        'subjectType', case
          when note."LifecycleNote_SubjectType" = 'quote' and quote_api.has_permission(auth.uid(), 'Quotes.Read') then 'quote'
          when job."Job_ID" is not null and booking_api.has_permission(auth.uid(), 'Bookings.Read') then 'booking'
          else 'customs'
        end,
        'originSubjectType', note."LifecycleNote_SubjectType",
        'reference', case
          when note."LifecycleNote_SubjectType" = 'quote' and quote_api.has_permission(auth.uid(), 'Quotes.Read')
            then 'Q-' || quote."CusQuoteHeader_Number"
          when job."Job_ID" is not null and booking_api.has_permission(auth.uid(), 'Bookings.Read')
            then coalesce(job."Job_BookingReference", 'MD-' || job."Job_Number")
          else customs_context.primary_reference
        end,
        'visibleOn', jsonb_strip_nulls(jsonb_build_object(
          'quote', case when note."LifecycleNote_QuoteID" is not null and quote_api.has_permission(auth.uid(), 'Quotes.Read') then jsonb_build_object(
            'id', note."LifecycleNote_QuoteID", 'reference', 'Q-' || quote."CusQuoteHeader_Number"
          ) end,
          'booking', case when job."Job_ID" is not null and booking_api.has_permission(auth.uid(), 'Bookings.Read') then jsonb_build_object(
            'id', job."Job_ID", 'reference', coalesce(job."Job_BookingReference", 'MD-' || job."Job_Number")
          ) end,
          'customs', coalesce(customs_context.records, '[]'::jsonb)
        )),
        'body', note."LifecycleNote_Body",
        'author', note."LifecycleNote_AuthorNameSnapshot",
        'mentions', coalesce(mentions.records, '[]'::jsonb),
        'mentionedUsers', coalesce(mentions.users, '[]'::jsonb),
        'mentionedDepartments', coalesce(mentions.departments, '[]'::jsonb),
        'createdAt', note."LifecycleNote_CreatedAt",
        'evidence', jsonb_build_object('sourceTable', 'OPS_LifecycleNotes', 'sourceId', note."LifecycleNote_ID")
      )) as value
    from public."OPS_LifecycleNotes" note
    left join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID" = note."LifecycleNote_QuoteID"
    left join lateral (
      select candidate.*
      from public."Job_Header" candidate
      where not candidate."Job_IsDeleted"
        and (
          candidate."Job_ID" = note."LifecycleNote_JobID"
          or (
            note."LifecycleNote_SubjectType" = 'quote'
            and candidate."Job_SourceQuoteID" = note."LifecycleNote_QuoteID"
          )
        )
      order by case when candidate."Job_ID" = note."LifecycleNote_JobID" then 0 else 1 end, candidate."Job_ID"
      limit 1
    ) job on true
    left join lateral (
      select
        jsonb_agg(jsonb_build_object(
          'id', declaration."CUST_id",
          'reference', coalesce(nullif(btrim(declaration."CUST_LocalReferenceNumber"), ''), declaration."CUST_id"::text)
        ) order by declaration."CUST_CreatedAt", declaration."CUST_id") as records,
        string_agg(coalesce(declaration."CUST_LocalReferenceNumber", ''), ' ') as search_text,
        bool_or(booking_api.customs_access(auth.uid(), declaration."CUST_id", false)) as can_read,
        (array_agg(declaration."CUST_id" order by declaration."CUST_CreatedAt", declaration."CUST_id"))[1] as primary_id,
        (array_agg(coalesce(nullif(btrim(declaration."CUST_LocalReferenceNumber"), ''), declaration."CUST_id"::text)
          order by declaration."CUST_CreatedAt", declaration."CUST_id"))[1] as primary_reference
      from public."Customs_Declarations" declaration
      where not declaration."CUST_IsDeleted"
        and booking_api.customs_access(auth.uid(), declaration."CUST_id", false)
        and (
          (note."LifecycleNote_SubjectType" = 'customs' and declaration."CUST_id" = note."LifecycleNote_CustomsID")
          or (
            note."LifecycleNote_SubjectType" in ('quote', 'booking')
            and coalesce(job."Job_ID", note."LifecycleNote_JobID") is not null
            and declaration."CUST_JobID" = coalesce(job."Job_ID", note."LifecycleNote_JobID")
          )
        )
    ) customs_context on true
    left join lateral (
      select
        jsonb_agg(jsonb_build_object(
          'type', mention."LifecycleNoteMention_TargetType",
          'id', mention."LifecycleNoteMention_TargetID",
          'label', mention."LifecycleNoteMention_LabelSnapshot"
        ) order by mention."LifecycleNoteMention_CreatedAt", mention."LifecycleNoteMention_ID") as records,
        jsonb_agg(mention."LifecycleNoteMention_LabelSnapshot" order by mention."LifecycleNoteMention_LabelSnapshot")
          filter (where mention."LifecycleNoteMention_TargetType" = 'user') as users,
        jsonb_agg(mention."LifecycleNoteMention_LabelSnapshot" order by mention."LifecycleNoteMention_LabelSnapshot")
          filter (where mention."LifecycleNoteMention_TargetType" = 'department') as departments,
        string_agg(mention."LifecycleNoteMention_LabelSnapshot", ' ') as search_text
      from public."OPS_LifecycleNoteMentions" mention
      where mention."LifecycleNoteMention_NoteID" = note."LifecycleNote_ID"
    ) mentions on true
    where note."LifecycleNote_CompanyID" = p_company_id
      and (
        (note."LifecycleNote_SubjectType" = 'quote' and (
          quote_api.has_permission(auth.uid(), 'Quotes.Read')
          or (job."Job_ID" is not null and booking_api.has_permission(auth.uid(), 'Bookings.Read'))
          or coalesce(customs_context.can_read, false)
        ))
        or (note."LifecycleNote_SubjectType" = 'booking' and (
          booking_api.has_permission(auth.uid(), 'Bookings.Read')
          or coalesce(customs_context.can_read, false)
        ))
        or (note."LifecycleNote_SubjectType" = 'customs' and booking_api.customs_access(auth.uid(), note."LifecycleNote_CustomsID", false))
      )
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', note."LifecycleNote_Body", note."LifecycleNote_AuthorNameSnapshot", mentions.search_text,
          quote."CusQuoteHeader_Number", job."Job_BookingReference", customs_context.search_text)
          ilike '%' || btrim(p_search) || '%'
      )
    order by note."LifecycleNote_CreatedAt" desc, note."LifecycleNote_ID" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  )
  select coalesce(jsonb_agg(value order by created_at desc), '[]'::jsonb) from rows;
$$;

revoke all on function public.multideck_dexter_domain_lifecycle_notes(uuid,text,integer) from public, anon, authenticated;

create or replace function public.multideck_dexter_domain_lifecycle_note_targets(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with actor as (
    select workspace_user."User_ID"
    from public."cmp_Users" workspace_user
    where workspace_user."Auth_User_ID" = auth.uid()
      and workspace_user."Company_ID" = p_company_id
      and workspace_user."User_AccessStatus" = 'active'
    limit 1
  ), targets as (
    select
      'user'::text as target_type,
      workspace_user."User_ID" as target_id,
      coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email"
      ) as label,
      nullif(btrim(workspace_user."User_JobTitle"), '') as detail,
      0 as target_order
    from public."cmp_Users" workspace_user
    where exists (select 1 from actor)
      and workspace_user."Company_ID" = p_company_id
      and workspace_user."User_AccessStatus" = 'active'
      and workspace_user."Auth_User_ID" is not null
    union all
    select
      'department'::text,
      department."Department_ID",
      department."Department_Name",
      'Department'::text,
      1
    from public."cmp_Departments" department
    where exists (select 1 from actor)
      and department."Company_ID" = p_company_id
      and department."Department_IsActive"
      and exists (
        select 1
        from public."cmp_Users_Departments" membership
        join public."cmp_Users" member on member."User_ID" = membership."User_ID"
        where membership."Department_ID" = department."Department_ID"
          and member."Company_ID" = p_company_id
          and member."User_AccessStatus" = 'active'
          and member."Auth_User_ID" is not null
      )
  ), filtered as (
    select *
    from targets
    where nullif(left(btrim(coalesce(p_search, '')), 160), '') is null
      or concat_ws(' ', label, detail) ilike '%' || left(btrim(p_search), 160) || '%'
    order by target_order, lower(label), target_id
    limit greatest(1, least(coalesce(p_take, 10), 25))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'recordId', target_id,
    'recordKind', 'mention_target',
    'targetType', target_type,
    'label', label,
    'detail', detail
  ) order by target_order, lower(label), target_id), '[]'::jsonb)
  from filtered;
$$;

revoke all on function public.multideck_dexter_domain_lifecycle_note_targets(uuid,text,integer) from public, anon, authenticated;

create or replace function public.multideck_dexter_action_add_lifecycle_note(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_auth_user_id uuid;
begin
  select workspace_user."Auth_User_ID" into v_auth_user_id
  from public."cmp_Users" workspace_user
  where workspace_user."User_ID" = p_user_id
    and workspace_user."Company_ID" = p_company_id
    and workspace_user."Auth_User_ID" = auth.uid()
    and workspace_user."User_AccessStatus" = 'active';
  if v_auth_user_id is null then
    raise exception 'Your signed-in account is not linked to this workspace.' using errcode = '42501';
  end if;
  return public._multideck_add_lifecycle_note(
    v_auth_user_id,
    p_arguments->>'subject_type',
    nullif(p_arguments->>'target_id', '')::uuid,
    p_arguments->>'body',
    coalesce(p_arguments->'mentions', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.multideck_dexter_action_add_lifecycle_note(uuid,uuid,jsonb) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt", "AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON", "AIDexterDomain_ScopeStrategy"
) values (
  'lifecycle_notes', 'Operational notes',
  'Tenant-safe notes added to exact quotes, bookings and Customs declarations, including their tagged people and departments. Quote notes remain visible on the linked booking and declaration; booking notes remain visible on its declaration.',
  'multideck_dexter_domain_lifecycle_notes', 46, true, now(), '[]'::jsonb,
  '["operational_notes","workspace_users","departments"]'::jsonb, 'record'
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now(),
  "AIDexterDomain_RequiredPermissionsJSON" = excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON" = excluded."AIDexterDomain_DataCategoriesJSON",
  "AIDexterDomain_ScopeStrategy" = excluded."AIDexterDomain_ScopeStrategy";

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt", "AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON", "AIDexterDomain_ScopeStrategy"
) values (
  'lifecycle_note_targets', 'Note tag targets',
  'Active people and departments in this physical tenant. Use exact returned targetType and recordId values only when adding an operational note; the note write still checks that each recipient can read the selected record.',
  'multideck_dexter_domain_lifecycle_note_targets', 47, true, now(), '[]'::jsonb,
  '["workspace_users","departments"]'::jsonb, 'company'
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now(),
  "AIDexterDomain_RequiredPermissionsJSON" = excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON" = excluded."AIDexterDomain_DataCategoriesJSON",
  "AIDexterDomain_ScopeStrategy" = excluded."AIDexterDomain_ScopeStrategy";

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name", "AIDexterAction_Description",
  "AIDexterAction_Function", "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt", "AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily", "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'add_lifecycle_note', 'lifecycle_notes', 'Add operational note',
  'Add one immutable note to an exact quote, booking or Customs declaration through the same tenant and product permission boundary. Optional person and department tags must use exact IDs returned by lifecycle_note_targets.',
  'multideck_dexter_action_add_lifecycle_note',
  '{"type":"object","properties":{"target_id":{"type":"string"},"subject_type":{"type":"string","enum":["quote","booking","customs"]},"body":{"type":"string"},"mentions":{"type":"array","maxItems":20,"items":{"type":"object","properties":{"type":{"type":"string","enum":["user","department"]},"id":{"type":"string"}},"required":["type","id"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","subject_type","body","mentions","reason"],"additionalProperties":false}'::jsonb,
  124, true, now(), '[]'::jsonb, 'add_lifecycle_note', 'record', false
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now(),
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description", "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder", "AIDexterWatchCapability_IsActive",
  "AIDexterWatchCapability_UpdatedAt", "AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy"
) values (
  'lifecycle_notes', 'Operational notes',
  'New notes and exact person or department tags on one selected quote, booking or Customs declaration.',
  '["subjectType","reference","body","author","mentionedUsers","mentionedDepartments","createdAt"]'::jsonb,
  46, true, now(), '[]'::jsonb, 'record'
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_UpdatedAt" = now(),
  "AIDexterWatchCapability_RequiredPermissionsJSON" = excluded."AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy" = excluded."AIDexterWatchCapability_ScopeStrategy";

create or replace function public.multideck_lifecycle_note_target_authorised(
  p_auth_user_id uuid,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, booking_api, quote_api
as $$
  select p_auth_user_id is not null and p_target_id is not null and (
    (
      quote_api.has_permission(p_auth_user_id, 'Quotes.Read')
      and exists (
        select 1
        from public."CusQuote_Header" quote
        join public."cmp_Offices" office
          on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
        join public."cmp_Users" actor
          on actor."Auth_User_ID" = p_auth_user_id
         and actor."Company_ID" = office."Company_ID"
         and actor."User_AccessStatus" = 'active'
        where quote."CusQuoteHeader_ID" = p_target_id and not quote."CusQuoteHeader_IsDeleted"
      )
    ) or (
      booking_api.has_permission(p_auth_user_id, 'Bookings.Read')
      and exists (
        select 1
        from public."Job_Header" job
        join public."cmp_Offices" office
          on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
        join public."cmp_Users" actor
          on actor."Auth_User_ID" = p_auth_user_id
         and actor."Company_ID" = office."Company_ID"
         and actor."User_AccessStatus" = 'active'
        where job."Job_ID" = p_target_id and not job."Job_IsDeleted"
      )
    ) or booking_api.customs_access(p_auth_user_id, p_target_id, false)
  );
$$;

revoke all on function public.multideck_lifecycle_note_target_authorised(uuid,uuid) from public, anon, authenticated;

-- Preserve the current security-hardened creator and add one exact-record
-- authorisation check for lifecycle-note watches.
create or replace function public.multideck_dexter_create_watch(
  p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,auth,booking_api as $$
declare v_context record; v_watch public."AI_DexterWatches"; v_capability text:=lower(btrim(p_capability)); v_fields jsonb; v_required jsonb; v_field text;
begin
  select * into v_context from public._multideck_dexter_context();
  select c."AIDexterWatchCapability_FieldsJSON",c."AIDexterWatchCapability_RequiredPermissionsJSON" into v_fields,v_required
  from public."sys_AIDexterWatchCapabilities" c where c."AIDexterWatchCapability_Code"=v_capability and c."AIDexterWatchCapability_IsActive";
  if v_fields is null then raise exception 'That source cannot be watched yet.' using errcode='22023'; end if;
  if not public._multideck_dexter_has_permissions(v_context.user_id,v_required) then raise exception 'You do not have permission to watch that source.' using errcode='42501'; end if;
  if v_capability='deals' and p_target_id is not null
     and not public._multideck_crm_deal_is_operator_visible(p_target_id,v_context.company_id) then
    raise exception 'Choose a deal that is available in this workspace.' using errcode='42501';
  end if;
  if v_capability='todo' and (
    p_target_id is null or not exists(
      select 1 from public."OPS_UserTasks" task
      where task."TodoTask_ID"=p_target_id
        and task."TodoTask_CompanyID"=v_context.company_id
        and task."TodoTask_OwnerUserID"=v_context.user_id
        and not task."TodoTask_IsDeleted"
    )
  ) then
    raise exception 'Choose one of your To Do tasks before creating this watch.' using errcode='42501';
  end if;
  if v_capability='customs_declarations' and (p_target_id is null or not booking_api.customs_access(auth.uid(),p_target_id,false)) then
    raise exception 'Choose an exact Customs declaration you are authorised to read before creating this watch.' using errcode='42501';
  end if;
  if v_capability='lifecycle_notes' and (
    p_target_id is null or not public.multideck_lifecycle_note_target_authorised(auth.uid(), p_target_id)
  ) then
    raise exception 'Choose an exact quote, booking or Customs declaration you can read before watching its notes.' using errcode='42501';
  end if;
  if jsonb_typeof(p_rule)<>'object' then raise exception 'The watch rule is invalid.' using errcode='22023'; end if;
  v_field:=p_rule->>'field';
  if v_field is null or not v_fields?v_field then raise exception 'That field cannot be watched.' using errcode='22023'; end if;
  if coalesce(p_rule->>'operator','') not in ('changed','eq','neq','contains','contains_all','gt','gte','lt','lte') then raise exception 'That watch condition is not supported.' using errcode='22023'; end if;
  if p_action is not null and not exists(
    select 1 from public."sys_AIDexterActions" a where a."AIDexterAction_Code"=p_action->>'action'
      and a."AIDexterAction_DomainCode"=v_capability and a."AIDexterAction_IsActive"
      and public._multideck_dexter_has_permissions(v_context.user_id,a."AIDexterAction_RequiredPermissionsJSON")
  ) then raise exception 'That prepared action is not available for this watch.' using errcode='42501'; end if;
  insert into public."AI_DexterWatches"(
    "AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title",
    "AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_TargetLabel","AIDexterWatch_RuleJSON","AIDexterWatch_ActionJSON"
  ) values(v_context.company_id,v_context.user_id,v_capability,left(btrim(p_title),180),left(btrim(p_summary),2000),left(btrim(p_request),4000),
    p_target_id,nullif(left(btrim(p_target_label),240),''),p_rule,p_action) returning * into v_watch;
  return jsonb_build_object('id',v_watch."AIDexterWatch_ID",'title',v_watch."AIDexterWatch_Title",'summary',v_watch."AIDexterWatch_Summary",
    'capability',v_watch."AIDexterWatch_CapabilityCode",'status',v_watch."AIDexterWatch_StatusCode",'targetLabel',v_watch."AIDexterWatch_TargetLabel",
    'rule',v_watch."AIDexterWatch_RuleJSON",'action',v_watch."AIDexterWatch_ActionJSON",'createdAt',v_watch."AIDexterWatch_CreatedAt",
    'updatedAt',v_watch."AIDexterWatch_UpdatedAt",'triggerCount',v_watch."AIDexterWatch_TriggerCount");
end $$;

revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) to authenticated,service_role;

commit;
