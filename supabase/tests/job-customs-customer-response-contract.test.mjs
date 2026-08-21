import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appRoot = new URL("../../", import.meta.url)
const readApp = (path) => readFile(new URL(path, appRoot), "utf8")

const [quoteBookingMigration, bookingWorkspaceMigration, jobCustomsMigration, dexterMigration, workspaceCustomsMigration, handoffAccessMigration, quoteWorkflowCore, quoteWorkflowEdge, quoteResponseCore, quoteResponseEdge, bookingEdge, iCustomsEdge, customsDocumentEdge, customsOcrEdge, appRoutes, appViteConfig, bookingPage, quotePage, customsPage, dexterEdge, responsePage, responseApi, errorStateAnimation] = await Promise.all([
  readApp("supabase/migrations/20260820150000_booking_quote_customer_response.sql"),
  readApp("supabase/migrations/20260820150500_booking_workspace_rpc.sql"),
  readApp("supabase/migrations/20260820151000_job_customs_handoff.sql"),
  readApp("supabase/migrations/20260820151500_job_customs_dexter_parity.sql"),
  readApp("supabase/migrations/20260820174257_share_customs_declarations_with_workspace.sql"),
  readApp("supabase/migrations/20260821085728_grant_customs_handoff_initiator_access.sql"),
  readApp("supabase/functions/quotes-workflow/core.ts"),
  readApp("supabase/functions/quotes-workflow/index.ts"),
  readApp("supabase/functions/quote-response/core.ts"),
  readApp("supabase/functions/quote-response/index.ts"),
  readApp("supabase/functions/bookings-workflow/index.ts"),
  readApp("supabase/functions/icustoms-api/index.ts"),
  readApp("supabase/functions/customs-declaration-document/index.ts"),
  readApp("supabase/functions/customs-invoice-ocr/index.ts"),
  readApp("multideck.client/src/App.tsx"),
  readApp("multideck.client/vite.config.ts"),
  readApp("multideck.client/src/components/multideck/booking-components.tsx"),
  readApp("multideck.client/src/pages/quotes-page.tsx"),
  readApp("multideck.client/src/pages/customs-declarations-page.tsx"),
  readApp("supabase/functions/agent-dexter/index.ts"),
  readApp("multideck.client/src/pages/quote-response-page.tsx"),
  readApp("multideck.client/src/lib/quote-response-api.ts"),
  readApp("multideck.client/src/assets/error-state-animation.ts"),
])

