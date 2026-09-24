import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Install only into an explicitly named, empty, disposable Supabase project.
// The management SQL endpoint has a request-size limit, so keep whole SQL
// statements in ordered batches. Historical migrations are not replayed.
const root = new URL('../baseline/', import.meta.url)
const files = [
  'required-extensions.sql',
  'public-schema-core.sql',
  'general-ledger-journals.sql',
  'public-schema-finance-patches.sql',
  'function-access.sql',
  'system-reference-data.sql',
  'storage.sql',
  'finance-report-access.sql',
]
const MAX_BATCH_BYTES = 160_000
const financePatchMarker = '-- A committed ledger posting must be a complete, balanced double-entry journal.'

function sourceFor(name) {
  if (name === 'general-ledger-journals.sql') {
    return readFileSync(new URL('../migrations/20260918123733_general_ledger_journals.sql', import.meta.url), 'utf8')
  }
  if (name === 'finance-report-access.sql') {
    return readFileSync(new URL('../migrations/20260923002429_harden_provisioned_finance_reporting_views.sql', import.meta.url), 'utf8')
  }
  if (name === 'public-schema-core.sql' || name === 'public-schema-finance-patches.sql') {
    const source = readFileSync(new URL('public-schema.sql', root), 'utf8')
    const marker = source.indexOf(financePatchMarker)
    assert.ok(marker > 0 && source.indexOf(financePatchMarker, marker + 1) === -1, 'Review the finance patch boundary before provisioning')
    return name === 'public-schema-core.sql' ? source.slice(0, marker) : source.slice(marker)
  }
  return readFileSync(new URL(name, root), 'utf8')
}

export function sqlStatements(source) {
  const result = []
  let start = 0
  let quote = ''
  let dollar = ''
  let blockDepth = 0
  let trailingCode = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (quote === 'line') {
      if (char === '\n') quote = ''
      continue
    }
    if (blockDepth) {
      if (char === '/' && next === '*') { blockDepth += 1; index += 1 }
      else if (char === '*' && next === '/') { blockDepth -= 1; index += 1 }
      continue
    }
    if (dollar) {
      if (source.startsWith(dollar, index)) { index += dollar.length - 1; dollar = '' }
      continue
    }
    if (quote === "'" || quote === '"') {
      if (char === quote && next === quote) { index += 1; continue }
      if (char === quote) quote = ''
      continue
    }
    if (char === '-' && next === '-') { quote = 'line'; index += 1; continue }
    if (char === '/' && next === '*') { blockDepth = 1; index += 1; continue }
    if (char === "'" || char === '"') { quote = char; trailingCode = true; continue }
    if (char === '$') {
      const match = source.slice(index).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)
      if (match) { dollar = match[0]; index += dollar.length - 1; trailingCode = true; continue }
    }
    if (char === ';') {
      const statement = source.slice(start, index + 1).trim()
      if (statement) result.push(statement)
      start = index + 1
      trailingCode = false
    } else if (!/\s/.test(char)) {
      trailingCode = true
    }
  }
  assert.equal(blockDepth, 0, 'Unclosed SQL block comment')
  assert.equal(quote === 'line' ? '' : quote, '', 'Unclosed SQL quote')
  assert.equal(dollar, '', 'Unclosed SQL dollar quote')
  assert.equal(trailingCode, false, 'SQL file must end after a complete statement')
  return result
}

export function transactionUnits(statements) {
  const units = []
  let transaction = []
  for (const statement of statements) {
    const bare = statement.replace(/(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)/g, '').trim().toLowerCase()
    if (bare === 'begin;') {
      assert.equal(transaction.length, 0, 'Nested SQL transaction in baseline')
      transaction = [statement]
    } else if (transaction.length) {
      transaction.push(statement)
      if (bare === 'commit;') { units.push(transaction.join('\n')); transaction = [] }
    } else units.push(statement)
  }
  assert.equal(transaction.length, 0, 'Unclosed SQL transaction in baseline')
  return units
}

export function batches(statements) {
  const result = []
  let current = ''
  for (const statement of transactionUnits(statements)) {
    const next = current ? `${current}\n${statement}\n` : `${statement}\n`
    if (Buffer.byteLength(next) > MAX_BATCH_BYTES && current) {
      result.push(current)
      current = `${statement}\n`
    } else current = next
    assert.ok(Buffer.byteLength(current) <= MAX_BATCH_BYTES, `One SQL statement exceeds ${MAX_BATCH_BYTES} bytes`)
  }
  if (current) result.push(current)
  return result
}

