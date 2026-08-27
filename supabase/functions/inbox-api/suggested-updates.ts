import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { cleanString, InboxHttpError, isObject } from "./core.ts"
import { mailboxIds, requirePermission, type Actor } from "./runtime.ts"

type Db = SupabaseClient<any, "public", any, any, any>
type Row = Record<string, any>

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function many<T extends Row>(query: PromiseLike<{ data: T[] | null; error: any }>, message: string) {
  const { data, error } = await query
  if (error) throw new InboxHttpError(503, message, cleanString(error.code, 80) || "database_unavailable")
  return data ?? []
}

function fieldDto(field: Row) {
  return {
    id: field.AIInboxField_ID,
    code: field.AIInboxField_FieldCode,
    label: field.AIInboxField_Label,
    currentValue: field.AIInboxField_CurrentValueJSON ?? null,
    proposedValue: field.AIInboxField_ProposedValueJSON ?? null,
    confidence: Number(field.AIInboxField_Confidence) || 0,
    selectedByDefault: field.AIInboxField_IsSelectedByDefault === true,
    appliedAt: field.AIInboxField_AppliedAt ?? null,
    evidence: isObject(field.AIInboxField_EvidenceJSON) ? field.AIInboxField_EvidenceJSON : {},
  }
}

function suggestionDto(suggestion: Row, fields: Row[], message: Row | null) {
  return {
    id: suggestion.AIInboxSuggestion_ID,
    status: suggestion.AIInboxSuggestion_StatusCode,
    documentType: suggestion.AIInboxSuggestion_DocumentTypeCode,
    targetType: suggestion.AIInboxSuggestion_TargetTypeCode ?? null,
    targetId: suggestion.AIInboxSuggestion_TargetID ?? null,
    targetLabel: suggestion.AIInboxSuggestion_TargetLabel ?? null,
    matchMethod: suggestion.AIInboxSuggestion_MatchMethodCode ?? null,
    matchConfidence: suggestion.AIInboxSuggestion_MatchConfidence === null ? null : Number(suggestion.AIInboxSuggestion_MatchConfidence),
    sourceFileName: suggestion.AIInboxSuggestion_SourceFileName,
    sourceSubject: message ? cleanString(message.CommMessage_Subject, 500) || null : null,
    sourceThreadId: message?.CommMessage_ThreadID ?? null,
    sourceMessageId: suggestion.AIInboxSuggestion_MessageID,
    sourceMailboxId: suggestion.AIInboxSuggestion_MailboxID,
    sourceAttachmentId: suggestion.AIInboxSuggestion_AttachmentID,
    summary: suggestion.AIInboxSuggestion_Summary,
    extracted: isObject(suggestion.AIInboxSuggestion_ExtractedJSON) ? suggestion.AIInboxSuggestion_ExtractedJSON : {},
    evidence: isObject(suggestion.AIInboxSuggestion_EvidenceJSON) ? suggestion.AIInboxSuggestion_EvidenceJSON : {},
    fields: fields.map(fieldDto),
    createdAt: suggestion.AIInboxSuggestion_CreatedAt,
    updatedAt: suggestion.AIInboxSuggestion_UpdatedAt,
    appliedAt: suggestion.AIInboxSuggestion_AppliedAt ?? null,
    dismissedAt: suggestion.AIInboxSuggestion_DismissedAt ?? null,
    jobDocumentId: suggestion.AIInboxSuggestion_AppliedJobDocumentID ?? null,
  }
}

