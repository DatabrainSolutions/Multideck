import assert from "node:assert/strict"
import test from "node:test"
import { createStandaloneImportDraft, createStandaloneExportDraft, validateStandaloneExportDraft } from "../src/lib/customs-declaration.ts"

const referenceIssues = (draft: ReturnType<typeof createStandaloneImportDraft>) => validateStandaloneExportDraft(draft).filter((issue) => ["badgeId", "ducr"].includes(issue.field ?? ""))

test("import review requires badge and DUCR without preventing creation of an incomplete draft", () => {
  const draft = createStandaloneImportDraft()
  assert.equal(draft.declarationCategory, "H1")
  assert.deepEqual(referenceIssues(draft).map((issue) => issue.field), ["badgeId", "ducr"])
  draft.badgeId = "GRK"
  draft.ducr = "6GB123456789000-JC001"
  assert.equal(referenceIssues(draft).length, 0)
  draft.ducr = "26GB123456789000-JC001"
  assert.deepEqual(referenceIssues(draft).map((issue) => issue.field), ["ducr"])
})

test("import mandatory references do not change export draft validation", () => {
  assert.equal(referenceIssues(createStandaloneExportDraft()).length, 0)
})
