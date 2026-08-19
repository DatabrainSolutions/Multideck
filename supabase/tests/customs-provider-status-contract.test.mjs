import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const providerSource = await readFile(
  new URL("../functions/icustoms-api/index.ts", import.meta.url),
  "utf8",
)

test("the workspace receives the exact iCustoms outcome instead of the collapsed lifecycle bucket", () => {
  const publicSubmission = providerSource.match(
    /function publicSubmission[\s\S]*?function publicDeclaration/u,
  )?.[0] ?? ""

  assert.match(
    publicSubmission,
    /status: text\(row\.ICUSS_ProviderStatus, 40\) \|\| declarationProviderStatus \|\|[\s\S]*?row\.ICUSS_Status/u,
  )
  assert.doesNotMatch(publicSubmission, /status: row\.ICUSS_Status[,\n]/u)
  assert.match(
    providerSource,
    /row\.CUST_iCustomsStatusSnapshot \|\| row\.CUST_Status/u,
  )
  assert.match(
    providerSource,
    /publicSubmission\(submission, declarationProviderStatus\)/u,
  )
})

test("released and cleared provider outcomes remain distinct while the internal submission is accepted", () => {
  const saveProviderSuccess = providerSource.match(
    /async function saveProviderSuccess[\s\S]*?async function providerDraft/u,
  )?.[0] ?? ""

  assert.match(
    saveProviderSuccess,
    /\["released", "cleared"\]\.includes\(providerStatus\)[\s\S]*?\? "accepted"/u,
  )
  assert.match(saveProviderSuccess, /ICUSS_ProviderStatus: providerStatus/u)
})
