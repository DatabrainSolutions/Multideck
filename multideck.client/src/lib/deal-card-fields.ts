import { useEffect, useState } from "react"

export const dealCardFieldDefinitions = [
  { key: "expectedValue", label: "Expected value", example: "£84,000" },
  { key: "expectedMargin", label: "Expected margin", example: "£12,600" },
  { key: "probability", label: "Win probability", example: "65%" },
  { key: "primaryContact", label: "Primary contact", example: "Alex Morgan" },
  { key: "owner", label: "Owner", example: "AM" },
  { key: "expectedClose", label: "Expected close", example: "14 Aug" },
  { key: "mode", label: "Freight mode", example: "Ocean" },
  { key: "direction", label: "Direction", example: "Import" },
  { key: "origin", label: "Origin", example: "Shanghai" },
  { key: "destination", label: "Destination", example: "Felixstowe" },
  { key: "tradeLane", label: "Trade lane", example: "China → UK" },
  { key: "serviceInterest", label: "Service interest", example: "Ocean FCL" },
  { key: "nextAction", label: "Next action", example: "Due tomorrow" },
] as const

export type DealCardFieldKey = (typeof dealCardFieldDefinitions)[number]["key"]

export const dealCardFieldLimit = 3
export const defaultDealCardFields: DealCardFieldKey[] = ["expectedValue", "owner", "expectedClose"]

const storageKey = "multideck.crm.deal-card-fields"
const changeEvent = "multideck:deal-card-fields-changed"
const validKeys = new Set<DealCardFieldKey>(dealCardFieldDefinitions.map((field) => field.key))

function normalizeDealCardFields(value: unknown): DealCardFieldKey[] {
  if (!Array.isArray(value)) return defaultDealCardFields

  const unique = value.filter(
    (key, index): key is DealCardFieldKey =>
      typeof key === "string"
      && validKeys.has(key as DealCardFieldKey)
      && value.indexOf(key) === index,
  )

  return unique.length > 0 ? unique.slice(0, dealCardFieldLimit) : defaultDealCardFields
}

export function readDealCardFields(): DealCardFieldKey[] {
  if (typeof window === "undefined") return defaultDealCardFields

  try {
    return normalizeDealCardFields(JSON.parse(window.localStorage.getItem(storageKey) ?? "null"))
  } catch {
    return defaultDealCardFields
  }
}

export function saveDealCardFields(fields: DealCardFieldKey[]) {
  if (typeof window === "undefined") return

  const normalized = normalizeDealCardFields(fields)
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalized))
  } catch {
    // The current selection still works when storage is unavailable, such as private browsing.
  }
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: normalized }))
}

export function useDealCardFields() {
  const [fields, setFields] = useState<DealCardFieldKey[]>(readDealCardFields)

  useEffect(() => {
    function syncFields(event: Event) {
      const next = event instanceof CustomEvent ? event.detail : readDealCardFields()
      setFields(normalizeDealCardFields(next))
    }

    window.addEventListener(changeEvent, syncFields)
    window.addEventListener("storage", syncFields)
    return () => {
      window.removeEventListener(changeEvent, syncFields)
      window.removeEventListener("storage", syncFields)
    }
  }, [])

  function updateFields(next: DealCardFieldKey[]) {
    const normalized = normalizeDealCardFields(next)
    setFields(normalized)
    saveDealCardFields(normalized)
  }

  return [fields, updateFields] as const
}
