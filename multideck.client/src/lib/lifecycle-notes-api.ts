import { supabase } from "@/lib/supabase"

export type LifecycleNoteSubjectType = "quote" | "booking" | "customs"
export type LifecycleNoteMentionType = "user" | "department"

export type LifecycleNoteMention = {
  type: LifecycleNoteMentionType
  id: string
  label: string
}

export type LifecycleNoteTarget = LifecycleNoteMention & {
  detail: string | null
}

export type LifecycleNote = {
  id: string
  subjectType: LifecycleNoteSubjectType
  subjectId: string
  body: string
  author: {
    id: string | null
    name: string
  }
  mentions: LifecycleNoteMention[]
  createdAt: string
  updatedAt?: string | null
  deletedAt?: string | null
}

export type LifecycleNotesPage = {
  notes: LifecycleNote[]
  hasMore: boolean
  canWrite: boolean
  reference: string
}

function requireClient() {
  if (!supabase) throw new Error("Notes are unavailable until this workspace is connected.")
  return supabase
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function getLifecycleNotes(
  subjectType: LifecycleNoteSubjectType,
  subjectId: string,
  before: string | null = null,
  limit = 30,
): Promise<LifecycleNotesPage> {
  const { data, error } = await requireClient().rpc("multideck_lifecycle_notes", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_limit: Math.max(1, Math.min(Math.trunc(limit), 50)),
    p_before: before,
  })
  if (error) throw error
  const response = record(data)
  return {
    notes: Array.isArray(response.notes) ? response.notes as LifecycleNote[] : [],
    hasMore: response.hasMore === true,
    canWrite: response.canWrite === true,
    reference: typeof response.reference === "string" ? response.reference : "",
  }
}

export async function searchLifecycleNoteTargets(
  subjectType: LifecycleNoteSubjectType,
  subjectId: string,
  search: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<LifecycleNoteTarget[]> {
  let query = requireClient().rpc("multideck_lifecycle_note_targets", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_search: search.trim().slice(0, 160) || null,
    p_limit: Math.max(1, Math.min(Math.trunc(limit), 50)),
  })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  return Array.isArray(data) ? data as LifecycleNoteTarget[] : []
}

export async function addLifecycleNote(
  subjectType: LifecycleNoteSubjectType,
  subjectId: string,
  body: string,
  mentions: LifecycleNoteMention[],
): Promise<LifecycleNote> {
  const { data, error } = await requireClient().rpc("multideck_add_lifecycle_note", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_body: body,
    p_mentions: mentions.map(({ type, id }) => ({ type, id })),
  })
  if (error) throw error
  return data as LifecycleNote
}

export async function updateLifecycleNote(noteId: string, body: string): Promise<LifecycleNote> {
  const { data, error } = await requireClient().rpc("multideck_update_lifecycle_note", {
    p_note_id: noteId,
    p_body: body,
  })
  if (error) throw error
  return data as LifecycleNote
}

export async function deleteLifecycleNote(noteId: string): Promise<LifecycleNote> {
  const { data, error } = await requireClient().rpc("multideck_delete_lifecycle_note", {
    p_note_id: noteId,
  })
  if (error) throw error
  return data as LifecycleNote
}
