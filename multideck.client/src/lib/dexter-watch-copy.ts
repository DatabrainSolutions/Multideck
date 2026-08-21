export type DexterWatchCopyRule = {
  field: string
  operator: string
  value?: string
}

export type DexterWatchCopyEvent = {
  body: string
  changed?: Record<string, unknown>
}

export type DexterWatchCopyWatch = {
  title: string
  summary: string
  capability: string
  targetLabel?: string | null
  rule: DexterWatchCopyRule
  latestEvent?: DexterWatchCopyEvent | null
}

type Translate = (text: string) => string

function eventValue(event: DexterWatchCopyEvent, key: string) {
  const value = event.changed?.[key]
  return typeof value === "string" ? value.trim() : ""
}

function joinTerms(terms: string[], t: Translate) {
  if (terms.length < 2) return terms[0] ?? ""
  if (terms.length === 2) return `${terms[0]} ${t("and")} ${terms[1]}`
  return `${terms.slice(0, -1).join(", ")}, ${t("and")} ${terms.at(-1)}`
}

function quotedTerms(value: string, t: Translate) {
  return joinTerms(value.split(/\s+/).filter(Boolean).map((term) => `“${term}”`), t)
}

export function readableWatchSummary(watch: DexterWatchCopyWatch, t: Translate) {
  if (watch.capability === "todo") {
    const field = watch.rule.field === "scheduledDate" ? t("Scheduled date") : t(watch.rule.field)
    if (watch.rule.operator === "changed") return `${field} ${t("changes")}.`
  }
  if (watch.capability !== "email") return watch.summary

  const value = watch.rule.value?.trim() ?? ""
  if (!value) return watch.summary

  const terms = value.split(/\s+/).filter(Boolean)
  const sender = terms.find((term) => term.includes("@"))
  const otherTerms = terms.filter((term) => term !== sender)

  if (watch.rule.field === "searchText" && sender && otherTerms.length) {
    return `${t("Emails from")} ${sender} ${t("that mention")} ${quotedTerms(otherTerms.join(" "), t)}.`
  }
  if (watch.rule.field === "senderEmail") return `${t("Emails from")} ${value}.`
  if (watch.rule.field === "senderName") return `${t("Emails from")} ${quotedTerms(value, t)}.`
  if (watch.rule.field === "subject") return `${t("Emails with")} ${quotedTerms(value, t)} ${t("in the subject")}.`
  if (watch.rule.field === "attachmentNames") return `${t("Emails with attachments named")} ${quotedTerms(value, t)}.`
  if (watch.rule.field === "body") return `${t("Emails that mention")} ${quotedTerms(value, t)}.`

  return watch.summary
}

export function readableWatchEvent(watch: DexterWatchCopyWatch, t: Translate) {
  const event = watch.latestEvent
  if (!event) return ""

  if (watch.capability === "email") {
    const sender = eventValue(event, "senderName") || eventValue(event, "senderEmail")
    const subject = eventValue(event, "subject")
    if (sender && subject) return `${t("Email from")} ${sender}: ${subject}`
  }

  const field = eventValue(event, "field") || watch.rule.field
  const before = eventValue(event, "before")
  const after = eventValue(event, "after")
  const target = watch.targetLabel?.trim() || watch.title
  if (!before || !after) return event.body

  if (field === "stage") return `${target} ${t("moved from")} ${before} ${t("to")} ${after}.`
  if (field === "status") return `${target}: ${t("Status changed from")} ${t(before)} ${t("to")} ${t(after)}.`
  if (watch.capability === "todo" && field === "scheduledDate") return `${target}: ${t("Scheduled date changed from")} ${before} ${t("to")} ${after}.`

  return `${target}: ${field} ${t("changed from")} ${before} ${t("to")} ${after}.`
}
