import assert from 'node:assert/strict'
import test from 'node:test'
import { createOpenAIEventStream } from '../functions/agent-dexter/openai-event-stream.ts'

test('parses a completed response when CRLF framing splits between reads', () => {
  const seen = []
  const stream = createOpenAIEventStream(event => seen.push(event))
  const input = 'event: response.completed\r\ndata: {"type":"response.completed","response":{"status":"completed","output":[]}}\r\n\r\ndata: [DONE]\r\n\r\n'
  for (const byte of input) stream.push(byte)
  stream.finish()
  assert.deepEqual(seen, [{ type: 'response.completed', response: { status: 'completed', output: [] } }])
})

test('preserves a failed terminal response for diagnosis', () => {
  const seen = []
  const stream = createOpenAIEventStream(event => seen.push(event))
  stream.push('data: {"type":"response.failed","response":{"status":"failed","error":{"code":"server_error"}}}\n\n')
  stream.finish()
  assert.deepEqual(seen[0], { type: 'response.failed', response: { status: 'failed', error: { code: 'server_error' } } })
})