function runQuery(projectRef, filePath) {
  const command = process.env.SUPABASE_CLI || 'npx'
  const prefix = process.env.SUPABASE_CLI ? [] : ['--yes', 'supabase']
  const response = spawnSync(command, [...prefix, 'db', 'query', '--linked', '--project-ref', projectRef, '--file', filePath], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 2_000_000,
  })
  if (response.error) throw response.error
  if (response.status !== 0) throw new Error(`${filePath}: ${response.stderr}\n${response.stdout}`)
}

function requireEmptyProject(projectRef) {
  const command = process.env.SUPABASE_CLI || 'npx'
  const prefix = process.env.SUPABASE_CLI ? [] : ['--yes', 'supabase']
  const query = "select (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as public_tables, (select count(*) from auth.users) as auth_users"
  // The project is checked before any schema installation. A fresh Supabase
  // project has no application tables or Auth users.
  const response = spawnSync(command, [...prefix, 'db', 'query', '--linked', '--project-ref', projectRef, query], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 100_000,
  })
  if (response.error) throw response.error
  if (response.status !== 0) throw new Error(`Cannot verify empty target: ${response.stderr}\n${response.stdout}`)
  const start = response.stdout.indexOf('{')
  const rows = JSON.parse(response.stdout.slice(start)).rows
  assert.equal(rows?.length, 1, 'Expected one fresh-project check row')
  assert.equal(Number(rows[0].public_tables), 0, 'Target already has application tables; never provision over existing work')
  assert.equal(Number(rows[0].auth_users), 0, 'Target already has Auth users; never provision over existing work')
}

export function provision(projectRef, { apply = false, resumeFile = '', resumeChunk = 1, resumeUnit = 0 } = {}) {
  assert.match(projectRef, /^[a-z]{20}$/, 'An exact Supabase project ref is required')
  assert.ok(!resumeFile || files.includes(resumeFile), 'Resume file must be a known installation stage')
  assert.ok(Number.isInteger(resumeChunk) && resumeChunk >= 1 && Number.isInteger(resumeUnit) && resumeUnit >= 0, 'Resume position must be non-negative integers')
  const prepared = files.map((name) => {
    const statements = sqlStatements(sourceFor(name))
    const preamble = name === 'public-schema-core.sql' || name === 'public-schema-finance-patches.sql' || name === 'system-reference-data.sql'
      ? `${sqlStatements(name === 'public-schema-finance-patches.sql' ? sourceFor('public-schema-core.sql') : sourceFor(name)).slice(0, name === 'system-reference-data.sql' ? 11 : 10).join('\n')}\n`
      : name === 'function-access.sql' ? `${statements[0]}\n` : ''
    return { name, statements: statements.length, chunks: batches(statements), preamble }
  })
  const summary = prepared.map(({ name, statements, chunks }) => ({ name, statements, chunks: chunks.length }))
  if (!apply) return summary
  if (!resumeFile) requireEmptyProject(projectRef)
  const directory = mkdtempSync(join(tmpdir(), 'multideck-baseline-'))
  try {
    let reachedResume = !resumeFile
    for (const file of prepared) {
      if (file.name === resumeFile) reachedResume = true
      if (!reachedResume) continue
      for (const [index, chunk] of file.chunks.entries()) {
        if (file.name === resumeFile && index + 1 < resumeChunk) continue
        const source = file.name === resumeFile && index + 1 === resumeChunk && resumeUnit
          ? transactionUnits(sqlStatements(chunk)).slice(resumeUnit).join('\n')
          : chunk
        const query = (index ? file.preamble : '') + source
        const path = join(directory, `${file.name}-${index + 1}.sql`)
        writeFileSync(path, query)
        console.log(`Applying ${file.name} ${index + 1}/${file.chunks.length}`)
        runQuery(projectRef, path)
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
  return summary
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const projectRef = process.argv[2]
  const apply = process.argv.includes('--apply')
  const resumeAt = process.argv.indexOf('--resume')
  const [resumeFile = '', chunk = '1', unit = '0'] = resumeAt >= 0 ? (process.argv[resumeAt + 1] ?? '').split(':') : []
  console.log(JSON.stringify(provision(projectRef, { apply, resumeFile, resumeChunk: Number(chunk), resumeUnit: Number(unit) }), null, 2))
}
