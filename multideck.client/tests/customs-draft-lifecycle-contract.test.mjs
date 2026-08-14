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
  assert.match(pageSource, /\.then\(async \(\) => \{[\s\S]*getICustomsDeclarationState\(saved\.id\)[\s\S]*newly started iCustoms draft state could not be refreshed/u)
  assert.match(pageSource, /activeDeclarationIdRef\.current === saved\.id/u)
  assert.match(pageSource, /navigate\(`\$\{registerPath\}\/\$\{saved\.id\}`\)/u)
  assert.match(pageSource, /Draft saved, but the iCustoms draft could not be started/u)
  assert.match(pageSource, /refreshStartingDraft[\s\S]*window\.setTimeout\(\(\) => \{ void refreshStartingDraft\(\) \}, 650\)/u)
})

test("Review saves the Multideck draft and its editable iCustoms mirror with truthful feedback", () => {
  assert.match(pageSource, /onSaveDraft=\{\(\) => void saveDraft\(false\)\}/u)
  assert.match(pageSource, /providerWasRejected \|\| !\["submitted", "accepted", "released", "cleared", "cancelled"\]\.includes/u)
  assert.match(pageSource, /providerWasRejected \? "Draft saved and corrected iCustoms draft created" : "Draft saved and updated in iCustoms test mode"/u)
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
  assert.match(pageSource, /md-sidebar-menu premium-stroke/u)
  assert.match(pageSource, /onSelect=\{\(\) => setContextDeleteDraft\(draft\)\}/u)
  assert.match(pageSource, /<DialogTitle>\{t\("Delete this draft\?"\)\}<\/DialogTitle>/u)
})
