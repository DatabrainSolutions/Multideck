import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export type EventStatus = "draft" | "published" | "cancelled"
export type EventAudience = "everyone" | "people" | "departments"
export type RsvpStatus = "going" | "maybe" | "not_going"
export type RsvpFieldType = "short_text" | "long_text" | "number" | "date" | "yes_no" | "single_choice" | "multi_choice"
export type RsvpFieldOption = { id: string; label: string }
export type RsvpField = { id: string; type: RsvpFieldType; label: string; required: boolean; options?: RsvpFieldOption[] }
export type RsvpAnswerValue = string | number | boolean | string[]
export type RsvpAnswers = Record<string, RsvpAnswerValue>

export type MyRsvp = { status: RsvpStatus; answers: RsvpAnswers; formVersion: number; needsUpdate: boolean; updatedAt: string }
export type EventResponse = MyRsvp & { userId: string; name: string; form: RsvpField[] }

export type CompanyEvent = {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string
  details: string
  imagePath: string | null
  status: EventStatus
  cancellationNote: string | null
  form: RsvpField[]
  formVersion: number
  editVersion: number
  goingCount: number
  maybeCount: number
  audience: EventAudience
  /** Active colleagues the invitation reaches; null when the workspace predates invitations. */
  invitedCount: number | null
  /** Organisers only: who the event is for. */
  invitees?: Array<{ kind: "user" | "department"; id: string }>
  canManage: boolean
  myRsvp: MyRsvp | null
  attendees?: EventAttendee[]
  responses?: EventResponse[]
}

export type EventAttendee = { userId: string; name: string; status: RsvpStatus; photoPath: string | null }

export type EventDraft = {
  title: string
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string
  details: string
  imagePath: string | null
  form: RsvpField[]
  audience: EventAudience
  /** User ids for "people", department ids for "departments". */
  invitees: string[]
}

export type EventsSettings = { enabled: boolean; canManage: boolean; canConfigure: boolean }

export const rsvpFieldTypes: Array<{ type: RsvpFieldType; label: string }> = [
  { type: "short_text", label: "Short answer" },
  { type: "long_text", label: "Paragraph" },
  { type: "single_choice", label: "Single choice" },
  { type: "multi_choice", label: "Multiple choice" },
  { type: "yes_no", label: "Yes or no" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
]

export const eventImageBucket = "company-event-images"
export const eventImageMaxBytes = 5 * 1024 * 1024
export const rsvpFormMaxFields = 20

export class EventsApiError extends Error {
  readonly code: "disabled" | "unavailable" | "conflict" | "cancelled" | "forbidden" | "invalid" | "network"
  constructor(message: string, code: EventsApiError["code"]) {
    super(message)
    this.name = "EventsApiError"
    this.code = code
  }
}

function client() {
  if (!supabase) throw new EventsApiError("Events are not connected to this workspace.", "unavailable")
  return supabase
}

function toError(error: { message?: string; code?: string } | null): EventsApiError {
  const message = (error?.message ?? "").slice(0, 300)
  if (/Choose going or not going/i.test(message)) return new EventsApiError("Maybe is not available in this workspace yet. Choose Yes or No.", "unavailable")
  if (/does not exist|schema cache|Could not find the function/i.test(message)) return new EventsApiError("Events are not available in this workspace yet.", "unavailable")
  if (/turned off/i.test(message)) return new EventsApiError(message, "disabled")
  if (error?.code === "40001") return new EventsApiError(message, "conflict")
  if (/cancelled/i.test(message) && error?.code === "55000") return new EventsApiError(message, "cancelled")
  if (error?.code === "42501") return new EventsApiError(message || "You do not have access to this event.", "forbidden")
  if (error?.code === "22023" || error?.code === "55000") return new EventsApiError(message, "invalid")
  if (/fetch|network|Failed to/i.test(message) || !message) return new EventsApiError("Multideck could not be reached. Check your connection and try again.", "network")
  return new EventsApiError(message, "invalid")
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  let result
  try {
    result = await client().rpc(name, args)
  } catch (error) {
    throw error instanceof EventsApiError ? error : toError({ message: error instanceof Error ? error.message : "" })
  }
  if (result.error) throw toError(result.error)
  return result.data as T
}

const text = (value: unknown, max = 8000) => (typeof value === "string" ? value.slice(0, max) : "")

function normaliseField(value: unknown): RsvpField | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const type = rsvpFieldTypes.some((item) => item.type === row.type) ? row.type as RsvpFieldType : null
  if (!type || !text(row.id, 40)) return null
  const options = Array.isArray(row.options)
    ? row.options.flatMap((option) => option && typeof option === "object" && text((option as RsvpFieldOption).id, 40) ? [{ id: text((option as RsvpFieldOption).id, 40), label: text((option as RsvpFieldOption).label, 80) }] : [])
    : undefined
  return { id: text(row.id, 40), type, label: text(row.label, 160), required: row.required === true, ...(options ? { options } : {}) }
}

