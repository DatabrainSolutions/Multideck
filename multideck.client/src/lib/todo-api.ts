import { supabase } from "@/lib/supabase"

export type TodoPriority = "low" | "medium" | "high" | "urgent"
export type TodoStatus = "open" | "completed"

export type TodoLink = {
  label: string
  url: string
}

export type TodoTag = {
  label: string
  href?: string
}

export type TodoTask = {
  id: string
  title: string
  scheduledDate: string
  priority: TodoPriority | null
  status: TodoStatus
  completedAt: string | null
  links: TodoLink[]
  tags: TodoTag[]
  source: "manual" | "dexter_context" | "dexter_action"
  sourceDexterMessageId: string | null
  editVersion: number
  createdAt: string
  updatedAt: string
}

export type CreateTodoTaskInput = {
  title: string
  scheduledDate: string
  priority?: TodoPriority | null
  links?: TodoLink[]
  tags?: TodoTag[]
  source?: "manual" | "dexter_context"
  sourceDexterMessageId?: string | null
}

export type UpdateTodoTaskPatch = Partial<Pick<
  TodoTask,
  "title" | "scheduledDate" | "priority" | "status" | "links" | "tags"
>>

export class TodoApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TodoApiError"
  }
}

function cleanString(value: unknown, maximum = 8_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function isPriority(value: unknown): value is TodoPriority {
  return value === "low" || value === "medium" || value === "high" || value === "urgent"
}

function normaliseLinks(value: unknown): TodoLink[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const link = item as Record<string, unknown>
    const label = cleanString(link.label, 120)
    const url = cleanString(link.url, 2_000)
    return label && url ? [{ label, url }] : []
  })
}

function normaliseTags(value: unknown): TodoTag[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const tag = item as Record<string, unknown>
    const label = cleanString(tag.label, 120)
    if (!label) return []
    const href = cleanString(tag.href, 2_000)
    return [{ label, ...(href ? { href } : {}) }]
  })
}

function normaliseTask(value: unknown): TodoTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TodoApiError("Multideck returned an invalid task.")
  }
  const row = value as Record<string, unknown>
  const id = cleanString(row.id, 80)
  const title = cleanString(row.title, 240)
  const scheduledDate = cleanString(row.scheduledDate, 10)
  if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    throw new TodoApiError("Multideck returned an incomplete task.")
  }
  const source = row.source === "dexter_context" || row.source === "dexter_action" ? row.source : "manual"
  return {
    id,
    title,
    scheduledDate,
    priority: isPriority(row.priority) ? row.priority : null,
    status: row.status === "completed" ? "completed" : "open",
    completedAt: cleanString(row.completedAt, 80) || null,
    links: normaliseLinks(row.links),
    tags: normaliseTags(row.tags),
    source,
    sourceDexterMessageId: cleanString(row.sourceDexterMessageId, 80) || null,
    editVersion: Math.max(1, Math.trunc(Number(row.editVersion) || 1)),
    createdAt: cleanString(row.createdAt, 80),
    updatedAt: cleanString(row.updatedAt, 80),
  }
}

function apiError(error: { message?: string } | null, fallback: string) {
  const message = cleanString(error?.message, 300)
  if (message && !/function .* does not exist|schema cache/i.test(message)) return new TodoApiError(message)
  return new TodoApiError(fallback)
}

function client() {
  if (!supabase) throw new TodoApiError("The To Do list is not connected to this workspace.")
  return supabase
}

export async function listTodoTasks(scheduledDate: string, signal?: AbortSignal) {
  let request = client().rpc("multideck_todo_list", { p_scheduled_date: scheduledDate })
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw apiError(error, "Your To Do list could not be loaded.")
  return (Array.isArray(data) ? data : []).map(normaliseTask)
}

export async function createTodoTask(input: CreateTodoTaskInput) {
  const { data, error } = await client().rpc("multideck_todo_create", {
    p_title: input.title,
    p_scheduled_date: input.scheduledDate,
    p_priority: input.priority ?? null,
    p_links: input.links ?? [],
    p_tags: input.tags ?? [],
    p_source_code: input.source ?? "manual",
    p_source_message_id: input.sourceDexterMessageId ?? null,
  })
  if (error) throw apiError(error, "That task could not be added.")
  return normaliseTask(data)
}

export async function updateTodoTask(taskId: string, patch: UpdateTodoTaskPatch) {
  const { data, error } = await client().rpc("multideck_todo_update", {
    p_task_id: taskId,
    p_patch: patch,
  })
  if (error) throw apiError(error, "That task could not be updated.")
  return normaliseTask(data)
}

export async function deleteTodoTask(taskId: string) {
  const { data, error } = await client().rpc("multideck_todo_delete", { p_task_id: taskId })
  if (error) throw apiError(error, "That task could not be removed.")
  return Boolean(data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).deleted)
}
