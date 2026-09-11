// Email intent is an operator instruction, never a keyword found inside quoted
// content or a prohibited clause. Keep this shared by routing and authorisation.
export function emailInstructionText(prompt, purpose = "write") {
  const text = prompt.replace(/[‘’]/g, "'")
    .replace(/```[\s\S]*?```|`[^`]*`|"[^"]*"|“[^”]*”|(?<!\w)'[^'\n]*'(?!\w)/g, " ")
  if (/^\s*(?:please\s+)?read[- ]only\b/i.test(text)) return ""
  const clauses = text.split(/[\n;!?]|\.(?=\s|$)|\b(?:but|instead|however)\b/i)
  const positive = []
  let sendVeto = false
  for (let clause of clauses) {
    // Product-navigation questions do not authorise email work merely because
    // an unrelated verb such as editing an address appears beside "email".
    if (/^\s*(?:please\s+)?(?:where\b|how\s+(?:do|can)\s+i\b|show me where\b|tell me where\b)/i.test(clause)) {
      const separateAction = /\b(?:and|also|then)\s+(?:please\s+)?(?:draft|write|compose|prepare|send|reply|forward)\b/i.exec(clause)
      if (!separateAction) continue
      clause = clause.slice(separateAction.index).replace(/^(?:and|also|then)\s+/i, "")
    }
    const negative = /\b(?:do\s+not|don't|never|without|avoid|refrain\s+from|no|not|must\s+not|should\s+not)\b/i.exec(clause)
    if (!negative) { positive.push(clause); continue }
    const prohibited = clause.slice(negative.index)
    if (/\b(?:send|sending|sent|forward|forwarding|emailing)\b|\bnot\s+(?:now|yet)\b/i.test(prohibited)) sendVeto = true
    // A trailing prohibition can retain a distinct affirmative draft instruction.
    // Do not retain an incomplete instruction such as "email must".
    positive.push(clause.slice(0, negative.index))
  }
  if (purpose === "send" && sendVeto) return ""
  return positive.filter(clause => !sendVeto || !/\b(?:send|forward|email)\b/i.test(clause)
    || /\b(?:draft|write|compose|prepare|reply|respond|rewrite|reword|polish|edit)\b/i.test(clause)).join("\n")
}

export function emailSelfRecipientRequested(prompt) {
  return /\bto\s+(?:myself|me|my (?:own )?(?:connected |default )?(?:sending |outbound )?(?:mailbox|email(?: address)?))\b/i.test(emailInstructionText(prompt))
}

export function emailSendRequested(prompt) {
  const text = emailInstructionText(prompt, "send").toLowerCase()
  return /\bsend\s+(?:an?\s+|the\s+|this\s+)?(?:e-?mail|message|reply|response)\b/.test(text)
    || /\bsend\b[^\n.!?]{0,90}\b(now|today|straight away|immediately|it|this)\b/.test(text)
    || /(?:^|\n)\s*(?:please\s+)?email\s+[^\n.!?]{0,90}\b(now|today|straight away|immediately)\b/.test(text)
    || /\bsend\s+(?:it|this)\b/.test(text)
    || /\bplease\s+send\b/.test(text)
    || /\b(?:review|check|approve)\s+(?:it\s+)?(?:and|then)\s+send\b/.test(text)
}

export function requiresExplicitActionApproval(_actionCode, _accessMode) {
  return true
}
