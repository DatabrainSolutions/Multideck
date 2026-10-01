import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('only an already-used response link is described as already responded', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'quote-response-errors-'))
  const output = join(directory, 'core.mjs')
  try {
    const build = spawnSync(fileURLToPath(new URL('../../multideck.client/node_modules/.bin/esbuild', import.meta.url)), [
      fileURLToPath(new URL('../functions/quote-response/core.ts', import.meta.url)),
      '--bundle', '--platform=node', '--format=esm', `--outfile=${output}`,
    ], { encoding: 'utf8' })
    assert.equal(build.status, 0, build.stderr)
    const { toClientError } = await import(pathToFileURL(output).href)
    const duplicateResponse = toClientError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "customer_responses_response_link_id_key"',
    })
    assert.equal(duplicateResponse.status, 409)
    assert.equal(duplicateResponse.clientMessage, 'This quote has already received a response.')

    const duplicateBookingCharge = toClientError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "UX_Job_Costing_Lines_source"',
    })
    assert.equal(duplicateBookingCharge.status, 500)
    assert.match(duplicateBookingCharge.clientMessage, /could not be completed/)
    assert.doesNotMatch(duplicateBookingCharge.clientMessage, /already received/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
