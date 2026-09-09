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
  assert.match(components, /aria-busy=\{Boolean\(pendingMode\)\}/)
})

test("conversation changes invalidate pending mode responses and restore Approve", () => {
  assert.ok((page.match(/accessModeRequestVersionRef\.current \+= 1/g) ?? []).length >= 2)
  assert.ok((page.match(/dexterClientSessionIdRef\.current = crypto\.randomUUID\(\)/g) ?? []).length >= 2)
  assert.ok((page.match(/setAccessMode\("approve"\)/g) ?? []).length >= 2)
  assert.ok((page.match(/setFullAccessGrantId\(null\)/g) ?? []).length >= 2)
  assert.ok((page.match(/setPendingAccessMode\(null\)/g) ?? []).length >= 3)
})

test("the access switch shows the requested mode immediately while the server confirms it", () => {
  assert.match(page, /const \[pendingAccessMode, setPendingAccessMode\] = useState<DexterAccessMode \| null>\(null\)/)
  assert.match(page, /setPendingAccessMode\(mode\)/)
  assert.match(page, /setAccessMode\(previousMode\)/)
  assert.match(page, /setFullAccessGrantId\(previousGrantId\)/)
  assert.match(components, /const displayMode = pendingMode \?\? mode/)
  assert.match(components, /pendingMode=\{pendingAccessMode\}/)
})

test("the access switch sizes itself to only the active translated label", () => {
  assert.match(components, /layout="size"/)
  assert.match(components, /w-fit shrink-0/)
  assert.match(components, /shrink-0 whitespace-nowrap leading-5/)
  assert.match(components, /transition-\[background-color,color,box-shadow\] duration-200 disabled:cursor-progress/)
  assert.match(components, /<div className="ms-auto flex shrink-0 items-center gap-2">\s*<DexterAccessModeToggle/)
  assert.doesNotMatch(components, /approveLabelRef|fullAccessLabelRef|labelWidths/)
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
