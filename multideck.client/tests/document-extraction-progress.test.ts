import assert from "node:assert/strict"
import test from "node:test"
import {
  completedStageIds,
  extractionProgressPercent,
  type ExtractionStage,
} from "../src/lib/document-extraction-progress.ts"

const stages: ExtractionStage[] = [
  { id: "reading", label: "Reading the document", ceiling: 24, expectedMs: 1_400 },
  { id: "extracting", label: "Finding the item lines", ceiling: 88, expectedMs: 9_000 },
  { id: "organising", label: "Preparing the review", ceiling: 99, expectedMs: 1_200 },
]

test("starts a stage at the previous stage's ceiling", () => {
  assert.equal(extractionProgressPercent({ stages, activeStageId: "reading", elapsedMs: 0 }), 0)
  assert.equal(extractionProgressPercent({ stages, activeStageId: "extracting", elapsedMs: 0 }), 24)
  assert.equal(extractionProgressPercent({ stages, activeStageId: "organising", elapsedMs: 0 }), 88)
})

test("keeps moving within a stage without ever reaching its ceiling", () => {
  const early = extractionProgressPercent({ stages, activeStageId: "extracting", elapsedMs: 2_000 })
  const later = extractionProgressPercent({ stages, activeStageId: "extracting", elapsedMs: 20_000 })
  const stalled = extractionProgressPercent({ stages, activeStageId: "extracting", elapsedMs: 10 * 60_000 })

  assert.ok(early > 24 && early < later, `expected ${early} between 24 and ${later}`)
  assert.ok(later < 88)
  assert.ok(stalled < 88)
})

test("only completes when the work does", () => {
  assert.equal(extractionProgressPercent({ stages, activeStageId: "organising", elapsedMs: 60_000 }), 99)
  assert.equal(extractionProgressPercent({ stages, activeStageId: "organising", elapsedMs: 500, done: true }), 100)
  assert.equal(extractionProgressPercent({ stages, activeStageId: null, elapsedMs: 5_000 }), 0)
})

test("marks earlier stages as finished", () => {
  assert.deepEqual(completedStageIds(stages, "reading"), [])
  assert.deepEqual(completedStageIds(stages, "organising"), ["reading", "extracting"])
  assert.deepEqual(completedStageIds(stages, "reading", true), ["reading", "extracting", "organising"])
})
