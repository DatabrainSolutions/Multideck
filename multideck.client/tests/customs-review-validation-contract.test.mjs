import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("standalone Customs review validates automatically without manual check actions", () => {
  assert.doesNotMatch(source, />\{t\("Validate"\)\}<\/Button>/u)
  assert.doesNotMatch(source, />\{t\("Run form checks"\)\}<\/Button>/u)
  assert.doesNotMatch(source, /onValidate=/u)
  assert.match(source, /const completion = useMemo\(\(\) => declarationCompletion\(draft\), \[draft\]\)/u)
  assert.match(source, /tab === "review" \|\| iCustomsIssues\.length \|\| \["rejected", "error"\]\.includes\(customsStatus\)/u)
})

test("submission persists current edits and passes server validation before confirmation", () => {
  const prepareStart = source.indexOf("async function prepareSubmitToICustoms()")
  const submitStart = source.indexOf("async function submitToICustoms()")
  const prepare = source.slice(prepareStart, submitStart)

  assert.ok(prepareStart > -1)
  assert.ok(submitStart > prepareStart)
  assert.match(prepare, /completion\.issues\.length/u)
  assert.match(prepare, /saveDeclarationDraft\(draft, declarationId\)/u)
  assert.match(prepare, /validateICustomsDeclaration\(saved\.id\)/u)
  assert.match(prepare, /if \(!validation\.ready\)[\s\S]*setICustomsIssues\(validation\.issues\)[\s\S]*revealReviewIssues\(\)/u)
  assert.match(prepare, /setSubmitDialogOpen\(true\)/u)
})

test("known failed-provider issues reduce readiness until correction is confirmed", () => {
  assert.match(source, /function declarationReadiness\(/u)
  assert.match(source, /\["rejected", "error"\]\.includes\(provider\.status\)/u)
  assert.match(source, /completion\.totalChecks \+ externalIssueMessages\.size/u)
  assert.match(source, /const readiness = declarationReadiness\(completion, iCustomsIssues, iCustomsState\)/u)
  assert.match(source, /\{readiness\.percent\}% \{t\("complete"\)\}/u)
  assert.doesNotMatch(source, /\{completion\.percent\}% \{t\("complete"\)\}/u)
})
