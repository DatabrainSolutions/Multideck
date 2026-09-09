create role anon;
create role authenticated;
create role service_role;
create schema auth;

create function auth.role() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), current_user)
$$;

create table public."cmp_Company" (
  "Company_ID" uuid primary key
);
create table public."cmp_Users" (
  "User_ID" uuid primary key,
  "Company_ID" uuid,
  "User_AccessStatus" text default 'active',
  "CanReadPhoneCalls" boolean default false,
  "CanReviewPhoneCalls" boolean default false
);
create table public."Org_Master" (
  "Org_id" uuid primary key,
  "Org_Name" text,
  "OwnerCompanyID" uuid
);
create table public."Org_Contacts" (
  "OrgContact_ID" uuid primary key,
  "Org_ID" uuid
);
create table public."CRM_Leads" (
  "CRMLead_ID" uuid primary key,
  "CRMLead_OwnerUserID" uuid,
  "CRMLead_OrgID" uuid,
  "CRMLead_IsDeleted" boolean default false
);
create table public."Comm_CallLogs" (
  "CommCall_ID" uuid primary key,
  "CommCall_CompanyID" uuid,
  "CommCall_EditVersion" integer default 1,
  "CommCall_UpdatedAt" timestamptz default now(),
  "CommCall_UpdatedBy" uuid,
  "CommCall_MatchedOrgID" uuid,
  "CommCall_MatchedContactID" uuid,
  "CommCall_MatchedLeadID" uuid,
  "CommCall_MatchStatusCode" text default 'unmatched',
  "CommCall_MatchMethodCode" text,
  "CommCall_MatchConfidence" numeric,
  "CommCall_FromDisplayNameSnapshot" text,
  "CommCall_ToDisplayNameSnapshot" text,
  "CommCall_FromNumber" text,
  "CommCall_ToNumber" text,
  "CommCall_DirectionCode" text,
  "CommCall_OutcomeCode" text,
  "CommCall_StartedAt" timestamptz,
  "CommCall_AnsweredAt" timestamptz,
  "CommCall_EndedAt" timestamptz,
  "CommCall_DurationSeconds" integer,
  "CommCall_TransferStatusCode" text default 'not_requested',
  "CommCall_TranscriptStatusCode" text default 'pending',
  "CommCall_AIDisclosureStatusCode" text default 'unknown',
  "CommCall_RecordingConsentStatusCode" text default 'unknown',
  "CommCall_TranscriptionConsentStatusCode" text default 'unknown',
  "CommCall_ConsentDisclosureVersion" text,
  "CommCall_ConsentDisclosedAt" timestamptz,
  "CommCall_ConsentSourceProviderCode" text,
  "CommCall_ConsentSourceEventID" uuid,
  "CommCall_RecordingStatusCode" text default 'unknown',
  "CommCall_AISummary" text,
  "CommCall_SourceProviderCode" text,
  "CommCall_ProviderCallID" text,
  "CommCall_CorrelationID" uuid,
  "CommCall_CreatedAt" timestamptz default now()
);
create table public."CRM_CallReviews" (
  "CRMCallReview_ID" uuid primary key default gen_random_uuid(),
  "CRMCallReview_CommCallID" uuid unique,
  "CRMCallReview_CompanyID" uuid,
  "CRMCallReview_EditVersion" integer default 1,
  "CRMCallReview_UpdatedAt" timestamptz default now(),
  "CRMCallReview_UpdatedBy" uuid,
  "CRMCallReview_UserApprovedSummary" text,
  "CRMCallReview_AISummary" text,
  "CRMCallReview_MeetingNotes" text,
  "CRMCallReview_CallReason" text
);
create table public."CRM_CallEntityLinks" (
  "CRMCallEntity_ID" uuid primary key default gen_random_uuid(),
  "CRMCallEntity_CallReviewID" uuid,
  "CRMCallEntity_EntityType" text,
  "CRMCallEntity_EntityValue" text,
  "CRMCallEntity_TargetTable" text,
  "CRMCallEntity_TargetID" uuid,
  "CRMCallEntity_ConfidenceScore" numeric,
  "CRMCallEntity_IsConfirmed" boolean default false,
  "CRMCallEntity_CreatedAt" timestamptz default now()
);
create table public."CRM_CallMatchCandidates" (
  "CRMCallMatch_ID" uuid primary key default gen_random_uuid(),
  "CRMCallMatch_CallReviewID" uuid,
  "CRMCallMatch_TargetID" uuid,
  "CRMCallMatch_StatusCode" text,
  "CRMCallMatch_ReviewedAt" timestamptz,
  "CRMCallMatch_ReviewedBy" uuid
);
create table public."Comm_CallAccessEvents" (
  "CommCallAccess_ID" uuid primary key default gen_random_uuid(),
  "CommCallAccess_CompanyID" uuid,
  "CommCallAccess_CallID" uuid,
  "CommCallAccess_UserID" uuid,
  "CommCallAccess_AccessTypeCode" text,
  "CommCallAccess_MetadataJSON" jsonb default '{}'::jsonb
);
create table public."Comm_CallParticipants" (
  "CommCallParticipant_ID" uuid primary key default gen_random_uuid(),
  "CommCallParticipant_CompanyID" uuid,
  "CommCallParticipant_CallID" uuid,
  "CommCallParticipant_DisplayName" text,
  "CommCallParticipant_Phone" text,
  "CommCallParticipant_TypeCode" text,
  "CommCallParticipant_JoinedAt" timestamptz,
  "CommCallParticipant_LeftAt" timestamptz,
  "CommCallParticipant_CreatedAt" timestamptz default now()
);
create table public."Comm_CallTranscriptSegments" (
  "CommCallSeg_ID" uuid primary key default gen_random_uuid(),
  "CommCallSeg_CallID" uuid,
  "CommCallSeg_SourceProviderCode" text,
  "CommCallSeg_SourceLegID" uuid,
  "CommCallSeg_ProviderSegmentID" text,
  "CommCallSeg_SourceSequenceNo" integer,
  "CommCallSeg_SequenceNo" integer,
  "CommCallSeg_StartedAt" timestamptz,
  "CommCallSeg_EndedAt" timestamptz,
  "CommCallSeg_SpeakerLabel" text,
  "CommCallSeg_SpeakerType" text,
  "CommCallSeg_StateCode" text,
  "CommCallSeg_Text" text
);
create table public."CRM_CallActionCandidates" (
  "CRMCallAction_ID" uuid primary key default gen_random_uuid(),
  "CRMCallAction_CallReviewID" uuid,
  "CRMCallAction_ActionTypeCode" text,
  "CRMCallAction_Title" text,
  "CRMCallAction_Description" text,
  "CRMCallAction_ConfidenceScore" numeric,
  "CRMCallAction_DecisionStatus" text,
  "CRMCallAction_DecisionReason" text,
  "CRMCallAction_ActionPayloadJSON" jsonb default '{}'::jsonb,
  "CRMCallAction_TodoTaskID" uuid,
  "CRMCallAction_AppliedAt" timestamptz,
  "CRMCallAction_EditVersion" integer default 1,
  "CRMCallAction_UpdatedAt" timestamptz default now(),
  "CRMCallAction_DecidedAt" timestamptz,
  "CRMCallAction_DecidedBy" uuid,
  "CRMCallAction_SourceKey" text,
  "CRMCallAction_CreatedAt" timestamptz default now()
);
create table public."CRM_CallReviewDecisions" (
  "CRMCallDecision_ID" uuid primary key default gen_random_uuid(),
  "CRMCallDecision_CallReviewID" uuid,
  "CRMCallDecision_ActionCandidateID" uuid,
  "CRMCallDecision_Decision" text,
  "CRMCallDecision_OriginalText" text,
  "CRMCallDecision_EditedText" text,
  "CRMCallDecision_Reason" text,
  "CRMCallDecision_DecidedAt" timestamptz default now(),
  "CRMCallDecision_DecidedBy" uuid
);
create table public."sys_AIDexterActions" (
  "AIDexterAction_Code" text primary key,
  "AIDexterAction_Description" text,
  "AIDexterAction_ParametersJSON" jsonb,
  "AIDexterAction_HasExternalEffect" boolean default false,
  "AIDexterAction_UpdatedAt" timestamptz default now()
);
create table public."AI_DexterWatches" (
  "AIDexterWatch_ID" uuid primary key default gen_random_uuid(),
  "AIDexterWatch_CompanyID" uuid,
  "AIDexterWatch_OwnerUserID" uuid,
  "AIDexterWatch_CapabilityCode" text,
  "AIDexterWatch_TargetID" uuid,
  "AIDexterWatch_StatusCode" text default 'active',
  "AIDexterWatch_IsArmed" boolean default true,
  "AIDexterWatch_UpdatedAt" timestamptz default now()
);
create table public."AI_DexterWatchSignals" (
  "AIDexterWatchSignal_ID" uuid primary key default gen_random_uuid(),
  "AIDexterWatchSignal_CompanyID" uuid,
  "AIDexterWatchSignal_CapabilityCode" text,
  "AIDexterWatchSignal_SourceTable" text,
  "AIDexterWatchSignal_SourceID" uuid,
  "AIDexterWatchSignal_OldJSON" jsonb,
  "AIDexterWatchSignal_NewJSON" jsonb
);
create table public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code" text primary key,
  "AIDexterWatchCapability_Description" text,
  "AIDexterWatchCapability_FieldsJSON" jsonb,
  "AIDexterWatchCapability_UpdatedAt" timestamptz
);
create table public."Comm_CallIngestionEvents" (
  "CommCallEvent_ID" uuid primary key default gen_random_uuid(),
  "CommCallEvent_CompanyID" uuid,
  "CommCallEvent_ProviderCode" text,
  "CommCallEvent_ExternalEventID" text,
  "CommCallEvent_ReceivedAt" timestamptz default now(),
  "CommCallEvent_ProcessedAt" timestamptz,
  "CommCallEvent_NextAttemptAt" timestamptz,
  "CommCallEvent_AttemptCount" integer default 0,
  "CommCallEvent_StatusCode" text,
  "CommCallEvent_ErrorCode" text,
  "CommCallEvent_ErrorMessage" text,
  "CommCallEvent_RawPayloadJSON" jsonb,
  "CommCallEvent_MetadataJSON" jsonb,
  "CommCallEvent_LeaseToken" uuid,
  "CommCallEvent_LeaseExpiresAt" timestamptz
);

