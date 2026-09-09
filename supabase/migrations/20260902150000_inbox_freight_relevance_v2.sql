-- Deploy the v2 email-watch-worker before applying this migration. Revisit
-- only existing unresolved suggestions, once, through the normal leased queue.
-- This does not scan historical email attachments or change reviewed records.
begin;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = 'Reviewable freight booking and invoice updates with source-backed freight evidence or an exact verified job reference. Unrelated purchases and unconfirmed documents remain in the original Inbox.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'inbox_suggestions';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'New, applied or dismissed freight-qualified Inbox suggestions. Filtered documents create no suggestion or watch signal. Evaluation uses persisted events, not recurring model calls.',
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'inbox_suggestions';

update public."AI_InboxProcessingJobs" job
set "AIInboxJob_StatusCode" = 'queued',
    "AIInboxJob_AttemptCount" = 0,
    "AIInboxJob_AvailableAt" = now(),
    "AIInboxJob_LeaseToken" = null,
    "AIInboxJob_LeaseExpiresAt" = null,
    "AIInboxJob_FailureCode" = null,
    "AIInboxJob_FailureMessage" = null,
    "AIInboxJob_StartedAt" = null,
    "AIInboxJob_CompletedAt" = null,
    "AIInboxJob_UpdatedAt" = now()
from public."AI_InboxSuggestedUpdates" suggestion
where suggestion."AIInboxSuggestion_JobID" = job."AIInboxJob_ID"
  and suggestion."AIInboxSuggestion_CompanyID" = job."AIInboxJob_CompanyID"
  and suggestion."AIInboxSuggestion_OwnerUserID" = job."AIInboxJob_OwnerUserID"
  and suggestion."AIInboxSuggestion_DocumentTypeCode" in ('commercial_invoice', 'booking_confirmation')
  and suggestion."AIInboxSuggestion_StatusCode" in ('needs_match', 'ready', 'no_changes')
  and suggestion."AIInboxSuggestion_ModelJSON"->>'relevanceVersion' is distinct from 'freight-relevance-v2'
  and job."AIInboxJob_StatusCode" = 'completed'
  and exists (
    select 1 from public."AI_InboxSuggestionSettings" setting
    where setting."AIInboxSetting_MailboxID" = job."AIInboxJob_MailboxID"
      and setting."AIInboxSetting_CompanyID" = job."AIInboxJob_CompanyID"
      and setting."AIInboxSetting_EnabledByUserID" = job."AIInboxJob_OwnerUserID"
      and setting."AIInboxSetting_IsEnabled" = true
  );

commit;
