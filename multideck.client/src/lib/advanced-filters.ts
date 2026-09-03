import { workspaceStorageKey } from "./workspace-environment.ts"
import { useCallback, useEffect, useState } from "react"

/**
 * Shared model for the register filter builders. Every table that offers
 * "all / any" condition groups reads and writes this one shape, so a saved
 * filter, a condition row and the matching logic stay in step across registers.
 */
export type FilterMatch = "all" | "any"

export type FilterOperator =
  | "contains"
  | "not-contains"
  | "is"
  | "is-not"
  | "starts-with"
  | "is-empty"
  | "is-not-empty"
  | "on"
  | "before"
  | "after"
  | "between"

export type FilterFieldKind = "text" | "date" | "select"

export type FilterFieldOption = {
  value: string
  label: string
  placeholder?: string
  kind?: FilterFieldKind
  options?: Array<{ value: string; label: string }>
}

export type FilterCondition = {
  id: string
  field: string
  operator: FilterOperator
  value: string
  valueTo?: string
}

export type FilterGroup = {
  id: string
  match: FilterMatch
  conditions: FilterCondition[]
}

export type FilterQuery = {
  match: FilterMatch
  groups: FilterGroup[]
}

export const textFilterOperators: Array<{ value: FilterOperator; label: string }> = [
  { value: "contains", label: "contains" },
  { value: "not-contains", label: "does not contain" },
  { value: "is", label: "is" },
  { value: "is-not", label: "is not" },
  { value: "starts-with", label: "starts with" },
  { value: "is-empty", label: "is empty" },
  { value: "is-not-empty", label: "is not empty" },
]

export const dateFilterOperators: Array<{ value: FilterOperator; label: string }> = [
  { value: "on", label: "is on" },
  { value: "before", label: "is before" },
  { value: "after", label: "is after" },
  { value: "between", label: "is between" },
  { value: "is-empty", label: "is empty" },
  { value: "is-not-empty", label: "is not empty" },
]

export const selectFilterOperators: Array<{ value: FilterOperator; label: string }> = [
  { value: "is", label: "is" },
  { value: "is-not", label: "is not" },
  { value: "is-empty", label: "is empty" },
  { value: "is-not-empty", label: "is not empty" },
]

export function filterOperatorsForKind(kind: FilterFieldKind = "text") {
  return kind === "date" ? dateFilterOperators : kind === "select" ? selectFilterOperators : textFilterOperators
}

export function filterOperatorNeedsValue(operator: FilterOperator) {
  return operator !== "is-empty" && operator !== "is-not-empty"
}

export function filterOperatorNeedsRange(operator: FilterOperator) {
  return operator === "between"
}

export function defaultFilterOperator(kind: FilterFieldKind = "text"): FilterOperator {
  return kind === "date" ? "on" : kind === "select" ? "is" : "contains"
}

let idCounter = 0

