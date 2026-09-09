begin;

-- A bounded, tenant-checked picker for the manual recovery path. The browser
-- never receives bookings from another physical workspace, even though the
-- Edge Function calls this through its service-role client.
create or replace function public.multideck_inbox_search_bookings(
  p_company_id uuid,
  p_user_id uuid,
  p_search text default null,
  p_take integer default 12
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_search text := nullif(btrim(p_search), '');
  v_take integer := greatest(1, least(coalesce(p_take, 12), 20));
  v_result jsonb;
begin
  if p_company_id is null or p_user_id is null
     or not public._multideck_dexter_has_permission(p_user_id, 'Bookings.Read') then
    raise exception 'You do not have permission to search bookings.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item."Job_ID",
    'reference', item."Booking_Reference",
    'customer', item."Customer_Name",
    'route', item."Route",
    'status', item."Status",
    'updatedAt', item."Updated_At"
  ) order by item.rank_order, item."Updated_At" desc nulls last, item."Booking_Reference"), '[]'::jsonb)
  into v_result
  from (
    select booking.*,
      case
        when v_search is not null and lower(booking."Booking_Reference") = lower(v_search) then 0
        when v_search is not null and lower(booking."Booking_Reference") like lower(v_search) || '%' then 1
        else 2
      end as rank_order
    from public."App_Live_Bookings" booking
    join public."Job_Header" job on job."Job_ID" = booking."Job_ID"
    join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    where office."Company_ID" = p_company_id
      and not coalesce(job."Job_IsDeleted", false)
      and (
        v_search is null
        or strpos(lower(concat_ws(' ',
          booking."Booking_Reference", booking."Job_Reference", booking."Customer_Name",
          booking."Route", booking."Customer_Reference", booking."Carrier"
        )), lower(v_search)) > 0
      )
    order by rank_order, booking."Updated_At" desc nulls last, booking."Booking_Reference"
    limit v_take
  ) item;

  return v_result;
end;
$$;

