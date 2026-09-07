-- Company conversations reuse lifecycle note permissions, authorship, mentions and watch signals.
begin;
alter table public."OPS_LifecycleNotes" drop constraint "OPS_LifecycleNotes_LifecycleNote_SubjectType_check";
alter table public."OPS_LifecycleNotes" add constraint "OPS_LifecycleNotes_LifecycleNote_SubjectType_check"
  check ("LifecycleNote_SubjectType" in ('quote','booking','customs','company'));
alter table public."OPS_LifecycleNotes" drop constraint "CK_OPS_LifecycleNotes_subject";
alter table public."OPS_LifecycleNotes" add constraint "CK_OPS_LifecycleNotes_subject" check (
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
      and "LifecycleNote_SubjectID" = "LifecycleNote_CustomsID")    or ("LifecycleNote_SubjectType" = 'company'
      and "LifecycleNote_QuoteID" is null and "LifecycleNote_JobID" is null and "LifecycleNote_CustomsID" is null)
  );
create index "IX_OPS_LifecycleNotes_company_subject_created" on public."OPS_LifecycleNotes"
 ("LifecycleNote_CompanyID", "LifecycleNote_SubjectID", "LifecycleNote_CreatedAt" desc)
 where "LifecycleNote_SubjectType" = 'company';
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

  if p_subject_id is null or v_subject_type not in ('quote', 'booking', 'customs', 'company') then
    raise exception 'Choose a company, quote, booking or Customs declaration for this note.' using errcode = '22023';
  end if;

  if v_subject_type = 'company' then
    if not quote_api.has_permission(p_auth_user_id, case when p_write then 'Customers.Write' else 'Customers.Read' end) then
      raise exception 'You do not have permission to access company notes.' using errcode = '42501';
    end if;
    perform public._multideck_crm_require_account_access(v_actor."User_ID", p_subject_id);
    select v_actor."Company_ID", org."Org_Name" into v_company_id, v_reference
    from public."Org_Master" org where org."Org_id" = p_subject_id;
  elsif v_subject_type = 'quote' then
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
    when 'company' then
      quote_api.has_permission(p_auth_user_id, 'Customers.Read') and exists (
        select 1 from public."cmp_Users" actor
        where actor."Auth_User_ID" = p_auth_user_id and actor."User_AccessStatus" = 'active'
          and public.multideck_crm_company_can_access_account(actor."Company_ID", p_subject_id)
      )
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

create or replace function public._multideck_lifecycle_notes_base(
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
    when 'company' then quote_api.has_permission(auth.uid(), 'Customers.Write')
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
        (lower(btrim(p_subject_type)) = 'company' and note."LifecycleNote_SubjectType" = 'company' and note."LifecycleNote_SubjectID" = p_subject_id)
        or (lower(btrim(p_subject_type)) = 'quote'
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

  if v_note."LifecycleNote_SubjectType" = 'company' then
    v_target_table := 'Org_Master';
    v_action_url := '/crm/accounts/' || p_subject_id;
  elsif v_note."LifecycleNote_SubjectType" = 'quote' then
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
    ) or public.multideck_lifecycle_note_recipient_authorised(p_auth_user_id, 'company', p_target_id) or booking_api.customs_access(p_auth_user_id, p_target_id, false)
  );
$$;

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
        'recordId', case when note."LifecycleNote_SubjectType" = 'company' then note."LifecycleNote_SubjectID"
          when note."LifecycleNote_SubjectType" = 'quote' and quote_api.has_permission(auth.uid(), 'Quotes.Read')
            then note."LifecycleNote_SubjectID"
          when job."Job_ID" is not null and booking_api.has_permission(auth.uid(), 'Bookings.Read')
            then job."Job_ID"
          else customs_context.primary_id
        end,
        'noteId', note."LifecycleNote_ID",
        'subjectType', case when note."LifecycleNote_SubjectType" = 'company' then 'company'
          when note."LifecycleNote_SubjectType" = 'quote' and quote_api.has_permission(auth.uid(), 'Quotes.Read') then 'quote'
          when job."Job_ID" is not null and booking_api.has_permission(auth.uid(), 'Bookings.Read') then 'booking'
          else 'customs'
        end,
        'originSubjectType', note."LifecycleNote_SubjectType",
        'reference', case when note."LifecycleNote_SubjectType" = 'company' then account."Org_Name"
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
    left join public."Org_Master" account on note."LifecycleNote_SubjectType" = 'company' and account."Org_id" = note."LifecycleNote_SubjectID"
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
        (note."LifecycleNote_SubjectType" = 'company' and public.multideck_lifecycle_note_recipient_authorised(auth.uid(), 'company', note."LifecycleNote_SubjectID"))
        or (note."LifecycleNote_SubjectType" = 'quote' and (
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
        or concat_ws(' ', account."Org_Name", note."LifecycleNote_Body", note."LifecycleNote_AuthorNameSnapshot", mentions.search_text,
          quote."CusQuoteHeader_Number", job."Job_BookingReference", customs_context.search_text)
          ilike '%' || btrim(p_search) || '%'
      )
    order by note."LifecycleNote_CreatedAt" desc, note."LifecycleNote_ID" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  )
  select coalesce(jsonb_agg(value order by created_at desc), '[]'::jsonb) from rows;
$$;
update public."sys_AIDexterActions" set
 "AIDexterAction_ParametersJSON" = jsonb_set("AIDexterAction_ParametersJSON", '{properties,subject_type,enum}', '["quote","booking","customs","company"]'),
 "AIDexterAction_Description" = 'Add a note to an exact company, quote, booking or Customs declaration. Reuses record permissions, author attribution and audited approval. Tags notify authorised recipients.',
 "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'add_lifecycle_note';
update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description" = 'Permission-scoped company, quote, booking and Customs notes. Includes exact note and record IDs, authors, timestamps and evidence. Company notes remain on the company record.', "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code" = 'lifecycle_notes';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description" = 'Watch changes to notes on an exact company, quote, booking or Customs record. Record access is checked and changes use deterministic lifecycle-note signals.'
where "AIDexterWatchCapability_Code" = 'lifecycle_notes';
-- Preserve existing company notes as attributed legacy entries without sending notifications.
insert into public."OPS_LifecycleNotes" (
 "LifecycleNote_CompanyID", "LifecycleNote_SubjectType", "LifecycleNote_SubjectID",
 "LifecycleNote_Body", "LifecycleNote_AuthorNameSnapshot", "LifecycleNote_CreatedAt"
)
select profile."CRMAccount_CompanyID", 'company', preference."CRMCustEngPref_CustomerOrgID",
 preference."CRMCustEngPref_Notes", 'Existing company note', coalesce(preference."CRMCustEngPref_UpdatedAt", preference."CRMCustEngPref_CreatedAt")
from public."CRM_CustomerEngagementPreferences" preference
join public."CRM_AccountProfiles" profile on profile."CRMAccount_OrgID"=preference."CRMCustEngPref_CustomerOrgID"
where not profile."CRMAccount_IsDeleted" and nullif(btrim(preference."CRMCustEngPref_Notes"),'') is not null
  and char_length(preference."CRMCustEngPref_Notes") <= 4000;
commit;
