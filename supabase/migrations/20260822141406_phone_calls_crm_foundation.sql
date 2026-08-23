-- Jenkar receptionist phone-call CRM foundation.
--
-- The existing Comm_Call* and CRM_Call* tables remain the canonical records.
-- This migration makes them tenant-scoped, provider-provenanced, review-safe,
-- and available to Dexter and Watching for you without exposing raw provider
-- payloads or transcript tables through the browser Data API.

begin;

create extension if not exists pg_trgm with schema extensions;

insert into public."sys_Permissions" (
  "sys_Permission_Value",
  "sys_Permission_Group",
  "sys_Permission_Name",
  "sys_Permission_Description",
  "sys_Permission_IsDangerous"
)
values
  ('CRM.PhoneCalls.Read', 'Sales & CRM', 'View phone calls', 'View tenant phone-call metadata, transcripts, summaries and analytics.', false),
  ('CRM.PhoneCalls.Review', 'Sales & CRM', 'Review phone calls', 'Resolve phone-call matches, edit notes and approve generated actions.', true)
on conflict ("sys_Permission_Value") do update
set "sys_Permission_Group" = excluded."sys_Permission_Group",
    "sys_Permission_Name" = excluded."sys_Permission_Name",
    "sys_Permission_Description" = excluded."sys_Permission_Description",
    "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from public."sys_UserRoles" role
cross join public."sys_Permissions" permission
where lower(role."sys_UserRole_Name") in (
  'administrator', 'operations manager', 'operator', 'sales manager', 'sales user'
)
and permission."sys_Permission_Value" in ('CRM.PhoneCalls.Read', 'CRM.PhoneCalls.Review')
on conflict do nothing;

alter table public."Comm_CallLogs"
  add column if not exists "CommCall_CompanyID" uuid references public."cmp_Company"("Company_ID") on delete cascade,
  add column if not exists "CommCall_CorrelationID" uuid,
  add column if not exists "CommCall_SourceProviderCode" varchar(32),
  add column if not exists "CommCall_OutcomeCode" varchar(40),
  add column if not exists "CommCall_TransferStatusCode" varchar(32) default 'not_requested',
  add column if not exists "CommCall_TransferRequestedAt" timestamptz,
  add column if not exists "CommCall_TransferAcceptedAt" timestamptz,
  add column if not exists "CommCall_TranscriptStatusCode" varchar(40) default 'pending',
  add column if not exists "CommCall_RecordingStatusCode" varchar(32) default 'unknown',
  add column if not exists "CommCall_ConsentStatusCode" varchar(32) default 'unknown',
  add column if not exists "CommCall_ConsentDisclosureVersion" varchar(80),
  add column if not exists "CommCall_ConsentDisclosedAt" timestamptz,
  add column if not exists "CommCall_RetentionUntil" timestamptz,
  add column if not exists "CommCall_MatchedOrgID" uuid references public."Org_Master"("Org_id") on delete set null,
  add column if not exists "CommCall_MatchedContactID" uuid references public."Org_Contacts"("OrgContact_ID") on delete set null,
  add column if not exists "CommCall_MatchedLeadID" uuid references public."CRM_Leads"("CRMLead_ID") on delete set null,
  add column if not exists "CommCall_MatchStatusCode" varchar(24) default 'unmatched',
  add column if not exists "CommCall_MatchMethodCode" varchar(40),
  add column if not exists "CommCall_MatchConfidence" numeric(5,4),
  add column if not exists "CommCall_EditVersion" integer default 1 not null,
  add column if not exists "CommCall_UpdatedAt" timestamptz default now() not null,
  add column if not exists "CommCall_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

update public."Comm_CallLogs" call
set "CommCall_CompanyID" = actor."Company_ID"
from public."cmp_Users" actor
where call."CommCall_CompanyID" is null
  and actor."User_ID" = call."CommCall_CreatedBy"
  and actor."Company_ID" is not null;

alter table public."Comm_CallTranscriptSegments"
  add column if not exists "CommCallSeg_SourceProviderCode" varchar(32),
  add column if not exists "CommCallSeg_SourceLegID" uuid,
  add column if not exists "CommCallSeg_ProviderSegmentID" varchar(240),
  add column if not exists "CommCallSeg_SourceSequenceNo" integer,
  add column if not exists "CommCallSeg_StartedAt" timestamptz,
  add column if not exists "CommCallSeg_EndedAt" timestamptz,
  add column if not exists "CommCallSeg_StateCode" varchar(24) default 'complete',
  add column if not exists "CommCallSeg_RawEventID" uuid;

alter table public."CRM_CallReviews"
  add column if not exists "CRMCallReview_CompanyID" uuid references public."cmp_Company"("Company_ID") on delete cascade,
  add column if not exists "CRMCallReview_CapturedCallerName" varchar(180),
  add column if not exists "CRMCallReview_CapturedCompanyName" varchar(240),
  add column if not exists "CRMCallReview_CallReason" text,
  add column if not exists "CRMCallReview_MeetingNotes" text,
  add column if not exists "CRMCallReview_EditVersion" integer default 1 not null,
  add column if not exists "CRMCallReview_UpdatedAt" timestamptz default now() not null,
  add column if not exists "CRMCallReview_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

update public."CRM_CallReviews" review
set "CRMCallReview_CompanyID" = call."CommCall_CompanyID"
from public."Comm_CallLogs" call
where review."CRMCallReview_CommCallID" = call."CommCall_ID"
  and review."CRMCallReview_CompanyID" is null;

alter table public."CRM_CallActionCandidates"
  add column if not exists "CRMCallAction_ActionPayloadJSON" jsonb default '{}'::jsonb not null,
  add column if not exists "CRMCallAction_SourceKey" varchar(160),
  add column if not exists "CRMCallAction_TodoTaskID" uuid references public."OPS_UserTasks"("TodoTask_ID") on delete set null,
  add column if not exists "CRMCallAction_AppliedAt" timestamptz,
  add column if not exists "CRMCallAction_EditVersion" integer default 1 not null,
  add column if not exists "CRMCallAction_UpdatedAt" timestamptz default now() not null;

create table if not exists public."Comm_CallIngestionEvents" (
  "CommCallEvent_ID" uuid primary key default gen_random_uuid(),
  "CommCallEvent_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CommCallEvent_ProviderCode" varchar(32) not null,
  "CommCallEvent_ExternalEventID" varchar(300) not null,
  "CommCallEvent_EventType" varchar(120) not null,
  "CommCallEvent_SourceObjectID" varchar(300),
  "CommCallEvent_PayloadHashSHA256" varchar(64) not null,
  "CommCallEvent_SignatureVerified" boolean not null default false,
  "CommCallEvent_OccurredAt" timestamptz,
  "CommCallEvent_ReceivedAt" timestamptz not null default now(),
  "CommCallEvent_ProcessedAt" timestamptz,
  "CommCallEvent_NextAttemptAt" timestamptz,
  "CommCallEvent_AttemptCount" integer not null default 0,
  "CommCallEvent_StatusCode" varchar(24) not null default 'received',
  "CommCallEvent_ErrorCode" varchar(80),
  "CommCallEvent_ErrorMessage" varchar(500),
  "CommCallEvent_RawPayloadJSON" jsonb not null,
  "CommCallEvent_MetadataJSON" jsonb not null default '{}'::jsonb,
  constraint "CK_Comm_CallIngestionEvents_provider" check (
    "CommCallEvent_ProviderCode" in ('elevenlabs', 'twilio', '3cx')
  ),
  constraint "CK_Comm_CallIngestionEvents_status" check (
    "CommCallEvent_StatusCode" in ('received', 'processing', 'complete', 'partial', 'retryable', 'terminal', 'dead_letter')
  ),
  constraint "CK_Comm_CallIngestionEvents_hash" check (
    "CommCallEvent_PayloadHashSHA256" ~ '^[0-9a-f]{64}$'
  ),
  constraint "CK_Comm_CallIngestionEvents_raw_object" check (
    jsonb_typeof("CommCallEvent_RawPayloadJSON") in ('object', 'array')
  ),
  constraint "UX_Comm_CallIngestionEvents_delivery" unique (
    "CommCallEvent_CompanyID", "CommCallEvent_ProviderCode", "CommCallEvent_ExternalEventID"
  )
);

