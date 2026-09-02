import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const migration = await read("../migrations/20260826121814_inbox_suggested_updates.sql")
const reconciliationMigration = await read("../migrations/20260826170000_restore_provider_message_reconciliation.sql")
const threadReconciliationMigration = await read("../migrations/20260826170500_restore_provider_thread_reconciliation.sql")
const forwardOnlyMigration = await read("../migrations/20260826171500_inbox_suggestions_forward_only.sql")
const atomicCompletionMigration = await read("../migrations/20260826174500_inbox_suggestion_atomic_completion.sql")
const manualAttachmentMigration = await read("../migrations/20260827090000_inbox_manual_booking_attachment.sql")
const relevanceMigration = await read("../migrations/20260901193000_recheck_inbox_invoice_relevance.sql")
const relevanceV2Migration = await read("../migrations/20260902150000_inbox_freight_relevance_v2.sql")
const relevancePolicy = await read("../functions/_shared/inbox-freight-relevance.ts")
const worker = await read("../functions/_shared/inbox-suggested-updates.ts")
const inboxApi = await read("../functions/inbox-api/suggested-updates.ts")
const inboxRuntime = await read("../functions/inbox-api/runtime.ts")
const emailWorker = await read("../functions/email-watch-worker/index.ts")
const review = await read("../../multideck.client/src/components/multideck/suggested-update-review.tsx")
const reviewWorkspace = await read("../../multideck.client/src/components/multideck/inbox-suggested-updates-workspace.tsx")
const sidebar = await read("../../multideck.client/src/components/multideck/app-sidebar.tsx")

