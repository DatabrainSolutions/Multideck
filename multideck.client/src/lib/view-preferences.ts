export function getSavedView<T extends string>(storageKey: string, options: readonly T[], fallback: T) {
  if (typeof window === "undefined") return fallback

  try {
    const saved = window.localStorage.getItem(storageKey)
    return options.includes(saved as T) ? saved as T : fallback
  } catch {
    return fallback
  }
}

export function saveView(storageKey: string, value: string) {
  try {
    window.localStorage.setItem(storageKey, value)
  } catch {
    // View preferences are optional; the selected view still works for this session.
  }
}