create table if not exists public."Comm_CallProviderLegs" (
  "CommCallLeg_ID" uuid primary key default gen_random_uuid(),
  "CommCallLeg_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CommCallLeg_CallID" uuid not null references public."Comm_CallLogs"("CommCall_ID") on delete cascade,
  "CommCallLeg_ProviderCode" varchar(32) not null,
  "CommCallLeg_ProviderCallID" varchar(300) not null,
  "CommCallLeg_ParentProviderCallID" varchar(300),
  "CommCallLeg_ProviderConversationID" varchar(300),
  "CommCallLeg_ProviderConferenceID" varchar(300),
  "CommCallLeg_ProviderRecordingID" varchar(300),
  "CommCallLeg_ProviderHistoryID" varchar(300),
  "CommCallLeg_ProviderSegmentID" varchar(300),
  "CommCallLeg_LegTypeCode" varchar(32) not null,
  "CommCallLeg_DirectionCode" varchar(16),
  "CommCallLeg_StatusCode" varchar(40),
  "CommCallLeg_OutcomeCode" varchar(40),
  "CommCallLeg_FromNumber" varchar(80),
  "CommCallLeg_ToNumber" varchar(80),
  "CommCallLeg_StartedAt" timestamptz,
  "CommCallLeg_AnsweredAt" timestamptz,
  "CommCallLeg_EndedAt" timestamptz,
  "CommCallLeg_TransferRequestedAt" timestamptz,
  "CommCallLeg_TranscriptStatusCode" varchar(40) not null default 'pending',
  "CommCallLeg_SortOrder" integer not null default 100,
  "CommCallLeg_CorrelationMethodCode" varchar(40),
  "CommCallLeg_CorrelationConfidence" numeric(5,4),
  "CommCallLeg_CorrelationEvidenceJSON" jsonb not null default '{}'::jsonb,
  "CommCallLeg_ProviderMetricsJSON" jsonb not null default '{}'::jsonb,
  "CommCallLeg_CreatedAt" timestamptz not null default now(),
  "CommCallLeg_UpdatedAt" timestamptz not null default now(),
  constraint "CK_Comm_CallProviderLegs_provider" check (
    "CommCallLeg_ProviderCode" in ('elevenlabs', 'twilio', '3cx')
  ),
  constraint "CK_Comm_CallProviderLegs_type" check (
    "CommCallLeg_LegTypeCode" in ('receptionist', 'carrier', 'transfer', 'employee', 'voicemail', 'unknown')
  ),
  constraint "UX_Comm_CallProviderLegs_provider_id" unique (
    "CommCallLeg_CompanyID", "CommCallLeg_ProviderCode", "CommCallLeg_ProviderCallID"
  )
);

create table if not exists public."Comm_CallParticipants" (
  "CommCallParticipant_ID" uuid primary key default gen_random_uuid(),
  "CommCallParticipant_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CommCallParticipant_CallID" uuid not null references public."Comm_CallLogs"("CommCall_ID") on delete cascade,
  "CommCallParticipant_LegID" uuid references public."Comm_CallProviderLegs"("CommCallLeg_ID") on delete set null,
  "CommCallParticipant_ProviderParticipantID" varchar(300),
  "CommCallParticipant_TypeCode" varchar(24) not null,
  "CommCallParticipant_RoleCode" varchar(40),
  "CommCallParticipant_DisplayName" varchar(240),
  "CommCallParticipant_Phone" varchar(80),
  "CommCallParticipant_NormalizedPhone" varchar(80),
  "CommCallParticipant_UserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CommCallParticipant_ContactID" uuid references public."Org_Contacts"("OrgContact_ID") on delete set null,
  "CommCallParticipant_JoinedAt" timestamptz,
  "CommCallParticipant_LeftAt" timestamptz,
  "CommCallParticipant_MetadataJSON" jsonb not null default '{}'::jsonb,
  "CommCallParticipant_CreatedAt" timestamptz not null default now(),
  constraint "CK_Comm_CallParticipants_type" check (
    "CommCallParticipant_TypeCode" in ('caller', 'receptionist', 'employee', 'queue', 'voicemail', 'unknown')
  )
);

create table if not exists public."CRM_CallMatchCandidates" (
  "CRMCallMatch_ID" uuid primary key default gen_random_uuid(),
  "CRMCallMatch_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMCallMatch_CallReviewID" uuid not null references public."CRM_CallReviews"("CRMCallReview_ID") on delete cascade,
  "CRMCallMatch_EntityTypeCode" varchar(24) not null,
  "CRMCallMatch_TargetID" uuid not null,
  "CRMCallMatch_TargetLabel" varchar(240) not null,
  "CRMCallMatch_Confidence" numeric(5,4) not null,
  "CRMCallMatch_Rank" integer not null,
  "CRMCallMatch_StatusCode" varchar(24) not null default 'candidate',
  "CRMCallMatch_AlgorithmVersion" varchar(40) not null,
  "CRMCallMatch_EvidenceJSON" jsonb not null default '{}'::jsonb,
  "CRMCallMatch_CreatedAt" timestamptz not null default now(),
  "CRMCallMatch_ReviewedAt" timestamptz,
  "CRMCallMatch_ReviewedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CK_CRM_CallMatchCandidates_type" check (
    "CRMCallMatch_EntityTypeCode" in ('company', 'contact', 'lead')
  ),
  constraint "CK_CRM_CallMatchCandidates_status" check (
    "CRMCallMatch_StatusCode" in ('candidate', 'selected', 'rejected')
  ),
  constraint "CK_CRM_CallMatchCandidates_confidence" check (
    "CRMCallMatch_Confidence" between 0 and 1
  ),
  constraint "UX_CRM_CallMatchCandidates_target" unique (
    "CRMCallMatch_CallReviewID", "CRMCallMatch_EntityTypeCode", "CRMCallMatch_TargetID"
  )
);

