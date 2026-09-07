/** A URL change is not evidence that the requested Quote has finished loading. */
export function quoteWorkspaceRoute(value: string) {
  const match = /^\/quotes\/([a-z0-9_-]+)\/?$/i.exec(value)
  return match ? `/quotes/${match[1].toLowerCase()}` : null
}

export function waitForQuoteWorkspace(
  route: string,
  ready: () => void,
  unavailable: () => void,
) {
  const target = quoteWorkspaceRoute(route)
  let completed = false
  let firstFrame = 0
  let secondFrame = 0
  const inspect = () => {
    if (completed || !target) return
    const workspace = Array.from(document.querySelectorAll<HTMLElement>('[data-quote-workspace-route]'))
      .find((element) => element.dataset.quoteWorkspaceRoute === target)
    if (workspace?.dataset.quoteWorkspaceState === 'error') unavailable()
    if (workspace?.dataset.quoteWorkspaceState !== 'ready') return
    completed = true
    observer.disconnect()
    window.clearTimeout(timeout)
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(ready)
    })
  }
  const observer = new MutationObserver(inspect)
  observer.observe(document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-quote-workspace-route', 'data-quote-workspace-state'],
  })
  // Keep the queue held on failure/slow loading; the operator can still dismiss.
  const timeout = window.setTimeout(unavailable, 20_000)
  inspect()
  return () => {
    completed = true
    observer.disconnect()
    window.clearTimeout(timeout)
    window.cancelAnimationFrame(firstFrame)
    window.cancelAnimationFrame(secondFrame)
  }
}
