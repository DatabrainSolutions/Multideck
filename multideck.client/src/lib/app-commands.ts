/**
 * A tiny registry for shell affordances a shortcut needs to reach.
 *
 * The command bar lives inside the top bar, which only some routes render. Rather
 * than hoisting its state into the app so a key handler can find it, the input
 * registers a focus function while it is mounted and the shortcut asks whether
 * anybody answered. That keeps the coupling to one function reference.
 */

type FocusHandler = () => void

const searchHandlers = new Set<FocusHandler>()

export function registerAppSearch(handler: FocusHandler) {
  searchHandlers.add(handler)
  return () => {
    searchHandlers.delete(handler)
  }
}

/** Focuses the command bar, and reports whether one was on screen to focus. */
export function focusAppSearch() {
  const handler = [...searchHandlers].at(-1)
  if (!handler) return false

  handler()
  return true
}
