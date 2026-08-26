import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const auditWorkspace = await readFile(new URL("../src/components/multideck/audit-workspace.tsx", import.meta.url), "utf8")

test("quote audit filters share one control height recipe", () => {
  assert.match(auditWorkspace, /const auditFilterControlClass = "!h-10 text-\[12px\]"/u)
  assert.equal(auditWorkspace.match(/triggerClassName=\{auditFilterControlClass\}/gu)?.length, 2)
  assert.equal(auditWorkspace.match(/timeClassName=\{auditFilterControlClass\}/gu)?.length, 2)
  assert.equal(auditWorkspace.match(/className=\{cn\(auditFilterControlClass, "w-full min-w-0"\)\}/gu)?.length, 2)
  assert.match(auditWorkspace, /className=\{cn\(auditFilterControlClass, "w-full justify-center xl:w-auto"\)\}/u)
})
