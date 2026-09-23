import type { DexterActivity, DexterActivityProvider } from "../../../shared/dexter-activity.ts"

type Json = Record<string, unknown>
const object = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const provider = (value: unknown): value is DexterActivityProvider => value === "gmail" || value === "outlook"
const names = { gmail: "Gmail", outlook: "Outlook" }
const domains: Record<string, string> = {
  customers: "customers", contacts: "contacts", leads: "leads", deals: "deals", bookings: "bookings",
  jobs: "jobs", quotes: "quotes", calendar: "calendar", meetings: "meetings", tasks: "tasks",
  finance: "finance records", customs: "customs records", warehouse: "warehouse records",
}

function failureDetail(name: string, evidence: unknown): string {
  const code = object(evidence) && typeof evidence.code === "string" ? evidence.code : ""
  const known: Record<string, string> = {
    thread_page_limit: "Dexter reached the three-page email limit for this request. Ask it to read the remaining email in a new request.",
    attachment_limit: "Dexter reached the three-attachment limit for this request. Ask it to read the remaining attachment in a new request.",
    attachment_too_large: "This attachment exceeds Dexter's 25 MB limit. Open it in Inbox or upload a smaller file.",
    attachment_total_too_large: "This request reached its attachment size limit. Ask Dexter to read this attachment on its own.",
    attachment_type_unsupported: "Dexter cannot read this attachment format. Open it in Inbox or provide a PDF, document, spreadsheet or supported image.",
    thread_not_in_context: "Dexter could not verify this email from the current search results. Ask it to search for the email again before reading it.",
    attachment_not_in_context: "Dexter needs to read the matching email before opening this attachment. Ask it to open the email first.",
    reauthorization_required: "The mailbox connection needs refreshing. Reconnect it in Settings → Integrations, then try again.",
    rate_limited: "The email provider temporarily limited requests. Wait a moment, then ask Dexter to try again.",
    permission_denied: "Your account does not have access to this source. Ask a workspace administrator to check your access.",
    "42501": "Your account does not have access to this source. Ask a workspace administrator to check your access.",
    provider_not_selected: "This mailbox was not included in the request. Select Gmail or Outlook in your message and try again.",
    not_found: "The requested source is no longer available to Dexter. Open it directly or search for it again.",
  }
  if (known[code]) return known[code]
  if (["thread_invalid", "attachment_invalid", "cursor_invalid", "date_invalid", "invalid_request"].includes(code)) {
    return "Dexter could not use this email reference or search. Ask it to search again with a subject, sender or date range."
  }
  if (name.includes("email") && name !== "load_operator_email_style") {
    return "Dexter could not complete this email step. Try asking it to check the email again, or open the email in Inbox."
  }
  return "Dexter could not complete this step. Ask it to try this part again, or open the source directly."
}

/** Observe operations already authorised by the existing tool boundary. No extra reads or model calls. */
export function createDexterActivityTracker(emit: (event: Json) => void) {
  const activities: DexterActivity[] = []
  const sources = new Map<string, DexterActivityProvider>()

  function rememberSources(value: unknown, inherited?: DexterActivityProvider, depth = 0) {
    if (depth > 6) return
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach(item => rememberSources(item, inherited, depth + 1))
    } else if (object(value)) {
      const source = provider(value.provider) ? value.provider : inherited
      if (source) for (const key of ["id", "threadId", "attachmentId"]) {
        if (typeof value[key] === "string") sources.set(value[key], source)
      }
      // Only structured provider results, never email prose or arbitrary fields.
      for (const key of ["items", "messages", "attachments", "thread"]) rememberSources(value[key], source, depth + 1)
    }
  }

  async function run<T>(name: string, args: Json, allowedProviders: DexterActivityProvider[], operation: () => Promise<T>, output: (result: T) => unknown = result => result): Promise<T> {
    const isSearch = name === "search_email" || name === "list_recent_email"
    const knownSource = sources.get(String(args.threadId ?? args.attachmentId ?? ""))
    const providers = isSearch
      ? allowedProviders.filter(item => !args.provider || args.provider === item)
      : knownSource && allowedProviders.includes(knownSource) ? [knownSource]
      : name.startsWith("read_email_") && allowedProviders.length === 1 ? allowedProviders : []
    const sourceName = providers.map(item => names[item]).join(" and ") || "email"
    const labels: Record<string, [string, string, string]> = {
      search_email: [`Searching ${sourceName}`, `Searched ${sourceName}`, `Could not search ${sourceName}`],
      list_recent_email: [`Checking recent ${providers.length ? sourceName + " emails" : "emails"}`, `Checked recent ${providers.length ? sourceName + " emails" : "emails"}`, "Could not check recent emails"],
      read_email_thread: [`Reading ${providers.length ? sourceName + " emails" : "emails"}`, `Read ${providers.length ? sourceName + " emails" : "emails"}`, "Could not read emails"],
      read_email_attachment: ["Reading email attachment", "Read email attachment", "Could not read email attachment"],
      query_data_domain: [`Checking ${domains[String(args.domain)] ?? "workspace records"}`, `Checked ${domains[String(args.domain)] ?? "workspace records"}`, "Could not check workspace records"],
      read_document: ["Reading document", "Read document", "Could not read document"],
      load_operator_email_style: ["Checking your email preferences", "Checked your email preferences", "Could not check email preferences"],
      prepare_email_draft: ["Preparing email draft", "Prepared email draft for review", "Could not prepare email draft"],
    }
    const [running, completed, failed] = labels[name] ?? ["Checking workspace data", "Checked workspace data", "Could not complete check"]
    const activity: DexterActivity = { id: crypto.randomUUID(), label: running, status: "running", providers }
    activities.push(activity)
    emit({ type: "activity", activity: { ...activity } })
    try {
      const result = await operation()
      const evidence = output(result)
      const failedResult = object(evidence) && (Boolean(evidence.error) || evidence.ok === false || evidence.success === false)
      if (!failedResult && (isSearch || name.startsWith("read_email_"))) {
        rememberSources(evidence)
        const actualSource = object(evidence) && provider(evidence.provider) ? evidence.provider : sources.get(String(args.threadId ?? args.attachmentId ?? ""))
        if (!isSearch && actualSource && allowedProviders.includes(actualSource)) activity.providers = [actualSource]
      }
      activity.status = failedResult ? "failed" : "completed"
      if (failedResult) activity.detail = failureDetail(name, evidence)
      activity.label = failedResult ? failed : name === "read_email_thread" && activity.providers.length
        ? `Read ${activity.providers.map(item => names[item]).join(" and ")} emails` : completed
      return result
    } catch (error) {
      activity.status = "failed"
      activity.label = failed
      activity.detail = failureDetail(name, error)
      throw error
    } finally {
      emit({ type: "activity", activity: { ...activity } })
    }
  }
  return { activities, run }
}
