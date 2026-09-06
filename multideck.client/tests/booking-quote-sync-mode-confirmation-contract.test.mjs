import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const bookingComponents = await readFile(
  new URL("../src/components/multideck/booking-components.tsx", import.meta.url),
  "utf8",
)
const bookingApi = await readFile(
  new URL("../src/lib/booking-workflow-api.ts", import.meta.url),
  "utf8",
)
const edgeCore = await readFile(
  new URL("../../supabase/functions/bookings-workflow/core.ts", import.meta.url),
  "utf8",
)
const edgeIndex = await readFile(
  new URL("../../supabase/functions/bookings-workflow/index.ts", import.meta.url),
  "utf8",
)

test("mode changes are not preselected and show a dedicated confirmation dialog", () => {
  assert.match(bookingComponents, /difference\.key !== "mode"/u)
  assert.match(bookingComponents, /<Dialog open=\{pendingModeFields !== null\}/u)
  assert.match(bookingComponents, /Apply mode change\?/u)
  assert.match(bookingComponents, /Keep current booking/u)
  assert.match(bookingComponents, /onApply\(pendingModeFields, true\)/u)
  assert.match(bookingComponents, /requestApply\(remainingDifferences\.map/u)
})

test("the booking header and review identify the applied and proposed quote versions", () => {
  assert.match(bookingComponents, /appliedVersionNumber/u)
  assert.match(bookingComponents, /review\.quoteReference/u)
  assert.match(bookingComponents, /review\.proposedVersionNumber/u)
  assert.match(bookingComponents, /t\("Original"\)/u)
})

test("the client and Edge Function carry and validate explicit mode confirmation", () => {
  assert.match(bookingApi, /confirmModeChange = false/u)
  assert.match(bookingApi, /confirmModeChange,/u)
  assert.match(edgeCore, /parseModeChangeConfirmation/u)
  assert.match(edgeIndex, /fields\.includes\("mode"\) && !confirmModeChange/u)
  assert.match(edgeIndex, /booking_workflow_apply_quote_sync_confirmed/u)
  assert.match(edgeIndex, /confirm_mode_change: confirmModeChange/u)
})
