import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const edgeFunction = await readFile(new URL("../functions/icustoms-api/index.ts", import.meta.url), "utf8")
const providerClient = await readFile(new URL("../functions/_shared/icustoms.ts", import.meta.url), "utf8")
const clientApi = await readFile(new URL("../../multideck.client/src/lib/icustoms-api.ts", import.meta.url), "utf8")
const declarationsPage = await readFile(new URL("../../multideck.client/src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("the true iCustoms submit path rejects incomplete persisted declarations before provider submission", () => {
  const submitPath = edgeFunction.match(/async function submitDeclaration[\s\S]*?async function refreshDeclaration/u)?.[0] ?? ""

  assert.match(submitPath, /validateICustomsDeclaration\([\s\S]*?declaration\.CUST_GenericPayloadJSON[\s\S]*?direction/u)
  assert.match(submitPath, /if \(submissionIssues\.length\) \{[\s\S]*?throw new CustomsSubmissionGateError\(submissionIssues\)/u)
  assert.match(submitPath, /const client = connectedICustomsClient\(\)/u)
  assert.ok(
    submitPath.indexOf("throw new CustomsSubmissionGateError") < submitPath.indexOf("const client = connectedICustomsClient()"),
    "The mandatory-field gate must run before any iCustoms submission call.",
  )
})

test("submissions use iCustoms' documented draft-submit or queued-create endpoint", () => {
  const submitPath = edgeFunction.match(/async function submitDeclaration[\s\S]*?async function refreshDeclaration/u)?.[0] ?? ""
  const providerSubmit = providerClient.match(/submitDraft\([\s\S]*?\n  \}/u)?.[0] ?? ""
  const providerDraftSubmit = providerClient.match(/draftAndSubmit\([\s\S]*?\n  \}/u)?.[0] ?? ""

  assert.match(submitPath, /\/api\/cds\/v1\/submit\/\$\{correlationId\}/u)
  assert.match(submitPath, /\/api\/cds\/v1\/draft-and-submit/u)
  assert.match(submitPath, /const operation = correlationId \? "submit_draft" : "draft_and_submit"/u)
  assert.match(submitPath, /correlationId[\s\S]*?client\.submitDraft\(correlationId\)[\s\S]*?client\.draftAndSubmit\(xml\)/u)
  assert.match(providerSubmit, /\/api\/cds\/v1\/submit\/\$\{encodeURIComponent\(correlationId\)\}/u)
  assert.match(providerSubmit, /method: "POST"/u)
  assert.doesNotMatch(providerSubmit, /body:/u)
  assert.match(providerDraftSubmit, /\/api\/cds\/v1\/draft-and-submit/u)
  assert.match(providerDraftSubmit, /"Content-Type": "application\/xml"/u)
  assert.match(providerDraftSubmit, /body: xml/u)
  assert.match(providerClient, /Array\.isArray\(record\.declarations\)[\s\S]*?providerCorrelationId\(declaration\)/u)
})

test("a provider error body cannot be recorded as a successful submission", () => {
  const submitPath = edgeFunction.match(/async function submitDeclaration[\s\S]*?async function refreshDeclaration/u)?.[0] ?? ""

  assert.match(submitPath, /responseRecord\.success === false/u)
  assert.match(submitPath, /icustoms_submission_failed/u)
  assert.ok(submitPath.indexOf("responseRecord.success === false") < submitPath.indexOf("saveProviderSuccess"))
})

test("provider persistence fails closed for false-success bodies", () => {
  const savePath = edgeFunction.match(
    /async function saveProviderSuccess[\s\S]*?async function providerDraft/u,
  )?.[0] ?? ""

  assert.match(savePath, /providerBody\.success === false/u)
  assert.match(savePath, /String\(providerBody\.success\)\.toLowerCase\(\) === "false"/u)
  assert.match(savePath, /icustoms_submission_failed/u)
  assert.ok(savePath.indexOf("providerBody.success === false") < savePath.indexOf("ICUSS_Status:"))
})

test("the review surface can submit a ready declaration even when a separate provider draft was not created", () => {
  const submissionCard = declarationsPage.match(/\{providerLifecycleStarted \? null : <>[\s\S]*?<\/>\}/u)?.[0] ?? ""

  assert.match(submissionCard, /!hasProviderDraft \? <Button[\s\S]*?onClick=\{onCreateDraft\}/u)
  assert.match(submissionCard, /providerRejected \? null : <Button[\s\S]*?onClick=\{onSubmit\}/u)
})

test("the submission gate returns actionable issues that the existing review flow preserves and reveals", () => {
  assert.match(edgeFunction, /code: "customs_submission_gate_failed",[\s\S]*?issues: error\.issues/u)
  assert.match(clientApi, /new ICustomsApiError\([\s\S]*?Array\.isArray\(payload\.issues\)/u)

  const submitHandler = declarationsPage.match(/async function submitToICustoms\(\)[\s\S]*?const readLocalCustomsState/u)?.[0] ?? ""
  assert.match(submitHandler, /setICustomsIssues\(error\.issues\)/u)
  assert.match(submitHandler, /revealReviewIssues\(\)/u)
  assert.doesNotMatch(submitHandler, /setDraft\(/u)
})
