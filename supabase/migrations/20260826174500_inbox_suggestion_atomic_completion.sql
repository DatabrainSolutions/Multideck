-- Finish extraction as one database transaction. A worker that reaches its
-- runtime limit must never leave a visible suggestion without its fields,
-- audit event, notification, or completed job state.

create or replace function public.multideck_inbox_complete_suggestion_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_suggestion jsonb,
  p_fields jsonb
) returns uuid
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public."AI_InboxProcessingJobs";
  v_suggestion_id uuid := nullif(p_suggestion->>'id', '')::uuid;
  v_status text := nullif(p_suggestion->>'status', '');
  v_target_id uuid := nullif(p_suggestion->>'targetId', '')::uuid;
  v_target_label text := nullif(p_suggestion->>'targetLabel', '');
  v_match_confidence numeric := nullif(p_suggestion->>'matchConfidence', '')::numeric;
  v_field_count integer := 0;
  v_now timestamptz := now();
begin
  if p_job_id is null or p_lease_token is null or v_suggestion_id is null
     or jsonb_typeof(coalesce(p_fields, '[]'::jsonb)) <> 'array' then
    raise exception 'The extracted Inbox suggestion is invalid.' using errcode = '22023';
  end if;

  select job.* into v_job
  from public."AI_InboxProcessingJobs" job
  where job."AIInboxJob_ID" = p_job_id
    and job."AIInboxJob_StatusCode" = 'processing'
    and job."AIInboxJob_LeaseToken" = p_lease_token
  for update;
  if not found then
    raise exception 'The Inbox suggestion job lease is no longer active.' using errcode = '40001';
  end if;

  if v_suggestion_id <> p_job_id
     or nullif(p_suggestion->>'companyId', '')::uuid <> v_job."AIInboxJob_CompanyID"
     or nullif(p_suggestion->>'ownerUserId', '')::uuid <> v_job."AIInboxJob_OwnerUserID"
     or nullif(p_suggestion->>'mailboxId', '')::uuid <> v_job."AIInboxJob_MailboxID"
     or nullif(p_suggestion->>'messageId', '')::uuid <> v_job."AIInboxJob_MessageID"
     or nullif(p_suggestion->>'attachmentId', '')::uuid <> v_job."AIInboxJob_AttachmentID" then
    raise exception 'The extracted Inbox suggestion does not match its source job.' using errcode = '22023';
  end if;

  insert into public."AI_InboxSuggestedUpdates" (
    "AIInboxSuggestion_ID", "AIInboxSuggestion_CompanyID", "AIInboxSuggestion_OwnerUserID",
    "AIInboxSuggestion_MailboxID", "AIInboxSuggestion_MessageID", "AIInboxSuggestion_AttachmentID",
    "AIInboxSuggestion_JobID", "AIInboxSuggestion_DocumentTypeCode", "AIInboxSuggestion_TargetTypeCode",
    "AIInboxSuggestion_TargetID", "AIInboxSuggestion_TargetLabel", "AIInboxSuggestion_MatchMethodCode",
    "AIInboxSuggestion_MatchConfidence", "AIInboxSuggestion_StatusCode", "AIInboxSuggestion_SourceFileName",
    "AIInboxSuggestion_Summary", "AIInboxSuggestion_ExtractedJSON", "AIInboxSuggestion_EvidenceJSON",
    "AIInboxSuggestion_ModelJSON", "AIInboxSuggestion_StoredObjectID",
    "AIInboxSuggestion_CreatedAt", "AIInboxSuggestion_UpdatedAt"
  ) values (
    v_suggestion_id, v_job."AIInboxJob_CompanyID", v_job."AIInboxJob_OwnerUserID",
    v_job."AIInboxJob_MailboxID", v_job."AIInboxJob_MessageID", v_job."AIInboxJob_AttachmentID",
    p_job_id, p_suggestion->>'documentType', nullif(p_suggestion->>'targetType', ''),
    v_target_id, v_target_label, nullif(p_suggestion->>'matchMethod', ''),
    v_match_confidence, v_status, left(p_suggestion->>'sourceFileName', 260),
    p_suggestion->>'summary', coalesce(p_suggestion->'extracted', '{}'::jsonb),
    coalesce(p_suggestion->'evidence', '{}'::jsonb), coalesce(p_suggestion->'model', '{}'::jsonb),
    nullif(p_suggestion->>'storedObjectId', '')::uuid, v_now, v_now
  );

  insert into public."AI_InboxSuggestedUpdateFields" (
    "AIInboxField_ID", "AIInboxField_SuggestionID", "AIInboxField_TargetRecordTypeCode",
    "AIInboxField_TargetRecordID", "AIInboxField_FieldCode", "AIInboxField_Label",
    "AIInboxField_CurrentValueJSON", "AIInboxField_ProposedValueJSON", "AIInboxField_EvidenceJSON",
    "AIInboxField_Confidence", "AIInboxField_IsSelectedByDefault", "AIInboxField_SortOrder"
  )
  select
    nullif(field->>'id', '')::uuid, v_suggestion_id, field->>'targetType',
    nullif(field->>'targetId', '')::uuid, field->>'code', field->>'label',
    coalesce(field->'current', 'null'::jsonb), coalesce(field->'proposed', 'null'::jsonb),
    jsonb_build_object('source', 'document_ocr', 'extractedValue', field->'proposed'),
    (field->>'confidence')::numeric, coalesce((field->>'selectedByDefault')::boolean, true),
    coalesce((field->>'sortOrder')::integer, 100)
  from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) field;
  get diagnostics v_field_count = row_count;

  if v_status = 'ready' and v_field_count = 0 then
    raise exception 'A ready Inbox suggestion must include at least one reviewable field.' using errcode = '22023';
  end if;

  insert into public."AI_InboxSuggestionAudit" (
    "AIInboxAudit_SuggestionID", "AIInboxAudit_CompanyID", "AIInboxAudit_UserID",
    "AIInboxAudit_EventCode", "AIInboxAudit_DetailsJSON"
  ) values (
    v_suggestion_id, v_job."AIInboxJob_CompanyID", v_job."AIInboxJob_OwnerUserID", v_status,
    jsonb_build_object('documentType', p_suggestion->>'documentType', 'targetId', v_target_id, 'fieldCount', v_field_count)
  );

  if v_status in ('ready', 'needs_match') then
    insert into public."Comm_Notifications" (
      "CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable",
      "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MessageID",
      "CommNotif_MetadataJSON", "CommNotif_CreatedBy"
    ) values (
      v_job."AIInboxJob_OwnerUserID",
      case when v_status = 'ready' then 'Booking update ready to review' else 'Inbox document needs a match' end,
      case when v_status = 'ready'
        then format('%s changes were found for %s.', v_field_count, coalesce(v_target_label, 'the booking'))
        else format('Review %s in Suggested updates.', left(p_suggestion->>'sourceFileName', 260)) end,
      'AI_InboxSuggestedUpdates', v_suggestion_id, 'inbox_suggestion', v_job."AIInboxJob_MessageID",
      jsonb_build_object('suggestion_id', v_suggestion_id, 'booking_id', v_target_id, 'route', '/inbox?view=suggested'),
      v_job."AIInboxJob_OwnerUserID"
    );
  end if;

  update public."AI_InboxProcessingJobs" set
    "AIInboxJob_StatusCode" = 'completed',
    "AIInboxJob_DocumentTypeCode" = p_suggestion->>'documentType',
    "AIInboxJob_ClassificationMethod" = p_suggestion->>'classificationMethod',
    "AIInboxJob_ClassificationConfidence" = nullif(p_suggestion->>'classificationConfidence', '')::numeric,
    "AIInboxJob_FailureCode" = null, "AIInboxJob_FailureMessage" = null,
    "AIInboxJob_LeaseToken" = null, "AIInboxJob_LeaseExpiresAt" = null,
    "AIInboxJob_CompletedAt" = v_now, "AIInboxJob_UpdatedAt" = v_now
  where "AIInboxJob_ID" = p_job_id;

  return v_suggestion_id;
end;
$$;

revoke all on function public.multideck_inbox_complete_suggestion_job(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.multideck_inbox_complete_suggestion_job(uuid, uuid, jsonb, jsonb)
  to service_role;
