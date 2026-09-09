-- Proactive, review-first updates from inbox documents.
--
-- Provider sync only enqueues deterministic candidates. A leased Edge worker
-- performs OCR/extraction once, and ordinary watch evaluation remains entirely
-- event driven. Applying a suggestion is a compare-and-set transaction against
-- the canonical booking tables; stale values fail closed instead of overwriting
-- more recent operator work.

begin;

insert into public."sys_CommLinkTypes" (
  "CommLinkType_Code", "CommLinkType_Name", "CommLinkType_Description",
  "CommLinkType_SortOrder", "CommLinkType_IsActive"
) values (
  'inbox_suggestion', 'Suggested update',
  'Linked to a reviewed update suggested from an inbox document.', 145, true
)
on conflict ("CommLinkType_Code") do update set
  "CommLinkType_Name" = excluded."CommLinkType_Name",
  "CommLinkType_Description" = excluded."CommLinkType_Description",
  "CommLinkType_IsActive" = true;

create table if not exists public."AI_InboxSuggestionSettings" (
  "AIInboxSetting_MailboxID" uuid primary key references public."Comm_Mailboxes"("CommMailbox_ID") on delete cascade,
  "AIInboxSetting_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIInboxSetting_EnabledByUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIInboxSetting_IsEnabled" boolean not null default false,
  "AIInboxSetting_EnabledAt" timestamptz,
  "AIInboxSetting_AllowedDocumentTypesJSON" jsonb not null default '["booking_confirmation","commercial_invoice"]'::jsonb,
  "AIInboxSetting_MinimumMatchConfidence" numeric(5,4) not null default 0.8000,
  "AIInboxSetting_CreatedAt" timestamptz not null default now(),
  "AIInboxSetting_UpdatedAt" timestamptz not null default now(),
  constraint "CK_AI_InboxSuggestionSettings_document_types" check (jsonb_typeof("AIInboxSetting_AllowedDocumentTypesJSON") = 'array'),
  constraint "CK_AI_InboxSuggestionSettings_confidence" check ("AIInboxSetting_MinimumMatchConfidence" between 0 and 1)
);

create table if not exists public."AI_InboxProcessingJobs" (
  "AIInboxJob_ID" uuid primary key default gen_random_uuid(),
  "AIInboxJob_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIInboxJob_OwnerUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIInboxJob_MailboxID" uuid not null references public."Comm_Mailboxes"("CommMailbox_ID") on delete cascade,
  "AIInboxJob_MessageID" uuid not null references public."Comm_Messages"("CommMessage_ID") on delete cascade,
  "AIInboxJob_AttachmentID" uuid not null references public."Comm_MessageAttachments"("CommAttachment_ID") on delete cascade,
  "AIInboxJob_StatusCode" varchar(24) not null default 'queued',
  "AIInboxJob_ClassifierVersion" varchar(40) not null,
  "AIInboxJob_ExtractorVersion" varchar(40) not null,
  "AIInboxJob_AttemptCount" integer not null default 0,
  "AIInboxJob_AvailableAt" timestamptz not null default now(),
  "AIInboxJob_LeaseToken" uuid,
  "AIInboxJob_LeaseExpiresAt" timestamptz,
  "AIInboxJob_DocumentTypeCode" varchar(40),
  "AIInboxJob_ClassificationMethod" varchar(40),
  "AIInboxJob_ClassificationConfidence" numeric(5,4),
  "AIInboxJob_FailureCode" varchar(120),
  "AIInboxJob_FailureMessage" text,
  "AIInboxJob_CreatedAt" timestamptz not null default now(),
  "AIInboxJob_StartedAt" timestamptz,
  "AIInboxJob_CompletedAt" timestamptz,
  "AIInboxJob_UpdatedAt" timestamptz not null default now(),
  constraint "CK_AI_InboxProcessingJobs_status" check ("AIInboxJob_StatusCode" in ('queued','processing','completed','ignored','failed')),
  constraint "CK_AI_InboxProcessingJobs_attempt" check ("AIInboxJob_AttemptCount" between 0 and 8),
  constraint "CK_AI_InboxProcessingJobs_confidence" check ("AIInboxJob_ClassificationConfidence" is null or "AIInboxJob_ClassificationConfidence" between 0 and 1),
  unique ("AIInboxJob_AttachmentID", "AIInboxJob_ClassifierVersion", "AIInboxJob_ExtractorVersion")
);

