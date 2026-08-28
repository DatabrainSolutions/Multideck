import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

test("the quote register uses the customer-facing reference used by the quote workspace", () => {
  const migration = read("supabase/migrations/20260828140500_quote_register_canonical_reference.sql")
  const quoteApi = read("multideck.client/src/lib/quote-api.ts")

  assert.match(migration, /coalesce\(nullif\(btrim\(quote\."CusQuoteHeader_CustomerReference"\), ''\), 'Q-' \|\| quote\."CusQuoteHeader_Number"\) as "Quote_Reference"/u)
  assert.match(quoteApi, /reference: row\.Quote_Reference/u)
  assert.match(quoteApi, /\.eq\("Quote_Reference", reference\)/u)
})
