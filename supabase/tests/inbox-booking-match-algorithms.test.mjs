import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = await readFile(new URL("../functions/_shared/inbox-booking-match.ts", import.meta.url), "utf8")
const moduleUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "strip" })).toString("base64")}`
const { decideBookingMatch } = await import(moduleUrl)

const base = {
  id: "booking-a", label: "JQ20015", bookingReference: "JQ20015",
  customerId: "customer-a", carrierId: "carrier-a", supplierId: null, status: "open",
  origin: "Shanghai", destination: "Felixstowe", plannedArrivalAt: "2026-09-10T08:00:00Z",
}

test("normalised references tolerate harmless separators without weakening the decision", () => {
  const decision = decideBookingMatch([base], {
    references: ["JQ-20015"], senderOrganisationIds: [], origin: null, destination: null, plannedArrivalAt: null,
  })
  assert.equal(decision.state, "matched")
  if (decision.state === "matched") assert.equal(decision.candidate.reasons.includes("normalised_reference"), true)
})

test("a known sender can match when independent route evidence corroborates one booking", () => {
  const decision = decideBookingMatch([base], {
    references: [], senderOrganisationIds: ["carrier-a"], origin: "Shanghai", destination: "Felixstowe", plannedArrivalAt: null,
  })
  assert.equal(decision.state, "matched")
})

test("sender identity alone never attaches a suggestion", () => {
  const decision = decideBookingMatch([base], {
    references: [], senderOrganisationIds: ["carrier-a"], origin: null, destination: null, plannedArrivalAt: null,
  })
  assert.equal(decision.state, "ambiguous")
})

test("close sender-derived candidates remain ambiguous", () => {
  const decision = decideBookingMatch([
    base,
    { ...base, id: "booking-b", label: "JQ20016", bookingReference: "JQ20016", plannedArrivalAt: "2026-09-11T08:00:00Z" },
  ], {
    references: [], senderOrganisationIds: ["carrier-a"], origin: "Shanghai", destination: "Felixstowe", plannedArrivalAt: "2026-09-10T08:00:00Z",
  })
  assert.equal(decision.state, "ambiguous")
})

test("no trustworthy evidence returns no match", () => {
  const decision = decideBookingMatch([base], {
    references: [], senderOrganisationIds: [], origin: "Rotterdam", destination: null, plannedArrivalAt: null,
  })
  assert.equal(decision.state, "no_match")
})
