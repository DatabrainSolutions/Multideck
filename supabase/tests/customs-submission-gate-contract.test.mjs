import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const edgeFunction = await readFile(new URL("../functions/icustoms-api/index.ts", import.meta.url), "utf8")
const clientApi = await readFile(new URL("../../multideck.client/src/lib/icustoms-api.ts", import.meta.url), "utf8")
const declarationsPage = await readFile(new URL("../../multideck.client/src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("the true iCustoms submit path rejects incomplete persisted declarations before provider submission", () => {
  const submitPath = edgeFunction.match(/async function submitDeclaration[\s\S]*?async function refreshDeclaration/u)?.[0] ?? ""

  assert.match(submitPath, /validateICustomsDeclaration\([\s\S]*?declaration\.CUST_GenericPayloadJSON[\s\S]*?direction/u)
  assert.match(submitPath, /if \(submissionIssues\.length\) \{[\s\S]*?throw new CustomsSubmissionGateError\(submissionIssues\)/u)
  assert.match(submitPath, /connectedICustomsClient\(\)\.submit\(/u)
  assert.ok(
    submitPath.indexOf("throw new CustomsSubmissionGateError") < submitPath.indexOf("connectedICustomsClient().submit"),
    "The mandatory-field gate must run before any iCustoms submission call.",
  )
})

test("the submission gate returns actionable issues that the existing review flow preserves and reveals", () => {
  assert.match(edgeFunction, /code: "customs_submission_gate_failed",[\s\S]*?issues: error\.issues/u)
  assert.match(clientApi, /new ICustomsApiError\([\s\S]*?Array\.isArray\(payload\.issues\)/u)

  const submitHandler = declarationsPage.match(/async function submitToICustoms\(\)[\s\S]*?const refreshFromICustoms/u)?.[0] ?? ""
  assert.match(submitHandler, /setICustomsIssues\(error\.issues\)/u)
  assert.match(submitHandler, /revealReviewIssues\(\)/u)
  assert.doesNotMatch(submitHandler, /setDraft\(/u)
})
