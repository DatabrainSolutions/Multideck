/** Only known database failures prove that the transaction was rejected.
 * Network failures may have lost a successful response: retry the same input. */
export function contactCardSubmissionError(error: unknown, submissionAttempted: boolean) {
  const candidate = error && typeof error === "object" ? error as { code?: string; message?: string } : {}
  const code = candidate.code ?? ""
  const message = candidate.message ?? ""
  if (code === "P0002") return { message: "This card is no longer accepting details. Contact the card owner.", pending: false, renew: false }
  if (code === "P0001") return { message: "This card is busy. Your details have been kept; please try again later.", pending: false, renew: false }
  if (code === "22023") {
    if (/expired|Reload this contact card/i.test(message)) return { message: "Your session expired. Your details have been kept; try again to start a new session.", pending: false, renew: true }
    if (/phone number/i.test(message)) return { message: "Add your phone number and try again.", pending: false, renew: false }
    if (/already been sent/i.test(message)) return { message: "Details have already been sent from this page. Reopen the card to send different details.", pending: false, renew: false }
    return { message: "Check your details and try again.", pending: false, renew: false }
  }
  if (["PGRST202", "42883"].includes(code)) return { message: "This card cannot accept details right now. Your details have been kept; please try again later.", pending: false, renew: false }
  return submissionAttempted
    ? { message: "We couldn't confirm whether your details were sent. Try again to check safely.", pending: true, renew: false }
    : { message: "Unable to connect. Your details have been kept; check your connection and try again.", pending: false, renew: false }
}
