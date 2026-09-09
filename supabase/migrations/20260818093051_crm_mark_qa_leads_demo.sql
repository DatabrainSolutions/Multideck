begin;

-- Older browser-verification submissions predate the explicit isDemo marker.
-- Mark only deterministic QA addresses so the cleanup remains safe if this
-- migration is replayed in another isolated tenant project.
update public."CRM_Leads"
set
  "CRMLead_MetadataJSON" = coalesce("CRMLead_MetadataJSON", '{}'::jsonb)
    || jsonb_build_object('isDemo', true, 'demoReason', 'automated-qa-address'),
  "CRMLead_UpdatedAt" = now()
where not "CRMLead_IsDeleted"
  and lower(coalesce("CRMLead_Email", '')) ~ '(^qr-live-qa-[^@]+@example\.com$|^codex-lead-[^@]+@example\.test$)';

commit;