export async function listSuggestedUpdates(admin: Db, actor: Actor, url: URL) {
  await requirePermission(admin, actor, "Email.Read")
  await requirePermission(admin, actor, "Email.AIRead")
  const readable = await mailboxIds(admin, actor, "read")
  if (!readable.size) return { suggestions: [] }
  const status = cleanString(url.searchParams.get("status"), 24)
  let query = admin.from("AI_InboxSuggestedUpdates").select("*")
    .eq("AIInboxSuggestion_CompanyID", actor.companyId)
    .eq("AIInboxSuggestion_OwnerUserID", actor.userId)
    .in("AIInboxSuggestion_MailboxID", [...readable])
    .order("AIInboxSuggestion_CreatedAt", { ascending: false }).limit(100)
  if (status) query = query.eq("AIInboxSuggestion_StatusCode", status)
  const suggestions = await many<Row>(query, "Suggested updates are unavailable.")
  const suggestionIds = suggestions.map((item) => item.AIInboxSuggestion_ID)
  const messageIds = [...new Set(suggestions.map((item) => item.AIInboxSuggestion_MessageID))]
  const [fields, messages] = await Promise.all([
    suggestionIds.length ? many<Row>(admin.from("AI_InboxSuggestedUpdateFields").select("*")
      .in("AIInboxField_SuggestionID", suggestionIds).order("AIInboxField_SortOrder"), "Suggested fields are unavailable.") : [],
    messageIds.length ? many<Row>(admin.from("Comm_Messages").select("CommMessage_ID,CommMessage_ThreadID,CommMessage_Subject")
      .in("CommMessage_ID", messageIds), "Source email details are unavailable.") : [],
  ])
  const fieldsBySuggestion = new Map<string, Row[]>()
  for (const field of fields) fieldsBySuggestion.set(field.AIInboxField_SuggestionID, [...(fieldsBySuggestion.get(field.AIInboxField_SuggestionID) ?? []), field])
  const messagesById = new Map(messages.map((message) => [message.CommMessage_ID, message]))
  return { suggestions: suggestions.map((suggestion) => suggestionDto(suggestion, fieldsBySuggestion.get(suggestion.AIInboxSuggestion_ID) ?? [], messagesById.get(suggestion.AIInboxSuggestion_MessageID) ?? null)) }
}

export async function suggestedUpdateSettings(admin: Db, actor: Actor) {
  await requirePermission(admin, actor, "Email.Read")
  const readable = await mailboxIds(admin, actor, "read")
  if (!readable.size) return { mailboxes: [] }
  const [mailboxes, settings] = await Promise.all([
    many<Row>(admin.from("Comm_Mailboxes").select("CommMailbox_ID,CommMailbox_Address,CommMailbox_DisplayName,CommMailbox_TypeCode")
      .in("CommMailbox_ID", [...readable]).eq("CommMailbox_IsDeleted", false), "Mailbox settings are unavailable."),
    many<Row>(admin.from("AI_InboxSuggestionSettings").select("*")
      .in("AIInboxSetting_MailboxID", [...readable]), "Suggested update settings are unavailable."),
  ])
  const byMailbox = new Map(settings.map((setting) => [setting.AIInboxSetting_MailboxID, setting]))
  return {
    mailboxes: mailboxes.map((mailbox) => {
      const setting = byMailbox.get(mailbox.CommMailbox_ID)
      return {
        mailboxId: mailbox.CommMailbox_ID,
        address: mailbox.CommMailbox_Address,
        displayName: mailbox.CommMailbox_DisplayName,
        kind: mailbox.CommMailbox_TypeCode,
        enabled: setting?.AIInboxSetting_IsEnabled === true,
        documentTypes: Array.isArray(setting?.AIInboxSetting_AllowedDocumentTypesJSON)
          ? setting.AIInboxSetting_AllowedDocumentTypesJSON : ["booking_confirmation", "commercial_invoice"],
      }
    }),
  }
}

export async function updateSuggestedUpdateSettings(admin: Db, actor: Actor, mailboxId: string, body: Row) {
  if (!isUuid(mailboxId)) throw new InboxHttpError(400, "Choose a valid mailbox.", "mailbox_invalid")
  await requirePermission(admin, actor, "Email.Connect")
  await requirePermission(admin, actor, "Email.AIRead")
  const manageable = await mailboxIds(admin, actor, "manage")
  if (!manageable.has(mailboxId)) throw new InboxHttpError(403, "You cannot change automation for this mailbox.", "mailbox_forbidden")
  const enabled = body.enabled === true
  const documentTypes = Array.isArray(body.documentTypes)
    ? body.documentTypes.map((value) => cleanString(value, 40)).filter((value) => ["booking_confirmation", "commercial_invoice"].includes(value))
    : ["booking_confirmation", "commercial_invoice"]
  if (!documentTypes.length) throw new InboxHttpError(400, "Choose at least one supported document type.", "document_types_required")
  const now = new Date().toISOString()
  const { data: current, error: currentError } = await admin
    .from("AI_InboxSuggestionSettings")
    .select("AIInboxSetting_IsEnabled,AIInboxSetting_EnabledAt")
    .eq("AIInboxSetting_MailboxID", mailboxId)
    .maybeSingle()
  if (currentError) throw new InboxHttpError(503, "Suggested update settings could not be read.", cleanString(currentError.code, 80))
  const enabledAt = enabled
    ? current?.AIInboxSetting_IsEnabled === true
      ? current.AIInboxSetting_EnabledAt ?? now
      : now
    : null
  const { error } = await admin.from("AI_InboxSuggestionSettings").upsert({
    AIInboxSetting_MailboxID: mailboxId, AIInboxSetting_CompanyID: actor.companyId,
    AIInboxSetting_EnabledByUserID: actor.userId, AIInboxSetting_IsEnabled: enabled,
    AIInboxSetting_EnabledAt: enabledAt,
    AIInboxSetting_AllowedDocumentTypesJSON: [...new Set(documentTypes)], AIInboxSetting_UpdatedAt: now,
  }, { onConflict: "AIInboxSetting_MailboxID" })
  if (error) throw new InboxHttpError(503, "Suggested update settings could not be saved.", cleanString(error.code, 80))
  // Enabling is forward-only. Historical attachment review is deliberately an
  // explicit future action so a quiet settings toggle cannot create surprise
  // OCR/model usage across an existing mailbox.
  return { mailboxId, enabled, documentTypes: [...new Set(documentTypes)], queued: 0 }
}

