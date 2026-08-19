import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const migration = await read("../migrations/20260819143000_email_watch_worker_owner_batch.sql")
const worker = await read("../functions/email-watch-worker/index.ts")
const benchmark = await read("../../multideck.client/benchmarks/email-watch-worker-batching.mjs")

test("scheduled email sync claims a fair, overlap-safe owner batch", () => {
  assert.match(migration, /create table if not exists public\."Comm_EmailWatchWorkerState"/)
  assert.match(migration, /create or replace function public\.comm_claim_email_watch_owners/)
  assert.match(migration, /least\(coalesce\(p_limit, 5\), 10\)/)
  assert.match(migration, /order by state\."CommWatchWorker_LastClaimedAt" asc nulls first/)
  assert.match(migration, /for update of state skip locked/)
  assert.match(migration, /"CommWatchWorker_LeaseToken" = p_lease_token/)
  assert.match(migration, /create or replace function public\.comm_release_email_watch_owner/)
  assert.match(migration, /"IX_Comm_ProviderConnections_watch_owner"/)
  assert.match(migration, /grant execute on function public\.comm_claim_email_watch_owners[\s\S]*to service_role/)
})

test("the worker never enumerates every active provider owner", () => {
  assert.match(worker, /const ownerLimit = mode === "backfill" \? 2 : 5/)
  assert.match(worker, /admin\.rpc\("comm_claim_email_watch_owners"/)
  assert.match(worker, /admin\.rpc\("comm_release_email_watch_owner"/)
  assert.match(worker, /finally \{/)
  assert.doesNotMatch(worker, /\.from\("Comm_ProviderConnections"\)[\s\S]*\.select\("CommConn_UserID"\)/)
})

test("the worker proof uses local records only", () => {
  assert.match(benchmark, /const ownerCount = 10_000/)
  assert.match(benchmark, /const liveBatchSize = 5/)
  assert.match(benchmark, /const runs = 9/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /createClient|SUPABASE_URL|\.insert\(|\.upsert\(/)
})
