/** Keep a quote's writes ordered even when its editor is remounted mid-save. */
export function createQuoteSaveQueue() {
  const pending = new Map<string, Promise<unknown>>()
  function save<T>(scope: string, request: () => Promise<T>): Promise<T> {
    const previous = pending.get(scope)
    const result = previous ? previous.then(request, request) : Promise.resolve().then(request)
    pending.set(scope, result)
    const settled = () => { if (pending.get(scope) === result) pending.delete(scope) }
    // Use both handlers: cleanup must not create an unhandled rejected promise.
    void result.then(settled, settled)
    return result
  }
  return Object.assign(save, {
    async waitForIdle(scope: string) {
      // A remounted editor must not load the previous version while its last
      // save is still committing. A failed save still permits a fresh read.
      while (pending.has(scope)) await pending.get(scope)!.catch(() => undefined)
    },
  })
}