export async function searchSuggestedUpdateBookings(admin: Db, actor: Actor, url: URL) {
  await requirePermission(admin, actor, "Bookings.Read")
  const { data, error } = await admin.rpc("multideck_inbox_search_bookings", {
    p_company_id: actor.companyId,
    p_user_id: actor.userId,
    p_search: cleanString(url.searchParams.get("search"), 180) || null,
    p_take: 12,
  })
  if (error) throw new InboxHttpError(error.code === "42501" ? 403 : 503, "Bookings could not be searched.", cleanString(error.code, 80))
  return { bookings: Array.isArray(data) ? data : [] }
}

export async function applySuggestedUpdate(admin: Db, actor: Actor, suggestionId: string, body: Row) {
  if (!isUuid(suggestionId)) throw new InboxHttpError(400, "Choose a valid suggested update.", "suggestion_invalid")
  const selectedFieldIds = Array.isArray(body.selectedFieldIds) ? body.selectedFieldIds.filter(isUuid) : []
  if (!selectedFieldIds.length) throw new InboxHttpError(400, "Choose at least one change to apply.", "suggestion_fields_required")
  const { data, error } = await admin.rpc("multideck_inbox_apply_suggested_update", {
    p_company_id: actor.companyId, p_user_id: actor.userId,
    p_suggestion_id: suggestionId, p_selected_field_ids: selectedFieldIds,
  })
  if (error) {
    const stale = error.code === "40001"
    throw new InboxHttpError(stale ? 409 : error.code === "42501" ? 403 : 422,
      cleanString(error.message, 1_000) || "The suggested update could not be applied.", stale ? "suggestion_stale" : cleanString(error.code, 80))
  }
  return data
}

export async function attachSuggestedDocument(admin: Db, actor: Actor, suggestionId: string, body: Row) {
  if (!isUuid(suggestionId)) throw new InboxHttpError(400, "Choose a valid suggested update.", "suggestion_invalid")
  const bookingId = cleanString(body.bookingId, 80)
  if (!isUuid(bookingId)) throw new InboxHttpError(400, "Choose a valid booking.", "booking_invalid")
  const { data, error } = await admin.rpc("multideck_inbox_attach_suggested_document", {
    p_company_id: actor.companyId,
    p_user_id: actor.userId,
    p_suggestion_id: suggestionId,
    p_booking_id: bookingId,
  })
  if (error) {
    const changed = error.code === "40001"
    throw new InboxHttpError(changed ? 409 : error.code === "42501" ? 403 : 422,
      cleanString(error.message, 1_000) || "The document could not be added to that booking.", changed ? "suggestion_changed" : cleanString(error.code, 80))
  }
  return data
}

export async function dismissSuggestedUpdate(admin: Db, actor: Actor, suggestionId: string) {
  if (!isUuid(suggestionId)) throw new InboxHttpError(400, "Choose a valid suggested update.", "suggestion_invalid")
  const { data, error } = await admin.rpc("multideck_inbox_dismiss_suggested_update", {
    p_company_id: actor.companyId, p_user_id: actor.userId, p_suggestion_id: suggestionId,
  })
  if (error) throw new InboxHttpError(error.code === "42501" ? 403 : 422, cleanString(error.message, 1_000) || "The suggested update could not be dismissed.", cleanString(error.code, 80))
  if (data !== true) throw new InboxHttpError(409, "This suggestion has already changed.", "suggestion_changed")
  return { status: "dismissed", suggestionId }
}