-- Manual matching intentionally attaches only the source document. It never
-- applies OCR-extracted field changes that were prepared without a safe match.
create or replace function public.multideck_inbox_attach_suggested_document(
  p_company_id uuid,
  p_user_id uuid,
  p_suggestion_id uuid,
  p_booking_id uuid
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_suggestion public."AI_InboxSuggestedUpdates";
  v_job public."Job_Header";
  v_booking_label text;
  v_document_id uuid;
  v_existing_document_id uuid;
  v_version integer;
  v_now timestamptz := now();
begin
  if p_company_id is null or p_user_id is null or p_suggestion_id is null or p_booking_id is null then
    raise exception 'Choose a valid suggestion and booking.' using errcode = '22023';
  end if;
  if not public._multideck_dexter_has_permission(p_user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(p_user_id, 'Email.AIRead')
     or not public._multideck_dexter_has_permission(p_user_id, 'Bookings.Read')
     or not public._multideck_dexter_has_permission(p_user_id, 'Bookings.Write') then
    raise exception 'You do not have permission to add this document to a booking.' using errcode = '42501';
  end if;

  select suggestion.* into v_suggestion
  from public."AI_InboxSuggestedUpdates" suggestion
  where suggestion."AIInboxSuggestion_ID" = p_suggestion_id
    and suggestion."AIInboxSuggestion_CompanyID" = p_company_id
    and suggestion."AIInboxSuggestion_OwnerUserID" = p_user_id
  for update;
  if not found then raise exception 'That suggestion was not found.' using errcode = 'P0002'; end if;
  if v_suggestion."AIInboxSuggestion_StatusCode" = 'applied' then
    return jsonb_build_object(
      'status', 'already_applied', 'suggestionId', p_suggestion_id,
      'bookingId', v_suggestion."AIInboxSuggestion_TargetID",
      'documentId', v_suggestion."AIInboxSuggestion_AppliedJobDocumentID"
    );
  end if;
  if v_suggestion."AIInboxSuggestion_StatusCode" <> 'needs_match' then
    raise exception 'This document no longer needs a booking.' using errcode = '40001';
  end if;
  if v_suggestion."AIInboxSuggestion_StoredObjectID" is null then
    raise exception 'The source document is no longer available.' using errcode = 'P0002';
  end if;

  select job.* into v_job
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = p_booking_id
    and office."Company_ID" = p_company_id
    and not coalesce(job."Job_IsDeleted", false)
  for update of job;
  if not found then raise exception 'That booking is no longer available.' using errcode = 'P0002'; end if;

  v_booking_label := coalesce(nullif(btrim(v_job."Job_BookingReference"), ''), 'JOB-' || v_job."Job_Number");

  select attachment."CommAttachment_JobDocumentID" into v_existing_document_id
  from public."Comm_MessageAttachments" attachment
  where attachment."CommAttachment_ID" = v_suggestion."AIInboxSuggestion_AttachmentID"
  for update;
  if v_existing_document_id is not null then
    raise exception 'This email attachment is already linked to a booking document.' using errcode = '40001';
  end if;

  select coalesce(max(document."JobDoc_VersionNo"), 0) + 1 into v_version
  from public."Job_Documents" document
  where document."JobDoc_JobID" = p_booking_id
    and lower(document."JobDoc_DocTypeCodeSnapshot") = lower(v_suggestion."AIInboxSuggestion_DocumentTypeCode")
    and not document."JobDoc_IsDeleted";

  update public."Job_Documents" set
    "JobDoc_IsCurrentVersion" = false,
    "JobDoc_UpdatedAt" = v_now,
    "JobDoc_UpdatedBy" = p_user_id
  where "JobDoc_JobID" = p_booking_id
    and lower("JobDoc_DocTypeCodeSnapshot") = lower(v_suggestion."AIInboxSuggestion_DocumentTypeCode")
    and "JobDoc_IsCurrentVersion"
    and not "JobDoc_IsDeleted";

  insert into public."Job_Documents" (
    "JobDoc_JobID", "JobDoc_DocTypeCodeSnapshot", "JobDoc_Title", "JobDoc_Description",
    "JobDoc_Status", "JobDoc_Source", "JobDoc_FileName", "JobDoc_FileMimeType",
    "JobDoc_FileSizeBytes", "JobDoc_VersionNo", "JobDoc_IsCurrentVersion",
    "JobDoc_ReceivedAt", "JobDoc_MetadataJSON", "JobDoc_CreatedBy", "JobDoc_UpdatedBy",
    "JobDoc_StoredObjectID"
  ) select
    p_booking_id, v_suggestion."AIInboxSuggestion_DocumentTypeCode",
    case when v_suggestion."AIInboxSuggestion_DocumentTypeCode" = 'booking_confirmation'
      then 'Booking confirmation' else 'Commercial invoice' end,
    'Received through Inbox and added to a booking after manual review.',
    'received', 'inbox_suggestion', v_suggestion."AIInboxSuggestion_SourceFileName",
    stored."DOCStoredObject_MimeType", stored."DOCStoredObject_FileSizeBytes",
    v_version, true, v_now,
    jsonb_build_object(
      'suggestionId', p_suggestion_id,
      'messageId', v_suggestion."AIInboxSuggestion_MessageID",
      'attachmentId', v_suggestion."AIInboxSuggestion_AttachmentID",
      'matchMethod', 'manual_selection'
    ),
    p_user_id, p_user_id, stored."DOCStoredObject_ID"
  from public."DOC_StoredObjects" stored
  where stored."DOCStoredObject_ID" = v_suggestion."AIInboxSuggestion_StoredObjectID"
    and stored."DOCStoredObject_StatusCode" = 'active'
  returning "JobDoc_ID" into v_document_id;
  if v_document_id is null then raise exception 'The source document is no longer available.' using errcode = 'P0002'; end if;

  update public."Comm_MessageAttachments" set "CommAttachment_JobDocumentID" = v_document_id
  where "CommAttachment_ID" = v_suggestion."AIInboxSuggestion_AttachmentID";

  update public."AI_InboxSuggestedUpdates" set
    "AIInboxSuggestion_TargetTypeCode" = 'booking',
    "AIInboxSuggestion_TargetID" = p_booking_id,
    "AIInboxSuggestion_TargetLabel" = v_booking_label,
    "AIInboxSuggestion_MatchMethodCode" = 'manual_selection',
    "AIInboxSuggestion_MatchConfidence" = null,
    "AIInboxSuggestion_StatusCode" = 'applied',
    "AIInboxSuggestion_AppliedAt" = v_now,
    "AIInboxSuggestion_AppliedByUserID" = p_user_id,
    "AIInboxSuggestion_AppliedJobDocumentID" = v_document_id,
    "AIInboxSuggestion_UpdatedAt" = v_now
  where "AIInboxSuggestion_ID" = p_suggestion_id;

  insert into public."AI_InboxSuggestionAudit" (
    "AIInboxAudit_SuggestionID", "AIInboxAudit_CompanyID", "AIInboxAudit_UserID",
    "AIInboxAudit_EventCode", "AIInboxAudit_DetailsJSON"
  ) values (
    p_suggestion_id, p_company_id, p_user_id, 'manually_attached',
    jsonb_build_object('bookingId', p_booking_id, 'documentId', v_document_id)
  );

  insert into public."AI_DexterActionAudit" (
    "AIDexterAudit_CompanyID", "AIDexterAudit_UserID", "AIDexterAudit_ActionCode",
    "AIDexterAudit_AccessMode", "AIDexterAudit_ArgumentsJSON", "AIDexterAudit_ResultJSON"
  ) values (
    p_company_id, p_user_id, 'attach_inbox_suggested_document', 'approve',
    jsonb_build_object('suggestion_id', p_suggestion_id, 'booking_id', p_booking_id),
    jsonb_build_object('status', 'applied', 'booking_id', p_booking_id, 'document_id', v_document_id)
  );

  insert into public."Comm_Notifications" (
    "CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable",
    "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MetadataJSON", "CommNotif_CreatedBy"
  ) values (
    p_user_id, 'Inbox document added to booking',
    format('%s was added to %s.', v_suggestion."AIInboxSuggestion_SourceFileName", v_booking_label),
    'AI_InboxSuggestedUpdates', p_suggestion_id, 'inbox_suggestion',
    jsonb_build_object('suggestion_id', p_suggestion_id, 'booking_id', p_booking_id, 'document_id', v_document_id),
    p_user_id
  );

  return jsonb_build_object(
    'status', 'applied', 'suggestionId', p_suggestion_id,
    'bookingId', p_booking_id, 'bookingLabel', v_booking_label,
    'documentId', v_document_id
  );
end;
$$;

create or replace function public.multideck_dexter_action_attach_inbox_suggested_document(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
begin
  return public.multideck_inbox_attach_suggested_document(
    p_company_id,
    p_user_id,
    nullif(p_arguments->>'suggestion_id', '')::uuid,
    nullif(p_arguments->>'booking_id', '')::uuid
  );
end;
$$;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function", "AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'attach_inbox_suggested_document', 'inbox_suggestions', 'Add inbox document to booking',
  'Attach one unmatched inbox document to an exact booking selected by the operator. OCR-extracted field changes are not applied.',
  'multideck_dexter_action_attach_inbox_suggested_document',
  '{"type":"object","properties":{"suggestion_id":{"type":"string"},"booking_id":{"type":"string"},"reason":{"type":"string"}},"required":["suggestion_id","booking_id","reason"],"additionalProperties":false}'::jsonb,
  581, true, now(), '["Email.Read","Email.AIRead","Bookings.Read","Bookings.Write"]'::jsonb,
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

revoke all on function public.multideck_inbox_search_bookings(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_inbox_attach_suggested_document(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_attach_inbox_suggested_document(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.multideck_inbox_search_bookings(uuid, uuid, text, integer) to service_role;
grant execute on function public.multideck_inbox_attach_suggested_document(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.multideck_dexter_action_attach_inbox_suggested_document(uuid, uuid, jsonb) to service_role;

commit;
