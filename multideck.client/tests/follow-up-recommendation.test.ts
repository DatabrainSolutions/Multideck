import assert from "node:assert/strict"
import test from "node:test"
import { formatFollowUpRecommendation, type FollowUpRecommendationCode } from "../src/lib/follow-up-recommendation.ts"

const translate = (value: string) => value

test("turns context classifications into concise operator actions", () => {
  const expected: Record<FollowUpRecommendationCode, string> = {
    answer_question: "Answer their question",
    answer_pricing: "Answer their pricing question",
    confirm_timing: "Confirm the collection or delivery timing",
    provide_documents: "Send the requested documents",
    resolve_concern: "Resolve the concern and reply",
    review_attachment: "Review the attachment and reply",
    reply_next_step: "Reply with the next step",
    follow_up_quote: "Check whether they want to proceed with the quote",
    follow_up_documents: "Ask for the outstanding documents",
    confirm_next_step: "Confirm the agreed next step",
    follow_up_personally: "Make a personal final check-in",
    follow_up_next_step: "Follow up on the last conversation",
    make_first_contact: "Make first contact",
    complete_scheduled_action: "Complete the planned follow-up",
  }

  for (const [code, label] of Object.entries(expected)) {
    assert.equal(formatFollowUpRecommendation(code as FollowUpRecommendationCode, translate), label)
  }
})

test("keeps a safe recommendation while the database migration is rolling out", () => {
  assert.equal(formatFollowUpRecommendation(undefined, translate), "Follow up on the last conversation")
})
