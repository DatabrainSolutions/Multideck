import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// Read the current migration chain, not a frozen historical policy. This is a
// narrow DDL extractor for access fixtures, not a migration runner.
const migrationDir = new URL('../migrations/', import.meta.url)
const sources = [
  ['baseline', readFileSync(new URL('../baseline/public-schema.sql', import.meta.url), 'utf8')],
  ...readdirSync(migrationDir).filter(name => name.endsWith('.sql')).sort()
    .map(name => [name, readFileSync(new URL(name, migrationDir), 'utf8')]),
]
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function currentFunction(schema, name) {
  const start = new RegExp(`^create(?: or replace)? function\\s+"?${escape(schema)}"?\\."?${escape(name)}"?\\s*\\(`, 'gim')
  let result
  for (const [file, sql] of sources) {
    for (const match of sql.matchAll(start)) {
      const tail = sql.slice(match.index)
      const delimiter = /\bas\s+(\$(?:[a-z_][a-z_0-9]*)?\$)/i.exec(tail)
      assert.ok(delimiter, `${file}: unsupported function body for ${name}`)
      const end = tail.indexOf(delimiter[1], delimiter.index + delimiter[0].length)
      assert.ok(end >= 0, `${file}: unterminated ${name}`)
      const terminator = tail.indexOf(';', end + delimiter[1].length)
      result = { file, sql: tail.slice(0, terminator + 1).replace(/^create function/i, 'create or replace function') }
    }
  }
  assert.ok(result, `Missing current function ${schema}.${name}`)
  return result
}

export function currentReadPolicies(table) {
  const policies = new Map()
  const pattern = new RegExp(`^(create|drop|alter) policy\\s+(?:if exists\\s+)?"([^"]+)"\\s+on\\s+"?public"?\\."${escape(table)}"[\\s\\S]*?;`, 'gim')
  for (const [file, sql] of sources) {
    for (const match of sql.matchAll(pattern)) {
      const [, verb, name] = match
      if (verb.toLowerCase() === 'drop') policies.delete(name)
      else if (verb.toLowerCase() === 'create') policies.set(name, { file, sql: match[0], read: /\bfor\s+(select|all)\b/i.test(match[0]) || !/\bfor\s+(insert|update|delete)\b/i.test(match[0]) })
      else if (policies.has(name)) policies.get(name).sql += `\n${match[0]}`
      else throw new Error(`${file}: ALTER POLICY without a known ${table}.${name}; update the fixture extractor`)
    }
  }
  const result = [...policies.values()].filter(policy => policy.read)
  assert.ok(result.length, `No read policy found for ${table}`)
  return result
}

function statements(sql) {
  // Preserve complete top-level statements; semicolons in functions, comments
  // and quoted strings must not turn function bodies into fixture mutations.
  const result = []
  let start = 0, quote = null, dollar = null, lineComment = false, blockDepth = 0
  for (let i = 0; i < sql.length; i++) {
    const pair = sql.slice(i, i + 2)
    if (lineComment) { if (sql[i] === '\n') lineComment = false; continue }
    if (blockDepth) { if (pair === '/*') { blockDepth++; i++ } else if (pair === '*/') { blockDepth--; i++ }; continue }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null }; continue }
    if (quote) { if (sql[i] === quote) { if (sql[i + 1] === quote) i++; else quote = null }; continue }
    if (pair === '--') { lineComment = true; i++; continue }
    if (pair === '/*') { blockDepth = 1; i++; continue }
    if (sql[i] === "'" || sql[i] === '"') { quote = sql[i]; continue }
    if (sql[i] === '$') { const match = /^\$(?:[a-z_][a-z_0-9]*)?\$/i.exec(sql.slice(i)); if (match) { dollar = match[0]; i += dollar.length - 1; continue } }
    if (sql[i] === ';') { result.push(sql.slice(start, i + 1)); start = i + 1 }
  }
  return result
}

export function currentRolePermissionMutations() {
  return sources.filter(([name]) => name !== 'baseline').flatMap(([file, sql]) => statements(sql)
    .map(statement => statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, ''))
    .filter(statement => /^(?:with\b|insert\b|delete\b|update\b)/i.test(statement)
      && /(?:insert\s+into|delete\s+from|update)\s+public\."sys_UserRole_Permissions"/i.test(statement))
    .map(sql => ({file, sql})))
}