create table if not exists public."Comm_CallAccessEvents" (
  "CommCallAccess_ID" uuid primary key default gen_random_uuid(),
  "CommCallAccess_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CommCallAccess_CallID" uuid not null references public."Comm_CallLogs"("CommCall_ID") on delete cascade,
  "CommCallAccess_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CommCallAccess_AccessTypeCode" varchar(32) not null,
  "CommCallAccess_OccurredAt" timestamptz not null default now(),
  "CommCallAccess_MetadataJSON" jsonb not null default '{}'::jsonb,
  constraint "CK_Comm_CallAccessEvents_type" check (
    "CommCallAccess_AccessTypeCode" in ('view', 'export', 'match_review', 'notes_update', 'action_review')
  )
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'CK_Comm_CallLogs_source_provider') then
    alter table public."Comm_CallLogs" add constraint "CK_Comm_CallLogs_source_provider"
      check ("CommCall_SourceProviderCode" is null or "CommCall_SourceProviderCode" in ('elevenlabs', 'twilio', '3cx'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'CK_Comm_CallLogs_outcome') then
    alter table public."Comm_CallLogs" add constraint "CK_Comm_CallLogs_outcome"
      check ("CommCall_OutcomeCode" is null or "CommCall_OutcomeCode" in ('answered', 'missed', 'no_answer', 'busy', 'declined', 'voicemail', 'failed', 'cancelled', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'CK_Comm_CallLogs_transfer') then
    alter table public."Comm_CallLogs" add constraint "CK_Comm_CallLogs_transfer"
      check ("CommCall_TransferStatusCode" in ('not_requested', 'requested', 'accepted', 'declined', 'failed', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'CK_Comm_CallLogs_transcript') then
    alter table public."Comm_CallLogs" add constraint "CK_Comm_CallLogs_transcript"
      check ("CommCall_TranscriptStatusCode" in ('pending', 'partial', 'complete', 'failed', 'unavailable', 'unavailable_not_licensed', 'expired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'CK_Comm_CallLogs_match') then
    alter table public."Comm_CallLogs" add constraint "CK_Comm_CallLogs_match"
      check ("CommCall_MatchStatusCode" in ('matched', 'review', 'unmatched'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'CK_Comm_CallLogs_match_confidence') then
    alter table public."Comm_CallLogs" add constraint "CK_Comm_CallLogs_match_confidence"
      check ("CommCall_MatchConfidence" is null or "CommCall_MatchConfidence" between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'CK_Comm_CallTranscriptSegments_source_provider') then
    alter table public."Comm_CallTranscriptSegments" add constraint "CK_Comm_CallTranscriptSegments_source_provider"
      check ("CommCallSeg_SourceProviderCode" is null or "CommCallSeg_SourceProviderCode" in ('elevenlabs', 'twilio', '3cx'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'FK_Comm_CallTranscriptSegments_source_leg') then
    alter table public."Comm_CallTranscriptSegments" add constraint "FK_Comm_CallTranscriptSegments_source_leg"
      foreign key ("CommCallSeg_SourceLegID") references public."Comm_CallProviderLegs"("CommCallLeg_ID") on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'FK_Comm_CallTranscriptSegments_raw_event') then
    alter table public."Comm_CallTranscriptSegments" add constraint "FK_Comm_CallTranscriptSegments_raw_event"
      foreign key ("CommCallSeg_RawEventID") references public."Comm_CallIngestionEvents"("CommCallEvent_ID") on delete set null;
  end if;
end $$;

create unique index if not exists "UX_Comm_CallLogs_company_correlation"
  on public."Comm_CallLogs" ("CommCall_CompanyID", "CommCall_CorrelationID")
  where "CommCall_CompanyID" is not null and "CommCall_CorrelationID" is not null;
create index if not exists "IX_Comm_CallLogs_company_started"
  on public."Comm_CallLogs" ("CommCall_CompanyID", "CommCall_StartedAt" desc, "CommCall_ID");
create index if not exists "IX_Comm_CallLogs_company_attention"
  on public."Comm_CallLogs" ("CommCall_CompanyID", "CommCall_MatchStatusCode", "CommCall_TranscriptStatusCode", "CommCall_StartedAt" desc);
create unique index if not exists "UX_Comm_CallTranscriptSegments_source_segment"
  on public."Comm_CallTranscriptSegments" (
    "CommCallSeg_SourceLegID", "CommCallSeg_ProviderSegmentID"
  ) where "CommCallSeg_SourceLegID" is not null and "CommCallSeg_ProviderSegmentID" is not null;
create index if not exists "IX_Comm_CallTranscriptSegments_chronology"
  on public."Comm_CallTranscriptSegments" (
    "CommCallSeg_CallID", "CommCallSeg_StartedAt", "CommCallSeg_SequenceNo"
  );
create index if not exists "IX_Comm_CallIngestionEvents_retry"
  on public."Comm_CallIngestionEvents" (
    "CommCallEvent_StatusCode", "CommCallEvent_NextAttemptAt", "CommCallEvent_ReceivedAt"
  ) where "CommCallEvent_StatusCode" in ('received', 'retryable');
create index if not exists "IX_Comm_CallProviderLegs_call_chronology"
  on public."Comm_CallProviderLegs" (
    "CommCallLeg_CallID", "CommCallLeg_StartedAt", "CommCallLeg_SortOrder"
  );
create index if not exists "IX_Comm_CallParticipants_call_joined"
  on public."Comm_CallParticipants" ("CommCallParticipant_CallID", "CommCallParticipant_JoinedAt");
create unique index if not exists "UX_Comm_CallParticipants_provider_identity"
  on public."Comm_CallParticipants" (
    "CommCallParticipant_CompanyID", "CommCallParticipant_ProviderParticipantID", "CommCallParticipant_TypeCode"
  );
create index if not exists "IX_CRM_CallMatchCandidates_review_rank"
  on public."CRM_CallMatchCandidates" ("CRMCallMatch_CallReviewID", "CRMCallMatch_Rank");
create unique index if not exists "UX_CRM_CallActionCandidates_source"
  on public."CRM_CallActionCandidates" ("CRMCallAction_CallReviewID", "CRMCallAction_SourceKey");
create index if not exists "IX_Comm_CallAccessEvents_user_occurred"
  on public."Comm_CallAccessEvents" ("CommCallAccess_UserID", "CommCallAccess_OccurredAt" desc);

alter table public."Comm_CallIngestionEvents" enable row level security;
alter table public."Comm_CallProviderLegs" enable row level security;
alter table public."Comm_CallParticipants" enable row level security;
alter table public."CRM_CallMatchCandidates" enable row level security;
alter table public."Comm_CallAccessEvents" enable row level security;

revoke all on table public."Comm_CallLogs", public."Comm_CallTranscriptSegments",
  public."Comm_CallAIOutputs", public."Comm_CallActionItems", public."CRM_CallReviews",
  public."CRM_CallActionCandidates", public."Comm_CallIngestionEvents",
  public."Comm_CallProviderLegs", public."Comm_CallParticipants",
  public."CRM_CallMatchCandidates", public."Comm_CallAccessEvents"
from public, anon, authenticated;

grant all on table public."Comm_CallLogs", public."Comm_CallTranscriptSegments",
  public."Comm_CallAIOutputs", public."Comm_CallActionItems", public."CRM_CallReviews",
  public."CRM_CallActionCandidates", public."Comm_CallIngestionEvents",
  public."Comm_CallProviderLegs", public."Comm_CallParticipants",
  public."CRM_CallMatchCandidates", public."Comm_CallAccessEvents"
to service_role;

insert into public."sys_CRMCallActionTypes" (
  "CRMCallActionType_Code", "CRMCallActionType_Name", "CRMCallActionType_Description",
  "CRMCallActionType_IsActive", "CRMCallActionType_SortOrder"
)
values
  ('create_todo', 'Add to To Do', 'Create a reviewed task from an exact call request.', true, 10),
  ('link_lead', 'Link to lead', 'Link the call to an exact existing CRM lead after review.', true, 20),
  ('add_note', 'Add CRM note', 'Prepare an editable CRM note from call evidence.', true, 30),
  ('follow_up', 'Schedule follow-up', 'Prepare a reviewed follow-up task from the call.', true, 40)
on conflict ("CRMCallActionType_Code") do update
set "CRMCallActionType_Name" = excluded."CRMCallActionType_Name",
    "CRMCallActionType_Description" = excluded."CRMCallActionType_Description",
    "CRMCallActionType_IsActive" = true,
    "CRMCallActionType_SortOrder" = excluded."CRMCallActionType_SortOrder";

create or replace function public._multideck_phone_normalize(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(
    case
      when btrim(coalesce(p_value, '')) like '00%' then '+' || substr(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), 3)
      else regexp_replace(
        regexp_replace(coalesce(p_value, ''), '^\s*(\+[0-9]{1,3})\s*\(0\)', '\1'),
        '[^0-9+]', '', 'g'
      )
    end,
    ''
  )
$$;

create or replace function public._multideck_phone_match_text(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p_value, '')), '[^[:alnum:]]+', ' ', 'g')), '')
$$;

create or replace function public._multideck_phone_assert_actor(
  p_company_id uuid,
  p_user_id uuid,
  p_permission text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public."cmp_Users" actor
    where actor."User_ID" = p_user_id
      and actor."Company_ID" = p_company_id
      and actor."Auth_User_ID" is not null
      and coalesce(actor."User_AccessStatus", 'active') = 'active'
  ) or not public._multideck_crm_has_permission(p_user_id, p_permission) then
    raise exception 'You do not have permission to use Phone calls.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._multideck_phone_assert_actor(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.multideck_phone_call_match_candidates(
  p_company_id uuid,
  p_user_id uuid,
  p_call_id uuid,
  p_take integer default 8
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_call public."Comm_CallLogs"%rowtype;
  v_review_id uuid;
  v_name text;
  v_company text;
  v_phone text;
  v_result jsonb;
begin
  perform public._multideck_phone_assert_actor(p_company_id, p_user_id, 'CRM.PhoneCalls.Read');
  select * into v_call from public."Comm_CallLogs" call
  where call."CommCall_ID" = p_call_id and call."CommCall_CompanyID" = p_company_id;
  if not found then raise exception 'Phone call not found.' using errcode = 'P0002'; end if;

  insert into public."CRM_CallReviews" (
    "CRMCallReview_CommCallID", "CRMCallReview_CompanyID", "CRMCallReview_OwnerUserID",
    "CRMCallReview_CapturedCallerName", "CRMCallReview_CapturedCompanyName",
    "CRMCallReview_CreatedBy", "CRMCallReview_UpdatedBy"
  ) values (
    p_call_id, p_company_id, p_user_id,
    coalesce(nullif(btrim(v_call."CommCall_FromDisplayNameSnapshot"), ''), nullif(btrim(v_call."CommCall_ToDisplayNameSnapshot"), '')),
    null, p_user_id, p_user_id
  )
  on conflict ("CRMCallReview_CommCallID") do update
  set "CRMCallReview_CompanyID" = coalesce(public."CRM_CallReviews"."CRMCallReview_CompanyID", excluded."CRMCallReview_CompanyID")
  returning "CRMCallReview_ID", "CRMCallReview_CapturedCallerName", "CRMCallReview_CapturedCompanyName"
  into v_review_id, v_name, v_company;

  v_phone := public._multideck_phone_normalize(
    case when v_call."CommCall_DirectionCode" = 'outbound' then v_call."CommCall_ToNumber" else v_call."CommCall_FromNumber" end
  );

  delete from public."CRM_CallMatchCandidates"
  where "CRMCallMatch_CallReviewID" = v_review_id
    and "CRMCallMatch_StatusCode" = 'candidate';

  with accessible_company as (
    select account_id from public.multideck_crm_accessible_account_ids(p_company_id)
  ), candidates as (
    select
      'company'::text entity_type,
      organisation."Org_id" target_id,
      organisation."Org_Name"::text target_label,
      least(0.99, greatest(
        case when v_company is not null and public._multideck_phone_match_text(organisation."Org_Name") = public._multideck_phone_match_text(v_company) then 0.92 else 0 end,
        case when v_company is not null then extensions.similarity(
          public._multideck_phone_match_text(organisation."Org_Name"),
          public._multideck_phone_match_text(v_company)
        ) * 0.82 else 0 end,
        case when v_phone is not null and exists (
          select 1 from public."Comm_Identities" identity
          where identity."CommIdentity_OrgID" = organisation."Org_id"
            and identity."CommIdentity_ChannelCode" in ('phone', 'sms', 'whatsapp')
            and not identity."CommIdentity_IsDeleted"
            and public._multideck_phone_normalize(identity."CommIdentity_NormalizedAddress") = v_phone
        ) then 0.98 else 0 end
      ))::numeric(5,4) confidence,
      jsonb_build_object(
        'companyNameExact', v_company is not null and public._multideck_phone_match_text(organisation."Org_Name") = public._multideck_phone_match_text(v_company),
        'companyNameSimilarity', case when v_company is null then null else round(extensions.similarity(public._multideck_phone_match_text(organisation."Org_Name"), public._multideck_phone_match_text(v_company))::numeric, 4) end,
        'phoneExact', v_phone is not null and exists (
          select 1 from public."Comm_Identities" identity
          where identity."CommIdentity_OrgID" = organisation."Org_id"
            and not identity."CommIdentity_IsDeleted"
            and public._multideck_phone_normalize(identity."CommIdentity_NormalizedAddress") = v_phone
        )
      ) evidence
    from public."Org_Master" organisation
    join accessible_company accessible on accessible.account_id = organisation."Org_id"
    where v_company is not null or v_phone is not null

    union all

    select
      'contact'::text,
      contact."OrgContact_ID",
      coalesce(nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), ''), organisation."Org_Name")::text,
      least(0.99, greatest(
        case when v_phone is not null and exists (
          select 1 from public."Comm_Identities" identity
          where identity."CommIdentity_ContactID" = contact."OrgContact_ID"
            and not identity."CommIdentity_IsDeleted"
            and public._multideck_phone_normalize(identity."CommIdentity_NormalizedAddress") = v_phone
        ) then 0.99 else 0 end,
        case when v_name is not null then extensions.similarity(
          public._multideck_phone_match_text(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")),
          public._multideck_phone_match_text(v_name)
        ) * 0.86 else 0 end
      ))::numeric(5,4),
      jsonb_build_object(
        'nameSimilarity', case when v_name is null then null else round(extensions.similarity(public._multideck_phone_match_text(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), public._multideck_phone_match_text(v_name))::numeric, 4) end,
        'phoneExact', v_phone is not null and exists (
          select 1 from public."Comm_Identities" identity
          where identity."CommIdentity_ContactID" = contact."OrgContact_ID"
            and not identity."CommIdentity_IsDeleted"
            and public._multideck_phone_normalize(identity."CommIdentity_NormalizedAddress") = v_phone
        ),
        'companyId', organisation."Org_id",
        'companyName', organisation."Org_Name"
      )
    from public."Org_Contacts" contact
    join accessible_company accessible on accessible.account_id = contact."Org_ID"
    join public."Org_Master" organisation on organisation."Org_id" = contact."Org_ID"
    where v_name is not null or v_phone is not null

    union all

    select
      'lead'::text,
      lead."CRMLead_ID",
      coalesce(nullif(btrim(lead."CRMLead_CompanyName"), ''), nullif(btrim(lead."CRMLead_PersonName"), ''), 'Unnamed lead')::text,
      least(0.99, greatest(
        case when v_phone is not null and public._multideck_phone_normalize(lead."CRMLead_Phone") = v_phone then 0.98 else 0 end,
        case when v_name is not null then extensions.similarity(public._multideck_phone_match_text(lead."CRMLead_PersonName"), public._multideck_phone_match_text(v_name)) * 0.82 else 0 end,
        case when v_company is not null then extensions.similarity(public._multideck_phone_match_text(lead."CRMLead_CompanyName"), public._multideck_phone_match_text(v_company)) * 0.78 else 0 end
      ))::numeric(5,4),
      jsonb_build_object(
        'phoneExact', v_phone is not null and public._multideck_phone_normalize(lead."CRMLead_Phone") = v_phone,
        'nameSimilarity', case when v_name is null then null else round(extensions.similarity(public._multideck_phone_match_text(lead."CRMLead_PersonName"), public._multideck_phone_match_text(v_name))::numeric, 4) end,
        'companySimilarity', case when v_company is null then null else round(extensions.similarity(public._multideck_phone_match_text(lead."CRMLead_CompanyName"), public._multideck_phone_match_text(v_company))::numeric, 4) end
      )
    from public."CRM_Leads" lead
    left join public."cmp_Users" owner on owner."User_ID" = lead."CRMLead_OwnerUserID"
    where not lead."CRMLead_IsDeleted"
      and lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
      and (owner."Company_ID" = p_company_id or lead."CRMLead_OrgID" in (select account_id from accessible_company))
      and (v_name is not null or v_company is not null or v_phone is not null)
  ), ranked as (
    select *, row_number() over (order by confidence desc, entity_type, target_label, target_id) rank
    from candidates where confidence >= 0.34
  ), inserted as (
    insert into public."CRM_CallMatchCandidates" (
      "CRMCallMatch_CompanyID", "CRMCallMatch_CallReviewID", "CRMCallMatch_EntityTypeCode",
      "CRMCallMatch_TargetID", "CRMCallMatch_TargetLabel", "CRMCallMatch_Confidence",
      "CRMCallMatch_Rank", "CRMCallMatch_AlgorithmVersion", "CRMCallMatch_EvidenceJSON"
    )
    select p_company_id, v_review_id, entity_type, target_id, left(target_label, 240), confidence,
      rank, 'phone-match-v1', evidence
    from ranked where rank <= greatest(1, least(coalesce(p_take, 8), 20))
    on conflict ("CRMCallMatch_CallReviewID", "CRMCallMatch_EntityTypeCode", "CRMCallMatch_TargetID")
    do update set
      "CRMCallMatch_TargetLabel" = excluded."CRMCallMatch_TargetLabel",
      "CRMCallMatch_Confidence" = excluded."CRMCallMatch_Confidence",
      "CRMCallMatch_Rank" = excluded."CRMCallMatch_Rank",
      "CRMCallMatch_AlgorithmVersion" = excluded."CRMCallMatch_AlgorithmVersion",
      "CRMCallMatch_EvidenceJSON" = excluded."CRMCallMatch_EvidenceJSON",
      "CRMCallMatch_StatusCode" = case when public."CRM_CallMatchCandidates"."CRMCallMatch_StatusCode" = 'selected' then 'selected' else 'candidate' end
    returning *
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', inserted."CRMCallMatch_ID",
    'entityType', inserted."CRMCallMatch_EntityTypeCode",
    'targetId', inserted."CRMCallMatch_TargetID",
    'label', inserted."CRMCallMatch_TargetLabel",
    'confidence', inserted."CRMCallMatch_Confidence",
    'rank', inserted."CRMCallMatch_Rank",
    'status', inserted."CRMCallMatch_StatusCode",
    'algorithmVersion', inserted."CRMCallMatch_AlgorithmVersion",
    'evidence', inserted."CRMCallMatch_EvidenceJSON"
  ) order by inserted."CRMCallMatch_Rank"), '[]'::jsonb)
  into v_result from inserted;

  update public."Comm_CallLogs"
  set "CommCall_MatchStatusCode" = case
        when jsonb_array_length(v_result) = 0 then 'unmatched'
        else 'review'
      end,
      "CommCall_UpdatedAt" = now()
  where "CommCall_ID" = p_call_id;

  return v_result;
