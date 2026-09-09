import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

test("Carbone Studio component remains authenticated and server-hosted", async () => {
  const [edge, client, page, config] = await Promise.all([
    read("supabase/functions/document-studio/index.ts"),
    read("multideck.client/src/lib/document-builder-api.ts"),
    read("multideck.client/src/pages/documents-page.tsx"),
    read("supabase/config.toml"),
  ])

  assert.match(config, /\[functions\.document-studio\]\s+verify_jwt = true/)
  assert.match(edge, /authenticateRequest\(request\)/)
  assert.match(edge, /payload\.action === "component"/)
  assert.match(edge, /getCarboneAuthorization\(\)/)
  assert.match(edge, /\/carbone-studio\.js\?v=/)
  assert.match(edge, /CARBONE_STUDIO_VERSION/)
  assert.match(edge, /maximumStudioComponentBytes = 5 \* 1024 \* 1024/)
  assert.match(client, /Authorization: `Bearer \$\{session\.access_token\}`/)
  assert.match(client, /JSON\.stringify\(\{ action: "component" \}\)/)
  assert.match(page, /getDocumentStudioComponent\(\)/)
  assert.match(page, /script\.type = "module"/)
  assert.match(page, /setRenderOptions\(\{ \.\.\.activeSession\.renderOptions, data: activeSampleData \}, false\)[\s\S]+openTemplateDataURI/)
  assert.match(page, /renderDocumentStudioPreview[\s\S]+sampleData/)
  assert.match(page, /studio\.addEventListener\("input", readCurrentStudioData, true\)/)
  assert.match(page, /typeof studio\.getRenderOptions === "function"/)
  assert.match(page, /new MutationObserver\(readCurrentStudioData\)/)
  assert.match(page, /new MutationObserver\(attachStudioDataObserver\)/)
  assert.match(page, /\[role="textbox"\]\[data-language="json"\]/)
  assert.match(page, /cmView\?\.view\?\.state\?\.doc\?\.toString\(\)/)
  assert.match(page, /JSON\.parse\(documentText\)/)
  assert.match(page, /Keep the last valid preview visible/)
  assert.match(page, /latestSampleJson[\s\S]+previewDebounceId[\s\S]+450/)
  assert.match(page, /previewRequestId[\s\S]+currentRequestId !== previewRequestId/)
  assert.match(page, /t\("Updating preview…"\)/)
  assert.match(page, /main > c-design > c-flex > c-flex-panel:first-child[\s\S]+main > c-design > c-flex > c-flex[\s\S]+display: none !important/)
  assert.match(page, /t\("Data \(JSON\)"\)/)
  assert.match(page, /downloadTemplateForLocalEditing/)
  assert.match(page, /uploadEditedTemplate/)
  assert.doesNotMatch(page, /template:updated/)
  assert.match(page, /saveDocumentStudioTemplate/)
  assert.doesNotMatch(page, /bin\.carbone\.io/)
  assert.match(page, /<iframe[\s\S]+title=\{t\("Live document preview"\)\}/)
  assert.doesNotMatch(client, /CARBONE_(?:AUTH|USERNAME|PASSWORD|API_TOKEN)/)
})

test("template saves are authorised, versioned, and keep published templates current", async () => {
  const [edge, migration, replacementPublishing] = await Promise.all([
    read("supabase/functions/document-studio/index.ts"),
    read("supabase/migrations/20260805123825_document_template_authoring_workflow.sql"),
    read("supabase/migrations/20260806083120_keep_published_template_saves_current.sql"),
  ])

  assert.match(edge, /payload\.action === "save"/)
  assert.match(edge, /versioning: true/)
  assert.match(edge, /authorize_studio_template_save/)
  assert.match(edge, /register_studio_template_version/)
  assert.match(edge, /templateSourcesBucket/)
  assert.match(edge, /sha256Hex\(templateBytes\)/)
  assert.match(edge, /record_template_source/)
  assert.match(edge, /\.from\(templateSourcesBucket\)/)
  assert.match(edge, /payload\.action === "bootstrap"/)
  assert.match(edge, /payload\.action === "approve"/)
  assert.match(edge, /approve_studio_template_version/)
  assert.match(edge, /providerTemplateId[\s\S]+\^\[0-9\]\{1,20\}\$/)
  assert.match(migration, /Documents\.Manage/)
  assert.match(migration, /'draft'/)
  assert.match(migration, /revoke all on function document_api\.register_studio_template_version/)
  assert.match(migration, /grant execute on function document_api\.register_studio_template_version[\s\S]+to service_role/)
  assert.match(replacementPublishing, /when selected_template\."DOCBT_StatusCode" = 'published' then 'published'/)
  assert.match(replacementPublishing, /"DOCBT_CurrentVersionNo" = case/)
  assert.match(replacementPublishing, /when saved_status = 'published' then next_version_no/)
})