function createId(prefix: string) {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export function createFilterCondition(field = "any", kind: FilterFieldKind = "text"): FilterCondition {
  return { id: createId("condition"), field, operator: defaultFilterOperator(kind), value: "", valueTo: "" }
}

export function createFilterGroup(field?: string, kind?: FilterFieldKind): FilterGroup {
  return { id: createId("group"), match: "all", conditions: [createFilterCondition(field, kind)] }
}

export function createEmptyFilterQuery(field?: string): FilterQuery {
  return { match: "all", groups: [createFilterGroup(field)] }
}

export function filterConditionIsActive(condition: FilterCondition) {
  if (!filterOperatorNeedsValue(condition.operator)) return true
  if (filterOperatorNeedsRange(condition.operator)) return Boolean(condition.value.trim() || condition.valueTo?.trim())
  return Boolean(condition.value.trim())
}

export function countActiveFilterConditions(query: FilterQuery) {
  return query.groups.reduce((total, group) => total + group.conditions.filter(filterConditionIsActive).length, 0)
}

export function filterQueryIsEmpty(query: FilterQuery) {
  return countActiveFilterConditions(query) === 0
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase()
}

/** Day precision keeps "is on" honest when a value carries a time component. */
function toDayNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const isoDay = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  const parsed = Date.parse(isoDay ? `${trimmed}T00:00:00Z` : trimmed)
  if (Number.isNaN(parsed)) return null

  const date = new Date(parsed)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export type FilterValueGetter<Row> = (row: Row, field: string) => string | number | null | undefined | Array<string | number | null | undefined>

function toValueList<Row>(row: Row, field: string, getValue: FilterValueGetter<Row>) {
  const raw = getValue(row, field)
  const values = Array.isArray(raw) ? raw : [raw]
  return values.map((value) => String(value ?? ""))
}

function matchesDateCondition(values: string[], condition: FilterCondition) {
  const days = values.map(toDayNumber).filter((day): day is number => day !== null)
  if (!days.length) return false

  const start = toDayNumber(condition.value)
  const end = toDayNumber(condition.valueTo ?? "")

  if (condition.operator === "before") return start === null || days.some((day) => day < start)
  if (condition.operator === "after") return start === null || days.some((day) => day > start)
  if (condition.operator === "between") {
    const from = start ?? end
    const to = end ?? start
    if (from === null || to === null) return true
    return days.some((day) => day >= Math.min(from, to) && day <= Math.max(from, to))
  }

  return start === null || days.some((day) => day === start)
}

function matchesCondition<Row>(row: Row, condition: FilterCondition, getValue: FilterValueGetter<Row>) {
  const values = toValueList(row, condition.field, getValue)
  const filled = values.filter((value) => value.trim() && value.trim() !== "—")

  if (condition.operator === "is-empty") return filled.length === 0
  if (condition.operator === "is-not-empty") return filled.length > 0

  if (condition.operator === "on" || condition.operator === "before" || condition.operator === "after" || condition.operator === "between") {
    return matchesDateCondition(filled, condition)
  }

  const query = normalizeText(condition.value)
  if (!query) return true

  const normalized = values.map(normalizeText)
  // Negative operators have to hold for every value the field exposes, or a
  // record with several origins would slip through on the one that differs.
  if (condition.operator === "is-not") return normalized.every((value) => value !== query)
  if (condition.operator === "not-contains") return normalized.every((value) => !value.includes(query))
  if (condition.operator === "is") return normalized.some((value) => value === query)
  if (condition.operator === "starts-with") return normalized.some((value) => value.startsWith(query))
  return normalized.some((value) => value.includes(query))
}

export function matchesFilterQuery<Row>(row: Row, query: FilterQuery, getValue: FilterValueGetter<Row>) {
  const groups = query.groups
    .map((group) => ({ ...group, conditions: group.conditions.filter(filterConditionIsActive) }))
    .filter((group) => group.conditions.length > 0)

  if (!groups.length) return true

  const groupResults = groups.map((group) => {
    const results = group.conditions.map((condition) => matchesCondition(row, condition, getValue))
    return group.match === "all" ? results.every(Boolean) : results.some(Boolean)
  })

  return query.match === "all" ? groupResults.every(Boolean) : groupResults.some(Boolean)
}

export type SavedFilterView = {
  id: string
  name: string
  query: FilterQuery
  savedAt: string
}

const savedFilterPrefix = workspaceStorageKey("multideck.filters.")

function isFilterQuery(value: unknown): value is FilterQuery {
  if (!value || typeof value !== "object") return false
  const candidate = value as FilterQuery
  if (candidate.match !== "all" && candidate.match !== "any") return false
  return Array.isArray(candidate.groups) && candidate.groups.every((group) => (
    Boolean(group)
    && (group.match === "all" || group.match === "any")
    && Array.isArray(group.conditions)
    && group.conditions.every((condition) => Boolean(condition) && typeof condition.field === "string" && typeof condition.operator === "string")
  ))
}

function readSavedFilterViews(storageKey: string): SavedFilterView[] {
  if (typeof window === "undefined") return []

  try {
    const stored = window.localStorage.getItem(`${savedFilterPrefix}${storageKey}`)
    if (!stored) return []

    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((view): view is SavedFilterView => (
      Boolean(view)
      && typeof view === "object"
      && typeof (view as SavedFilterView).id === "string"
      && typeof (view as SavedFilterView).name === "string"
      && isFilterQuery((view as SavedFilterView).query)
    ))
  } catch {
    return []
  }
}

function writeSavedFilterViews(storageKey: string, views: SavedFilterView[]) {
  try {
    window.localStorage.setItem(`${savedFilterPrefix}${storageKey}`, JSON.stringify(views))
  } catch {
    // A full or blocked storage quota must never stop the filter from applying.
  }
}

export function useSavedFilterViews(storageKey: string) {
  const [views, setViews] = useState<SavedFilterView[]>(() => readSavedFilterViews(storageKey))

  useEffect(() => setViews(readSavedFilterViews(storageKey)), [storageKey])

  /** Saving under an existing name replaces it, so re-saving never leaves duplicates behind. */
  const saveView = useCallback((name: string, query: FilterQuery) => {
    const trimmed = name.trim()
    if (!trimmed) return null

    const existing = views.find((candidate) => candidate.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())
    const view: SavedFilterView = {
      id: existing?.id ?? createId("view"),
      name: trimmed,
      query,
      savedAt: new Date().toISOString(),
    }
    const next = existing
      ? views.map((candidate) => candidate.id === existing.id ? view : candidate)
      : [...views, view]

    setViews(next)
    writeSavedFilterViews(storageKey, next)
    return view
  }, [storageKey, views])

  const deleteView = useCallback((id: string) => {
    setViews((current) => {
      const next = current.filter((view) => view.id !== id)
      writeSavedFilterViews(storageKey, next)
      return next
    })
  }, [storageKey])

  return { views, saveView, deleteView }
}
