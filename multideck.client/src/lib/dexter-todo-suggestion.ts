import type { TodoLink, TodoPriority, TodoTag } from "@/lib/todo-api"

export type DexterTodoSuggestion = {
  title: string
  scheduledDate: string
  priority: TodoPriority | null
  links: TodoLink[]
  tags: TodoTag[]
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function offsetDate(days: number, now: Date) {
  const date = new Date(now)
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

const weekdayTerms = [
  ["sunday","sonntag","dimanche"],
  ["monday","montag","lundi"],
  ["tuesday","dienstag","mardi"],
  ["wednesday","mittwoch","mercredi"],
  ["thursday","donnerstag","jeudi"],
  ["friday","freitag","vendredi"],
  ["saturday","samstag","samedi"],
] as const

function scheduledDateFrom(text: string, now: Date) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
  if (iso) {
    const parsed = new Date(`${iso}T12:00:00`)
    if (!Number.isNaN(parsed.getTime()) && localDateKey(parsed) === iso) return iso
  }
  if (/\b(tomorrow|morgen|demain)\b|غد[اً]?/i.test(text)) return offsetDate(1,now)
  if (/\b(today|heute|aujourd['’]hui)\b|اليوم/i.test(text)) return localDateKey(now)
  const lower = text.toLowerCase()
  for (let day = 0; day < weekdayTerms.length; day += 1) {
    if (!weekdayTerms[day].some((term) => lower.includes(term))) continue
    const distance = (day - now.getDay() + 7) % 7 || 7
    return offsetDate(distance,now)
  }
  return localDateKey(now)
}

function priorityFrom(text: string): TodoPriority | null {
  if (/\b(urgent|asap|immediately|critical)\b|عاجل|dringend|urgente/i.test(text)) return "urgent"
  if (/\bhigh(?:\s+priority)?\b|hoch|élevée|عالية/i.test(text)) return "high"
  if (/\bmedium(?:\s+priority)?\b|mittel|moyenne|متوسطة/i.test(text)) return "medium"
  if (/\blow(?:\s+priority)?\b|niedrig|faible|منخفضة/i.test(text)) return "low"
  return null
}

function actionableAssistantLine(content: string) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean)
  const labelled = lines.find((line) => /^(?:#{1,4}\s*)?(?:next action|recommended next (?:action|step)|follow[- ]?up|action item)\s*[:—-]/i.test(line))
  if (labelled) return labelled
  return lines.find((line) => /^[-*]\s+/.test(line) && /\b(follow up|review|send|call|check|confirm|chase|prepare|book|schedule|complete|update)\b/i.test(line)) ?? ""
}

function cleanTitle(value: string) {
  const cleaned = value
    .replace(/^\s*(?:please\s+)?(?:remind me to|add(?: this)? to (?:my )?(?:to[- ]?do|task list)|add (?:a )?(?:to[- ]?do|task)(?: to)?|i need to|we need to|action item[:—-]?)\s*/i, "")
    .replace(/\s+(?:to|on) (?:my )?(?:to[- ]?do|task list)\s*$/i, "")
    .replace(/^[-*#\s]+/, "")
    .replace(/^(?:next action|recommended next (?:action|step)|follow[- ]?up|action item)\s*[:—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned.slice(0, 240)
}

function markdownLinks(content: string) {
  const result: TodoLink[] = []
  const seen = new Set<string>()
  for (const match of content.matchAll(/\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|\/[^\s)]*)\)/gi)) {
    const label = match[1].trim()
    const url = match[2].trim()
    if (!label || !url || seen.has(url)) continue
    seen.add(url)
    result.push({ label, url })
    if (result.length === 12) break
  }
  return result
}

function recordTags(content: string) {
  const values = new Set<string>()
  for (const match of content.matchAll(/\b(?:MD|Q|RD)-\d{2,}\b/gi)) values.add(match[0].toUpperCase())
  return [...values].slice(0,12).map((label) => ({ label }))
}

export function dexterTodoSuggestion(
  userContent: string,
  assistantContent: string,
  options: { pendingAction?: boolean; emailDraft?: boolean; streaming?: boolean; now?: Date } = {},
): DexterTodoSuggestion | null {
  if (options.pendingAction || options.emailDraft || options.streaming) return null
  const user = userContent.trim()
  const answer = assistantContent.trim()
  if (!answer || /\b(?:added|saved|created)\b.{0,50}\bto[- ]?do list\b/i.test(answer)) return null

  const explicitTaskIntent = /\b(remind me|to[- ]?do|todo|task list|action item|i need to|we need to|don['’]t forget|follow up|chase)\b/i.test(user)
  const assistantLine = actionableAssistantLine(answer)
  if (!explicitTaskIntent && !assistantLine) return null

  const title = cleanTitle(explicitTaskIntent ? user : assistantLine)
  if (title.length < 3) return null
  const combined = `${user}\n${answer}`
  return {
    title,
    scheduledDate: scheduledDateFrom(user || answer,options.now ?? new Date()),
    priority: priorityFrom(combined),
    links: markdownLinks(answer),
    tags: recordTags(combined),
  }
}
