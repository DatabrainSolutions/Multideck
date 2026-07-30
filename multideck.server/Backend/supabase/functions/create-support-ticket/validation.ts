export type JsonObject = Record<string, unknown>

export type NormalizedSupportTicketRequest = {
  idempotencyKey: string
  topic: string
  title: string
  description: string
  priority: "medium" | "high" | "urgent"
  applicationUrl: string | null
}

export type SupportTicketValidation =
  | { value: NormalizedSupportTicketRequest; message?: never }
  | { value?: never; message: string }

const TOPICS = new Set([
  "Workflow question",
  "Booking sync issue",
  "Billing question",
  "Security concern",
  "Product feedback",
])

export function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  return value.trim().replace(/\u0000/g, "").slice(0, maxLength)
}

export function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export function isEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function normalizeStatusUrl(value: unknown) {
  const raw = cleanString(value, 2_000)
  if (!raw) return null

  try {
    const parsed = new URL(raw)
    return parsed.protocol === "https:" ? parsed.toString() : null
  } catch {
    return null
  }
}

function validateApplicationUrl(value: unknown) {
  const raw = cleanString(value, 2_001)
  if (!raw) return null
  if (raw.length > 2_000) return undefined

  try {
    const parsed = new URL(raw)
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

export function validateSupportTicketRequest(body: JsonObject): SupportTicketValidation {
  const idempotencyKey = cleanString(body.idempotencyKey, 120)
  const topic = cleanString(body.topic, 80)
  const title = cleanString(body.title, 180)
  const description = cleanString(body.description, 20_000)
  const priority = cleanString(body.priority, 20).toLowerCase()
  const normalizedPriority = priority === "normal" || priority === "medium"
    ? "medium"
    : priority === "high" || priority === "urgent"
      ? priority
      : ""
  const applicationUrl = validateApplicationUrl(body.applicationUrl)

  if (idempotencyKey.length < 8 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    return { message: "Start a new ticket and try again." }
  }
  if (!TOPICS.has(topic)) {
    return { message: "Choose a valid support topic." }
  }
  if (title.length < 3) {
    return { message: "Add a short subject so support can route the request." }
  }
  if (description.length < 20) {
    return { message: "Add at least 20 characters explaining what happened and what you expected." }
  }
  if (!normalizedPriority) {
    return { message: "Choose a valid ticket priority." }
  }
  if (applicationUrl === undefined) {
    return { message: "Refresh the page and try again." }
  }

  return {
    value: {
      idempotencyKey,
      topic,
      title,
      description,
      priority: normalizedPriority,
      applicationUrl,
    },
  }
}
