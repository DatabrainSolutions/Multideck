import assert from "node:assert/strict"
import test from "node:test"
import { isHumanFollowUpCandidate } from "../src/lib/home-follow-up-filter.ts"

function candidate({
  address = "alex@example.com",
  displayName = "Alex Morgan",
  subject = "Can you confirm the collection time?",
  preview = "Hi Harry, could you let me know before Friday?",
} = {}) {
  return { participant: { address, displayName }, subject, preview }
}

test("keeps a plausible message from a person waiting for a reply", () => {
  assert.equal(isHumanFollowUpCandidate(candidate()), true)
})

test("excludes newsletter and campaign language wherever it appears", () => {
  assert.equal(isHumanFollowUpCandidate(candidate({ subject: "Our weekly newsletter" })), false)
  assert.equal(isHumanFollowUpCandidate(candidate({ preview: "View in your browser or unsubscribe" })), false)
  assert.equal(isHumanFollowUpCandidate(candidate({ displayName: "Freight Weekly Newsletter" })), false)
})

test("excludes automated sender addresses even when the subject looks personal", () => {
  assert.equal(isHumanFollowUpCandidate(candidate({ address: "marketing@example.com" })), false)
  assert.equal(isHumanFollowUpCandidate(candidate({ address: "no-reply@example.com" })), false)
  assert.equal(isHumanFollowUpCandidate(candidate({ address: "notifications@example.com" })), false)
})

test("excludes routine machine mail and meeting recaps", () => {
  assert.equal(isHumanFollowUpCandidate(candidate({ subject: "Your meeting transcript is ready" })), false)
  assert.equal(isHumanFollowUpCandidate(candidate({ subject: "Receipt for your payment" })), false)
  assert.equal(isHumanFollowUpCandidate(candidate({ subject: "Automatic reply: annual leave" })), false)
})

test("does not reject a human conversation merely because the company works in marketing", () => {
  assert.equal(isHumanFollowUpCandidate(candidate({
    address: "sarah@example.com",
    subject: "Marketing plan approval",
    preview: "Could you approve the plan before our call?",
  })), true)
})
