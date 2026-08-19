import { performance } from "node:perf_hooks"

import {
  getOrCreateWorkspaceBootstrap,
  invalidateWorkspaceBootstrap,
} from "../src/lib/workspace-bootstrap.ts"

const warmups = 2
const measuredRuns = 9
const fixtureRoundTripMs = Number(process.env.BOOTSTRAP_FIXTURE_ROUND_TRIP_MS ?? 8)

const roundTrip = () => new Promise((resolve) => setTimeout(resolve, fixtureRoundTripMs))

async function legacyPermissions() {
  await roundTrip()
  await roundTrip()
  await roundTrip()
}

async function legacyStartup() {
  const account = (async () => {
    await roundTrip()
    await Promise.all([roundTrip(), roundTrip(), roundTrip(), legacyPermissions()])
    await Promise.all([roundTrip(), roundTrip()])
  })()
  const separatePreferenceReads = Promise.all(Array.from({ length: 6 }, roundTrip))

  await account
  await roundTrip()
  await separatePreferenceReads
}

async function optimizedStartup() {
  invalidateWorkspaceBootstrap()
  let clientSupabaseBoundaries = 0
  const load = async () => {
    clientSupabaseBoundaries += 1
    await roundTrip() // One database RPC.
    await roundTrip() // One batched private-media signing request.
    return { workspace: { preferences: {}, profileMedia: {} } }
  }

  await Promise.all(Array.from({ length: 8 }, () => getOrCreateWorkspaceBootstrap("fixture-token", load)))
  if (clientSupabaseBoundaries !== 1) throw new Error(`Expected one bootstrap boundary, received ${clientSupabaseBoundaries}.`)
}

function statistics(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    rangeMs: [sorted[0], sorted.at(-1)],
    cvPercent: Math.sqrt(variance) / mean * 100,
    rawMs: values,
  }
}

async function measure(run) {
  for (let index = 0; index < warmups; index += 1) await run()
  const values = []
  for (let index = 0; index < measuredRuns; index += 1) {
    const startedAt = performance.now()
    await run()
    values.push(performance.now() - startedAt)
  }
  return statistics(values)
}

const before = await measure(legacyStartup)
const after = await measure(optimizedStartup)
const improvementPercent = (before.medianMs - after.medianMs) / before.medianMs * 100

console.log(JSON.stringify({
  benchmark: "controlled authenticated startup request graph",
  limitation: "Deterministic local round-trip fixture; not a live Supabase latency claim.",
  fixtureRoundTripMs,
  warmups,
  measuredRuns,
  before: {
    clientSupabaseBoundaries: 8,
    accountDatabaseQueries: 9,
    accountCriticalDatabaseRoundTrips: 5,
    ...before,
  },
  after: {
    clientSupabaseBoundaries: 1,
    accountDatabaseQueries: 1,
    accountCriticalDatabaseRoundTrips: 1,
    ...after,
  },
  improvementPercent,
  speedup: before.medianMs / after.medianMs,
}, null, 2))