create function public._multideck_crm_has_permission(p_user_id uuid, p_permission text)
returns boolean language sql stable as $$
  select exists (
    select 1 from public."cmp_Users" actor
    where actor."User_ID" = p_user_id
      and actor."User_AccessStatus" = 'active'
      and case
        when p_permission = 'CRM.PhoneCalls.Read' then actor."CanReadPhoneCalls"
        when p_permission = 'CRM.PhoneCalls.Review' then actor."CanReviewPhoneCalls"
        else false
      end
  )
$$;
create function public._multideck_phone_assert_actor(p_company_id uuid, p_user_id uuid, p_permission text)
returns void language plpgsql as $$
begin
  if not exists (
    select 1 from public."cmp_Users" actor
    where actor."User_ID" = p_user_id
      and actor."Company_ID" = p_company_id
      and actor."User_AccessStatus" = 'active'
      and public._multideck_crm_has_permission(p_user_id, p_permission)
  ) then raise exception 'denied' using errcode = '42501'; end if;
end $$;
create function public.multideck_crm_company_can_access_account(p_company_id uuid, p_org_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public."Org_Master" organisation
    where organisation."Org_id" = p_org_id
      and organisation."OwnerCompanyID" = p_company_id
  )
$$;
create function public._multideck_todo_create_for_actor(
  p_company_id uuid,
  p_user_id uuid,
  p_title text,
  p_scheduled_date date,
  p_priority text,
  p_links jsonb,
  p_record_tags jsonb,
  p_source text,
  p_source_id uuid
)
returns jsonb language sql volatile as $$
  select jsonb_build_object('id', gen_random_uuid())
$$;
create function public._multideck_dexter_context()
returns table(user_id uuid, company_id uuid) language sql stable as $$
  select
    nullif(current_setting('app.test_user_id', true), '')::uuid,
    nullif(current_setting('app.test_company_id', true), '')::uuid
$$;

insert into public."sys_AIDexterWatchCapabilities" values (
  'phone_calls', 'old', '[]'::jsonb, now()
);
insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_Description", "AIDexterAction_ParametersJSON"
) values (
  'review_phone_call_suggestion', 'old', '{}'::jsonb
);