test("template sources are privately owned by each tenant and catalogued before use", async () => {
  const migration = await read("supabase/migrations/20260805151933_register_system_template_sources.sql")

  assert.match(migration, /'multideck-template-sources'/)
  assert.match(migration, /false,\s+15728640/)
  assert.match(migration, /record_template_source/)
  assert.match(migration, /storage\.objects/)
  assert.match(migration, /DOC_StoredObjects/)
  assert.match(migration, /revoke all on function document_api\.record_template_source/)
  assert.match(migration, /grant execute on function document_api\.record_template_source[\s\S]+to service_role/)
})

test("published template thumbnails render the blank approved source", async () => {
  const page = await read("multideck.client/src/pages/documents-page.tsx")

  assert.match(page, /getDocumentStudioSession\(request\)/)
  assert.match(page, /renderDocumentStudioPreview\(\{ \.\.\.request, templateBase64: session\.templateBase64, sampleData: \{\} \}\)/)
  assert.match(page, /renderPdfPageImages/)
  assert.match(page, /aspect-\[210\/297\]/)
  assert.match(page, /pathLength="1"/)
  assert.match(page, /stroke-dashoffset:1/)
  assert.match(page, /text-center/)
  assert.match(page, /document\.status === "ready" && document\.templateCode === template\.code/)
  assert.match(page, /\?\? workspace\?\.generatedDocuments\.find\(\(document\) => document\.status === "ready"\)/)
  assert.match(page, /document\.targetReference\.slice\(separatorIndex \+ 1\)/)
})

test("draft templates stay out of the customer template row", async () => {
  const [migration, page] = await Promise.all([
    read("supabase/migrations/20260805152605_expose_review_templates_to_managers.sql"),
    read("multideck.client/src/pages/documents-page.tsx"),
  ])

  assert.match(migration, /can_manage and template\."DOCBT_StatusCode" = 'draft'/)
  assert.match(migration, /template\."DOCBT_StatusCode" = 'published'/)
  assert.doesNotMatch(page, /Templates in review/)
  assert.doesNotMatch(page, /Carrier review/)
  assert.match(page, /templates=\{workspace\.templates\.filter\(\(template\) => template\.status === "published"\)\}/)
})

test("the full-height documents route owns a constrained page scroll area", async () => {
  const page = await read("multideck.client/src/pages/documents-page.tsx")

  assert.match(page, /data-document-page-scroll/)
  assert.match(page, /h-full min-h-0 overflow-y-auto overscroll-contain/)
})

test("a saved private source can be explicitly published by the backend", async () => {
  const [migration, api] = await Promise.all([
    read("supabase/migrations/20260805153033_approve_carbone_document_template.sql"),
    read("multideck.client/src/lib/document-builder-api.ts"),
  ])

  assert.match(migration, /approve_studio_template_version/)
  assert.match(migration, /Documents\.Manage/)
  assert.match(migration, /\{carbone,versionId\}/)
  assert.match(migration, /\{source,path\}/)
  assert.match(migration, /'published'/)
  assert.match(api, /bootstrapDocumentStudioTemplate/)
  assert.match(api, /approveDocumentStudioTemplate/)
})

