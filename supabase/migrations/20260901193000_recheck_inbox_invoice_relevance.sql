-- Re-evaluate only unresolved invoice suggestions under the content-aware
-- freight relevance gate. This does not scan historical mailbox attachments,
-- revisit documents the operator already applied or dismissed, or enqueue
-- unrelated files that never became a suggestion.

update public."AI_InboxProcessingJobs" job
set
  "AIInboxJob_StatusCode" = 'queued',
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
  and suggestion."AIInboxSuggestion_DocumentTypeCode" = 'commercial_invoice'
  and suggestion."AIInboxSuggestion_StatusCode" in ('needs_match', 'ready', 'no_changes')
  and job."AIInboxJob_StatusCode" = 'completed'
  and job."AIInboxJob_ClassifierVersion" = 'inbox-triage-v1'
  and job."AIInboxJob_ExtractorVersion" = 'inbox-extract-v1';
