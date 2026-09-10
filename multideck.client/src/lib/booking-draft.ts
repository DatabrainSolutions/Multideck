/** Apply a save response without replacing edits made after that request began. */
export function rebaseBookingDraft<T>(saved: T, sent: T, current: T): T {
  if (JSON.stringify(current) === JSON.stringify(sent)) return saved
  if (Array.isArray(current) && Array.isArray(sent) && Array.isArray(saved)) {
    return current.map((item, index) => {
      const id = item && typeof item === "object" ? item.id : undefined
      const sentIndex = id ? sent.findIndex(candidate => candidate?.id === id) : index
      if (sentIndex < 0 || sentIndex >= sent.length) return item
      // Party rows are recreated by the save endpoint and can be reordered by role.
      // Match a unique role before falling back to position so newer payer edits
      // never acquire another party's name or account ID from the response.
      const role = item && typeof item === "object" ? item.role : undefined
      const roleMatches = role ? saved.filter(candidate => candidate?.role === role) : []
      const savedItem = (id ? saved.find(candidate => candidate?.id === id) : undefined)
        ?? (roleMatches.length === 1 ? roleMatches[0] : saved[sentIndex])
      return savedItem === undefined ? item : rebaseBookingDraft(savedItem, sent[sentIndex], item)
    }) as T
  }
  if (current && sent && saved && typeof current === "object" && typeof sent === "object" && typeof saved === "object" && !Array.isArray(current)) {
    const before = sent as Record<string, unknown>, next = saved as Record<string, unknown>, live = current as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(live), ...Object.keys(next)])) {
      if (!(key in live) && key in before) continue
      result[key] = rebaseBookingDraft(next[key], before[key], live[key])
    }
    return result as T
  }
  return current
}

/** Only competing edits need review; unchanged server metadata is never offered as an override. */
export function bookingDraftConflicts(base: unknown, saved: unknown, draft: unknown, path: string[] = []): { field: string; saved: string; draft: string }[] {
  if (JSON.stringify(base) === JSON.stringify(draft) || JSON.stringify(base) === JSON.stringify(saved) || JSON.stringify(saved) === JSON.stringify(draft)) return []
  if (base && saved && draft && typeof base === "object" && typeof saved === "object" && typeof draft === "object") {
    const before = base as Record<string, unknown>, next = saved as Record<string, unknown>, live = draft as Record<string, unknown>
    return Object.keys(live).flatMap(key => bookingDraftConflicts(before[key], next[key], live[key], [...path, key]))
  }
  const field = path.filter(part => !["workspace", "editableDetails", "rawSnapshot", "data"].includes(part)).map(part => /^\d+$/.test(part) ? String(Number(part) + 1) : part.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, value => value.toUpperCase())).join(" · ")
  const display = (value: unknown) => value == null || value === "" ? "Blank" : typeof value === "object" ? JSON.stringify(value) : String(value)
  return [{ field, saved: display(saved), draft: display(draft) }]
}
