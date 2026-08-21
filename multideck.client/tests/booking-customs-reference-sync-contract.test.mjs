import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const booking = await readFile(new URL("../src/components/multideck/booking-components.tsx", import.meta.url), "utf8")
const customs = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
const quote = await readFile(new URL("../src/pages/quotes-page.tsx", import.meta.url), "utf8")
const shared = await readFile(new URL("../src/components/multideck/customs-readiness-review.tsx", import.meta.url), "utf8")
const documentsWorkspaceStart = booking.indexOf("function BookingDocumentsWorkspace")
const documentsWorkspaceEnd = booking.indexOf("function BookingCustomsSourceEditor", documentsWorkspaceStart)
const documentsWorkspace = booking.slice(documentsWorkspaceStart, documentsWorkspaceEnd)
const financeWorkspaceStart = booking.indexOf("function BookingFinanceWorkspace")
const financeWorkspaceEnd = booking.indexOf("function BookingActivityWorkspace", financeWorkspaceStart)
const financeWorkspace = booking.slice(financeWorkspaceStart, financeWorkspaceEnd)
const activityWorkspaceStart = booking.indexOf("function BookingActivityWorkspace")
const activityWorkspaceEnd = booking.indexOf("function BookingDetailTabPage", activityWorkspaceStart)
const activityWorkspace = booking.slice(activityWorkspaceStart, activityWorkspaceEnd)

test("booking and declaration review share the same actionable readiness component", () => {
  assert.match(booking, /<CustomsReadinessReview/u)
  assert.match(customs, /<CustomsReadinessReview/u)
  assert.match(shared, /readiness checks passed/u)
  assert.match(shared, /aria-expanded=\{expanded\}/u)
  assert.match(shared, /role="progressbar"/u)
  assert.match(booking, /type BookingCustomsView = "source" \| "review"/u)
  assert.match(booking, /headline="Ready to hand off to Customs\?"/u)
  assert.match(booking, /onReviewCustoms=\{\(\) => \{[\s\S]*setCustomsView\("review"\)[\s\S]*setActiveTab\("Customs"\)/u)
  assert.match(booking, /view === "source" \? <Surface/u)
  assert.doesNotMatch(booking, /<BookingSectionHeading[^>]*title=\{t\("Customs source data"\)\}/u)
  assert.match(booking, /void saveSourceData\(\)\.then\(\(saved\).*if \(saved\) close\(\)/u)
  assert.match(booking, /getBookingCustomsReadiness\(workspace\.booking\.jobId\)/u)
  for (const key of ["direction", "exporter_eori", "importer_identifier", "goods_description", "gross_weight", "commercial_invoice"]) {
    assert.match(booking, new RegExp(`issue\\.key === "${key}"`, "u"))
  }
  assert.match(booking, /role: "consignor"/u)
  assert.match(booking, /role: "consignee"/u)
  assert.doesNotMatch(booking, /role: "exporter"/u)
  assert.doesNotMatch(booking, /role: "importer"/u)
})

test("booking documents use the top-bar attachment action without a redundant document-set header", () => {
  assert.equal(documentsWorkspaceStart >= 0, true)
  assert.equal(documentsWorkspaceEnd > documentsWorkspaceStart, true)
  assert.doesNotMatch(documentsWorkspace, /BookingSectionHeading/u)
  assert.match(booking, /activeTab === "Documents"[\s\S]*Attach document/u)
  assert.match(booking, /Attach commercial invoice/u)
  assert.match(booking, /Attach packing list \(optional\)/u)
  assert.match(booking, /uploadBookingCustomsDocument\(loadedRecord\.workspace\.booking\.jobId, documentType, file\)/u)
})

test("booking finance uses clean section titles instead of section-header banners", () => {
  assert.equal(financeWorkspaceStart >= 0, true)
  assert.equal(financeWorkspaceEnd > financeWorkspaceStart, true)
  assert.match(financeWorkspace, /<BookingWorkspaceSectionTitle>\{t\("References and value"\)\}<\/BookingWorkspaceSectionTitle>/u)
  assert.match(financeWorkspace, /<UnavailableBookingSection title="Cost ledger"/u)
  assert.doesNotMatch(financeWorkspace, /BookingSectionHeading/u)
})

test("booking audit renders the real workspace event feed", () => {
  assert.match(activityWorkspace, /const events = record\.workspace\?\.events \?\? \[\]/u)
  assert.match(activityWorkspace, /events\.map\(\(event\)/u)
  assert.match(activityWorkspace, /Booking updates, document attachments and Customs handoffs will appear here\./u)
})

test("old booking and quote paths redirect to their canonical references", () => {
  assert.match(booking, /canonicalReference !== normalizedId[\s\S]*navigate\(getBookingDetailPath\(canonicalReference\)\)/u)
  assert.match(booking, /encodeURIComponent\(id\.toLowerCase\(\)\)/u)
  assert.match(quote, /canonicalReference !== reference[\s\S]*navigate\?\.\(`\/quotes\/\$\{encodeURIComponent\(canonicalReference\.toLowerCase\(\)\)\}`\)/u)
})
