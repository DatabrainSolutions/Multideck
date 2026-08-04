/**
 * The three engines a Dexter request can run on. The product deliberately hides
 * vendor model names behind a job description — an operator picking a lane cares
 * about "how long will this take and how hard will it think", not a version
 * string — while the provider glyph keeps the underlying model honest.
 *
 * `strength` is the filled-bar count out of `modelStrengthBars`, so the meter is
 * a single source of truth rather than a hand-drawn set of bars per row.
 */

export type DexterModelId = "fast" | "smart" | "worker"

export type DexterModelProvider = "openai"

export type DexterModel = {
  id: DexterModelId
  name: string
  /** The one-line "when to reach for this" shown under the name. */
  description: string
  /** Short suffix rendered next to the name in the composer pill. */
  tag: string
  provider: DexterModelProvider
  strength: number
}

export const modelStrengthBars = 9

export const dexterModels: DexterModel[] = [
  {
    id: "fast",
    name: "Fast",
    description: "Instant answers, lookups and short drafts",
    tag: "Instant",
    provider: "openai",
    strength: 4,
  },
  {
    id: "smart",
    name: "Smart",
    description: "Reasons across bookings, docs and rates",
    tag: "Balanced",
    provider: "openai",
    strength: 7,
  },
  {
    id: "worker",
    name: "Worker",
    description: "Runs long jobs in the background and reports back",
    tag: "Deep",
    provider: "openai",
    strength: 9,
  },
]

export const defaultDexterModelId: DexterModelId = "fast"

const modelsById = new Map(dexterModels.map((model) => [model.id, model]))

export function getDexterModel(id: DexterModelId): DexterModel {
  return modelsById.get(id) ?? modelsById.get(defaultDexterModelId)!
}
