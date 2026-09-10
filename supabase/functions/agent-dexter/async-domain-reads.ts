type Json = Record<string, unknown>
/** Only permission-checked data-domain reads may begin before a response finishes. */
export function asyncDomainReads(read: (argumentsValue: Json) => Promise<unknown>) {
  const calls = new Map<string, {signature: string; result: Promise<unknown>}>()
  return (call: Json): Promise<unknown> => {
    if (call.name !== 'query_data_domain' || typeof call.call_id !== 'string' || !call.call_id
      || typeof call.arguments !== 'string' || call.arguments.length > 8000)
      throw new Error('invalid_async_domain_read')
    const signature = call.arguments
    const existing = calls.get(call.call_id)
    if (existing) {
      if (existing.signature !== signature) throw new Error('async_read_call_id_reused')
      return existing.result
    }
    if (calls.size >= 24) throw new Error('async_read_limit')
    const args: unknown = JSON.parse(signature)
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('invalid_async_read_arguments')
    // Convert a recoverable read failure into a tool result immediately so an
    // early rejected promise cannot become an unhandled rejection while streaming.
    const result = Promise.resolve().then(() => read(args as Json)).catch(() => ({
      error: 'The selected data domain could not be read.', code: 'domain_read_failed',
    }))
    calls.set(call.call_id, {signature, result})
    return result
  }
}