create table if not exists public."AI_InboxSuggestedUpdates" (
  "AIInboxSuggestion_ID" uuid primary key default gen_random_uuid(),
  "AIInboxSuggestion_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIInboxSuggestion_OwnerUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIInboxSuggestion_MailboxID" uuid not null references public."Comm_Mailboxes"("CommMailbox_ID") on delete cascade,
  "AIInboxSuggestion_MessageID" uuid not null references public."Comm_Messages"("CommMessage_ID") on delete cascade,
  "AIInboxSuggestion_AttachmentID" uuid not null references public."Comm_MessageAttachments"("CommAttachment_ID") on delete cascade,
  "AIInboxSuggestion_JobID" uuid not null references public."AI_InboxProcessingJobs"("AIInboxJob_ID") on delete cascade,
  "AIInboxSuggestion_DocumentTypeCode" varchar(40) not null,
  "AIInboxSuggestion_TargetTypeCode" varchar(40),
  "AIInboxSuggestion_TargetID" uuid,
  "AIInboxSuggestion_TargetLabel" varchar(240),
  "AIInboxSuggestion_MatchMethodCode" varchar(60),
  "AIInboxSuggestion_MatchConfidence" numeric(5,4),
  "AIInboxSuggestion_StatusCode" varchar(24) not null default 'needs_match',
  "AIInboxSuggestion_SourceFileName" varchar(260) not null,
  "AIInboxSuggestion_Summary" text not null,
  "AIInboxSuggestion_ExtractedJSON" jsonb not null default '{}'::jsonb,
  "AIInboxSuggestion_EvidenceJSON" jsonb not null default '{}'::jsonb,
  "AIInboxSuggestion_ModelJSON" jsonb not null default '{}'::jsonb,
  "AIInboxSuggestion_StoredObjectID" uuid references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete set null,
  "AIInboxSuggestion_AppliedJobDocumentID" uuid references public."Job_Documents"("JobDoc_ID") on delete set null,
  "AIInboxSuggestion_CreatedAt" timestamptz not null default now(),
  "AIInboxSuggestion_UpdatedAt" timestamptz not null default now(),
  "AIInboxSuggestion_AppliedAt" timestamptz,
  "AIInboxSuggestion_AppliedByUserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  "AIInboxSuggestion_DismissedAt" timestamptz,
  "AIInboxSuggestion_DismissedByUserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CK_AI_InboxSuggestedUpdates_document_type" check ("AIInboxSuggestion_DocumentTypeCode" in ('booking_confirmation','commercial_invoice')),
  constraint "CK_AI_InboxSuggestedUpdates_target_type" check ("AIInboxSuggestion_TargetTypeCode" is null or "AIInboxSuggestion_TargetTypeCode" in ('booking','supplier_invoice')),
  constraint "CK_AI_InboxSuggestedUpdates_status" check ("AIInboxSuggestion_StatusCode" in ('needs_match','ready','no_changes','applying','applied','dismissed','failed','superseded')),
  constraint "CK_AI_InboxSuggestedUpdates_match_confidence" check ("AIInboxSuggestion_MatchConfidence" is null or "AIInboxSuggestion_MatchConfidence" between 0 and 1),
  unique ("AIInboxSuggestion_AttachmentID", "AIInboxSuggestion_DocumentTypeCode")
);

create table if not exists public."AI_InboxSuggestedUpdateFields" (
  "AIInboxField_ID" uuid primary key default gen_random_uuid(),
  "AIInboxField_SuggestionID" uuid not null references public."AI_InboxSuggestedUpdates"("AIInboxSuggestion_ID") on delete cascade,
  "AIInboxField_TargetRecordTypeCode" varchar(24) not null,
  "AIInboxField_TargetRecordID" uuid not null,
  "AIInboxField_FieldCode" varchar(80) not null,
  "AIInboxField_Label" varchar(160) not null,
  "AIInboxField_CurrentValueJSON" jsonb not null default 'null'::jsonb,
  "AIInboxField_ProposedValueJSON" jsonb not null default 'null'::jsonb,
  "AIInboxField_EvidenceJSON" jsonb not null default '{}'::jsonb,
  "AIInboxField_Confidence" numeric(5,4) not null,
  "AIInboxField_IsSelectedByDefault" boolean not null default true,
  "AIInboxField_SortOrder" integer not null default 100,
  "AIInboxField_AppliedAt" timestamptz,
  constraint "CK_AI_InboxSuggestedUpdateFields_target" check ("AIInboxField_TargetRecordTypeCode" in ('route','cargo','header')),
  constraint "CK_AI_InboxSuggestedUpdateFields_code" check ("AIInboxField_FieldCode" in ('planned_arrival_at','vessel','voyage_number','destination_terminal','gross_weight_kg')),
  constraint "CK_AI_InboxSuggestedUpdateFields_confidence" check ("AIInboxField_Confidence" between 0 and 1),
  unique ("AIInboxField_SuggestionID", "AIInboxField_FieldCode", "AIInboxField_TargetRecordID")
);

create table if not exists public."AI_InboxSuggestionAudit" (
  "AIInboxAudit_ID" uuid primary key default gen_random_uuid(),
  "AIInboxAudit_SuggestionID" uuid not null references public."AI_InboxSuggestedUpdates"("AIInboxSuggestion_ID") on delete cascade,
  "AIInboxAudit_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIInboxAudit_UserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  "AIInboxAudit_EventCode" varchar(60) not null,
  "AIInboxAudit_DetailsJSON" jsonb not null default '{}'::jsonb,
  "AIInboxAudit_CreatedAt" timestamptz not null default now()
);

