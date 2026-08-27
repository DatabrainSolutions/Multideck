-- Author-owned lifecycle note edits and soft deletion. The original note row,
-- author and lifecycle provenance stay in place so operational chronology and
-- audit evidence are never silently rewritten.

begin;

alter table public."OPS_LifecycleNotes"
  add column if not exists "LifecycleNote_UpdatedAt" timestamptz,
  add column if not exists "LifecycleNote_DeletedAt" timestamptz,
  add column if not exists "LifecycleNote_DeletedByUserID" uuid references public."cmp_Users"("User_ID") on delete set null;

select public."Audit_EnableTableAudit"(
  p_table_schema => 'public',
  p_table_name => 'OPS_LifecycleNotes',
  p_record_type_code => null,
  p_mode_code => 'all_changes',
  p_retention_class_code => 'standard_7y',
  p_sensitivity_code => 'confidential',
  p_track_row_snapshots => false,
  p_key_columns => array['LifecycleNote_ID'],
  p_include_columns => array[
    'LifecycleNote_ID', 'LifecycleNote_Body', 'LifecycleNote_UpdatedAt',
    'LifecycleNote_DeletedAt', 'LifecycleNote_DeletedByUserID'
  ],
  p_ignore_columns => array[]::text[],
  p_redact_columns => array['LifecycleNote_Body']
);

-- Keep the proven lifecycle visibility query intact and enrich only its JSON
-- response with mutation state. The renamed base is private to this wrapper.
alter function public.multideck_lifecycle_notes(text,uuid,integer,timestamptz)
  rename to _multideck_lifecycle_notes_base;
revoke all on function public._multideck_lifecycle_notes_base(text,uuid,integer,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.multideck_lifecycle_notes(
  p_subject_type text,
  p_subject_id uuid,
  p_limit integer default 30,
  p_before timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with base as (
    select public._multideck_lifecycle_notes_base(p_subject_type, p_subject_id, p_limit, p_before) as value
  ), enriched as (
    select coalesce(jsonb_agg(
      case when note."LifecycleNote_DeletedAt" is not null then
        (item.value - 'body') || jsonb_build_object(
          'body', '',
          'updatedAt', note."LifecycleNote_UpdatedAt",
          'deletedAt', note."LifecycleNote_DeletedAt"
        )
      else item.value || jsonb_build_object(
        'updatedAt', note."LifecycleNote_UpdatedAt",
        'deletedAt', null
      ) end
      order by item.ordinality
    ), '[]'::jsonb) as notes
    from base
    cross join lateral jsonb_array_elements(coalesce(base.value->'notes', '[]'::jsonb))
      with ordinality as item(value, ordinality)
    join public."OPS_LifecycleNotes" note
      on note."LifecycleNote_ID" = (item.value->>'id')::uuid
  )
  select jsonb_set(base.value, '{notes}', enriched.notes, true)
  from base cross join enriched;
$$;

revoke all on function public.multideck_lifecycle_notes(text,uuid,integer,timestamptz) from public, anon;
grant execute on function public.multideck_lifecycle_notes(text,uuid,integer,timestamptz) to authenticated, service_role;

create or replace function public._multideck_lifecycle_note_json(p_note_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', note."LifecycleNote_ID",
    'subjectType', note."LifecycleNote_SubjectType",
    'subjectId', note."LifecycleNote_SubjectID",
    'body', case when note."LifecycleNote_DeletedAt" is null then note."LifecycleNote_Body" else '' end,
    'author', jsonb_build_object(
      'id', note."LifecycleNote_AuthorUserID",
      'name', note."LifecycleNote_AuthorNameSnapshot"
    ),
    'mentions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', mention."LifecycleNoteMention_TargetType",
        'id', mention."LifecycleNoteMention_TargetID",
        'label', mention."LifecycleNoteMention_LabelSnapshot"
      ) order by mention."LifecycleNoteMention_CreatedAt", mention."LifecycleNoteMention_ID")
      from public."OPS_LifecycleNoteMentions" mention
      where mention."LifecycleNoteMention_NoteID" = note."LifecycleNote_ID"
    ), '[]'::jsonb),
    'createdAt', note."LifecycleNote_CreatedAt",
    'updatedAt', note."LifecycleNote_UpdatedAt",
    'deletedAt', note."LifecycleNote_DeletedAt"
  )
  from public."OPS_LifecycleNotes" note
  where note."LifecycleNote_ID" = p_note_id;
