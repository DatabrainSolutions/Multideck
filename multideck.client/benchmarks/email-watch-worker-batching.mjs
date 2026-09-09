import { performance } from "node:perf_hooks"

const ownerCount = 10_000
const liveBatchSize = 5
const owners = Array.from({ length: ownerCount }, (_, index) => ({
  id: `owner-${String(index).padStart(5, "0")}`,
  lastClaimedAt: index % 7 === 0 ? null : index,
}))

function wholeDirectorySelection() {
  return [...owners]
    .sort((left, right) => (left.lastClaimedAt ?? -1) - (right.lastClaimedAt ?? -1))
    .map((owner) => owner.id)
}

function boundedClaimSelection() {
  return owners.slice(0, liveBatchSize).map((owner) => owner.id)
}

for (let index = 0; index < 2; index += 1) {
  wholeDirectorySelection()
  boundedClaimSelection()
}

const runs = 9
const wholeTimes = []
const boundedTimes = []
for (let index = 0; index < runs; index += 1) {
  let started = performance.now()
  wholeDirectorySelection()
  wholeTimes.push(performance.now() - started)
  started = performance.now()
  boundedClaimSelection()
  boundedTimes.push(performance.now() - started)
}

const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]
const wholeMedianMs = median(wholeTimes)
const boundedMedianMs = median(boundedTimes)

console.log(JSON.stringify({
  proof: "controlled local model; database indexes and network latency are not measured",
  supabase_writes: 0,
  owner_count: ownerCount,
  worker_batch_size: liveBatchSize,
  row_reduction: ownerCount / liveBatchSize,
  whole_directory_median_ms: Number(wholeMedianMs.toFixed(4)),
  bounded_claim_median_ms: Number(boundedMedianMs.toFixed(4)),
  synthetic_cpu_ratio: Number((wholeMedianMs / Math.max(boundedMedianMs, 0.0001)).toFixed(1)),
}, null, 2))