function normaliseForm(value: unknown) {
  return Array.isArray(value) ? value.flatMap((field) => normaliseField(field) ?? []) : []
}

function normaliseRsvp(value: unknown): MyRsvp | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (row.status !== "going" && row.status !== "maybe" && row.status !== "not_going") return null
  return {
    status: row.status,
    answers: row.answers && typeof row.answers === "object" && !Array.isArray(row.answers) ? row.answers as RsvpAnswers : {},
    formVersion: Number(row.formVersion) || 1,
    needsUpdate: row.needsUpdate === true,
    updatedAt: text(row.updatedAt, 80),
  }
}

export function normaliseEvent(value: unknown): CompanyEvent {
  if (!value || typeof value !== "object") throw new EventsApiError("Multideck returned an invalid event.", "invalid")
  const row = value as Record<string, unknown>
  const status = row.status === "published" || row.status === "cancelled" ? row.status : "draft"
  return {
    id: text(row.id, 80),
    title: text(row.title, 160),
    startsAt: text(row.startsAt, 80),
    endsAt: text(row.endsAt, 80) || null,
    timezone: text(row.timezone, 80) || "Europe/London",
    location: text(row.location, 240),
    details: text(row.details),
    imagePath: text(row.imagePath, 200) || null,
    status,
    cancellationNote: text(row.cancellationNote, 400) || null,
    form: normaliseForm(row.form),
    formVersion: Number(row.formVersion) || 1,
    editVersion: Number(row.editVersion) || 1,
    goingCount: Math.max(0, Number(row.goingCount) || 0),
    maybeCount: Math.max(0, Number(row.maybeCount) || 0),
    audience: row.audience === "people" || row.audience === "departments" ? row.audience : "everyone",
    invitedCount: typeof row.invitedCount === "number" ? Math.max(0, row.invitedCount) : null,
    ...(Array.isArray(row.invitees) ? { invitees: row.invitees.flatMap((item) => {
      const record = item as Record<string, unknown>
      return (record.kind === "user" || record.kind === "department") && text(record.id, 80) ? [{ kind: record.kind, id: text(record.id, 80) }] : []
    }) } : {}),
    canManage: row.canManage === true,
    myRsvp: normaliseRsvp(row.myRsvp),
    ...(Array.isArray(row.attendees) ? {
      attendees: row.attendees.flatMap((item) => {
        const record = item as Record<string, unknown>
        // Older servers list only people going, without a status.
        const status: RsvpStatus = record.status === "maybe" || record.status === "not_going" ? record.status : "going"
        return text(record.userId, 80) ? [{ userId: text(record.userId, 80), name: text(record.name, 200), status, photoPath: text(record.photoPath, 255) || null }] : []
      }),
    } : {}),
    ...(Array.isArray(row.responses) ? {
      responses: row.responses.flatMap((item) => {
        const rsvp = normaliseRsvp(item)
        const record = item as Record<string, unknown>
        return rsvp ? [{ ...rsvp, userId: text(record.userId, 80), name: text(record.name, 200), form: normaliseForm(record.form) }] : []
      }),
    } : {}),
  }
}

// One shared read of the company switch so the sidebar, route guard and page agree.
let settingsCache: EventsSettings | null = null
let settingsRequest: Promise<EventsSettings> | null = null
const settingsListeners = new Set<(settings: EventsSettings | null) => void>()

export function getEventsSettings(force = false): Promise<EventsSettings> {
  if (settingsCache && !force) return Promise.resolve(settingsCache)
  if (settingsRequest && !force) return settingsRequest
  settingsRequest = rpc<Record<string, unknown>>("company_events_settings").then((data) => {
    settingsCache = { enabled: data?.enabled === true, canManage: data?.canManage === true, canConfigure: data?.canConfigure === true }
    settingsListeners.forEach((listener) => listener(settingsCache))
    return settingsCache
  }).finally(() => { settingsRequest = null })
  return settingsRequest
}