create index if not exists "IX_AI_InboxProcessingJobs_claim"
  on public."AI_InboxProcessingJobs" ("AIInboxJob_StatusCode", "AIInboxJob_AvailableAt", "AIInboxJob_CreatedAt")
  where "AIInboxJob_StatusCode" in ('queued','processing');
create index if not exists "IX_AI_InboxSuggestedUpdates_owner_status"
  on public."AI_InboxSuggestedUpdates" ("AIInboxSuggestion_OwnerUserID", "AIInboxSuggestion_StatusCode", "AIInboxSuggestion_CreatedAt" desc);
create index if not exists "IX_AI_InboxSuggestedUpdates_target"
  on public."AI_InboxSuggestedUpdates" ("AIInboxSuggestion_TargetID", "AIInboxSuggestion_StatusCode");
create index if not exists "IX_AI_InboxSuggestedUpdateFields_suggestion"
  on public."AI_InboxSuggestedUpdateFields" ("AIInboxField_SuggestionID", "AIInboxField_SortOrder");
create index if not exists "IX_AI_InboxSuggestionAudit_suggestion"
  on public."AI_InboxSuggestionAudit" ("AIInboxAudit_SuggestionID", "AIInboxAudit_CreatedAt");

alter table public."AI_InboxSuggestionSettings" enable row level security;
alter table public."AI_InboxProcessingJobs" enable row level security;
alter table public."AI_InboxSuggestedUpdates" enable row level security;
alter table public."AI_InboxSuggestedUpdateFields" enable row level security;
alter table public."AI_InboxSuggestionAudit" enable row level security;

revoke all on table public."AI_InboxSuggestionSettings" from public, anon, authenticated;
revoke all on table public."AI_InboxProcessingJobs" from public, anon, authenticated;
revoke all on table public."AI_InboxSuggestedUpdates" from public, anon, authenticated;
revoke all on table public."AI_InboxSuggestedUpdateFields" from public, anon, authenticated;
revoke all on table public."AI_InboxSuggestionAudit" from public, anon, authenticated;
grant all on table public."AI_InboxSuggestionSettings", public."AI_InboxProcessingJobs",
  public."AI_InboxSuggestedUpdates", public."AI_InboxSuggestedUpdateFields",
  public."AI_InboxSuggestionAudit" to service_role;

