-- Internal decision evidence stays on the server-only processing job. No
-- broader mailbox or Dexter access is granted by this diagnostic field.
alter table public."AI_InboxProcessingJobs"
  add column if not exists "AIInboxJob_RelevanceJSON" jsonb not null default '{}'::jsonb;

comment on column public."AI_InboxProcessingJobs"."AIInboxJob_RelevanceJSON" is
  'Bounded freight relevance decision, reason and source quotes. Internal worker diagnostics; not a new Dexter data domain or watch event.';
