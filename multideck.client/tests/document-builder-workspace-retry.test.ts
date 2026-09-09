import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/lib/document-builder-api.ts", import.meta.url), "utf8")

test("the read-only document workspace retries one transient Edge transport failure", () => {
  assert.match(source, /error\.name === "FunctionsFetchError"/)
  assert.match(source, /error\.message === "Failed to send a request to the Edge Function"/)
  assert.match(source, /if \(error && isTransientFunctionFetchError\(error\)\)/)
  assert.equal((source.match(/await invokeWorkspace\(\)/g) ?? []).length, 2)
})

test("document generation and downloads are not automatically retried", () => {
  const retryBlock = source.match(/export async function getDocumentBuilderWorkspace[\s\S]*?\n}\n/)?.[0] ?? ""

  assert.match(retryBlock, /isTransientFunctionFetchError/)
  assert.doesNotMatch(source.match(/export async function renderDocument[\s\S]*?\n}\n/)?.[0] ?? "", /isTransientFunctionFetchError/)
  assert.doesNotMatch(source.match(/export async function getGeneratedDocumentDownload[\s\S]*?\n}\n/)?.[0] ?? "", /isTransientFunctionFetchError/)
})
