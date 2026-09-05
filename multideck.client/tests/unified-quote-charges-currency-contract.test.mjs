import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const workspace = readFileSync(
  resolve(root, "multideck.client/src/components/multideck/unified-quote-charges-workspace.tsx"),
  "utf8",
)

test("charge currencies remain selectable when a finance rate is unavailable", () => {
  assert.doesNotMatch(workspace, /isCurrencyAvailable/u)
  assert.doesNotMatch(workspace, /if \((?:cost|sell)Roe === null\) return/u)

  assert.match(workspace, /costRoe: costRoe \?\? 0/u)
  assert.match(workspace, /costRoeSource: costRoe === null \? "manual" : "rate"/u)
  assert.match(workspace, /sellRoe: sellRoe \?\? 0/u)
  assert.match(workspace, /sellRoeSource: sellRoe === null \? "manual" : "rate"/u)
})

test("an unavailable selected currency still exposes manual cost and sell ROE inputs", () => {
  assert.match(workspace, /label: "Cost ROE"[\s\S]{0,500}costRoeSource: "manual"/u)
  assert.match(workspace, /label: "Sell ROE"[\s\S]{0,500}sellRoeSource: "manual"/u)
  assert.match(workspace, /Rates unavailable/u)
})