end;
$$;

revoke all on function public.multideck_phone_call_match_candidates(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_match_candidates(uuid, uuid, uuid, integer) to service_role;

create or replace function public.multideck_phone_call_review_match(
  p_company_id uuid,
  p_user_id uuid,
  p_call_id uuid,
  p_resolution text,
  p_company_target_id uuid default null,
  p_contact_target_id uuid default null,
  p_lead_target_id uuid default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_call public."Comm_CallLogs"%rowtype;
  v_review_id uuid;
begin
  perform public._multideck_phone_assert_actor(p_company_id, p_user_id, 'CRM.PhoneCalls.Review');
  select * into v_call from public."Comm_CallLogs" call
  where call."CommCall_ID" = p_call_id and call."CommCall_CompanyID" = p_company_id
  for update;
  if not found then raise exception 'Phone call not found.' using errcode = 'P0002'; end if;
  if p_expected_version is not null and v_call."CommCall_EditVersion" <> p_expected_version then
    raise exception 'PHONE_CALL_CONFLICT: Reload this call before saving.' using errcode = 'P0001';
  end if;
  if p_resolution not in ('link', 'unmatched') then
    raise exception 'Choose whether to link the caller or leave the call unmatched.' using errcode = '22023';
  end if;
  if p_resolution = 'link' and num_nonnulls(p_company_target_id, p_contact_target_id, p_lead_target_id) = 0 then
    raise exception 'Choose a company, contact or lead to link.' using errcode = '22023';
  end if;
  if p_resolution = 'unmatched' and num_nonnulls(p_company_target_id, p_contact_target_id, p_lead_target_id) > 0 then
    raise exception 'An unmatched call cannot keep a CRM link.' using errcode = '22023';
  end if;
  if p_company_target_id is not null and not public.multideck_crm_company_can_access_account(p_company_id, p_company_target_id) then
    raise exception 'That company is outside this workspace.' using errcode = '42501';
  end if;
  if p_contact_target_id is not null and not exists (
    select 1 from public."Org_Contacts" contact
    where contact."OrgContact_ID" = p_contact_target_id
      and public.multideck_crm_company_can_access_account(p_company_id, contact."Org_ID")
  ) then raise exception 'That contact is outside this workspace.' using errcode = '42501'; end if;
  if p_lead_target_id is not null and not exists (
    select 1 from public."CRM_Leads" lead
    left join public."cmp_Users" owner on owner."User_ID" = lead."CRMLead_OwnerUserID"
    where lead."CRMLead_ID" = p_lead_target_id and not lead."CRMLead_IsDeleted"
      and (owner."Company_ID" = p_company_id or public.multideck_crm_company_can_access_account(p_company_id, lead."CRMLead_OrgID"))
  ) then raise exception 'That lead is outside this workspace.' using errcode = '42501'; end if;

  update public."Comm_CallLogs"
  set "CommCall_MatchedOrgID" = case when p_resolution = 'link' then coalesce(
        p_company_target_id,
        (select contact."Org_ID" from public."Org_Contacts" contact where contact."OrgContact_ID" = p_contact_target_id)
      ) else null end,
      "CommCall_MatchedContactID" = case when p_resolution = 'link' then p_contact_target_id else null end,
      "CommCall_MatchedLeadID" = case when p_resolution = 'link' then p_lead_target_id else null end,
      "CommCall_MatchStatusCode" = case when p_resolution = 'link' then 'matched' else 'unmatched' end,
      "CommCall_MatchMethodCode" = 'user_review',
      "CommCall_MatchConfidence" = case when p_resolution = 'link' then 1 else null end,
      "CommCall_EditVersion" = "CommCall_EditVersion" + 1,
      "CommCall_UpdatedAt" = now(),
      "CommCall_UpdatedBy" = p_user_id
  where "CommCall_ID" = p_call_id
  returning * into v_call;

  select "CRMCallReview_ID" into v_review_id from public."CRM_CallReviews"
  where "CRMCallReview_CommCallID" = p_call_id;
  if v_review_id is not null then
    update public."CRM_CallReviews"
    set "CRMCallReview_EditVersion" = "CRMCallReview_EditVersion" + 1,
        "CRMCallReview_UpdatedAt" = now(),
        "CRMCallReview_UpdatedBy" = p_user_id
    where "CRMCallReview_ID" = v_review_id;
    update public."CRM_CallMatchCandidates"
    set "CRMCallMatch_StatusCode" = case
          when p_resolution = 'link' and "CRMCallMatch_TargetID" in (p_company_target_id, p_contact_target_id, p_lead_target_id) then 'selected'
          else 'rejected'
        end,
        "CRMCallMatch_ReviewedAt" = now(),
        "CRMCallMatch_ReviewedBy" = p_user_id
    where "CRMCallMatch_CallReviewID" = v_review_id;
  end if;

  insert into public."Comm_CallAccessEvents" (
    "CommCallAccess_CompanyID", "CommCallAccess_CallID", "CommCallAccess_UserID",
    "CommCallAccess_AccessTypeCode", "CommCallAccess_MetadataJSON"
  ) values (p_company_id, p_call_id, p_user_id, 'match_review', jsonb_build_object('resolution', p_resolution));

  return jsonb_build_object(
    'id', v_call."CommCall_ID",
    'editVersion', v_call."CommCall_EditVersion",
    'matchStatus', v_call."CommCall_MatchStatusCode",
    'companyId', v_call."CommCall_MatchedOrgID",
    'contactId', v_call."CommCall_MatchedContactID",
    'leadId', v_call."CommCall_MatchedLeadID"
  );
end;
$$;

revoke all on function public.multideck_phone_call_review_match(uuid, uuid, uuid, text, uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_review_match(uuid, uuid, uuid, text, uuid, uuid, uuid, integer) to service_role;

create or replace function public.multideck_phone_call_save_notes(
  p_company_id uuid,
  p_user_id uuid,
  p_call_id uuid,
  p_summary text,
  p_meeting_notes text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_review public."CRM_CallReviews"%rowtype;
begin
  perform public._multideck_phone_assert_actor(p_company_id, p_user_id, 'CRM.PhoneCalls.Review');
  select review.* into v_review
  from public."CRM_CallReviews" review
  join public."Comm_CallLogs" call on call."CommCall_ID" = review."CRMCallReview_CommCallID"
  where call."CommCall_ID" = p_call_id and call."CommCall_CompanyID" = p_company_id
  for update of review;
  if not found then raise exception 'Phone call review not found.' using errcode = 'P0002'; end if;
  if p_expected_version is not null and v_review."CRMCallReview_EditVersion" <> p_expected_version then
    raise exception 'PHONE_CALL_CONFLICT: Reload these notes before saving.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_summary, '')) > 4000 or length(coalesce(p_meeting_notes, '')) > 12000 then
    raise exception 'The call notes are too long.' using errcode = '22023';
  end if;
  update public."CRM_CallReviews"
  set "CRMCallReview_UserApprovedSummary" = nullif(btrim(p_summary), ''),
      "CRMCallReview_MeetingNotes" = nullif(btrim(p_meeting_notes), ''),
      "CRMCallReview_EditVersion" = "CRMCallReview_EditVersion" + 1,
      "CRMCallReview_UpdatedAt" = now(),
      "CRMCallReview_UpdatedBy" = p_user_id
  where "CRMCallReview_ID" = v_review."CRMCallReview_ID"
  returning * into v_review;
  update public."Comm_CallLogs"
  set "CommCall_EditVersion" = "CommCall_EditVersion" + 1,
      "CommCall_UpdatedAt" = now(),
      "CommCall_UpdatedBy" = p_user_id
  where "CommCall_ID" = p_call_id;
  insert into public."Comm_CallAccessEvents" (
    "CommCallAccess_CompanyID", "CommCallAccess_CallID", "CommCallAccess_UserID", "CommCallAccess_AccessTypeCode"
  ) values (p_company_id, p_call_id, p_user_id, 'notes_update');
  return jsonb_build_object(
    'id', v_review."CRMCallReview_ID",
    'summary', v_review."CRMCallReview_UserApprovedSummary",
    'meetingNotes', v_review."CRMCallReview_MeetingNotes",
    'editVersion', v_review."CRMCallReview_EditVersion",
    'updatedAt', v_review."CRMCallReview_UpdatedAt"
  );
end;
$$;

revoke all on function public.multideck_phone_call_save_notes(uuid, uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_save_notes(uuid, uuid, uuid, text, text, integer) to service_role;

create or replace function public._multideck_phone_call_review_action_for_actor(
  p_company_id uuid,
  p_user_id uuid,
  p_call_id uuid,
  p_action_id uuid,
  p_decision text,
  p_edited_title text default null,
  p_scheduled_date date default null,
  p_priority text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_action public."CRM_CallActionCandidates"%rowtype;
  v_review public."CRM_CallReviews"%rowtype;
  v_title text;
  v_todo_title text;
  v_original_title text;
  v_todo jsonb;
  v_lead_id uuid;
begin
  perform public._multideck_phone_assert_actor(p_company_id, p_user_id, 'CRM.PhoneCalls.Review');
  select action.* into v_action
  from public."CRM_CallActionCandidates" action
  join public."CRM_CallReviews" review on review."CRMCallReview_ID" = action."CRMCallAction_CallReviewID"
  join public."Comm_CallLogs" call on call."CommCall_ID" = review."CRMCallReview_CommCallID"
  where action."CRMCallAction_ID" = p_action_id
    and call."CommCall_ID" = p_call_id
    and call."CommCall_CompanyID" = p_company_id
  for update of action;
  if not found then raise exception 'Suggested action not found.' using errcode = 'P0002'; end if;
  select review.* into strict v_review
  from public."CRM_CallReviews" review
  where review."CRMCallReview_ID" = v_action."CRMCallAction_CallReviewID";
  if v_action."CRMCallAction_DecisionStatus" <> 'pending' then
    return jsonb_build_object(
      'id', v_action."CRMCallAction_ID", 'status', v_action."CRMCallAction_DecisionStatus",
      'todoTaskId', v_action."CRMCallAction_TodoTaskID", 'replayed', true
    );
  end if;
  if p_decision not in ('approve', 'dismiss') then
    raise exception 'Choose Approve or Dismiss.' using errcode = '22023';
  end if;
  v_original_title := v_action."CRMCallAction_Title";
  v_title := left(coalesce(nullif(btrim(p_edited_title), ''), v_action."CRMCallAction_Title"), 240);
  v_todo_title := left(regexp_replace(v_title, '\s+—\s+add this to the to-do list\?$', '', 'i'), 240);
  if p_decision = 'approve' and v_action."CRMCallAction_ActionTypeCode" in ('create_todo', 'follow_up') then
    v_todo := public._multideck_todo_create_for_actor(
      p_company_id, p_user_id, v_todo_title, coalesce(p_scheduled_date, current_date), p_priority,
      jsonb_build_array(jsonb_build_object('label', 'Phone call', 'url', '/crm/phone-calls/' || p_call_id::text)),
      jsonb_build_array(jsonb_build_object('label', 'Phone call follow-up', 'href', '/crm/phone-calls/' || p_call_id::text)),
      'dexter_action', null
    );
  elsif p_decision = 'approve' and v_action."CRMCallAction_ActionTypeCode" = 'link_lead' then
    begin v_lead_id := (v_action."CRMCallAction_ActionPayloadJSON" ->> 'leadId')::uuid;
    exception when others then raise exception 'The suggested lead link is invalid.' using errcode = '22023'; end;
    if not exists (
      select 1 from public."CRM_Leads" lead
      left join public."cmp_Users" owner on owner."User_ID" = lead."CRMLead_OwnerUserID"
      where lead."CRMLead_ID" = v_lead_id and not lead."CRMLead_IsDeleted"
        and (owner."Company_ID" = p_company_id or public.multideck_crm_company_can_access_account(p_company_id, lead."CRMLead_OrgID"))
    ) then raise exception 'The suggested lead is outside this workspace.' using errcode = '42501'; end if;
    update public."Comm_CallLogs"
    set "CommCall_MatchedLeadID" = v_lead_id,
        "CommCall_MatchStatusCode" = 'matched',
        "CommCall_MatchMethodCode" = 'approved_action',
        "CommCall_EditVersion" = "CommCall_EditVersion" + 1,
        "CommCall_UpdatedAt" = now(),
        "CommCall_UpdatedBy" = p_user_id
    where "CommCall_ID" = p_call_id;
  elsif p_decision = 'approve' then
    raise exception 'That generated action is review-only and cannot yet change CRM data.' using errcode = '22023';
  end if;

  update public."CRM_CallActionCandidates"
  set "CRMCallAction_Title" = v_title,
      "CRMCallAction_DecisionStatus" = case
        when p_decision = 'dismiss' then 'rejected'
        when p_edited_title is not null then 'edited'
        else 'accepted'
      end,
      "CRMCallAction_DecisionReason" = nullif(left(btrim(coalesce(p_reason, '')), 1000), ''),
      "CRMCallAction_TodoTaskID" = case when v_todo is null then null else (v_todo ->> 'id')::uuid end,
      "CRMCallAction_DecidedAt" = now(),
      "CRMCallAction_DecidedBy" = p_user_id,
      "CRMCallAction_AppliedAt" = case when p_decision = 'approve' then now() else null end,
      "CRMCallAction_EditVersion" = "CRMCallAction_EditVersion" + 1,
      "CRMCallAction_UpdatedAt" = now()
  where "CRMCallAction_ID" = p_action_id
  returning * into v_action;

  insert into public."CRM_CallReviewDecisions" (
    "CRMCallDecision_CallReviewID", "CRMCallDecision_ActionCandidateID", "CRMCallDecision_Decision",
    "CRMCallDecision_OriginalText", "CRMCallDecision_EditedText", "CRMCallDecision_Reason", "CRMCallDecision_DecidedBy"
  ) values (
    v_review."CRMCallReview_ID", p_action_id, p_decision,
    v_original_title, nullif(btrim(p_edited_title), ''), nullif(btrim(p_reason), ''), p_user_id
  );
  insert into public."Comm_CallAccessEvents" (
    "CommCallAccess_CompanyID", "CommCallAccess_CallID", "CommCallAccess_UserID",
    "CommCallAccess_AccessTypeCode", "CommCallAccess_MetadataJSON"
  ) values (p_company_id, p_call_id, p_user_id, 'action_review', jsonb_build_object('actionId', p_action_id, 'decision', p_decision));

  return jsonb_build_object(
    'id', v_action."CRMCallAction_ID",
    'status', v_action."CRMCallAction_DecisionStatus",
    'title', v_action."CRMCallAction_Title",
    'todoTaskId', v_action."CRMCallAction_TodoTaskID",
    'appliedAt', v_action."CRMCallAction_AppliedAt"
  );
end;
$$;

revoke all on function public._multideck_phone_call_review_action_for_actor(uuid, uuid, uuid, uuid, text, text, date, text, text) from public, anon, authenticated;

create or replace function public.multideck_phone_call_review_action(
  p_company_id uuid,
  p_user_id uuid,
  p_call_id uuid,
  p_action_id uuid,
  p_decision text,
  p_edited_title text default null,
  p_scheduled_date date default null,
  p_priority text default null,
  p_reason text default null
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select public._multideck_phone_call_review_action_for_actor(
    p_company_id, p_user_id, p_call_id, p_action_id, p_decision,
    p_edited_title, p_scheduled_date, p_priority, p_reason
  )
$$;

revoke all on function public.multideck_phone_call_review_action(uuid, uuid, uuid, uuid, text, text, date, text, text) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_review_action(uuid, uuid, uuid, uuid, text, text, date, text, text) to service_role;

create or replace function public.multideck_dexter_domain_phone_calls(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb; v_term text := nullif(btrim(p_search), '');
begin
  select * into v_context from public._multideck_dexter_context();
  if v_context.company_id <> p_company_id or not public._multideck_crm_has_permission(v_context.user_id, 'CRM.PhoneCalls.Read') then
    raise exception 'Phone calls are outside this workspace or permission.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row_data order by started_at desc), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'recordId', call."CommCall_ID",
      'callerName', coalesce(call."CommCall_FromDisplayNameSnapshot", call."CommCall_ToDisplayNameSnapshot"),
      'phoneNumber', case when call."CommCall_DirectionCode" = 'outbound' then call."CommCall_ToNumber" else call."CommCall_FromNumber" end,
      'direction', call."CommCall_DirectionCode",
      'outcome', call."CommCall_OutcomeCode",
      'startedAt', call."CommCall_StartedAt",
      'answeredAt', call."CommCall_AnsweredAt",
      'endedAt', call."CommCall_EndedAt",
      'durationSeconds', call."CommCall_DurationSeconds",
      'transferStatus', call."CommCall_TransferStatusCode",
      'transcriptStatus', call."CommCall_TranscriptStatusCode",
      'matchStatus', call."CommCall_MatchStatusCode",
      'companyId', call."CommCall_MatchedOrgID",
      'companyName', organisation."Org_Name",
      'leadId', call."CommCall_MatchedLeadID",
      'summary', coalesce(review."CRMCallReview_UserApprovedSummary", review."CRMCallReview_AISummary", call."CommCall_AISummary"),
      'callReason', review."CRMCallReview_CallReason",
      'providerEvidence', jsonb_build_object(
        'source', call."CommCall_SourceProviderCode",
        'providerCallId', call."CommCall_ProviderCallID",
        'correlationId', call."CommCall_CorrelationID"
      ),
      'route', '/crm/phone-calls/' || call."CommCall_ID"::text
    ) row_data, call."CommCall_StartedAt" started_at
    from public."Comm_CallLogs" call
    left join public."CRM_CallReviews" review on review."CRMCallReview_CommCallID" = call."CommCall_ID"
    left join public."Org_Master" organisation on organisation."Org_id" = call."CommCall_MatchedOrgID"
    where call."CommCall_CompanyID" = p_company_id
      and (
        v_term is null or concat_ws(' ', call."CommCall_FromDisplayNameSnapshot", call."CommCall_ToDisplayNameSnapshot",
          call."CommCall_FromNumber", call."CommCall_ToNumber", organisation."Org_Name",
          review."CRMCallReview_CallReason", review."CRMCallReview_AISummary") ilike '%' || v_term || '%'
      )
    order by call."CommCall_StartedAt" desc nulls last, call."CommCall_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) calls;
  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_domain_phone_calls(uuid, text, integer) from public, anon, authenticated;

create or replace function public.multideck_dexter_action_review_phone_call(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  return public._multideck_phone_call_review_action_for_actor(
    p_company_id,
    p_user_id,
    (p_arguments ->> 'call_id')::uuid,
    (p_arguments ->> 'target_id')::uuid,
    p_arguments ->> 'decision',
    nullif(p_arguments ->> 'edited_title', ''),
    nullif(p_arguments ->> 'scheduled_date', '')::date,
    nullif(p_arguments ->> 'priority', ''),
    p_arguments ->> 'reason'
  );
end;
$$;

revoke all on function public.multideck_dexter_action_review_phone_call(uuid, uuid, jsonb) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt", "AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON", "AIDexterDomain_ScopeStrategy"
)
values (
  'phone_calls', 'Phone calls',
  'Tenant phone calls with provider evidence, match state, transcript availability, summaries and reviewed follow-up state.',
  'multideck_dexter_domain_phone_calls', 22, true, now(), '["CRM.PhoneCalls.Read"]'::jsonb,
  '["call_metadata","contact_data","transcript","ai_assistance"]'::jsonb, 'company'
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
)
values (
  'review_phone_call_suggestion', 'phone_calls', 'Review phone call suggestion',
  'Approve, edit or dismiss one exact generated call suggestion. Approved task suggestions create a linked To Do task.',
  'multideck_dexter_action_review_phone_call',
  '{"type":"object","properties":{"target_id":{"type":"string"},"call_id":{"type":"string"},"decision":{"type":"string","enum":["approve","dismiss"]},"edited_title":{"type":["string","null"]},"scheduled_date":{"type":["string","null"]},"priority":{"type":["string","null"],"enum":["low","medium","high","urgent",null]},"reason":{"type":"string"}},"required":["target_id","call_id","decision","edited_title","scheduled_date","priority","reason"],"additionalProperties":false}'::jsonb,
  22, true, now(), '["CRM.PhoneCalls.Review"]'::jsonb,
  'phone_call_review', 'company', false
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now(),
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description", "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder", "AIDexterWatchCapability_UpdatedAt",
  "AIDexterWatchCapability_RequiredPermissionsJSON"
)
values (
  'phone_calls', 'Phone calls',
  'Phone call outcomes, transcript readiness, transfer acceptance, CRM match state and follow-up suggestions.',
  '["outcome","transferStatus","transcriptStatus","matchStatus","companyName","callReason","pendingActionCount"]'::jsonb,
  22, now(), '["CRM.PhoneCalls.Read"]'::jsonb
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_UpdatedAt" = now(),
  "AIDexterWatchCapability_RequiredPermissionsJSON" = excluded."AIDexterWatchCapability_RequiredPermissionsJSON";

create or replace function public._multideck_phone_call_watch_source_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_old jsonb := '{}'::jsonb; v_new jsonb; v_company_name text; v_reason text; v_actions integer;
begin
  if new."CommCall_CompanyID" is null then return new; end if;
  if not exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = new."CommCall_CompanyID"
      and watch."AIDexterWatch_CapabilityCode" = 'phone_calls'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = new."CommCall_ID")
  ) then return new; end if;
  select organisation."Org_Name", review."CRMCallReview_CallReason",
    count(action."CRMCallAction_ID") filter (where action."CRMCallAction_DecisionStatus" = 'pending')::integer
  into v_company_name, v_reason, v_actions
  from public."CRM_CallReviews" review
  left join public."CRM_CallActionCandidates" action on action."CRMCallAction_CallReviewID" = review."CRMCallReview_ID"
  left join public."Org_Master" organisation on organisation."Org_id" = new."CommCall_MatchedOrgID"
  where review."CRMCallReview_CommCallID" = new."CommCall_ID"
  group by organisation."Org_Name", review."CRMCallReview_CallReason";
  if tg_op = 'UPDATE' then
    v_old := jsonb_build_object(
      'outcome', old."CommCall_OutcomeCode", 'transferStatus', old."CommCall_TransferStatusCode",
      'transcriptStatus', old."CommCall_TranscriptStatusCode", 'matchStatus', old."CommCall_MatchStatusCode"
    );
  end if;
  v_new := jsonb_build_object(
    'outcome', new."CommCall_OutcomeCode", 'transferStatus', new."CommCall_TransferStatusCode",
    'transcriptStatus', new."CommCall_TranscriptStatusCode", 'matchStatus', new."CommCall_MatchStatusCode",
    'companyName', v_company_name, 'callReason', v_reason, 'pendingActionCount', coalesce(v_actions, 0)
  );
  if v_old is not distinct from v_new then return new; end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  ) values (
    new."CommCall_CompanyID", 'phone_calls', 'Comm_CallLogs', new."CommCall_ID", v_old, v_new
  );
  return new;
end;
$$;

drop trigger if exists "TR_Comm_CallLogs_dexter_watch" on public."Comm_CallLogs";
create trigger "TR_Comm_CallLogs_dexter_watch"
after insert or update of "CommCall_OutcomeCode", "CommCall_TransferStatusCode", "CommCall_TranscriptStatusCode", "CommCall_MatchStatusCode"
on public."Comm_CallLogs"
for each row execute function public._multideck_phone_call_watch_source_change();

create or replace function public._multideck_phone_call_action_watch_source_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_call_id uuid; v_company_id uuid; v_pending integer; v_old jsonb; v_new jsonb;
begin
  select call."CommCall_ID", call."CommCall_CompanyID"
  into v_call_id, v_company_id
  from public."CRM_CallReviews" review
  join public."Comm_CallLogs" call on call."CommCall_ID" = review."CRMCallReview_CommCallID"
  where review."CRMCallReview_ID" = new."CRMCallAction_CallReviewID";
  if v_call_id is null or not exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'phone_calls'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_call_id)
  ) then return new; end if;
  select count(*) filter (where action."CRMCallAction_DecisionStatus" = 'pending')::integer
  into v_pending from public."CRM_CallActionCandidates" action
  where action."CRMCallAction_CallReviewID" = new."CRMCallAction_CallReviewID";
  v_old := jsonb_build_object(
    'pendingActionCount', greatest(0,
      coalesce(v_pending, 0)
      - case when new."CRMCallAction_DecisionStatus" = 'pending' then 1 else 0 end
      + case when tg_op = 'UPDATE' and old."CRMCallAction_DecisionStatus" = 'pending' then 1 else 0 end
    ),
    'actionStatus', case when tg_op = 'UPDATE' then old."CRMCallAction_DecisionStatus" else null end
  );
  v_new := jsonb_build_object(
    'pendingActionCount', coalesce(v_pending, 0),
    'actionStatus', new."CRMCallAction_DecisionStatus"
  );
  if v_old is not distinct from v_new then return new; end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  ) values (v_company_id, 'phone_calls', 'CRM_CallActionCandidates', v_call_id, v_old, v_new);
  return new;
end;
$$;

drop trigger if exists "TR_CRM_CallActionCandidates_dexter_watch" on public."CRM_CallActionCandidates";
create trigger "TR_CRM_CallActionCandidates_dexter_watch"
after insert or update of "CRMCallAction_DecisionStatus" on public."CRM_CallActionCandidates"
for each row execute function public._multideck_phone_call_action_watch_source_change();

create or replace function public._multideck_phone_call_review_watch_source_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_call_id uuid; v_company_id uuid;
begin
  if old."CRMCallReview_CallReason" is not distinct from new."CRMCallReview_CallReason" then return new; end if;
  select call."CommCall_ID", call."CommCall_CompanyID"
  into v_call_id, v_company_id from public."Comm_CallLogs" call
  where call."CommCall_ID" = new."CRMCallReview_CommCallID";
  if v_call_id is null or not exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'phone_calls'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_call_id)
  ) then return new; end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  ) values (
    v_company_id, 'phone_calls', 'CRM_CallReviews', v_call_id,
    jsonb_build_object('callReason', old."CRMCallReview_CallReason"),
    jsonb_build_object('callReason', new."CRMCallReview_CallReason")
  );
  return new;
