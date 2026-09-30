/** Share hover/focus/navigation downloads and bound the route loading state. */
export function createPageLoader<T>(load: () => Promise<T>, timeoutMs = 20_000) {
  let pending: Promise<T> | undefined
  return () => {
    if (pending) return pending
    let timer: ReturnType<typeof setTimeout>
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("This page took too long to load. Reload the page to try again.")), timeoutMs)
    })
    pending = Promise.race([Promise.resolve().then(load), deadline])
      .catch(error => { pending = undefined; throw error })
      .finally(() => clearTimeout(timer))
    return pending
  }
}
