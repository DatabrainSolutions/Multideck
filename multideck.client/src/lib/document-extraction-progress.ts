/**
 * Progress maths for staged document work where only some stages have a known duration.
 *
 * Each stage owns a ceiling it eases towards but never reaches, so the bar keeps moving
 * while a slow stage runs and still tells the truth: it only completes when the work does.
 */

export type ExtractionStage = {
  id: string
  label: string
  detail?: string
  /** Percentage this stage moves towards, reached only once the stage finishes. */
  ceiling: number
  /** Roughly how long this stage takes, used to shape the easing. */
  expectedMs: number
}

export type ExtractionProgressInput = {
  stages: ExtractionStage[]
  activeStageId: string | null
  elapsedMs: number
  done?: boolean
}

export function extractionProgressPercent({ stages, activeStageId, elapsedMs, done }: ExtractionProgressInput) {
  if (done) return 100
  const index = stages.findIndex((stage) => stage.id === activeStageId)
  if (index < 0) return 0

  const stage = stages[index]
  const floor = index ? stages[index - 1].ceiling : 0
  const span = Math.max(0, stage.ceiling - floor)
  const expected = Math.max(1, stage.expectedMs)
  // Capped just short of 1 so a stalled stage still reads as unfinished.
  const eased = Math.min(1 - Math.exp(-Math.max(0, elapsedMs) / expected), 0.999)

  return clampPercent(floor + span * eased)
}

export function completedStageIds(stages: ExtractionStage[], activeStageId: string | null, done?: boolean) {
  if (done) return stages.map((stage) => stage.id)
  const index = stages.findIndex((stage) => stage.id === activeStageId)
  return index <= 0 ? [] : stages.slice(0, index).map((stage) => stage.id)
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(Math.max(value, 0), 100) * 10) / 10
}
