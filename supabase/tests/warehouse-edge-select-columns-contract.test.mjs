import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import test from "node:test"

// PostgREST column names are case-sensitive and only fail at runtime. A wrong
// name in an enrichment select (for example User_FirstName instead of
// User_Firstname) turns a committed warehouse action into a 500 response.
// Every literal column list the Warehouse Edge Function selects must exist in
// the provisioning baseline or be added by a migration.
const root = new URL("../", import.meta.url)
const baseline = readFileSync(new URL("baseline/public-schema.sql", root), "utf8")
const migrations = readdirSync(new URL("migrations/", root)).filter(name => name.endsWith(".sql"))
  .map(name => readFileSync(new URL(`migrations/${name}`, root), "utf8")).join("\n")

function columns(table) {
  const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${table}" (`)
  if (start < 0) return null
  const body = baseline.slice(start, baseline.indexOf("\n);", start))
  return new Set([...body.matchAll(/^\s+"([^"]+)"/gm)].map(match => match[1]))
}

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? sources(new URL(`${entry.name}/`, directory))
    : entry.name.endsWith(".ts") ? [{ name: entry.name, text: readFileSync(new URL(entry.name, directory), "utf8") }] : [])
}

test("warehouse edge selects only columns that exist", () => {
  const problems = []
  let checked = 0
  for (const { name, text } of sources(new URL("functions/warehouse/", root))) {
    for (const match of text.matchAll(/\.from\("([A-Za-z_]+)"\)\s*\.select\("([^"*]+)"/g)) {
      const [, table, list] = match
      const known = columns(table)
      if (!known) continue
      for (const column of list.split(",").map(value => value.trim()).filter(Boolean)) {
        checked += 1
        if (!known.has(column) && !migrations.includes(`"${column}"`)) problems.push(`${name}: ${table}.${column}`)
      }
    }
  }
  assert.ok(checked > 20, "The contract must inspect the warehouse select lists")
  assert.deepEqual(problems, [])
})
