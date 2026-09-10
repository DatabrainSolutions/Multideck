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
  if (watch.capability === "customers" && field === "contactEmails") {
    return `${target}: ${t("Contact email details updated")}.`
  }
  if (watch.capability === "customers" && field === "contactEmployment") {
    return `${target}: ${t("Contact employment updated")}.`
  }
  if (watch.capability === "customers" && field === "relatedPartyDefaults") {
    return `${target}: ${t("Related-party defaults updated")}.`
  }
  if (watch.capability === "customers" && field === "responsibleOffices") {
    return `${target}: ${t("Responsible offices updated")}.`
  }
  if (watch.capability === "customers" && field === "addresses") {
    const readAddress = (text: string): Record<string, unknown> | null => {
      try {
        const value: unknown = JSON.parse(text)
        return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
      } catch { return null }
    }
    const previous = readAddress(before), current = readAddress(after)
    if (!previous || !current) return `${target}: ${t("Address details changed")}.`
    if (!Object.keys(previous).length) return `${target}: ${t("Address added")}.`
    if (!Object.keys(current).length) return `${target}: ${t("Address removed")}.`
    const labels: Record<string, string> = {
      Org_NameOverride: "Address name", OrgAdd_Line1: "Address line 1", OrgAdd_Line2: "Address line 2",
      OrgAdd_TownCity: "Town or city", OrgAdd_CountyState: "County or state", OrgAdd_PostZipCode: "Postcode",
      OrgAdd_Country: "Country", OrgAdd_UNLOCODE: "Location code", OrgAdd_TimeZone: "Timezone",
      OrgAdd_IsActive: "Active", OrgAdd_MainEmail: "Email", OrgAdd_MainPhone: "Phone",
    }
    const display = (value: unknown) => value === null || value === undefined || value === "" ? t("Not set")
      : typeof value === "boolean" ? t(value ? "Yes" : "No") : typeof value === "string" ? value : t("Updated")
    const changes = Object.entries(labels).filter(([key]) => previous[key] !== current[key])
      .map(([key, label]) => `${t(label)} ${t("changed from")} ${display(previous[key])} ${t("to")} ${display(current[key])}`)
    for (const [key, label] of [["purposes", "Address purposes updated"], ["weeklyHours", "Opening hours updated"], ["openingOverrides", "Dated opening exceptions updated"]]) {
      if (JSON.stringify(previous[key] ?? []) !== JSON.stringify(current[key] ?? [])) changes.push(t(label))
    }
    return `${target}: ${changes.length ? changes.join("; ") : t("Address details changed")}.`
  }
  if (watch.capability === "customers" && ["accountCode", "scopeCode"].includes(field)) {
    const label = field === "accountCode" ? "Company code" : "Scope"
    return `${target}: ${t(label)} ${t("changed from")} ${before || t("Not set")} ${t("to")} ${after || t("Not set")}.`
  }
  if (!before || !after) return event.body

  if (field === "stage") return `${target} ${t("moved from")} ${before} ${t("to")} ${after}.`
  if (field === "status") return `${target}: ${t("Status changed from")} ${t(before)} ${t("to")} ${t(after)}.`
  if (watch.capability === "todo" && field === "scheduledDate") return `${target}: ${t("Scheduled date changed from")} ${before} ${t("to")} ${after}.`

  return `${target}: ${field} ${t("changed from")} ${before} ${t("to")} ${after}.`
}
