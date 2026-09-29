type ResponseEvent = Record<string, unknown>

/** SSE framing can span read() chunks, including the two bytes of CRLF. */
export function createOpenAIEventStream(onEvent: (event: ResponseEvent) => void) {
  let buffer = ""

  const processBlock = (block: string) => {
    const data = block.split(/\r\n|\r|\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart())
      .join("\n")
    if (!data || data === "[DONE]") return
    try {
      const event: unknown = JSON.parse(data)
      if (event && typeof event === "object" && !Array.isArray(event)) onEvent(event as ResponseEvent)
    } catch {
      // Ignore malformed provider events; the missing terminal event is reported by the caller.
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk
      let boundary = /(?:\r\n|\r|\n){2}/.exec(buffer)
      while (boundary && boundary.index !== undefined) {
        processBlock(buffer.slice(0, boundary.index))
        buffer = buffer.slice(boundary.index + boundary[0].length)
        boundary = /(?:\r\n|\r|\n){2}/.exec(buffer)
      }
    },
    finish() {
      if (buffer.trim()) processBlock(buffer)
      buffer = ""
    },
  }
}
