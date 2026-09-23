import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "../../multideck.client/node_modules/typescript/lib/typescript.js"

const source = ts.transpileModule(readFileSync(new URL("../functions/_shared/hyperext.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('import { HttpError } from "./backend.ts"', 'class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }')
const { parseHyperExtNominals } = await import(`data:text/javascript,${encodeURIComponent(source)}`)

test("Sage 50 nominal catalog keeps exact codes and excludes inactive accounts", () => {
  assert.deepEqual(parseHyperExtNominals({
    success: true,
    results: [
      { accountRef: "4000", name: "Sales", inactiveFlag: 0, balance: 100 },
      { accountRef: "0010", name: "Freehold Property", inactiveFlag: 0 },
      { accountRef: "4999", name: "Old sales", inactiveFlag: 1 },
    ],
  }), [
    { name: "0010", account_number: "0010", account_name: "Freehold Property" },
    { name: "4000", account_number: "4000", account_name: "Sales" },
  ])
})

test("Sage 50 nominal catalog rejects missing, malformed or duplicate codes", () => {
  assert.throws(() => parseHyperExtNominals({ response: [] }), /nominal account list/)
  assert.throws(() => parseHyperExtNominals({ results: [{ name: "Sales" }] }), /without a code or name/)
  assert.throws(() => parseHyperExtNominals({ results: [
    { accountRef: "4000", name: "Sales" },
    { accountRef: "4000", name: "Other sales" },
  ] }), /duplicate nominal account codes/)
})
