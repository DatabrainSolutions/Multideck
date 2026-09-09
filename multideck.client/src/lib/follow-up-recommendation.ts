export type FollowUpRecommendationCode =
  | "answer_question"
  | "answer_pricing"
  | "confirm_timing"
  | "provide_documents"
  | "resolve_concern"
  | "review_attachment"
  | "reply_next_step"
  | "follow_up_quote"
  | "follow_up_documents"
  | "confirm_next_step"
  | "follow_up_personally"
  | "follow_up_next_step"
  | "make_first_contact"
  | "complete_scheduled_action"

const recommendationLabel: Record<FollowUpRecommendationCode, string> = {
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

export function formatFollowUpRecommendation(
  code: FollowUpRecommendationCode | null | undefined,
  translate: (key: string) => string,
) {
  return translate(code ? recommendationLabel[code] : recommendationLabel.follow_up_next_step)
}