create or replace function public.multideck_inbox_enqueue_suggestions(
  p_message_id uuid,
  p_actor_user_id uuid,
  p_classifier_version text default 'inbox-triage-v1',
  p_extractor_version text default 'inbox-extract-v1'
) returns integer
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare v_inserted integer := 0;
begin
  insert into public."AI_InboxProcessingJobs" (
    "AIInboxJob_CompanyID", "AIInboxJob_OwnerUserID", "AIInboxJob_MailboxID",
    "AIInboxJob_MessageID", "AIInboxJob_AttachmentID",
    "AIInboxJob_ClassifierVersion", "AIInboxJob_ExtractorVersion"
  )
  select
    setting."AIInboxSetting_CompanyID", setting."AIInboxSetting_EnabledByUserID",
    mailbox."CommMailbox_ID", message."CommMessage_ID", attachment."CommAttachment_ID",
    left(btrim(p_classifier_version), 40), left(btrim(p_extractor_version), 40)
  from public."Comm_Messages" message
  join public."Comm_Mailboxes" mailbox on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
  join public."AI_InboxSuggestionSettings" setting on setting."AIInboxSetting_MailboxID" = mailbox."CommMailbox_ID"
  join public."Comm_MessageAttachments" attachment on attachment."CommAttachment_MessageID" = message."CommMessage_ID"
  where message."CommMessage_ID" = p_message_id
    and setting."AIInboxSetting_IsEnabled"
    and coalesce(
      message."CommMessage_ReceivedAt",
      message."CommMessage_MessageDate",
      message."CommMessage_CreatedAt"
    ) >= setting."AIInboxSetting_EnabledAt"
    and exists (
      select 1 from public."cmp_Users" actor
      where actor."User_ID" = p_actor_user_id
        and actor."Company_ID" = setting."AIInboxSetting_CompanyID"
        and coalesce(actor."User_AccessStatus", 'active') = 'active'
    )
    and mailbox."CommMailbox_InboundEnabled" and not mailbox."CommMailbox_IsDeleted"
    and not message."CommMessage_IsDeleted" and not message."CommMessage_IsDraft" and not message."CommMessage_IsSpam"
    and not attachment."CommAttachment_IsInline"
    and lower(attachment."CommAttachment_FileName") ~ '\.(pdf|xlsx|xls|csv|docx|doc|odt|ods|png|jpe?g|webp)$'
    and not exists (
      select 1 from public."Comm_MessageFolders" membership
      join public."Comm_MailFolders" folder on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
      where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
        and folder."CommMailFolder_RoleCode" in ('drafts','spam','trash')
    )
    and exists (
      select 1 from public."Comm_MessageFolders" membership
      join public."Comm_MailFolders" folder on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
      where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
        and folder."CommMailFolder_RoleCode" = 'inbox'
    )
    and exists (
      select 1 from public."Comm_MessageRecipients" recipient
      where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
        and recipient."CommRecipient_RecipientTypeCode" in ('to','cc','bcc')
        and lower(recipient."CommRecipient_NormalizedAddress") = lower(mailbox."CommMailbox_NormalizedAddress")
    )
  on conflict ("AIInboxJob_AttachmentID", "AIInboxJob_ClassifierVersion", "AIInboxJob_ExtractorVersion") do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.multideck_inbox_claim_suggestion_jobs(
  p_lease_token uuid,
  p_limit integer default 2
) returns table (
  job_id uuid, company_id uuid, owner_user_id uuid, mailbox_id uuid,
  message_id uuid, attachment_id uuid, classifier_version text, extractor_version text
)
language sql volatile security definer
set search_path = pg_catalog, public
as $$
  with candidates as (
    select job."AIInboxJob_ID"
    from public."AI_InboxProcessingJobs" job
    where (
      job."AIInboxJob_StatusCode" = 'queued'
      or (job."AIInboxJob_StatusCode" = 'processing' and job."AIInboxJob_LeaseExpiresAt" < now())
    )
      and job."AIInboxJob_AvailableAt" <= now()
      and job."AIInboxJob_AttemptCount" < 5
    order by job."AIInboxJob_CreatedAt"
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 2), 5))
  ), claimed as (
    update public."AI_InboxProcessingJobs" job set
      "AIInboxJob_StatusCode" = 'processing',
      "AIInboxJob_LeaseToken" = p_lease_token,
      "AIInboxJob_LeaseExpiresAt" = now() + interval '4 minutes',
      "AIInboxJob_AttemptCount" = job."AIInboxJob_AttemptCount" + 1,
      "AIInboxJob_StartedAt" = coalesce(job."AIInboxJob_StartedAt", now()),
      "AIInboxJob_UpdatedAt" = now()
    from candidates
    where job."AIInboxJob_ID" = candidates."AIInboxJob_ID"
    returning job.*
  )
  select
    claimed."AIInboxJob_ID", claimed."AIInboxJob_CompanyID", claimed."AIInboxJob_OwnerUserID",
    claimed."AIInboxJob_MailboxID", claimed."AIInboxJob_MessageID", claimed."AIInboxJob_AttachmentID",
    claimed."AIInboxJob_ClassifierVersion"::text, claimed."AIInboxJob_ExtractorVersion"::text
  from claimed;
$$;

