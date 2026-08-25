import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const navigation = await readFile(new URL("../src/data/navigation-data.ts", import.meta.url), "utf8")
const page = await readFile(new URL("../src/pages/crm-phone-calls-page.tsx", import.meta.url), "utf8")
const crmPage = await readFile(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
const accountPage = await readFile(new URL("../src/pages/crm-account-detail-page.tsx", import.meta.url), "utf8")
const components = await readFile(new URL("../src/components/multideck/phone-call-components.tsx", import.meta.url), "utf8")
const dataTable = await readFile(new URL("../src/components/multideck/data-table.tsx", import.meta.url), "utf8")
const api = await readFile(new URL("../src/lib/phone-calls-api.ts", import.meta.url), "utf8")
const previewData = await readFile(new URL("../src/lib/phone-calls-preview-data.ts", import.meta.url), "utf8")
const gallery = await readFile(new URL("../src/data/multideck-data.ts", import.meta.url), "utf8")
const galleryPage = await readFile(new URL("../src/pages/components-gallery-page.tsx", import.meta.url), "utf8")

test("phone calls has a register route and a shareable call-detail route", () => {
  assert.match(navigation, /label: "Phone calls"[^\n]+route: "\/crm\/phone-calls"/u)
  assert.match(app, /function isCrmPhoneCallDetailRoute/u)
  assert.match(app, /\^\\\/crm\\\/phone-calls\\\/\[\^\/\]\+\$/u)
  assert.match(page, /<DataTable/u)
  assert.match(page, /navigate\(`\/crm\/phone-calls\/\$\{call\.id\}`\)/u)
  assert.doesNotMatch(page, /New call/u)
})

test("the client uses the narrow phone-calls Edge Function contract", () => {
  assert.match(api, /const phoneCallsFunctionName = "phone-calls"/u)
  assert.match(api, /import\.meta\.env\.VITE_PHONE_CALLS_PREVIEW !== "true"/u)
  assert.match(api, /import\("@\/lib\/phone-calls-preview-data"\)/u)
  assert.match(page, /LocalPhoneCallsPreviewNotice/u)
  assert.match(page, /Sample records are shown locally; approvals and edits will not be saved\./u)
  assert.match(api, /`\/overview\?\$\{query\.toString\(\)\}`/u)
  assert.match(api, /`\/calls\?\$\{query\.toString\(\)\}`/u)
  assert.match(api, /append\(query, "timezone", input\.timezone\)/u)
  assert.match(api, /append\(query, "companyId", input\.companyId\)/u)
  assert.match(api, /append\(query, "leadId", input\.leadId\)/u)
  assert.match(page, /listPhoneCalls\(\{ offset, limit, timezone,/u)
  assert.match(api, /`\/calls\/\$\{encodeURIComponent\(callId\)\}`/u)
  assert.match(api, /`\/calls\/\$\{encodeURIComponent\(callId\)\}\/match`[\s\S]*method: "PATCH"/u)
  assert.match(api, /`\/calls\/\$\{encodeURIComponent\(callId\)\}\/notes`[\s\S]*method: "PATCH"/u)
  assert.match(api, /\/actions\/\$\{encodeURIComponent\(actionId\)\}\/review`[\s\S]*method: "POST"/u)
})

test("identity matching and inferred actions remain operator-reviewed", () => {
  assert.match(components, /PhoneCallIdentityMatchReview/u)
  assert.match(components, /onLink: \(candidate: PhoneCallMatchCandidate\) => void/u)
  assert.match(components, /Open contacts/u)
  assert.match(components, /capturedCallerName/u)
  assert.match(components, /candidate\.confidence/u)
  assert.match(components, /Leave unmatched/u)
  assert.match(components, /Edit suggestion/u)
  assert.match(components, /title: editing \? editedText\.trim\(\)/u)
  assert.doesNotMatch(components, /text: editedText\.trim\(\)/u)
  assert.match(components, /scheduledDate: editing \? editedDueDate/u)
  assert.match(components, /Open created To Do/u)
  assert.match(components, /\?date=\$\{encodeURIComponent\(action\.draft\.scheduledDate\)\}/u)
  assert.match(components, /todoDraftInvalid[\s\S]*Add a title and due date before approval\./u)
  assert.match(components, /aria-invalid=\{!editedText\.trim\(\)\}/u)
  assert.match(components, /aria-describedby=\{todoDraftInvalid \? todoValidationId : undefined\}/u)
  assert.match(components, /Lead target/u)
  assert.match(components, /leadCandidates\.filter\(\(candidate\) => candidate\.recordType === "lead"\)/u)
  assert.match(components, /type="radio"[\s\S]*value=\{candidate\.id\}/u)
  assert.match(components, /leadId: selectedLead\.id, leadLabel: selectedLead\.name/u)
  assert.match(components, /action\.type === "lead_link" && !selectedLead/u)
  assert.match(page, /leadCandidates=\{call\.matchCandidates\}/u)
  assert.match(gallery, /<PhoneCallSuggestedActions[\s\S]*leadCandidates=\{phoneCall\.matchCandidates\}/u)
  assert.match(components, /Reviewed actions/u)
  assert.match(components, /submitReview\(action, "approve"/u)
  assert.match(components, /submitReview\(action, "dismiss"/u)
  assert.match(page, /Review is required before suggested actions change CRM data\./u)
  assert.match(page, /CRM\.PhoneCalls\.Review/u)
})

test("the transcript presents one Agent-to-Handler conversation while keeping provenance in audit detail", () => {
  assert.match(components, /sourceChanged = previous && previous\.source !== segment\.source/u)
  assert.match(components, /call\.transfer\.acceptedAt \|\| call\.transfer\.offeredAt/u)
  assert.match(components, /call\.transcriptSegments\.map\(\(segment, index\) => \(\{ segment, index \}\)\)\.sort/u)
  assert.match(components, /Transfer accepted by Jenkar team/u)
  assert.match(components, /segment\.speakerRole === "receptionist"[\s\S]*t\("Agent"\)/u)
  assert.match(components, /segment\.speakerRole === "employee"[\s\S]*t\("Handler"\)/u)
  assert.match(components, /speakerLabel[\s\S]*genericTranscriptSpeakerLabels/u)
  assert.match(components, /genericTranscriptSpeakerLabels[\s\S]*"handler transcript"/u)
  assert.match(components, /Handler conversation begins/u)
  assert.match(components, /Handler transcript is pending/u)
  assert.match(components, /showProvenance \? <span[\s\S]*previous\.sourceLabel\} → \{segment\.sourceLabel/u)
  assert.match(components, /showProvenance \? \([\s\S]*Transcript evidence[\s\S]*segment\.sourceLabel/u)
  assert.doesNotMatch(components, /t\("Transcript source changed"\)/u)
  assert.match(components, /transcriptStatus === "partial" \|\| call\.transcriptStatus === "pending"/u)
  assert.match(components, /call\.transcriptStatus === "unavailable"/u)
  assert.match(api, /startedAt: string \| null/u)
  assert.match(api, /globalSequence\?: number \| null/u)
  assert.match(api, /sourceSequence\?: number \| null/u)
  assert.match(components, /Number\.isFinite\(left\.globalSequence\)[\s\S]*Number\.isFinite\(right\.globalSequence\)/u)
  assert.match(components, /Number\.isFinite\(left\.sourceSequence\)[\s\S]*Number\.isFinite\(right\.sourceSequence\)/u)
  assert.match(components, /segment\.startedAt \? <time[\s\S]*Time not supplied/u)
  assert.match(components, /const handlerIndex = groups\.findIndex\(\(segment\) => segment\.source === "3cx"\)/u)
  assert.match(components, /aria-label=\{t\("Call transcript"\)\}/u)
  assert.match(components, /transferMarker \? <ol aria-label=\{t\("Call transcript"\)\}>\{transferMarker\}<\/ol>/u)
  assert.match(page, /Show audit detail/u)
  assert.match(page, /One chronological transcript from greeting, through transfer, to the handler conversation/u)
  assert.match(page, /role === "receptionist" \? "Agent" : role === "employee" \? "Handler"/u)
  assert.match(page, /Provider references/u)
})

test("phone-call analytics and review primitives are discoverable in the component gallery", () => {
  for (const id of [
    "phone-call-metric-strip",
    "phone-call-analysis-launcher",
    "phone-call-provider-health",
    "phone-call-volume-chart",
    "phone-call-attention-list",
    "phone-call-reason-list",
    "phone-call-coverage",
    "phone-call-status",
    "unified-phone-call-transcript",
    "phone-call-linked-record",
    "phone-call-identity-match-review",
    "phone-call-suggested-actions",
  ]) assert.match(gallery, new RegExp(`id: "${id}"`))
  assert.match(galleryPage, /ids: \["phone-call-metric-strip", "phone-call-analysis-launcher", "phone-call-provider-health"/u)
  assert.match(galleryPage, /id: "volume"[\s\S]*evidence: \{ kind: "derived" as const, source: "multideck" as const/u)
  assert.match(galleryPage, /id: "transfer"[\s\S]*evidence: \{ kind: "provider_confirmed" as const, source: "twilio" as const/u)
  assert.match(galleryPage, /id: "handling"[\s\S]*evidence: \{ kind: "derived" as const, source: "multideck" as const/u)
})

test("confirmed calls appear on their linked Lead and Company records without name-based matching", () => {
  assert.match(api, /companyId\?: string \| null/u)
  assert.match(api, /leadId\?: string \| null/u)
  assert.match(api, /lead: \{ id: string; name: string \} \| null/u)
  assert.match(components, /listPhoneCalls\(\{ offset: 0, limit: 5, timezone, matchStatus: "matched", companyId:/u)
  assert.match(components, /recordType === "company" \? row\.company\?\.id === recordId : row\.lead\?\.id === recordId/u)
  assert.doesNotMatch(components, /recordType === "lead" \|\| row\.company\?\.id === recordId/u)
  assert.match(components, /setTotal\(safelyLinkedRows\.length === result\.rows\.length \? result\.total : safelyLinkedRows\.length\)/u)
  assert.match(components, /linkedCallBelongsToRecord/u)
  assert.match(components, /call\.matchStatus !== "matched"/u)
  assert.match(components, /call\.company\?\.id === recordId : call\.lead\?\.id === recordId/u)
  assert.match(components, /<UnifiedPhoneCallTranscript call=\{expandedCall\}/u)
  assert.doesNotMatch(components, /id=\{detailId\}[^>]*aria-live="polite"/u)
  assert.match(components, /<span className="sr-only" role="status">\{t\("Conversation loaded\."\)\}<\/span>/u)
  assert.match(components, /<Button asChild size="sm" variant="ghost"><a href=\{`\/crm\/phone-calls\/\$\{encodeURIComponent\(call\.id\)\}`\}/u)
  assert.match(components, /This call is no longer safely linked to this record\./u)
  assert.match(crmPage, /PhoneCallLinkedRecordSection recordType="lead" recordId=\{lead\.id\}/u)
  assert.match(accountPage, /PhoneCallLinkedRecordSection recordType="company" recordId=\{currentAccount\.id\}/u)
  assert.doesNotMatch(components, /listPhoneCalls\(\{[^}]*search:/u)
  assert.match(galleryPage, /PhoneCallLinkedRecordPreview/u)
})

test("phone-call AI analysis is scoped to an individual call and opens the real Dexter workspace on demand", () => {
  assert.match(page, /rememberDexterHomeHandoff/u)
  assert.match(page, /specialistId: "analytics"/u)
  assert.match(page, /accessMode: "approve"/u)
  assert.match(page, /navigate\("\/agent-dexter"\)/u)
  assert.match(page, /<DexterActionPill label=\{t\("Analyse call"\)\}/u)
  assert.match(page, /cite this call record:/u)
  assert.doesNotMatch(page, /<PhoneCallAnalysisLauncher/u)
  assert.doesNotMatch(page, /<PhoneCallProviderHealth/u)
  assert.doesNotMatch(page, /<PhoneCallAttentionList/u)
  assert.doesNotMatch(page, /t\("Analyse calls"\)/u)
  assert.doesNotMatch(page, /DexterDockedPage/u)
})

test("phone-call controls expose analytics evidence and failure states", () => {
  assert.match(api, /PhoneCallProviderStatus/u)
  assert.match(api, /source: "3cx" \| "elevenlabs" \| "twilio" \| "multideck"/u)
  assert.match(components, /evidence\.source === "twilio"\) return "Twilio confirmed"/u)
  assert.match(components, /Recovery worker health from the selected Supabase project/u)
  assert.match(components, /providers = \[\]/u)
  assert.match(components, /Provider health is temporarily unavailable\. Call records remain available/u)
  assert.match(components, /translatedMetricDetail/u)
})

test("phone calls refresh only while visible and preserve stale data after a background failure", () => {
  assert.match(page, /document\.visibilityState !== "visible"/u)
  assert.match(page, /window\.setInterval\(refreshWhenVisible, 60_000\)/u)
  assert.match(page, /Last updated/u)
  assert.match(page, /Refresh live phone data/u)
  assert.match(page, /Phone call data could not be refreshed\. Existing records remain on screen\./u)
  assert.match(page, /setOverviewState\(backgroundRefresh \? "ready" : "error"\)/u)
  assert.match(page, /setListState\(backgroundRefresh \? "ready" : "error"\)/u)
  assert.match(page, /call\.transcriptStatus === "pending" \|\| call\.transcriptStatus === "partial"/u)
  assert.match(components, /call\.transcriptStatus === "partial" \? "The available transcript is shown\. Some timing, speaker or provider-completion detail is not confirmed\."/u)
  assert.match(page, /disabled=\{detailReviewBusy\}/u)
})

test("the workspace recovery view cannot fail with the language provider", () => {
  const fallback = app.match(
    /function WorkspaceFailureFallback[\s\S]*?class WorkspaceErrorBoundary/u,
  )?.[0] ?? ""
  assert.match(fallback, /translateText\(text, language\)/u)
  assert.match(fallback, /isLanguageCode\(documentLanguage\)/u)
  assert.doesNotMatch(fallback, /useLanguage\(\)/u)
})

test("phone-call narrow layouts and read-only states keep actions usable", () => {
  assert.match(dataTable, /className="inline-flex min-h-6 min-w-0 items-center gap-1\.5[^"]+"/u)
  assert.match(components, /sm:grid-cols-\[28px_minmax\(0,1fr\)_auto\]/u)
  assert.match(components, /col-span-2 w-full sm:col-span-1 sm:w-auto/u)
  assert.match(components, /Review access is required to change this identity match\./u)
  assert.match(page, /Read-only call record/u)
  assert.match(page, /aria-label=\{t\(title\)\}/u)
  assert.match(page, /role="status" aria-live="polite"/u)
  assert.match(components, /role="note"[\s\S]*<bdi dir="ltr">\{previous\.sourceLabel\} → \{segment\.sourceLabel\}<\/bdi>/u)
})

test("phone-call review workflows preserve focus, unsaved edits, and recoverable errors", () => {
  assert.match(page, /<Textarea autoFocus value=\{value\}/u)
  assert.match(page, /editButtonRef\.current\?\.focus\(\)/u)
  assert.match(page, /editingField !== null && editingField !== "summary"/u)
  assert.match(page, /editingField !== null && editingField !== "notes"/u)
  assert.match(page, /setNotesError\(message\)/u)
  assert.match(page, /setMatchError\(message\)/u)
  assert.match(page, /item\.id === action\.id \? \{ \.\.\.item, error: message \}/u)
  assert.match(page, /matchError \? <p[^>]+role="alert"/u)
  assert.match(components, /<Textarea autoFocus value=\{editedText\}/u)
  assert.match(components, /reviewedActionRefs\.current\.get\(focusReviewedId\)\?\.focus\(\)/u)
  assert.match(components, /ref=\{rootRef\} tabIndex=\{-1\}/u)
})

test("phone-call matching and derived analytics expose readable evidence in RTL layouts", () => {
  assert.match(components, /candidate\.reasons\.join\(" · "\)/u)
  assert.match(components, /candidate\.secondaryLabel \? <p[^>]+dir="auto"/u)
  assert.match(components, /const recordTypeLabel = candidate\.recordType/u)
  assert.match(components, /title=\{reason\.label\}>\{reason\.label\}<\/p>/u)
  assert.doesNotMatch(components, /\{t\(reason\.label\)\}/u)
  assert.match(previewData, /speakerLabel: "Handler transcript"[\s\S]*startedAt: null[\s\S]*timingProvenance: "source_boundary_only"/u)
  assert.doesNotMatch(previewData, /Requested during the employee portion of the call\./u)
  assert.match(previewData, /reason: "Alex requested the revised quote during the receptionist portion of the call\."/u)
})

test("phone-call privacy keeps disclosure, consent, and provenance explicit", () => {
  assert.match(api, /PhoneCallAIDisclosureStatus = "unknown" \| "disclosed" \| "not_required" \| "conflict"/u)
  assert.match(api, /PhoneCallConsentStatus = "unknown" \| "not_required" \| "received" \| "declined" \| "conflict"/u)
  for (const field of [
    "aiDisclosureStatus",
    "recordingConsentStatus",
    "transcriptionConsentStatus",
    "consentDisclosureVersion",
    "consentDisclosedAt",
    "consentEvidence",
    "sourceEventId",
    "sourceFields",
  ]) assert.match(api, new RegExp(field))
  assert.match(api, /recordingConsent: "received" \| "not_recorded" \| "unknown"/u)
  assert.match(previewData, /aiDisclosureStatus: "disclosed"/u)
  assert.match(previewData, /consentEvidence: \{ provider: "elevenlabs"/u)
  assert.match(page, /function PhoneCallPrivacySection/u)
  assert.match(page, /Unknown does not mean consent\./u)
  assert.match(page, /row\.status === "conflict" \|\| row\.status === "declined"/u)
  assert.match(page, /Privacy evidence needs attention\./u)
  assert.match(page, /role="alert"/u)
  assert.match(page, /<details className="group/u)
  assert.match(page, /View consent evidence/u)
  assert.match(page, /consentEvidence\.sourceFields\.join/u)
  assert.match(page, /<bdi data-i18n-skip dir="ltr">\{call\.consentEvidence\.sourceEventId\}<\/bdi>/u)
  assert.doesNotMatch(page, /\["Consent", t\(call\.recordingConsent/u)
})
