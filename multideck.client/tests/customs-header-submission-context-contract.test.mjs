import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pageSource = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("the standalone declaration header keeps its title context separate from responsive actions", () => {
  const headerStart = pageSource.indexOf("<header", pageSource.indexOf('data-testid={`standalone-${kind}-editor`}'))
  const header = pageSource.slice(headerStart, pageSource.indexOf("</header>", headerStart))
  const headerActions = header.match(/data-customs-header-actions>([\s\S]*?)\n          <\/div>/u)?.[1] ?? ""

  assert.match(header, /Declaration status[\s\S]*?<StatusPill kind="status" tone=\{customsStatusTone\(customsStatus\)\}/u)
  assert.match(headerActions, /openDeclarationPdf[\s\S]*?View declaration[\s\S]*?saveDraft[\s\S]*?Save draft/u)
  assert.match(header, /data-customs-header-context[\s\S]*?Assigned to[\s\S]*?DeclarationAssigneePicker[\s\S]*?iCustoms correlation ID[\s\S]*?Display options[\s\S]*?<SegmentedControl[\s\S]*?<DeclarationFieldVisibilityPopover/u)
  assert.match(header, /Changes could not be saved[\s\S]*?queueAutosave\(draft\)[\s\S]*?Retry save/u)
  assert.doesNotMatch(headerActions, /borderBlockEnd|rounded-full|toneToVar/u)
  assert.doesNotMatch(pageSource, /Standalone import" : "Standalone export/u)
  assert.doesNotMatch(pageSource, /autosaveStatus === "saved" \? t\("All changes saved"\)/u)
})

test("confirmed iCustoms correlation IDs appear in the header and submission context without a fallback ID", () => {
  assert.match(pageSource, /const iCustomsProviderReference = iCustomsState\?\.declaration\.correlationId\?\.trim\(\) \|\| null/u)
  assert.match(pageSource, /iCustomsProviderReference \? <p[\s\S]*?iCustoms correlation ID[\s\S]*?dir="ltr"[\s\S]*?\{iCustomsProviderReference\}/u)
  assert.doesNotMatch(pageSource, /const iCustomsProviderReference[^\n]*draft\.iCustomsCorrelationId/u)
  assert.match(pageSource, /provider \|\| providerCorrelationId \? <dl[\s\S]*?iCustoms correlation ID[\s\S]*?valueDirection="ltr"/u)
  assert.doesNotMatch(pageSource, /iCustomsProviderReference[^\n]*declarationId/u)
})