export async function setEventsEnabled(enabled: boolean) {
  const data = await rpc<Record<string, unknown>>("company_events_set_enabled", { p_enabled: enabled })
  settingsCache = { enabled: data?.enabled === true, canManage: data?.canManage === true, canConfigure: data?.canConfigure === true }
  settingsListeners.forEach((listener) => listener(settingsCache))
  return settingsCache
}

/** Null while loading or when the backend is unavailable; the destination stays hidden until confirmed on. */
export function useEventsSettings(active = true) {
  const [settings, setSettings] = useState<EventsSettings | null>(settingsCache)
  const [resolved, setResolved] = useState(settingsCache !== null)
  useEffect(() => {
    if (!active) return
    let current = true
    const listener = (next: EventsSettings | null) => { if (current) { setSettings(next); setResolved(true) } }
    settingsListeners.add(listener)
    getEventsSettings().then(listener, () => { if (current) { setSettings(null); setResolved(true) } })
    return () => { current = false; settingsListeners.delete(listener) }
  }, [active])
  return { settings, resolved }
}

export async function listEvents() {
  const data = await rpc<unknown[]>("company_events_list")
  return (Array.isArray(data) ? data : []).map(normaliseEvent)
}

export async function getEvent(eventId: string) {
  return normaliseEvent(await rpc("company_event_get", { p_event_id: eventId }))
}

export async function saveEvent(eventId: string | null, expectedVersion: number, draft: EventDraft) {
  return normaliseEvent(await rpc("company_event_save", { p_event_id: eventId, p_expected_version: expectedVersion, p_payload: draft }))
}

export async function setEventStatus(eventId: string, status: "published" | "cancelled" | "archived", expectedVersion: number | null, note?: string) {
  return normaliseEvent(await rpc("company_event_set_status", { p_event_id: eventId, p_status: status, p_expected_version: expectedVersion, p_note: note ?? null }))
}

/** The request id makes a retried or double-submitted RSVP save exactly once. */
export async function saveRsvp(eventId: string, status: RsvpStatus, answers: RsvpAnswers | null, requestId: string) {
  return normaliseEvent(await rpc("company_event_rsvp", { p_event_id: eventId, p_status: status, p_answers: answers, p_request_id: requestId }))
}

async function detectImageType(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" }
  if ([0x89, 0x50, 0x4e, 0x47].every((value, index) => bytes[index] === value)) return { mime: "image/png", ext: "png" }
  if ([0x52, 0x49, 0x46, 0x46].every((value, index) => bytes[index] === value) && [0x57, 0x45, 0x42, 0x50].every((value, index) => bytes[index + 8] === value)) return { mime: "image/webp", ext: "webp" }
  return null
}

export async function uploadEventImage(file: File) {
  if (file.size > eventImageMaxBytes) throw new EventsApiError("Choose an image under 5 MB.", "invalid")
  const type = await detectImageType(file)
  if (!type) throw new EventsApiError("Choose a JPEG, PNG or WebP image.", "invalid")
  const { data: auth } = await client().auth.getUser()
  if (!auth.user) throw new EventsApiError("Sign in again to upload images.", "forbidden")
  const path = `${auth.user.id}/${crypto.randomUUID()}.${type.ext}`
  const { error } = await client().storage.from(eventImageBucket).upload(path, file, { contentType: type.mime, upsert: false })
  if (error) throw new EventsApiError(/row-level|policy|403/i.test(error.message) ? "You need the Event organiser role to upload images." : "The image could not be uploaded. Try again.", "invalid")
  return path
}

const signedUrls = new Map<string, { url: string; expires: number }>()

export async function eventImageUrl(path: string) {
  const cached = signedUrls.get(path)
  if (cached && cached.expires > Date.now() + 60_000) return cached.url
  const { data, error } = await client().storage.from(eventImageBucket).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) throw new EventsApiError("The event image could not be loaded.", "network")
  signedUrls.set(path, { url: data.signedUrl, expires: Date.now() + 3600_000 })
  return data.signedUrl
}