$$;

revoke all on function public._multideck_lifecycle_note_json(uuid) from public, anon, authenticated, service_role;

create or replace function public._multideck_mutate_lifecycle_note(
  p_auth_user_id uuid,
  p_note_id uuid,
  p_body text,
  p_delete boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, booking_api, quote_api
as $$
declare
  v_note public."OPS_LifecycleNotes";
  v_context record;
  v_body text := btrim(coalesce(p_body, ''));
  v_old_body text;
  v_mentions jsonb;
  v_event_kind text := case when p_delete then 'deleted' else 'edited' end;
begin
  select * into v_note
  from public."OPS_LifecycleNotes" note
  where note."LifecycleNote_ID" = p_note_id
  for update;

  if not found then
    raise exception 'That note is no longer available.' using errcode = 'P0002';
  end if;

  select * into strict v_context
  from public._multideck_lifecycle_note_context(
    p_auth_user_id,
    v_note."LifecycleNote_SubjectType",
    v_note."LifecycleNote_SubjectID",
    true
  );

  if v_note."LifecycleNote_CompanyID" <> v_context.company_id
     or v_note."LifecycleNote_AuthorUserID" is distinct from v_context.actor_user_id then
    raise exception 'You can only change a note you added.' using errcode = '42501';
  end if;
  if v_note."LifecycleNote_DeletedAt" is not null then
    raise exception 'That note has already been deleted.' using errcode = '22023';
  end if;
  if not p_delete and v_body = '' then
    raise exception 'Write a note before saving it.' using errcode = '22023';
  end if;
  if not p_delete and char_length(v_body) > 4000 then
    raise exception 'Keep the note to 4,000 characters or fewer.' using errcode = '22023';
  end if;

  v_old_body := v_note."LifecycleNote_Body";
  perform set_config('app.user_id', v_context.actor_user_id::text, true);
  perform set_config('app.auth_user_id', p_auth_user_id::text, true);
  perform set_config('app.actor_type', 'user', true);
  perform set_config('app.source_app', 'Multideck App', true);
  perform set_config('app.source_module', 'lifecycle_notes', true);

  if p_delete then
    update public."OPS_LifecycleNotes"
    set "LifecycleNote_DeletedAt" = now(),
        "LifecycleNote_DeletedByUserID" = v_context.actor_user_id
    where "LifecycleNote_ID" = p_note_id
    returning * into v_note;
  else
    update public."OPS_LifecycleNotes"
    set "LifecycleNote_Body" = v_body,
        "LifecycleNote_UpdatedAt" = now()
    where "LifecycleNote_ID" = p_note_id
    returning * into v_note;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'type', mention."LifecycleNoteMention_TargetType",
    'id', mention."LifecycleNoteMention_TargetID",
    'label', mention."LifecycleNoteMention_LabelSnapshot"
  )), '[]'::jsonb)
  into v_mentions
  from public."OPS_LifecycleNoteMentions" mention
  where mention."LifecycleNoteMention_NoteID" = p_note_id;

  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  )
  select distinct
    v_context.company_id,
    'lifecycle_notes',
    'OPS_LifecycleNotes',
    watch."AIDexterWatch_TargetID",
    jsonb_build_object(
      'eventKind', 'existing',
      'subjectType', v_note."LifecycleNote_SubjectType",
      'body', v_old_body,
      'author', v_note."LifecycleNote_AuthorNameSnapshot",
      'updatedAt', coalesce(v_note."LifecycleNote_UpdatedAt", v_note."LifecycleNote_CreatedAt")
    ),
    jsonb_build_object(
      'eventKind', v_event_kind,
      'subjectType', v_note."LifecycleNote_SubjectType",
      'reference', coalesce(
        (select 'Q-' || quote."CusQuoteHeader_Number" from public."CusQuote_Header" quote where quote."CusQuoteHeader_ID" = watch."AIDexterWatch_TargetID"),
        (select coalesce(nullif(btrim(job."Job_BookingReference"), ''), 'MD-' || job."Job_Number") from public."Job_Header" job where job."Job_ID" = watch."AIDexterWatch_TargetID"),
        (select coalesce(nullif(btrim(declaration."CUST_LocalReferenceNumber"), ''), declaration."CUST_id"::text) from public."Customs_Declarations" declaration where declaration."CUST_id" = watch."AIDexterWatch_TargetID"),
        v_context.reference
      ),
      'body', case when p_delete then null else v_note."LifecycleNote_Body" end,
      'author', v_note."LifecycleNote_AuthorNameSnapshot",
      'mentionedUsers', coalesce((select jsonb_agg(value->>'label') from jsonb_array_elements(v_mentions) value where value->>'type' = 'user'), '[]'::jsonb),
      'mentionedDepartments', coalesce((select jsonb_agg(value->>'label') from jsonb_array_elements(v_mentions) value where value->>'type' = 'department'), '[]'::jsonb),
      'createdAt', v_note."LifecycleNote_CreatedAt",
      'updatedAt', coalesce(v_note."LifecycleNote_DeletedAt", v_note."LifecycleNote_UpdatedAt")
    )
  from public."AI_DexterWatches" watch
  where watch."AIDexterWatch_CompanyID" = v_context.company_id
    and watch."AIDexterWatch_CapabilityCode" = 'lifecycle_notes'
    and watch."AIDexterWatch_StatusCode" = 'active'
    and (
      watch."AIDexterWatch_TargetID" = v_note."LifecycleNote_SubjectID"
      or (
        v_note."LifecycleNote_SubjectType" = 'quote'
        and exists (
          select 1 from public."Job_Header" job
          where job."Job_SourceQuoteID" = v_note."LifecycleNote_QuoteID"
            and not job."Job_IsDeleted"
            and (
              watch."AIDexterWatch_TargetID" = job."Job_ID"
              or exists (
                select 1 from public."Customs_Declarations" declaration
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
          select 1 from public."Customs_Declarations" declaration
          where declaration."CUST_JobID" = v_note."LifecycleNote_JobID"
            and declaration."CUST_id" = watch."AIDexterWatch_TargetID"
            and not declaration."CUST_IsDeleted"
        )
      )
    );

  return public._multideck_lifecycle_note_json(p_note_id);
exception
  when no_data_found then
    raise exception 'Your signed-in account is not linked to an active Multideck user.' using errcode = '42501';
end;
$$;

revoke all on function public._multideck_mutate_lifecycle_note(uuid,uuid,text,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.multideck_update_lifecycle_note(p_note_id uuid, p_body text)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
  select public._multideck_mutate_lifecycle_note(auth.uid(), p_note_id, p_body, false);
$$;

create or replace function public.multideck_delete_lifecycle_note(p_note_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
  select public._multideck_mutate_lifecycle_note(auth.uid(), p_note_id, null, true);
$$;

revoke all on function public.multideck_update_lifecycle_note(uuid,text) from public, anon;
revoke all on function public.multideck_delete_lifecycle_note(uuid) from public, anon;
grant execute on function public.multideck_update_lifecycle_note(uuid,text) to authenticated, service_role;
grant execute on function public.multideck_delete_lifecycle_note(uuid) to authenticated, service_role;

-- Dexter keeps its existing permission-filtered domain, but deleted bodies are
-- removed and mutation state is explicit rather than inferred.
create or replace function public.multideck_dexter_domain_lifecycle_notes_v2(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(
    case when note."LifecycleNote_DeletedAt" is not null then
      (item.value - 'body') || jsonb_build_object(
        'deleted', true,
        'updatedAt', note."LifecycleNote_UpdatedAt",
        'deletedAt', note."LifecycleNote_DeletedAt"
      )
    else item.value || jsonb_build_object(
      'deleted', false,
      'updatedAt', note."LifecycleNote_UpdatedAt",
      'deletedAt', null
    ) end
    order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(public.multideck_dexter_domain_lifecycle_notes(p_company_id, p_search, p_take))
    with ordinality as item(value, ordinality)
  join public."OPS_LifecycleNotes" note
    on note."LifecycleNote_ID" = (item.value->>'noteId')::uuid;
$$;

revoke all on function public.multideck_dexter_domain_lifecycle_notes_v2(uuid,text,integer)
  from public, anon, authenticated;

create or replace function public.multideck_dexter_action_edit_lifecycle_note(
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
declare v_auth_user_id uuid;
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
  return public._multideck_mutate_lifecycle_note(
    v_auth_user_id,
    nullif(p_arguments->>'note_id', '')::uuid,
    p_arguments->>'body',
    false
  );
end;
$$;

create or replace function public.multideck_dexter_action_delete_lifecycle_note(
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
declare v_auth_user_id uuid;
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
  return public._multideck_mutate_lifecycle_note(
    v_auth_user_id,
    nullif(p_arguments->>'note_id', '')::uuid,
    null,
    true
  );
end;
$$;

revoke all on function public.multideck_dexter_action_edit_lifecycle_note(uuid,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_delete_lifecycle_note(uuid,uuid,jsonb)
  from public, anon, authenticated;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_QueryFunction" = 'multideck_dexter_domain_lifecycle_notes_v2',
    "AIDexterDomain_Description" = 'Tenant-safe operational notes on exact quotes, bookings and Customs declarations. Notes retain lifecycle provenance; author edits are marked and deletions remain as tombstones.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'lifecycle_notes';

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name", "AIDexterAction_Description",
  "AIDexterAction_Function", "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt", "AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily", "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values
  (
    'edit_lifecycle_note', 'lifecycle_notes', 'Edit own operational note',
    'Edit the body of one exact non-deleted lifecycle note authored by the signed-in operator after approval.',
    'multideck_dexter_action_edit_lifecycle_note',
    '{"type":"object","properties":{"note_id":{"type":"string"},"body":{"type":"string"},"reason":{"type":"string"}},"required":["note_id","body","reason"],"additionalProperties":false}'::jsonb,
    125, true, now(), '[]'::jsonb, 'edit_lifecycle_note', 'record', false
  ),
  (
    'delete_lifecycle_note', 'lifecycle_notes', 'Delete own operational note',
    'Soft-delete one exact non-deleted lifecycle note authored by the signed-in operator. Always preserve its timeline tombstone and require approval.',
    'multideck_dexter_action_delete_lifecycle_note',
    '{"type":"object","properties":{"note_id":{"type":"string"},"reason":{"type":"string"}},"required":["note_id","reason"],"additionalProperties":false}'::jsonb,
    126, true, now(), '[]'::jsonb, 'delete_lifecycle_note', 'record', true
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

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'New, edited and deleted notes on one selected quote, booking or Customs declaration.',
    "AIDexterWatchCapability_FieldsJSON" = '["eventKind","subjectType","reference","body","author","mentionedUsers","mentionedDepartments","createdAt","updatedAt"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'lifecycle_notes';

-- Note tags already create one permission-safe Comm_Notifications row per
-- recipient. The tenant notification trigger routes that row through the
-- shared Multideck email renderer and Resend delivery function; an explicit
-- default-on preference makes that branded email behaviour visible and
-- user-controllable without weakening the in-app notification.
insert into public."Comm_UserNotificationPreferences" (
  "CommNotifPref_UserID", "CommNotifPref_ChannelCode", "CommNotifPref_EventType",
  "CommNotifPref_IsEnabled", "CommNotifPref_DeliveryChannelsJSON", "CommNotifPref_QuietHoursJSON"
)
select workspace_user."User_ID", 'email', 'lifecycle_note_mention', true,
  jsonb_build_object('email', true, 'in_app', true), '{}'::jsonb
from public."cmp_Users" workspace_user
where workspace_user."User_AccessStatus" = 'active'
on conflict ("CommNotifPref_UserID", "CommNotifPref_ChannelCode", "CommNotifPref_EventType") do nothing;

commit;
