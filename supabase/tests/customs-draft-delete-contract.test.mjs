import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../migrations/20260813194429_delete_customs_draft.sql", import.meta.url), "utf8")
const dexter = await readFile(new URL("../functions/agent-dexter/index.ts", import.meta.url), "utf8")
const edgeFunction = await readFile(new URL("../functions/icustoms-api/index.ts", import.meta.url), "utf8")
const providerClient = await readFile(new URL("../functions/_shared/icustoms.ts", import.meta.url), "utf8")

test("Customs draft deletion stays owner-bound, draft-only, and soft", () => {
  assert.match(migration, /security definer/u)
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/u)
  assert.match(migration, /"CUST_CreatedBy" = v_user_id/u)
  assert.match(migration, /v_status <> 'draft'/u)
  assert.match(migration, /"CUST_IsDeleted" = true/u)
  assert.doesNotMatch(migration, /delete from public\."Customs_Declarations"/u)
})

test("Customs draft deletion is audited and unavailable to anonymous callers", () => {
  assert.match(migration, /insert into public\."Customs_AuditLog"/u)
  assert.match(migration, /'draft_deleted'/u)
  assert.match(migration, /revoke all on function public\.delete_customs_draft\(uuid\) from public, anon/u)
  assert.match(migration, /grant execute on function public\.delete_customs_draft\(uuid\) to authenticated/u)
})

test("Dexter names the destructive-action exception instead of guessing support", () => {
  assert.match(migration, /Dexter parity exception/u)
  assert.match(dexter, /Deleting a Customs draft is intentionally not available to Dexter/u)
  assert.match(dexter, /not a meaningful Watching for you event/u)
})

test("new records start a real iCustoms workspace draft without HMRC submission", () => {
  assert.match(edgeFunction, /provider-draft-start/u)
  assert.match(edgeFunction, /buildICustomsDraftShellXml/u)
  assert.match(edgeFunction, /\.createDraft\(xml\)/u)
  assert.match(providerClient, /element\("DeclarationCategory"/u)
  assert.match(providerClient, /element\("TypeCode"/u)
  assert.doesNotMatch(edgeFunction.match(/async function startProviderDraft[\s\S]*?async function deleteProviderDraft/u)?.[0] ?? "", /\.submit\(/u)
})

test("deletion removes the provider draft before its owner-bound local recovery record", () => {
  const lifecycle = edgeFunction.match(/async function deleteProviderDraft[\s\S]*?async function/u)?.[0] ?? edgeFunction
  assert.match(lifecycle, /declarationForUser[\s\S]*true/u)
  assert.match(lifecycle, /deleteWorkspaceDraft\(internalDraftId\)/u)
  assert.match(lifecycle, /declarationDetails\([\s\S]*correlationId/u)
  assert.match(lifecycle, /icustoms_workspace_draft_still_exists/u)
  assert.match(lifecycle, /CUST_CreatedBy/u)
  assert.match(lifecycle, /CUST_Status/u)
  assert.match(lifecycle, /CUST_IsDeleted: true/u)
  assert.ok(lifecycle.indexOf("deleteWorkspaceDraft") < lifecycle.indexOf("CUST_IsDeleted: true"))
  assert.doesNotMatch(lifecycle, /\/api\/cds\/v1\/cancel/u)
})

test("the provider UUID returned by supported draft creation is retained for deletion", () => {
  assert.match(edgeFunction, /record\.UUID/u)
  assert.match(edgeFunction, /ICUSS_iCustomsSubmissionID: internalDraftId/u)
})

test("a restored locally deleted draft starts a fresh provider mirror", () => {
  const lifecycle = edgeFunction.match(/async function providerDraft[\s\S]*?async function startProviderDraft/u)?.[0] ?? edgeFunction
  assert.match(lifecycle, /\["rejected", "cancelled"\]\.includes/u)
  assert.match(lifecycle, /correlationFrom\(declaration, latest\)/u)
  assert.match(edgeFunction, /submission\?\.ICUSS_Status, 40\) === "cancelled"/u)
  assert.match(edgeFunction, /hasCustomsDraft: Boolean\(activeCorrelation\)/u)
})

test("Dexter's approved create action starts the same iCustoms draft lifecycle", () => {
  assert.match(dexter, /async function startCustomsProviderDraftFetch/u)
  assert.match(dexter, /provider-draft-start/u)
  assert.match(dexter, /dexter:start:/u)
  assert.match(dexter, /creates its editable iCustoms draft but does not submit anything to HMRC/u)
  assert.doesNotMatch(dexter, /It will remain a Multideck draft and will not be sent to iCustoms/u)
})