export function useEventImage(path: string | null) {
  const [url, setUrl] = useState<string | null>(() => (path ? signedUrls.get(path)?.url ?? null : null))
  useEffect(() => {
    if (!path) { setUrl(null); return }
    let current = true
    eventImageUrl(path).then((next) => { if (current) setUrl(next) }, () => { if (current) setUrl(null) })
    return () => { current = false }
  }, [path])
  return url
}

export function isEventOver(event: Pick<CompanyEvent, "startsAt" | "endsAt">, now = Date.now()) {
  return Date.parse(event.endsAt ?? event.startsAt) < now
}

/** Mirrors the server rules so problems show beside the field before saving. */
export function validateRsvpAnswers(form: RsvpField[], answers: RsvpAnswers) {
  const errors: Record<string, string> = {}
  for (const field of form) {
    const value = answers[field.id]
    const empty = value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0)
    if (empty) { if (field.required) errors[field.id] = "Answer this question."; continue }
    if (field.type === "short_text" && String(value).trim().length > 240) errors[field.id] = "Keep this under 240 characters."
    if (field.type === "long_text" && String(value).trim().length > 4000) errors[field.id] = "Keep this under 4,000 characters."
    if (field.type === "number" && !/^-?\d{1,12}(\.\d{1,4})?$/.test(String(value).trim())) errors[field.id] = "Enter a number."
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) errors[field.id] = "Choose a date."
  }
  return errors
}

export function validateRsvpForm(form: RsvpField[]) {
  const errors: Record<string, string> = {}
  for (const field of form) {
    if (!field.label.trim()) errors[field.id] = "Add a question."
    else if ((field.type === "single_choice" || field.type === "multi_choice")) {
      const labels = (field.options ?? []).map((option) => option.label.trim().toLowerCase())
      if (labels.length < 2) errors[field.id] = "Add at least two options."
      else if (labels.some((label) => !label)) errors[field.id] = "Name every option."
      else if (new Set(labels).size !== labels.length) errors[field.id] = "Options must be different."
    }
  }
  return errors
}

export function newFieldId() {
  return `q_${crypto.randomUUID().slice(0, 8)}`
}

/** Signed URLs for colleagues' profile photos, read through the existing profile-photos policy. */
export function useProfilePhotoUrls(paths: Array<string | null>) {
  const key = [...new Set(paths.filter((path): path is string => Boolean(path)))].sort().join("|")
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!key || !supabase) { setUrls(new Map()); return }
    let current = true
    supabase.storage.from("profile-photos").createSignedUrls(key.split("|"), 3600).then(({ data }) => {
      if (!current || !data) return
      setUrls(new Map(data.flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as [string, string]] : [])))
    }, () => undefined)
    return () => { current = false }
  }, [key])
  return urls
}

export type DirectoryPerson = { userId: string; name: string; jobTitle: string | null; photoPath: string | null; departmentIds: string[] }
export type DirectoryDepartment = { id: string; name: string; memberCount: number }
export type EventsDirectory = { people: DirectoryPerson[]; departments: DirectoryDepartment[] }

/** Organisers only: the colleagues and departments an event can be sent to. */
export async function getEventsDirectory(): Promise<EventsDirectory> {
  const data = await rpc<Record<string, unknown>>("company_events_directory")
  const people = Array.isArray(data?.people) ? data.people : []
  const departments = Array.isArray(data?.departments) ? data.departments : []
  return {
    people: people.flatMap((item) => {
      const row = item as Record<string, unknown>
      return text(row.userId, 80) ? [{ userId: text(row.userId, 80), name: text(row.name, 200), jobTitle: text(row.jobTitle, 120) || null, photoPath: text(row.photoPath, 255) || null, departmentIds: Array.isArray(row.departmentIds) ? row.departmentIds.map((id) => text(id, 80)).filter(Boolean) : [] }] : []
    }),
    departments: departments.flatMap((item) => {
      const row = item as Record<string, unknown>
      return text(row.id, 80) ? [{ id: text(row.id, 80), name: text(row.name, 80), memberCount: Math.max(0, Number(row.memberCount) || 0) }] : []
    }),
  }
}

/** How many colleagues an audience reaches, using the same rule as the server. */
export function audienceReach(directory: EventsDirectory, audience: EventAudience, invitees: string[]) {
  if (audience === "everyone") return directory.people.length
  const chosen = new Set(invitees)
  if (audience === "people") return directory.people.filter((person) => chosen.has(person.userId)).length
  return directory.people.filter((person) => person.departmentIds.some((id) => chosen.has(id))).length
}