test("Master Air Waybill is published into the normal template row", async () => {
  const migration = await read("supabase/migrations/20260805170000_publish_master_air_waybill_template.sql")

  assert.match(migration, /DOCBT_Code" = 'MAWB'/)
  assert.match(migration, /DOCBT_StatusCode" = 'published'/)
  assert.match(migration, /DOCBTV_StatusCode" = 'published'/)
  assert.match(migration, /requiresCarrierApproval/)
  assert.match(migration, /'false'::jsonb/)
})

test("the first saved draft becomes the version offered for approval", async () => {
  const migration = await read("supabase/migrations/20260805153501_advance_draft_template_to_saved_version.sql")

  assert.match(migration, /advance_draft_template_to_saved_version/)
  assert.match(migration, /document_builder_advance_draft_template_version/)
  assert.match(migration, /DOCBT_CurrentVersionNo/)
  assert.match(migration, /DOCBT_StatusCode" = 'draft'/)
})

test("saved templates confirm context and active drafts reopen without losing progress", async () => {
  const [page, draftStore] = await Promise.all([
    read("multideck.client/src/pages/documents-page.tsx"),
    read("multideck.client/src/lib/document-builder-draft.ts"),
  ])
  const restoreStart = page.indexOf("async function restoreDraft")
  const restoreEnd = page.indexOf("const draftSnapshot", restoreStart)
  const restoreDraft = page.slice(restoreStart, restoreEnd)

  assert.match(page, /data-document-context-step/)
  assert.match(page, /t\("Choose document context"\)/)
  assert.match(page, /<Select value="job" disabled>/)
  assert.match(page, /t\("Jobs is the only data module currently supported for document templates\."\)/)
  assert.match(page, /t\("Continue to JSON and preview"\)/)
  assert.match(restoreDraft, /loadDocumentBuilderDraft/)
  assert.match(restoreDraft, /setJobNumber\(draft\.jobNumber\)/)
  assert.match(restoreDraft, /resumeActiveDraft && draft\.stage === "studio"/)
  assert.match(restoreDraft, /getDocumentStudioSession\(request\)/)
  assert.match(page, /const session = await getDocumentStudioSession\(request\)/)
  assert.match(page, /sampleData=\{studioData\}/)
  assert.match(page, /onDataChange=\{setStudioData\}/)
  assert.match(page, /window\.addEventListener\("pagehide", flushLatestDraft\)/)
  assert.match(page, /restoringDraftRef\.current = false[\s\S]+setStudioLoading\(false\)/)
  assert.match(page, /restoringDraftRef\.current \|\| !draftSnapshot/)
  assert.match(page, /latestDraftRef\.current = null[\s\S]+clearDocumentBuilderDraft/)
  assert.match(draftStore, /schemaVersion: 2/)
  assert.match(draftStore, /stage: "context" \| "studio"/)
  assert.match(draftStore, /sampleData: Record<string, unknown> \| null/)
  assert.match(draftStore, /savedTemplate: SaveDocumentStudioTemplateResponse \| null/)
  assert.match(draftStore, /store\.put\(draft, draftKey\(userId\)\)[\s\S]+store\.put\(draft, templateDraftKey\(userId, draft\.templateCode\)\)/)
  assert.match(draftStore, /activeDraftIdKey/)
  assert.match(draftStore, /crypto\.randomUUID\(\)/)
  assert.match(draftStore, /`active:\$\{userId\}:\$\{draftId\}`/)
  assert.match(draftStore, /legacyDraftKey\(userId\)/)
  assert.match(draftStore, /templateDraftKey\(userId, draft\.templateCode\)/)
})

test("document generation selects UUID templates without hiding safe function errors", async () => {
  const [migration, api] = await Promise.all([
    read("supabase/migrations/20260805142919_fix_document_template_uuid_selection.sql"),
    read("multideck.client/src/lib/document-builder-api.ts"),
  ])

  assert.match(migration, /min\(template\."DOCBT_ID"::text\)::uuid/)
  assert.doesNotMatch(migration, /min\(template\."DOCBT_ID"\)/)
  assert.match(api, /context instanceof Response/)
  assert.match(api, /context\.clone\(\)\.json\(\)/)
  assert.match(api, /!error\.message\.includes\("non-2xx"\)/)
  const page = await read("multideck.client/src/pages/documents-page.tsx")
  assert.match(page, /await fetch\(url, \{ credentials: "omit" \}\)/)
  assert.match(page, /URL\.createObjectURL\(await response\.blob\(\)\)/)
})
