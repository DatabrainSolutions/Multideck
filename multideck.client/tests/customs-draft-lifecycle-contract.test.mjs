import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const apiSource = await readFile(new URL("../src/lib/customs-drafts-api.ts", import.meta.url), "utf8")
const providerApiSource = await readFile(new URL("../src/lib/icustoms-api.ts", import.meta.url), "utf8")
const pageSource = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
const dataTableSource = await readFile(new URL("../src/components/multideck/data-table.tsx", import.meta.url), "utf8")

test("opening a new standalone declaration creates its owned draft immediately", () => {
  assert.match(pageSource, /useState\(Boolean\(declarationId\)\)/u)
  assert.match(pageSource, /if \(declarationId \|\| initialDraftCreationRef\.current\) return/u)
  assert.match(pageSource, /saveDeclarationDraft\(draftRef\.current\)/u)
  assert.match(pageSource, /do \{[\s\S]*latestDraft[\s\S]*saveDeclarationDraft\(latestDraft, saved\.id\)[\s\S]*\} while/u)
  const initialCreation = pageSource.slice(pageSource.indexOf("const createInitialDraft = async"), pageSource.indexOf("void createInitialDraft()"))
  assert.doesNotMatch(initialCreation, /startICustomsProviderDraft|saveICustomsProviderDraft|validateICustomsDeclaration/u)
  assert.match(pageSource, /navigate\(`\$\{registerPath\}\/\$\{saved\.id\}`\)/u)
})

test("Review separates saving in Multideck from explicit provider creation or update", () => {
  assert.match(pageSource, /onSaveDraft=\{\(\) => void saveDraft\(false\)\}/u)
  const localSave = pageSource.slice(pageSource.indexOf("async function saveDraft("), pageSource.indexOf("async function createOrUpdateICustomsDraft("))
  assert.doesNotMatch(localSave, /startICustomsProviderDraft|saveICustomsProviderDraft|validateICustomsDeclaration/u)
  assert.match(localSave, /Draft saved in Multideck/u)
  assert.match(pageSource, /onClick=\{onCreateDraft\}[\s\S]*?hasProviderDraft \? "Update iCustoms draft" : "Create iCustoms draft"/u)
  assert.match(pageSource, /onClick=\{onSaveDraft\}[\s\S]*?t\(savingDraft \|\| iCustomsBusy === "draft" \? "Saving draft" : "Save draft"\)/u)
  assert.doesNotMatch(pageSource, /Update customs test draft/u)
})

test("declaration document actions stay hidden until an accepted state has an MRN", () => {
  assert.match(pageSource, /Boolean\(declarationId && iCustomsState\?\.declaration\.provider\?\.mrn && \["accepted", "released", "cleared"\]\.includes\(customsStatus\)\)/u)
  assert.match(pageSource, /\{declarationPdfAvailable \? <Button[\s\S]*?"View declaration"[\s\S]*?: null\}/u)
  assert.match(pageSource, /\{pdfAvailable \? <Button[\s\S]*?"View declaration PDF"[\s\S]*?: null\}/u)
  assert.doesNotMatch(pageSource, /PDF available after acceptance/u)
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
  assert.match(pageSource, /rowContextActions=\{\(draft\) =>/u)
  assert.match(pageSource, /onSelect: setContextDeleteDraft/u)
  assert.match(dataTableSource, /premium-stroke fixed z-\[120\] w-\[252px\]/u)
  assert.match(dataTableSource, /initial=\{reduceMotion \? false : \{ opacity: 0, scale: 0\.96, y: -5, filter: "blur\(6px\)" \}\}/u)
  assert.match(pageSource, /<DialogTitle>\{t\("Delete this draft\?"\)\}<\/DialogTitle>/u)
})