test("suggested updates are private, provider-scoped, deduplicated, and Inbox-only", () => {
  for (const table of [
    "AI_InboxSuggestionSettings",
    "AI_InboxProcessingJobs",
    "AI_InboxSuggestedUpdates",
    "AI_InboxSuggestedUpdateFields",
    "AI_InboxSuggestionAudit",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\."${table}" enable row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\."${table}" from public, anon, authenticated`))
  }
  assert.match(migration, /unique \("AIInboxJob_AttachmentID", "AIInboxJob_ClassifierVersion", "AIInboxJob_ExtractorVersion"\)/)
  assert.match(migration, /folder\."CommMailFolder_RoleCode" = 'inbox'/)
  assert.match(migration, /recipient\."CommRecipient_RecipientTypeCode" in \('to','cc','bcc'\)/)
  assert.match(migration, /lower\(recipient\."CommRecipient_NormalizedAddress"\) = lower\(mailbox\."CommMailbox_NormalizedAddress"\)/)
  assert.match(migration, /to service_role/)
})

test("both document types pass source-backed freight admission before any suggestion is stored", () => {
  const classificationIndex = worker.indexOf("const classification = deterministicDocumentType")
  const downloadIndex = worker.indexOf("const download = await downloadEmailAttachment")
  assert.ok(classificationIndex > 0 && downloadIndex > classificationIndex)
  assert.match(worker, /metadata_no_match/)
  assert.match(worker, /AIInboxSetting_AllowedDocumentTypesJSON/)
  assert.match(worker, /allowedDocumentTypes\.includes\(classification\.type\)/)
  assert.match(worker, /mailbox_setting_excluded/)
  assert.match(worker, /\\b\(booking\|shipment\)\\s\+confirmation\\b/)
  assert.match(worker, /\\bcommercial\\s\+invoice\\b\|\\binvoice\\b/)
  assert.match(worker, /freightRelevance: \{ type: "string", enum: \["relevant","irrelevant","uncertain"\] \}/)
  assert.match(worker, /INBOX_RELEVANCE_INSTRUCTIONS/)
  assert.match(worker, /CommMessage_BodyText,CommMessage_BodyPreview/)
  assert.match(worker, /groundedBookingReferences\(extracted, groundedFreightEvidence\(extracted, sources\)\)/)
  assert.match(worker, /if \(!relevance\.allow\)/)
  assert.match(worker, /AIInboxJob_ClassificationMethod: relevance\.reason/)
  assert.match(relevancePolicy, /INBOX_RELEVANCE_VERSION = "freight-relevance-v2"/)
  assert.doesNotMatch(worker, /highConfidenceIrrelevantInvoice/)
  assert.equal(inboxRuntime.match(/p_classifier_version: "inbox-triage-v1"/g)?.length, 2)
  const contentDecisionIndex = worker.indexOf("const extracted = await extractStructuredDocument")
  const cleanupIndex = worker.indexOf("await cleanupInterruptedSuggestion", contentDecisionIndex)
  assert.ok(contentDecisionIndex > 0 && cleanupIndex > contentDecisionIndex)
  assert.ok(worker.indexOf("if (!relevance.allow)", contentDecisionIndex) < worker.indexOf("const stored = await storeSourceDocument", contentDecisionIndex))
  assert.match(relevanceMigration, /"AIInboxSuggestion_DocumentTypeCode" = 'commercial_invoice'/)
  assert.match(relevanceMigration, /"AIInboxSuggestion_StatusCode" in \('needs_match', 'ready', 'no_changes'\)/)
  assert.match(relevanceMigration, /"AIInboxJob_StatusCode" = 'completed'/)
  assert.match(relevanceV2Migration, /"AIInboxSuggestion_DocumentTypeCode" in \('commercial_invoice', 'booking_confirmation'\)/)
  assert.match(relevanceV2Migration, /"AIInboxSuggestion_StatusCode" in \('needs_match', 'ready', 'no_changes'\)/)
  assert.match(relevanceV2Migration, /"AIInboxJob_StatusCode" = 'completed'/)
  assert.match(relevanceV2Migration, /is distinct from 'freight-relevance-v2'/)
  assert.match(relevanceV2Migration, /"AIInboxSetting_IsEnabled" = true/)
  assert.doesNotMatch(relevanceV2Migration, /delete from|insert into public\."AI_InboxProcessingJobs"/i)
  assert.match(emailWorker, /processInboxSuggestionJobs\(admin, 1\)/)
})

test("matching keeps exact references, adds bounded sender evidence, and exposes ambiguity", () => {
  assert.match(worker, /\.eq\("Job_BookingReference", reference\)/)
  assert.match(worker, /\.eq\("JobRoute_CarrierBookingReference", reference\)/)
  assert.match(worker, /\.eq\("JobRoute_MasterTransportReference", reference\)/)
  assert.doesNotMatch(worker, /\.or\(`JobRoute_CarrierBookingReference/)
  assert.match(worker, /CommRecipient_RecipientTypeCode", "from"/)
  assert.match(worker, /PUBLIC_EMAIL_DOMAINS/)
  assert.match(worker, /unique_sender_domain/)
  assert.match(worker, /decideBookingMatch\(candidates, signals\)/)
  assert.match(worker, /matchResult\.state === "ambiguous"/)
  assert.match(worker, /matching: matchResult\.evidence/)
})

test("apply is selected-field-only, stale-safe, versioned, and audited", () => {
  for (const permission of ["Email.Read", "Email.AIRead", "Bookings.Read", "Bookings.Write"]) {
    assert.match(migration, new RegExp(`_multideck_dexter_has_permission\\(p_user_id, '${permission.replace(".", "\\.")}'\\)`))
  }
  assert.match(migration, /"AIInboxSuggestion_OwnerUserID" = p_user_id/)
  assert.match(migration, /"AIInboxField_ID" = any\(p_selected_field_ids\)/)
  assert.match(migration, /v_current is distinct from v_field\."AIInboxField_CurrentValueJSON"/)
  assert.match(migration, /using errcode = '40001'/)
  assert.match(migration, /"JobDoc_VersionNo"/)
  assert.match(migration, /"CommAttachment_JobDocumentID" = v_document_id/)
  assert.match(migration, /"AI_InboxSuggestionAudit"/)
  assert.match(migration, /"AI_DexterActionAudit"/)
})

test("Dexter reads and watches remain owner-private and event-driven", () => {
  assert.match(migration, /item\."AIInboxSuggestion_OwnerUserID" = v_context\.user_id/)
  assert.match(migration, /"AIDexterDomain_ScopeStrategy"/)
  assert.match(migration, /"AIDexterWatchCapability_ScopeStrategy"/)
  assert.match(migration, /watch\."AIDexterWatch_OwnerUserID" = new\."AIInboxSuggestion_OwnerUserID"/)
  assert.match(migration, /after insert or update of "AIInboxSuggestion_StatusCode"/)
  assert.doesNotMatch(migration, /cron|pg_cron|http_post/)
})

test("the API reapplies mailbox ACLs and the review defaults weight to manual opt-in", () => {
  assert.match(inboxApi, /mailboxIds\(admin, actor, "read"\)/)
  assert.match(inboxApi, /mailboxIds\(admin, actor, "manage"\)/)
  assert.match(inboxApi, /if \(!readable\.size\) return \{ suggestions: \[\] \}/)
  assert.doesNotMatch(inboxApi, /Date\.now\(\) - 7 \* 24 \* 60 \* 60_000/)
  assert.match(inboxApi, /queued: 0/)
  assert.match(inboxApi, /AIInboxSetting_EnabledAt/)
  assert.match(inboxApi, /current\?\.AIInboxSetting_IsEnabled === true/)
  assert.match(worker, /selectedByDefault: field\.code !== "gross_weight_kg"/)
  assert.match(atomicCompletionMigration, /"AIInboxField_IsSelectedByDefault"/)
  assert.match(review, /Untick anything you do not want to update\./)
  assert.match(review, /\$\{t\("Apply"\)\} \$\{selectedCount\}/)
})

test("the review surface keeps evidence, outcomes, and actions in one accessible hierarchy", () => {
  assert.match(review, /flex max-w-\[720px\] flex-col items-center text-center/)
  assert.doesNotMatch(review, /\{suggestion\.summary\}/)
  assert.match(review, /match confidence/)
  assert.match(review, /Ambiguous match/)
  assert.match(review, /No safe match/)
  assert.match(review, /bg-\[var\(--md-status-green-bg\)\]/)
  assert.match(review, /bg-\[var\(--md-status-red-bg\)\]/)
  assert.match(review, /Applied/)
  assert.match(review, /Not applied/)
  assert.match(review, /DexterActionPill/)
  assert.match(review, /Changes were not applied\./)
  assert.doesNotMatch(review, /<footer/)
  const changesIndex = review.indexOf("suggestion.fields.map")
  const actionsIndex = review.indexOf("{actions}", changesIndex)
  assert.ok(changesIndex > 0 && actionsIndex > changesIndex)
  assert.match(reviewWorkspace, /actionError=\{actionError\}/)
})

test("unmatched documents offer an explicit tenant-safe booking attachment decision", () => {
  assert.match(review, /Add to booking/)
  assert.match(review, /No, don't add/)
  assert.match(review, /The document will be attached only\. Extracted booking fields will not change\./)
  assert.match(review, /role="combobox"/)
  assert.match(review, /role="listbox"/)
  assert.match(review, /role="option"/)
  assert.match(review, /event\.key === "Escape"/)
  assert.match(reviewWorkspace, /attachInboxSuggestedDocument/)
  assert.match(inboxApi, /multideck_inbox_search_bookings/)
  assert.match(inboxApi, /multideck_inbox_attach_suggested_document/)
  for (const permission of ["Email.Read", "Email.AIRead", "Bookings.Read", "Bookings.Write"]) {
    assert.match(manualAttachmentMigration, new RegExp(`_multideck_dexter_has_permission\\(p_user_id, '${permission.replace(".", "\\.")}'\\)`))
  }
  assert.match(manualAttachmentMigration, /office\."Company_ID" = p_company_id/)
  assert.match(manualAttachmentMigration, /"AIInboxSuggestion_OwnerUserID" = p_user_id/)
  assert.match(manualAttachmentMigration, /"AIInboxSuggestion_StatusCode" <> 'needs_match'/)
  assert.match(manualAttachmentMigration, /v_existing_document_id is not null/)
  assert.match(manualAttachmentMigration, /'manual_selection'/)
  assert.match(manualAttachmentMigration, /attach_inbox_suggested_document/)
  assert.match(manualAttachmentMigration, /to service_role/)
  assert.doesNotMatch(manualAttachmentMigration, /to authenticated/)
})

test("Suggested updates reuses the live Dexter sidebar shader", () => {
  assert.match(sidebar, /view: "suggested", label: "Suggested updates", icon: AiEditing/)
  assert.match(sidebar, /accent=\{item\.view === "suggested" \? "dexter" : "default"\}/)
  assert.match(reviewWorkspace, /Ambiguous match/)
  assert.match(reviewWorkspace, /No safe match/)
})

test("automation starts at opt-in and never scans historical attachments", () => {
  assert.match(migration, /"AIInboxSetting_EnabledAt" timestamptz/)
  assert.match(forwardOnlyMigration, /add column if not exists "AIInboxSetting_EnabledAt" timestamptz/)
  assert.match(forwardOnlyMigration, /message\."CommMessage_ReceivedAt"/)
  assert.match(forwardOnlyMigration, />= setting\."AIInboxSetting_EnabledAt"/)
  assert.doesNotMatch(inboxApi, /AI_InboxProcessingJobs"\)\.insert/)
})

test("a partial write removes the suggestion before deleting its stored source", () => {
  const removeSuggestion = worker.indexOf('from("AI_InboxSuggestedUpdates").delete()')
  const removeCatalogue = worker.indexOf('from("DOC_StoredObjects").delete()')
  assert.ok(removeSuggestion > 0 && removeCatalogue > removeSuggestion)
  assert.match(worker, /multideck_inbox_complete_suggestion_job/)
  assert.match(atomicCompletionMigration, /for update/)
  assert.match(atomicCompletionMigration, /"AIInboxJob_LeaseToken" = p_lease_token/)
  assert.match(atomicCompletionMigration, /A ready Inbox suggestion must include at least one reviewable field/)
  assert.match(atomicCompletionMigration, /"AIInboxJob_StatusCode" = 'completed'/)
  assert.match(atomicCompletionMigration, /to service_role/)
  assert.doesNotMatch(atomicCompletionMigration, /to authenticated/)
})

test("expensive extraction runs before mailbox sync consumes the worker runtime", () => {
  const extraction = emailWorker.indexOf("const suggestedUpdates = mode === \"live\"")
  const ownerClaim = emailWorker.indexOf("comm_claim_email_watch_owners")
  assert.ok(extraction > 0 && ownerClaim > extraction)
})

test("provider deletion reconciliation cannot block later live messages", () => {
  assert.match(reconciliationMigration, /create or replace function public\.comm_remove_provider_messages/)
  assert.match(reconciliationMigration, /"CommMessage_MailboxID" = p_mailbox_id/)
  assert.match(reconciliationMigration, /"CommMessage_ProviderMessageID" = any/)
  assert.match(reconciliationMigration, /_multideck_refresh_retained_email_threads/)
  assert.match(reconciliationMigration, /grant execute on function public\.comm_remove_provider_messages\(uuid, text\[\]\)[\s\S]+to service_role/)
  assert.match(threadReconciliationMigration, /create or replace function public\._multideck_refresh_retained_email_threads/)
  assert.match(threadReconciliationMigration, /"CommThread_LastMessageID" = v_latest\."CommMessage_ID"/)
  assert.match(threadReconciliationMigration, /"CommThread_IsDeleted" = case/)
  assert.match(threadReconciliationMigration, /revoke all on function public\._multideck_refresh_retained_email_threads\(uuid\[\]\)/)
})