end;
$$;

drop trigger if exists "TR_CRM_CallReviews_dexter_watch" on public."CRM_CallReviews";
create trigger "TR_CRM_CallReviews_dexter_watch"
after update of "CRMCallReview_CallReason" on public."CRM_CallReviews"
for each row execute function public._multideck_phone_call_review_watch_source_change();

create or replace function public.multideck_phone_call_purge_expired(
  p_company_id uuid,
  p_limit integer default 100
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode = '42501'; end if;
  with expired as (
    select call."CommCall_ID" from public."Comm_CallLogs" call
    where call."CommCall_CompanyID" = p_company_id
      and call."CommCall_RetentionUntil" is not null
      and call."CommCall_RetentionUntil" <= now()
      and call."CommCall_TranscriptStatusCode" <> 'expired'
    order by call."CommCall_RetentionUntil"
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  ), deleted_segments as (
    delete from public."Comm_CallTranscriptSegments" segment
    using expired where segment."CommCallSeg_CallID" = expired."CommCall_ID"
    returning segment."CommCallSeg_CallID"
  ), cleared as (
    update public."Comm_CallLogs" call
    set "CommCall_TranscriptText" = null,
        "CommCall_AISummary" = null,
        "CommCall_AIActionItemsJSON" = '[]'::jsonb,
        "CommCall_RecordingStorageBucket" = null,
        "CommCall_RecordingStoragePath" = null,
        "CommCall_TranscriptStatusCode" = 'expired',
        "CommCall_RecordingStatusCode" = 'expired',
        "CommCall_UpdatedAt" = now()
    from expired where call."CommCall_ID" = expired."CommCall_ID"
    returning call."CommCall_ID"
  ) select count(*) into v_count from cleared;
  return v_count;
end;
$$;

revoke all on function public.multideck_phone_call_purge_expired(uuid, integer) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_purge_expired(uuid, integer) to service_role;

commit;
