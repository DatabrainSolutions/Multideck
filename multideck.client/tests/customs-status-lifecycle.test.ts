import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  CUSTOMS_STATUS_POLL_DELAYS_MS,
  customsStatusPollDelay,
  isTerminalCustomsStatus,
  shouldPollCustomsStatus,
  shouldPollCustomsSubmission,
} from "../src/lib/customs-status-lifecycle.ts"

test("customs lifecycle polls only provider states that can still change", () => {
  for (const status of ["submitted", "acknowledged", "pending", "queued", "processing"]) {
    assert.equal(shouldPollCustomsStatus(status), true, status)
  }
  for (const status of ["draft", "accepted", "released", "cleared", "rejected", "cancelled", undefined]) {
    assert.equal(shouldPollCustomsStatus(status), false, String(status))
  }
})

test("authoritative outcomes stop background polling", () => {
  for (const status of ["accepted", "released", "cleared", "rejected", "cancelled"]) {
    assert.equal(isTerminalCustomsStatus(status), true, status)
  }
  assert.equal(isTerminalCustomsStatus("submitted"), false)
})

test("a provider draft acknowledgement does not start submission polling", () => {
  assert.equal(shouldPollCustomsSubmission("acknowledged", null), false)
  assert.equal(shouldPollCustomsSubmission("acknowledged", "2026-08-13T00:00:00.000Z"), true)
})

test("polling backoff is bounded", () => {
  assert.deepEqual(CUSTOMS_STATUS_POLL_DELAYS_MS, [2_000, 4_000, 8_000, 15_000, 30_000, 45_000, 60_000])
  assert.equal(customsStatusPollDelay(0), 2_000)
  assert.equal(customsStatusPollDelay(CUSTOMS_STATUS_POLL_DELAYS_MS.length), null)
})

test("the declaration workspace does not expose a manual customs refresh control", async () => {
  const source = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(source, /Refresh customs status/)
  assert.doesNotMatch(source, /onRefresh=/)
  assert.match(source, /refreshOnReturn/)
  assert.match(source, /loadDeclarationPdf\(\)\.catch/)
})

test("accepted provider messages never render as a stale rejection", async () => {
  const source = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
  assert.match(source, /providerRejected && providerIssues\.length/)
  assert.match(source, /providerAccepted && providerIssues\.length/)
  assert.match(source, /Customs accepted this declaration with provider messages/)
})