create or replace function public.multideck_inbox_apply_suggested_update(
  p_company_id uuid,
  p_user_id uuid,
  p_suggestion_id uuid,
  p_selected_field_ids uuid[]
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_suggestion public."AI_InboxSuggestedUpdates";
  v_job public."Job_Header";
  v_field public."AI_InboxSuggestedUpdateFields";
  v_current jsonb;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_document_id uuid;
  v_version integer;
  v_now timestamptz := now();
begin
  if p_company_id is null or p_user_id is null or p_suggestion_id is null then
    raise exception 'That suggested update is invalid.' using errcode = '22023';
  end if;
  if not public._multideck_dexter_has_permission(p_user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(p_user_id, 'Email.AIRead')
     or not public._multideck_dexter_has_permission(p_user_id, 'Bookings.Read')
     or not public._multideck_dexter_has_permission(p_user_id, 'Bookings.Write') then
    raise exception 'You do not have permission to apply this suggested update.' using errcode = '42501';
  end if;

  select suggestion.* into v_suggestion
  from public."AI_InboxSuggestedUpdates" suggestion
  where suggestion."AIInboxSuggestion_ID" = p_suggestion_id
    and suggestion."AIInboxSuggestion_CompanyID" = p_company_id
    and suggestion."AIInboxSuggestion_OwnerUserID" = p_user_id
  for update;
  if not found then raise exception 'That suggested update was not found.' using errcode = 'P0002'; end if;
  if v_suggestion."AIInboxSuggestion_StatusCode" = 'applied' then
    return jsonb_build_object('status','already_applied','suggestionId',p_suggestion_id,'bookingId',v_suggestion."AIInboxSuggestion_TargetID",'documentId',v_suggestion."AIInboxSuggestion_AppliedJobDocumentID");
  end if;
  if v_suggestion."AIInboxSuggestion_StatusCode" <> 'ready' or v_suggestion."AIInboxSuggestion_TargetTypeCode" <> 'booking' then
    raise exception 'This suggestion is not ready to apply.' using errcode = '55000';
  end if;
  if coalesce(cardinality(p_selected_field_ids), 0) = 0 then
    raise exception 'Choose at least one change to apply.' using errcode = '22023';
  end if;

  select job.* into v_job
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = v_suggestion."AIInboxSuggestion_TargetID"
    and office."Company_ID" = p_company_id and not job."Job_IsDeleted"
  for update;
  if not found then raise exception 'The matched booking is no longer available.' using errcode = 'P0002'; end if;

  update public."AI_InboxSuggestedUpdates" set
    "AIInboxSuggestion_StatusCode" = 'applying', "AIInboxSuggestion_UpdatedAt" = v_now
  where "AIInboxSuggestion_ID" = p_suggestion_id;

  for v_field in
    select field.* from public."AI_InboxSuggestedUpdateFields" field
    where field."AIInboxField_SuggestionID" = p_suggestion_id
      and field."AIInboxField_ID" = any(p_selected_field_ids)
    order by field."AIInboxField_SortOrder", field."AIInboxField_ID"
  loop
    if v_field."AIInboxField_TargetRecordTypeCode" = 'route' then
      select case v_field."AIInboxField_FieldCode"
        when 'planned_arrival_at' then coalesce(to_jsonb(route."JobRoute_PlannedArrivalAt"), 'null'::jsonb)
        when 'vessel' then coalesce(to_jsonb(route."JobRoute_Vessel"), 'null'::jsonb)
        when 'voyage_number' then coalesce(to_jsonb(route."JobRoute_VoyageNumber"), 'null'::jsonb)
        when 'destination_terminal' then coalesce(to_jsonb(route."JobRoute_DestinationTerminal"), 'null'::jsonb)
        else 'null'::jsonb end
      into v_current
      from public."Job_Routing" route
      where route."JobRoute_ID" = v_field."AIInboxField_TargetRecordID" and route."Job_ID" = v_job."Job_ID"
      for update;
      if not found or v_current is distinct from v_field."AIInboxField_CurrentValueJSON" then
        raise exception 'The booking changed after this suggestion was prepared. Review it again before applying.' using errcode = '40001';
      end if;
      update public."Job_Routing" route set
        "JobRoute_PlannedArrivalAt" = case when v_field."AIInboxField_FieldCode" = 'planned_arrival_at' then nullif(v_field."AIInboxField_ProposedValueJSON" #>> '{}','')::timestamptz else route."JobRoute_PlannedArrivalAt" end,
        "JobRoute_Vessel" = case when v_field."AIInboxField_FieldCode" = 'vessel' then nullif(v_field."AIInboxField_ProposedValueJSON" #>> '{}','') else route."JobRoute_Vessel" end,
        "JobRoute_VoyageNumber" = case when v_field."AIInboxField_FieldCode" = 'voyage_number' then nullif(v_field."AIInboxField_ProposedValueJSON" #>> '{}','') else route."JobRoute_VoyageNumber" end,
        "JobRoute_DestinationTerminal" = case when v_field."AIInboxField_FieldCode" = 'destination_terminal' then nullif(v_field."AIInboxField_ProposedValueJSON" #>> '{}','') else route."JobRoute_DestinationTerminal" end,
        "JobRoute_UpdatedAt" = v_now, "JobRoute_UpdatedBy" = p_user_id
      where route."JobRoute_ID" = v_field."AIInboxField_TargetRecordID";
    elsif v_field."AIInboxField_TargetRecordTypeCode" = 'cargo' and v_field."AIInboxField_FieldCode" = 'gross_weight_kg' then
      select coalesce(to_jsonb(cargo."JobCargo_GrossKilos"), 'null'::jsonb) into v_current
      from public."Job_Cargo" cargo
      where cargo."JobCargo_ID" = v_field."AIInboxField_TargetRecordID" and cargo."JobCargo_JobID" = v_job."Job_ID"
      for update;
      if not found or v_current is distinct from v_field."AIInboxField_CurrentValueJSON" then
        raise exception 'The booking changed after this suggestion was prepared. Review it again before applying.' using errcode = '40001';
      end if;
      update public."Job_Cargo" cargo set
        "JobCargo_GrossKilos" = nullif(v_field."AIInboxField_ProposedValueJSON" #>> '{}','')::numeric,
        "JobCargo_UpdatedAt" = v_now, "JobCargo_UpdatedBy" = p_user_id
      where cargo."JobCargo_ID" = v_field."AIInboxField_TargetRecordID";
    else
      raise exception 'That suggested field is not allowlisted.' using errcode = '22023';
    end if;
    update public."AI_InboxSuggestedUpdateFields" set "AIInboxField_AppliedAt" = v_now
    where "AIInboxField_ID" = v_field."AIInboxField_ID";
    v_applied_ids := array_append(v_applied_ids, v_field."AIInboxField_ID");
  end loop;

  if cardinality(v_applied_ids) <> cardinality(p_selected_field_ids) then
    raise exception 'One or more selected changes are no longer available.' using errcode = '22023';
  end if;

  if v_suggestion."AIInboxSuggestion_StoredObjectID" is not null then
    select coalesce(max(document."JobDoc_VersionNo"), 0) + 1 into v_version
    from public."Job_Documents" document
    where document."JobDoc_JobID" = v_job."Job_ID"
      and lower(document."JobDoc_DocTypeCodeSnapshot") = lower(v_suggestion."AIInboxSuggestion_DocumentTypeCode")
      and not document."JobDoc_IsDeleted";
    update public."Job_Documents" set "JobDoc_IsCurrentVersion" = false, "JobDoc_UpdatedAt" = v_now, "JobDoc_UpdatedBy" = p_user_id
    where "JobDoc_JobID" = v_job."Job_ID"
      and lower("JobDoc_DocTypeCodeSnapshot") = lower(v_suggestion."AIInboxSuggestion_DocumentTypeCode")
      and "JobDoc_IsCurrentVersion" and not "JobDoc_IsDeleted";
    insert into public."Job_Documents" (
      "JobDoc_JobID", "JobDoc_DocTypeCodeSnapshot", "JobDoc_Title", "JobDoc_Description",
      "JobDoc_Status", "JobDoc_Source", "JobDoc_FileName", "JobDoc_FileMimeType",
      "JobDoc_FileSizeBytes", "JobDoc_VersionNo", "JobDoc_IsCurrentVersion",
      "JobDoc_ReceivedAt", "JobDoc_MetadataJSON", "JobDoc_CreatedBy", "JobDoc_UpdatedBy",
      "JobDoc_StoredObjectID"
    ) select
      v_job."Job_ID", v_suggestion."AIInboxSuggestion_DocumentTypeCode",
      case when v_suggestion."AIInboxSuggestion_DocumentTypeCode" = 'booking_confirmation' then 'Booking confirmation' else 'Commercial invoice' end,
      'Received through Inbox and applied from Suggested updates.', 'received', 'inbox_suggestion',
      v_suggestion."AIInboxSuggestion_SourceFileName", stored."DOCStoredObject_MimeType",
      stored."DOCStoredObject_FileSizeBytes", v_version, true, v_now,
      jsonb_build_object('suggestionId', p_suggestion_id, 'messageId', v_suggestion."AIInboxSuggestion_MessageID", 'attachmentId', v_suggestion."AIInboxSuggestion_AttachmentID"),
      p_user_id, p_user_id, stored."DOCStoredObject_ID"
    from public."DOC_StoredObjects" stored
    where stored."DOCStoredObject_ID" = v_suggestion."AIInboxSuggestion_StoredObjectID"
      and stored."DOCStoredObject_StatusCode" = 'active'
    returning "JobDoc_ID" into v_document_id;
    if v_document_id is null then raise exception 'The source document is no longer available.' using errcode = 'P0002'; end if;
    update public."Comm_MessageAttachments" set "CommAttachment_JobDocumentID" = v_document_id
    where "CommAttachment_ID" = v_suggestion."AIInboxSuggestion_AttachmentID";
  end if;

  update public."AI_InboxSuggestedUpdates" set
    "AIInboxSuggestion_StatusCode" = 'applied', "AIInboxSuggestion_AppliedAt" = v_now,
    "AIInboxSuggestion_AppliedByUserID" = p_user_id,
    "AIInboxSuggestion_AppliedJobDocumentID" = v_document_id,
    "AIInboxSuggestion_UpdatedAt" = v_now
  where "AIInboxSuggestion_ID" = p_suggestion_id;

  insert into public."AI_InboxSuggestionAudit" (
    "AIInboxAudit_SuggestionID", "AIInboxAudit_CompanyID", "AIInboxAudit_UserID",
    "AIInboxAudit_EventCode", "AIInboxAudit_DetailsJSON"
  ) values (p_suggestion_id, p_company_id, p_user_id, 'applied', jsonb_build_object('fieldIds', to_jsonb(v_applied_ids), 'bookingId', v_job."Job_ID", 'documentId', v_document_id));
  insert into public."AI_DexterActionAudit" (
    "AIDexterAudit_CompanyID", "AIDexterAudit_UserID", "AIDexterAudit_ActionCode",
    "AIDexterAudit_AccessMode", "AIDexterAudit_ArgumentsJSON", "AIDexterAudit_ResultJSON"
  ) values (
    p_company_id, p_user_id, 'apply_inbox_suggested_update', 'approve',
    jsonb_build_object('suggestion_id', p_suggestion_id, 'selected_field_ids', to_jsonb(v_applied_ids)),
    jsonb_build_object('status','applied','booking_id',v_job."Job_ID",'document_id',v_document_id)
  );
  insert into public."Comm_Notifications" (
    "CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable",
    "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MetadataJSON", "CommNotif_CreatedBy"
  ) values (
    p_user_id, 'Booking updated from Inbox',
    format('%s selected changes were applied to %s.', cardinality(v_applied_ids), coalesce(v_suggestion."AIInboxSuggestion_TargetLabel", 'the booking')),
    'AI_InboxSuggestedUpdates', p_suggestion_id, 'inbox_suggestion',
    jsonb_build_object('suggestion_id',p_suggestion_id,'booking_id',v_job."Job_ID",'document_id',v_document_id), p_user_id
  );
  return jsonb_build_object('status','applied','suggestionId',p_suggestion_id,'bookingId',v_job."Job_ID",'documentId',v_document_id,'appliedFieldIds',to_jsonb(v_applied_ids));
end;
$$;

create or replace function public.multideck_inbox_dismiss_suggested_update(
  p_company_id uuid, p_user_id uuid, p_suggestion_id uuid
) returns boolean
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
begin
  if not public._multideck_dexter_has_permission(p_user_id, 'Email.Read') then
    raise exception 'You do not have permission to dismiss this suggestion.' using errcode = '42501';
  end if;
  update public."AI_InboxSuggestedUpdates" set
    "AIInboxSuggestion_StatusCode" = 'dismissed', "AIInboxSuggestion_DismissedAt" = now(),
    "AIInboxSuggestion_DismissedByUserID" = p_user_id, "AIInboxSuggestion_UpdatedAt" = now()
  where "AIInboxSuggestion_ID" = p_suggestion_id
    and "AIInboxSuggestion_CompanyID" = p_company_id
    and "AIInboxSuggestion_OwnerUserID" = p_user_id
    and "AIInboxSuggestion_StatusCode" in ('needs_match','ready','no_changes');
  if not found then return false; end if;
  insert into public."AI_InboxSuggestionAudit" (
    "AIInboxAudit_SuggestionID", "AIInboxAudit_CompanyID", "AIInboxAudit_UserID", "AIInboxAudit_EventCode"
  ) values (p_suggestion_id, p_company_id, p_user_id, 'dismissed');
  return true;
end;
$$;

create or replace function public.multideck_dexter_action_apply_inbox_suggested_update(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_suggestion_id uuid := nullif(p_arguments->>'suggestion_id','')::uuid;
  v_field_ids uuid[];
begin
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_field_ids
  from jsonb_array_elements_text(coalesce(p_arguments->'selected_field_ids','[]'::jsonb)) value;
  return public.multideck_inbox_apply_suggested_update(p_company_id, p_user_id, v_suggestion_id, v_field_ids);
end;
$$;

create or replace function public.multideck_dexter_domain_inbox_suggestions(
  p_company_id uuid, p_search text, p_take integer
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb; v_search text := nullif(btrim(p_search),'');
begin
  select * into v_context from public._multideck_dexter_context();
  if v_context.company_id <> p_company_id then
    raise exception 'Those Inbox suggestions are outside this workspace.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'recordId', suggestion."AIInboxSuggestion_ID", 'recordType', 'inbox_suggestion',
    'documentType', suggestion."AIInboxSuggestion_DocumentTypeCode",
    'status', suggestion."AIInboxSuggestion_StatusCode", 'targetId', suggestion."AIInboxSuggestion_TargetID",
    'targetLabel', suggestion."AIInboxSuggestion_TargetLabel", 'matchConfidence', suggestion."AIInboxSuggestion_MatchConfidence",
    'summary', suggestion."AIInboxSuggestion_Summary", 'sourceFileName', suggestion."AIInboxSuggestion_SourceFileName",
    'createdAt', suggestion."AIInboxSuggestion_CreatedAt", 'appliedAt', suggestion."AIInboxSuggestion_AppliedAt"
  )) order by suggestion."AIInboxSuggestion_CreatedAt" desc), '[]'::jsonb) into v_result
  from (
    select item.* from public."AI_InboxSuggestedUpdates" item
    where item."AIInboxSuggestion_CompanyID" = p_company_id
      and item."AIInboxSuggestion_OwnerUserID" = v_context.user_id
      and (v_search is null or concat_ws(' ', item."AIInboxSuggestion_TargetLabel", item."AIInboxSuggestion_Summary", item."AIInboxSuggestion_SourceFileName") ilike '%' || v_search || '%')
    order by item."AIInboxSuggestion_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take,10),25))
  ) suggestion;
  return v_result;
end;
$$;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt", "AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON", "AIDexterDomain_ScopeStrategy"
) values (
  'inbox_suggestions', 'Inbox suggested updates',
  'Reviewable booking and invoice changes extracted from authorised inbox documents.',
  'multideck_dexter_domain_inbox_suggestions', 58, true, now(),
  '["Email.Read","Email.AIRead","Bookings.Read"]'::jsonb,
  '["email_metadata","document_content","business_record_references"]'::jsonb, 'owner'
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
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function", "AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'apply_inbox_suggested_update', 'inbox_suggestions', 'Apply inbox suggested update',
  'Apply only the selected, reviewed fields from an exact ready inbox suggestion and attach its source document to the matched booking.',
  'multideck_dexter_action_apply_inbox_suggested_update',
  '{"type":"object","properties":{"suggestion_id":{"type":"string"},"selected_field_ids":{"type":"array","minItems":1,"items":{"type":"string"}},"reason":{"type":"string"}},"required":["suggestion_id","selected_field_ids","reason"],"additionalProperties":false}'::jsonb,
  580, true, now(), '["Email.Read","Email.AIRead","Bookings.Read","Bookings.Write"]'::jsonb,
  'update', 'owner', false
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
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name", "AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON", "AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive", "AIDexterWatchCapability_UpdatedAt",
  "AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy"
) values (
  'inbox_suggestions', 'Inbox suggested updates',
  'New, applied or dismissed reviewable updates from inbox documents.',
  '["status","documentType","targetLabel","matchConfidence","summary"]'::jsonb,
  58, true, now(), '["Email.Read","Email.AIRead","Bookings.Read"]'::jsonb, 'owner'
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_UpdatedAt" = now(),
  "AIDexterWatchCapability_RequiredPermissionsJSON" = excluded."AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy" = excluded."AIDexterWatchCapability_ScopeStrategy";

create or replace function public._multideck_inbox_suggestion_watch_change()
returns trigger language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' or new."AIInboxSuggestion_StatusCode" is distinct from old."AIInboxSuggestion_StatusCode" then
    if exists (
      select 1 from public."AI_DexterWatches" watch
      where watch."AIDexterWatch_CompanyID" = new."AIInboxSuggestion_CompanyID"
        and watch."AIDexterWatch_OwnerUserID" = new."AIInboxSuggestion_OwnerUserID"
        and watch."AIDexterWatch_CapabilityCode" = 'inbox_suggestions'
        and watch."AIDexterWatch_StatusCode" = 'active'
        and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = new."AIInboxSuggestion_ID")
    ) then
      insert into public."AI_DexterWatchSignals" (
        "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
        "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
        "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
      ) values (
        new."AIInboxSuggestion_CompanyID", 'inbox_suggestions', 'AI_InboxSuggestedUpdates', new."AIInboxSuggestion_ID",
        case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object(
          'status',old."AIInboxSuggestion_StatusCode",'documentType',old."AIInboxSuggestion_DocumentTypeCode",'ownerUserId',old."AIInboxSuggestion_OwnerUserID",
          'targetLabel',old."AIInboxSuggestion_TargetLabel",'matchConfidence',old."AIInboxSuggestion_MatchConfidence",'summary',old."AIInboxSuggestion_Summary") end,
        jsonb_build_object(
          'status',new."AIInboxSuggestion_StatusCode",'documentType',new."AIInboxSuggestion_DocumentTypeCode",'ownerUserId',new."AIInboxSuggestion_OwnerUserID",
          'targetLabel',new."AIInboxSuggestion_TargetLabel",'matchConfidence',new."AIInboxSuggestion_MatchConfidence",'summary',new."AIInboxSuggestion_Summary")
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_AI_InboxSuggestedUpdates_watch" on public."AI_InboxSuggestedUpdates";
create trigger "TR_AI_InboxSuggestedUpdates_watch"
after insert or update of "AIInboxSuggestion_StatusCode" on public."AI_InboxSuggestedUpdates"
for each row execute function public._multideck_inbox_suggestion_watch_change();

revoke all on function public.multideck_inbox_enqueue_suggestions(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.multideck_inbox_claim_suggestion_jobs(uuid,integer) from public, anon, authenticated;
revoke all on function public.multideck_inbox_apply_suggested_update(uuid,uuid,uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.multideck_inbox_dismiss_suggested_update(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_apply_inbox_suggested_update(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_inbox_suggestions(uuid,text,integer) from public, anon, authenticated;
revoke all on function public._multideck_inbox_suggestion_watch_change() from public, anon, authenticated;
grant execute on function public.multideck_inbox_enqueue_suggestions(uuid,uuid,text,text) to service_role;
grant execute on function public.multideck_inbox_claim_suggestion_jobs(uuid,integer) to service_role;
grant execute on function public.multideck_inbox_apply_suggested_update(uuid,uuid,uuid,uuid[]) to service_role;
grant execute on function public.multideck_inbox_dismiss_suggested_update(uuid,uuid,uuid) to service_role;
grant execute on function public.multideck_dexter_action_apply_inbox_suggested_update(uuid,uuid,jsonb) to service_role;
grant execute on function public.multideck_dexter_domain_inbox_suggestions(uuid,text,integer) to service_role;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'AI_InboxSuggestedUpdates'
     ) then
    alter publication supabase_realtime add table public."AI_InboxSuggestedUpdates";
  end if;
end $$;

commit;
