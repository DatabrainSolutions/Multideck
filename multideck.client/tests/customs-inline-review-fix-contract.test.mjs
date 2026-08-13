import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("customs validation opens review instead of navigating to the source field", () => {
  assert.match(source, /setViewMode\("tabs"\)[\s\S]*selectTab\("review"\)/u)
  assert.doesNotMatch(source, /function fixIssue\(/u)
  assert.doesNotMatch(source, /generalTabForField/u)
})

test("review fixes disclose focused editable fields in place", () => {
  assert.match(source, /aria-expanded=\{expanded\}/u)
  assert.match(source, /aria-controls=\{`customs-review-fix-/u)
  assert.match(source, /<ReviewFixFields draft=\{draft\} issue=\{issue\}/u)
  assert.match(source, /querySelector<HTMLElement>\("input, textarea, button"\)\?\.focus\(\)/u)
  assert.match(source, /<CompactCustomsFormContext\.Provider value>/u)
  assert.doesNotMatch(source, /invalid && "ring-2 ring-\[color-mix\(in_srgb,var\(--md-red\)/u)
  assert.match(source, /function confirmFix\(\)[\s\S]*setOpenFixKey\(null\)[\s\S]*setHeldIssue\(null\)/u)
  assert.match(source, /onClick=\{confirmFix\}>\{t\("Confirm"\)\}<\/Button>/u)
  assert.doesNotMatch(source, /Country`\]\s*\.filter\(/u)
  assert.match(source, /<ReviewFixSectionHeader draft=\{draft\} issue=\{issue\} t=\{t\} \/>/u)
})

test("inline fixes cover grouped form and provider issues", () => {
  assert.match(source, /general-\(importer\|exporter\|consignee\|declarant\)-contact/u)
  assert.match(source, /\["procedureCode", "additionalProcedureCode"\]/u)
  assert.match(source, /\["additionalDocumentCategory", "additionalDocumentType", "additionalDocumentId"\]/u)
  assert.match(source, /<ReviewFixFields draft=\{draft\} providerIssue=\{issue\}/u)
  assert.match(source, /<ReviewFixSectionHeader draft=\{draft\} providerIssue=\{issue\} t=\{t\} \/>/u)
  assert.match(source, /issue\?\.scope === "item"[\s\S]*`\$\{t\("Items"\)\} · \$\{t\("Item"\)\} \$\{itemNumber\}`/u)
  assert.match(source, /section === "documents"[\s\S]*draft\.direction === "import" \? "Import terms" : "Documents & offices"/u)
})

test("provider rejection fixes stay in the main review panel", () => {
  const reviewPanelEnd = source.indexOf('</Surface>\n    <div className="space-y-4">', source.indexOf("function ReviewSection"))
  const providerFixes = source.indexOf("providerRejected && providerIssues.length", source.indexOf("function ReviewSection"))

  assert.ok(reviewPanelEnd > -1)
  assert.ok(providerFixes > -1)
  assert.ok(providerFixes < reviewPanelEnd)
})

test("the iCustoms record link appears only for a real provider draft", () => {
  assert.match(source, /hasProviderDraft && draft\.iCustomsCorrelationId/u)
  assert.match(source, /direction === "export"[\s\S]*`\/export\/cds\/edit\/\$\{encodeURIComponent\(providerId\)\}`[\s\S]*`\/cds\/edit\/\$\{encodeURIComponent\(providerId\)\}`/u)
  assert.match(source, /providerDeclarationUrl \? <Button asChild variant="outline"/u)
  assert.match(source, /<img src=\{iCustomsLogo\} alt="iCustoms"/u)
  assert.match(source, /target="_blank" rel="noopener noreferrer"/u)
})
