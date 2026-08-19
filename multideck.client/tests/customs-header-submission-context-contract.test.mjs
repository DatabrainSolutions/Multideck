import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pageSource = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("the standalone declaration header keeps its title context left and actions together on the right", () => {
  const headerActions = pageSource.match(/<div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2" data-customs-header-actions>([\s\S]*?)\n          <\/div>/u)?.[1] ?? ""

  assert.match(pageSource, /<header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-8">/u)
  assert.match(pageSource, /items-start lg:flex-1[\s\S]*?<h1 className="mt-3 text-start[\s\S]*?<p className="mt-1/u)
  assert.match(pageSource, /flex-col items-end gap-1\.5[\s\S]*?iCustomsProviderReference[\s\S]*?text-end[\s\S]*?data-customs-header-actions[\s\S]*?Declaration status[\s\S]*?<SegmentedControl[\s\S]*?<DeclarationFieldVisibilityPopover[\s\S]*?View declaration[\s\S]*?Save draft/u)
  assert.match(headerActions, /<span[\s\S]*?role="status"[\s\S]*?<StatusPill kind="status" tone=\{customsStatusTone\(customsStatus\)\}/u)
  assert.doesNotMatch(headerActions, /borderBlockEnd|rounded-full|toneToVar/u)
  assert.doesNotMatch(pageSource, /Standalone import" : "Standalone export/u)
  assert.doesNotMatch(pageSource, /autosaveStatus === "saved" \? t\("All changes saved"\)/u)
})

test("confirmed iCustoms correlation IDs appear in the header and submission context without a fallback ID", () => {
  assert.match(pageSource, /const iCustomsProviderReference = iCustomsState\?\.declaration\.correlationId\?\.trim\(\) \|\| null/u)
  assert.match(pageSource, /iCustomsProviderReference \? <p className="max-w-full text-end[\s\S]*?iCustoms correlation ID[\s\S]*?dir="ltr"[\s\S]*?\{iCustomsProviderReference\}/u)
  assert.doesNotMatch(pageSource, /const iCustomsProviderReference[^\n]*draft\.iCustomsCorrelationId/u)
  assert.match(pageSource, /provider \|\| providerCorrelationId \? <dl[\s\S]*?iCustoms correlation ID[\s\S]*?valueDirection="ltr"/u)
  assert.doesNotMatch(pageSource, /iCustomsProviderReference[^\n]*declarationId/u)
})
