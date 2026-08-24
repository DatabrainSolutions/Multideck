type FollowUpCandidate = {
  subject: string
  preview: string
  participant: {
    address: string
    displayName?: string | null
  }
}

const automatedSenderPattern = /^(?:auto(?:mated)?|campaigns?|digest|do-?not-?reply|mailer(?:-daemon)?|marketing|news|newsletters?|no-?reply|notifications?|postmaster|promotions?|receipts?|support|tickets?|updates?)$/i

const bulkMailPattern = /(?:\bnewsletter\b|\b(?:daily|weekly|monthly)\s+(?:brief|digest|round[ -]?up|update)\b|\bmarketing (?:email|update)\b|\bpromotional\b|\bspecial offer\b|\blimited[ -]?time offer\b|\bexclusive offer\b|\bsale (?:ends|now|starts)\b|\bwebinar\b|\bevent reminder\b|\bproduct updates?\b|\blatest news\b|\bview (?:this email|online|in (?:your )?browser)\b|\bmanage (?:your )?(?:email )?preferences\b|\bemail preferences\b|\bsubscription preferences\b|\bunsubscribe\b|\byou (?:are|'re) receiving this\b|\bautomated (?:email|message|notification)\b|\bautomatic reply\b|\bout of (?:the )?office\b|\bdelivery status notification\b|\bmail delivery (?:failed|subsystem)\b|\bundeliverable\b|\breceipt for (?:your )?(?:payment|purchase|order)\b|\bpassword reset\b|\bverification code\b|\bsupport ticket\b|\bticket #[0-9]+\b|\bmeeting (?:notes|recap|summary|transcript)\b|\btranscript (?:is )?ready\b)/i

/**
 * Home is a reply queue, not a second unread inbox. Only keep mail that could
 * plausibly be a person waiting; bulk and automated messages remain in Inbox.
 */
export function isHumanFollowUpCandidate(candidate: FollowUpCandidate) {
  const localPart = candidate.participant.address.trim().split("@")[0] ?? ""
  if (automatedSenderPattern.test(localPart)) return false

  const searchableText = [
    candidate.participant.displayName ?? "",
    candidate.subject,
    candidate.preview,
  ].join(" ")

  return !bulkMailPattern.test(searchableText)
}
