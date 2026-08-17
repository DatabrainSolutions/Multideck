import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const page = read("multideck.client/src/pages/agent-dexter-page.tsx")
const components = read("multideck.client/src/components/multideck/agent-dexter-components.tsx")

test("Full access waits for one server-issued mode response at a time", () => {
  assert.match(page, /accessModeRequestInFlightRef\.current/)
  assert.match(page, /accessModeRequestVersionRef\.current !== requestVersion/)
  assert.match(page, /conversationIntentRef\.current\.version !== conversationVersion/)
  assert.match(page, /setIsAccessModeChanging\(true\)/)
  assert.match(page, /isSending=\{isWorking\}/)
  assert.match(components, /disabled=\{isSending \|\| isAccessModeChanging\}/)
  assert.match(components, /aria-busy=\{disabled\}/)
})

test("conversation changes invalidate pending mode responses and restore Approve", () => {
  assert.ok((page.match(/accessModeRequestVersionRef\.current \+= 1/g) ?? []).length >= 2)
  assert.ok((page.match(/dexterClientSessionIdRef\.current = crypto\.randomUUID\(\)/g) ?? []).length >= 2)
  assert.ok((page.match(/setAccessMode\("approve"\)/g) ?? []).length >= 3)
  assert.ok((page.match(/setFullAccessGrantId\(null\)/g) ?? []).length >= 3)
})

test("the translated access label reserves enough width without clipping the switch", () => {
  assert.match(components, /Math\.max\(approveLabelRef\.current\.getBoundingClientRect\(\)\.width, approveLabelRef\.current\.scrollWidth\)/)
  assert.match(components, /Math\.ceil\(measuredFullAccessWidth\) \+ 6/)
  assert.match(components, /overflow-visible rounded-full/)
})

test("recording captions are not shipped as Dexter product UI", () => {
  for (const recordingCaption of [
    "Safe read-only request",
    "READ-ONLY RESULT",
    "FAIL-CLOSED",
    "Access resets to Approve",
  ]) {
    assert.doesNotMatch(page, new RegExp(recordingCaption, "i"))
    assert.doesNotMatch(components, new RegExp(recordingCaption, "i"))
  }
})
