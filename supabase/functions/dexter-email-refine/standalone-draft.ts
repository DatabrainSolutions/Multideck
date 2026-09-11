/** Wording-only input. No record IDs, delivery claims or recipient edits are trusted. */
export function standaloneRefinementDraft(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request")
  const draft = value as Record<string, unknown>
  if (draft.mode !== "new" || draft.sourceMessageId != null || draft.threadId != null ||
      typeof draft.subject !== "string" || draft.subject.length > 500 ||
      typeof draft.bodyText !== "string" || draft.bodyText.length > 20_000 ||
      !draft.delivery || typeof draft.delivery !== "object" ||
      !["draft", "failed"].includes(String((draft.delivery as Record<string, unknown>).status))) throw new Error("invalid_request")
  return { subject: draft.subject, bodyText: draft.bodyText }
}