test("public quote links store only a SHA-256 token hash and all quote actions are explicit POST requests", () => {
  assert.match(quoteBookingMigration, /token_hash varchar\(64\) not null/)
  assert.match(quoteBookingMigration, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(quoteResponseCore, /crypto\.subtle\.digest\("SHA-256"/)
  assert.match(quoteResponseEdge, /request\.method !== "POST"/)
  assert.match(quoteResponseEdge, /authorization, apikey, content-type, x-client-info/)
  assert.match(quoteResponseEdge, /body\.action === "view"/)
  assert.match(quoteResponseEdge, /body\.action === "submit"/)
  assert.match(quoteResponseEdge, /isAllowedOrigin\(requestOrigin\)/)
  assert.doesNotMatch(quoteResponseEdge, /QUOTE_RESPONSE_(?:BASE_URL|ALLOWED_ORIGINS)/)
  assert.match(quoteWorkflowCore, /normaliseMultideckAppOrigin/)
  assert.match(quoteWorkflowCore, /\/quotes\/respond\//)
  assert.doesNotMatch(quoteWorkflowCore, /multideck\.live/)
  assert.match(quoteWorkflowEdge, /parseQuoteResponseOrigin\(request\.headers\.get\("Origin"\)\)/)
  assert.match(quoteWorkflowEdge, /requested_response_origin: responseOrigin/)
  assert.match(quoteBookingMigration, /response_origin varchar\(255\) not null/)
  assert.match(quoteBookingMigration, /link_row\.response_origin is distinct from requested_response_origin/)
  assert.match(quoteResponseEdge, /requested_response_origin: origin/)
})

test("customer responses are single-use, version-bound and enforce useful decline or challenge context", () => {
  assert.match(quoteBookingMigration, /response_link_id uuid not null unique/)
  assert.match(quoteBookingMigration, /quote_version_id uuid not null references public\."CusQuote_Versions"/)
  assert.match(quoteBookingMigration, /decision_value in \('declined','challenged'\).*requested_message/s)
  assert.match(quoteBookingMigration, /TR_CusQuote_Versions_revoke_superseded_customer_links/)
  assert.match(quoteBookingMigration, /quote_version_id <> new\."CusQuoteVersion_ID"/)
  assert.match(quoteBookingMigration, /CusQuoteVersion_SnapshotJSON"#>>'\{quote,customerName\}'/)
  assert.match(quoteResponseCore, /decision === "declined" \|\| decision === "challenged"/)
  assert.match(quoteResponseCore, /Attach a competitor quote up to 10 MB/)
  assert.match(responsePage, /messageRequired = decision === "challenged"/)
  assert.match(responsePage, /quoteLossReasons\.map/)
  assert.match(responsePage, /formatQuoteLossReason\(lossReason, lossDetails\)/)
  assert.match(responsePage, /nextDecision === "challenged" && competitorQuote/)
  assert.match(quoteWorkflowEdge, /charge\.sellAmount \?\? charge\.sellLocal/)
  assert.match(quoteWorkflowEdge, /for \(const charge of charges\) totals\.set/)
  assert.match(responsePage, /function QuotePdfPreview/)
})

test("acceptance creates one canonical booking from the immutable accepted quote version", () => {
  assert.match(quoteBookingMigration, /create unique index if not exists "UX_Job_Header_source_quote"/)
  assert.match(quoteBookingMigration, /create or replace function booking_api\.convert_accepted_quote/)
  assert.match(quoteBookingMigration, /quote_row\."CusQuoteHeader_AcceptedVersionID"/)
  assert.match(quoteBookingMigration, /'acceptedSnapshot', version_row\."CusQuoteVersion_SnapshotJSON"/)
  assert.match(quoteBookingMigration, /booking_api\.convert_accepted_quote\(link_row\.quote_id/)
  assert.match(quoteBookingMigration, /return jsonb_build_object\('jobId', existing_job\."Job_ID"[\s\S]*'reused', true\)/)
})

test("quote readiness keeps the Customs entry count expression valid in PL/pgSQL", () => {
  assert.match(
    quoteBookingMigration,
    /if has_customs and \(\s*case\s+when coalesce\(facts->>'entries', ''\).*?end\s*\) < 1 then/s,
  )
})

test("bookings open as persisted drafts and the old wizard is not mounted", () => {
  assert.match(appRoutes, /BookingOpenPage/)
  assert.doesNotMatch(appRoutes, /BookingCreationPage/)
  assert.match(bookingEdge, /action === "open"/)
  assert.match(quoteBookingMigration, /create or replace function booking_api\.open_booking/)
})

test("quote issue and booking Customs handoff expose readiness rather than fake success", () => {
  assert.match(quoteWorkflowCore, /"readiness"/)
  assert.match(quoteWorkflowCore, /"issue-options"/)
  assert.match(quoteWorkflowCore, /"issue-draft"/)
  assert.match(quoteWorkflowCore, /"issue"/)
  assert.match(quoteWorkflowEdge, /if \(action === "issue"\)/)
  assert.match(quotePage, /getQuoteIssueReadiness/)
  assert.match(quotePage, /issueQuoteWorkflow/)
  assert.match(quotePage, /Review to send/)
  assert.match(bookingPage, /getBookingCustomsReadiness/)
  assert.match(bookingPage, /customsReadiness\?\.ready/)
  assert.match(bookingPage, /sendBookingToCustoms/)
})

test("Customs readiness enforces the meeting-agreed operator evidence and keeps packing list optional", () => {
  for (const evidenceLabel of [
    "Consignor / shipper name",
    "Consignor / shipper full address",
    "Exporter EORI",
    "Importer name",
    "Importer full address",
    "Importer EORI or VAT number",
    "Pieces / packages",
    "Gross weight",
    "Goods description",
    "Incoterms",
    "Freight amount",
    "Freight currency",
    "Transport mode",
    "Attached commercial invoice",
  ]) assert.match(jobCustomsMigration, new RegExp(evidenceLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(jobCustomsMigration, /Packing list not attached \(optional\)/)
  assert.match(jobCustomsMigration, /direction_value in \('import','export'\)/)
})

test("sending to Customs creates or reuses a reviewable job declaration and never submits it to a provider", () => {
  assert.match(jobCustomsMigration, /create or replace function booking_api\.send_to_customs/)
  assert.match(jobCustomsMigration, /not coalesce\(status\."CDST_IsFinal", false\)/)
  assert.match(jobCustomsMigration, /'prefillReviewRequired', true/)
  assert.match(jobCustomsMigration, /'source', 'booking_customs_handoff'/)
  assert.match(jobCustomsMigration, /insert into public\."Customs_Items"/)
  assert.match(jobCustomsMigration, /insert into public\."Customs_Parties"/)
  assert.match(jobCustomsMigration, /'canOpen',\s*booking_api\.customs_access/)
  assert.match(bookingPage, /if \(result\.canOpen\)/)
  assert.match(bookingPage, /setActiveTab\("Customs"\)/)
  assert.match(bookingPage, /Customs department still received the handoff/)
  assert.doesNotMatch(jobCustomsMigration, /insert into public\."ICUS_Submissions"/)
  assert.doesNotMatch(jobCustomsMigration, /submit_declaration|submitToIcustoms|fetch\(/i)
})

test("booking transport data is converted into the exact declaration codes before prefill", () => {
  assert.match(jobCustomsMigration, /"JTM_CustomsTransportModeCode"/)
  assert.match(jobCustomsMigration, /when 'sea' then '1'/)
  assert.match(jobCustomsMigration, /when 'rail' then '2'/)
  assert.match(jobCustomsMigration, /when 'road' then '3'/)
  assert.match(jobCustomsMigration, /when 'air' then '4'/)
  assert.match(jobCustomsMigration, /'departureIdentificationNumber', case when direction_value = 'export'/)
  assert.match(jobCustomsMigration, /'arrivalIdentificationNumber', case when direction_value = 'import'/)
  assert.match(jobCustomsMigration, /'isContainerised', case when container_row\."JobContainers_ID" is null then '0' else '1' end/)
})

test("booking source-document uploads reserve and atomically finalise bounded storage", () => {
  assert.match(bookingEdge, /booking_workflow_reserve_document_upload/)
  assert.match(bookingEdge, /booking_workflow_complete_document_upload/)
  assert.match(bookingEdge, /booking_workflow_cancel_document_upload/)
  assert.match(bookingEdge, /upsert: true/)
})

test("final Customs access is shared only inside the physical-tenant company and keeps role permissions", () => {
  assert.match(workspaceCustomsMigration, /caller\."Company_ID" is not null/)
  assert.match(workspaceCustomsMigration, /caller\."Company_ID" = declaration_creator\."Company_ID"/)
  assert.match(workspaceCustomsMigration, /coalesce\(caller\."User_AccessStatus", 'active'\) = 'active'/)
  assert.match(workspaceCustomsMigration, /case when require_write then 'Customs\.Write' else 'Customs\.Read' end/)
  assert.doesNotMatch(workspaceCustomsMigration, /using \(true\)/)
  assert.match(jobCustomsMigration, /create or replace function public\.customs_declaration_current_user_authorised/)
  assert.match(jobCustomsMigration, /select auth\.uid\(\)/)
  assert.match(jobCustomsMigration, /using \(public\.customs_declaration_current_user_authorised\("CUST_id", false\)\)/)
  assert.match(jobCustomsMigration, /grant execute on function public\.customs_declaration_current_user_authorised\(uuid,boolean\) to authenticated,service_role/)
  assert.match(jobCustomsMigration, /grant execute on function public\.customs_declaration_authorised\(uuid,uuid,boolean,boolean\) to service_role/)
  assert.doesNotMatch(jobCustomsMigration, /grant execute on function booking_api\.customs_access\(uuid,uuid,boolean\) to authenticated/)
  assert.match(customsPage, /scope=\{jobRelated \? "job-related" : "standalone"\}/)
  assert.match(appRoutes, /customs\/job-related/)
})

test("the booking handoff initiator gets scoped Customs read and write access without a global role", () => {
  assert.match(handoffAccessMigration, /create table booking_api\.customs_declaration_grants/)
  assert.match(handoffAccessMigration, /assigned_user_id := app_user\."User_ID"/)
  assert.match(handoffAccessMigration, /issue\.value ->> 'key' <> 'customs_operator'/)
  assert.match(handoffAccessMigration, /declaration\."CUST_CreatedBy" = caller_auth_user_id/)
  assert.match(handoffAccessMigration, /and \(not require_write or scoped_grant\.can_write\)/)
  assert.match(handoffAccessMigration, /on conflict \(declaration_id, user_id\) do update/)
  assert.match(handoffAccessMigration, /caller\."Company_ID" = declaration_creator\."Company_ID"/)
  assert.doesNotMatch(handoffAccessMigration, /insert into public\."sys_UserRole_Permissions"/)
  assert.doesNotMatch(handoffAccessMigration, /insert into public\."cmp_Users_Departments"/)
  assert.match(iCustomsEdge, /"customs_declaration_authorised"/)
  assert.match(customsDocumentEdge, /"customs_declaration_authorised"/)
  assert.match(customsOcrEdge, /"customs_declaration_authorised"/)
})

test("the handoff notifies the Customs department with the exact booking context and declaration deep link", () => {
  assert.match(jobCustomsMigration, /insert into public\."Comm_Notifications"/)
  assert.match(jobCustomsMigration, /'Booking sent to Customs'/)
  assert.match(jobCustomsMigration, /sender_name \|\| ' sent booking '/)
  assert.match(jobCustomsMigration, /'action_url','\/customs\/job-related\/'/)
})

test("Dexter uses the real handoff boundary and deterministic database events for read, write and watch parity", () => {
  const actionStart = dexterMigration.indexOf("create or replace function public.multideck_dexter_action_send_booking_to_customs")
  const actionEnd = dexterMigration.indexOf("create or replace function public._multideck_dexter_pause_unauthorised_customs_watches", actionStart)
  assert.ok(actionStart >= 0 && actionEnd > actionStart, "Dexter Customs write actions should remain explicitly bounded")
  const dexterWriteActions = dexterMigration.slice(actionStart, actionEnd)

  assert.match(dexterMigration, /multideck_dexter_domain_bookings/)
  assert.match(dexterMigration, /multideck_dexter_domain_customs_declarations/)
  assert.match(dexterMigration, /multideck_dexter_action_send_booking_to_customs/)
  assert.match(dexterMigration, /booking_api\.send_to_customs/)
  assert.match(dexterMigration, /booking_api\.customs_access/)
  assert.match(handoffAccessMigration, /create or replace function booking_api\.customs_access/)
  assert.match(dexterMigration, /booking_api\.save_job_customs_draft\(v_auth_user_id, v_target_id, v_draft\)/)
  assert.match(dexterMigration, /"AIDexterAction_RequiredPermissionsJSON" = '\["Customs\.Write"\]'::jsonb/)
  assert.match(dexterMigration, /shared Customs workspace/)
  assert.match(dexterMigration, /valid nature of transaction code/)
  assert.doesNotMatch(dexterMigration, /two-part nature of transaction/)
  assert.match(dexterMigration, /_multideck_crm_deal_is_operator_visible\(p_target_id,v_context\.company_id\)/)
  assert.match(dexterMigration, /task\."TodoTask_OwnerUserID"=v_context\.user_id/)
  assert.match(dexterMigration, /to authenticated,service_role/)
  assert.match(dexterMigration, /_multideck_dexter_pause_unauthorised_customs_watches/)
  assert.match(dexterMigration, /'transactionNature'.*CUST_GenericPayloadJSON/s)
  assert.match(dexterMigration, /'freightChargeAmount'.*CUST_GenericPayloadJSON/s)
  assert.match(dexterMigration, /'vatValueAdjustmentAmount'.*CUST_GenericPayloadJSON/s)
  assert.match(dexterMigration, /'insuranceCostAmount'.*CUST_GenericPayloadJSON/s)
  assert.match(dexterMigration, /'containerPackingCostAmount'.*CUST_GenericPayloadJSON/s)
  assert.match(dexterMigration, /update of[\s\S]*"CUST_GenericPayloadJSON"/)
  assert.doesNotMatch(dexterWriteActions, /actor\."Auth_User_ID" = auth\.uid\(\)/)
  assert.match(dexterMigration, /create trigger "TR_Customs_Declarations_booking_watch"/)
  assert.doesNotMatch(dexterMigration, /cron\.schedule|net\.http|model_gateway|governedModelFetch/i)
  assert.match(dexterEdge, /send_booking_to_customs/)
  assert.match(dexterEdge, /customs\/job-related/)
})

test("Multideck App mounts the unauthenticated response route with explicit actions and terminal states", () => {
  assert.match(appRoutes, /isQuoteResponseRoute/)
  assert.match(appRoutes, /QuoteResponsePage/)
  assert.match(appViteConfig, /pathname\.startsWith\("\/quotes\/respond\/"\)/)
  assert.match(responsePage, /Accept quote/)
  assert.match(responsePage, /Ask for changes/)
  assert.match(responsePage, /Decline quote/)
  assert.match(responsePage, /state === "expired" \|\| view\?\.state === "revoked"/)
  assert.match(responsePage, /submitCustomerQuoteResponse/)
  assert.match(responseApi, /functions\.invoke<.*>\("quote-response"/s)
  assert.match(responseApi, /edge function\|failed to send a request\|fetch failed\|non-2xx/i)
})

test("invalid and terminal quote links use the supplied accessible error animation", () => {
  assert.match(responsePage, /function QuoteResponseUnavailable/)
  assert.match(responsePage, /data=\{errorStateAnimationData\}/)
  assert.match(responsePage, /autoplay=\{!reducedMotion\}/)
  assert.match(responsePage, /role="alert"/)
  assert.match(errorStateAnimation, /icon-padlock-22/)
})
