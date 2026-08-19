import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
const leadsPage = source.slice(source.indexOf("export function CrmLeadsPage"), source.indexOf("export function CrmLeadDetailPage"))

test("lead ownership changes preserve the register while fresh rows load", () => {
  assert.match(leadsPage, /const \[revalidating, setRevalidating\] = useState\(false\)/u)
  assert.match(leadsPage, /if \(hasLoadedLeads\.current\) setRevalidating\(true\)/u)
  assert.match(leadsPage, /else setLoadState\("loading"\)/u)
  assert.match(leadsPage, /onChange=\{changeLeadScope\}/u)
  assert.match(leadsPage, /counts=\{revalidating \? \{\} :/u)
  assert.match(leadsPage, /toolbarOptions=\{<RegisterRevalidatingMark active=\{revalidating\} \/>\}/u)
})
