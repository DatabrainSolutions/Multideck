import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const apiSource = await readFile(new URL("../src/lib/customs-drafts-api.ts", import.meta.url), "utf8")
const providerApiSource = await readFile(new URL("../src/lib/icustoms-api.ts", import.meta.url), "utf8")
const pageSource = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("opening a new standalone declaration creates its owned draft immediately", () => {
  assert.match(pageSource, /useState\(Boolean\(declarationId\)\)/u)
  assert.match(pageSource, /if \(declarationId \|\| initialDraftCreationRef\.current\) return/u)
  assert.match(pageSource, /saveStandaloneDeclarationDraft\(draftRef\.current\)/u)
  assert.match(pageSource, /do \{[\s\S]*latestDraft[\s\S]*saveStandaloneDeclarationDraft\(latestDraft, saved\.id\)[\s\S]*\} while/u)
  assert.match(pageSource, /startICustomsProviderDraft\(saved\.id, `start-\$\{saved\.id\}`\)/u)
  assert.match(pageSource, /navigate\(`\$\{registerPath\}\/\$\{saved\.id\}`\)/u)
})

test("editor changes are debounced and serialised into the existing draft", () => {
  assert.match(pageSource, /const queueAutosave = useCallback/u)
  assert.match(pageSource, /autosaveQueueRef\.current\.then/u)
  assert.match(pageSource, /window\.setTimeout\(\(\) => \{ void queueAutosave\(draft\) \}, 850\)/u)
  assert.match(pageSource, /visibilitychange/u)
  assert.match(pageSource, /Changes could not be saved/u)
  assert.match(pageSource, /Retry save/u)
})

test("register deletion uses the provider-backed Edge lifecycle and the Dexter inline confirmation motion", () => {
  assert.doesNotMatch(apiSource, /rpc\("delete_customs_draft"/u)
  assert.match(providerApiSource, /method: "DELETE"/u)
  assert.match(pageSource, /deleteICustomsProviderDraft\(draft\.id\)/u)
  assert.match(pageSource, /draft\.status\.toLocaleLowerCase\(\) !== "draft"/u)
  assert.match(pageSource, /animate=\{\{ width: confirming \? 62 : 28 \}\}/u)
  assert.match(pageSource, /absolute inset-y-0 right-0/u)
  assert.match(pageSource, /onKeyDown=\{\(event\) => \{[\s\S]*event\.key !== "Escape"/u)
  assert.match(pageSource, /md-sidebar-menu premium-stroke/u)
  assert.match(pageSource, /onSelect=\{\(\) => setContextDeleteDraft\(draft\)\}/u)
  assert.match(pageSource, /<DialogTitle>\{t\("Delete this draft\?"\)\}<\/DialogTitle>/u)
})
