type Event = Record<string, unknown>
/** A browser disconnect stops delivery, not the authorised request or its save. */
export function durableEventStream(work: (emit: (event: Event) => void) => Promise<void>,
  keepAlive: (task: Promise<void>) => void = task => {
    const runtime = (globalThis as unknown as {EdgeRuntime?: {waitUntil: (task: Promise<void>) => void}}).EdgeRuntime
    runtime?.waitUntil(task)
  }) {
  let connected = true
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: Event) => {
        if (!connected) return
        const bytes = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        try { controller.enqueue(bytes) } catch (error) {
          if (!(error instanceof TypeError)) throw error
          connected = false
        }
      }
      const task = (async () => {
        try { await work(emit) }
        finally {
          if (connected) { connected = false; controller.close() }
        }
      })()
      keepAlive(task)
      return task
    },
    cancel() { connected = false },
  })
}
