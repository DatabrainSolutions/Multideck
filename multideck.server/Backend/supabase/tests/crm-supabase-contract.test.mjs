import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const supabaseRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(supabaseRoot, "../../..")

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

const crmClientFiles = [
  "multideck.client/src/lib/lead-api.ts",
  "multideck.client/src/lib/deal-api.ts",
  "multideck.client/src/lib/pipeline-api.ts",
]

test("CRM leads, deals, and pipeline settings do not depend on the local API", () => {
  for (const path of crmClientFiles) {
    const source = read(path)
    assert.equal(source.includes("/api/v1/crm"), false, path)
    assert.equal(source.includes("apiFetch"), false, path)
    assert.equal(source.includes("local API"), false, path)
    assert.match(source, /callCrmRpc|mutatePipelineSettings/, path)
  }
})

test("the client uses the authenticated Supabase CRM contracts", () => {
  const leadApi = read(crmClientFiles[0])
  const dealApi = read(crmClientFiles[1])
  const pipelineApi = read(crmClientFiles[2])

  assert.match(leadApi, /multideck_crm_list_leads/)
  assert.match(leadApi, /multideck_crm_get_lead/)
  assert.match(dealApi, /multideck_crm_list_deals/)
  assert.match(dealApi, /multideck_crm_move_deal_stage/)
  assert.match(dealApi, /multideck_crm_convert_lead/)
  assert.match(pipelineApi, /multideck_crm_pipeline_settings/)
  assert.match(pipelineApi, /multideck_crm_mutate_pipeline_settings/)
})

test("the Supabase functions fail closed and settings writes retain permission checks", () => {
  const dataMigration = read(
    "multideck.server/Backend/supabase/migrations/202607300002_crm_supabase_rpc.sql",
  )
  const settingsMigration = read(
    "multideck.server/Backend/supabase/migrations/202607300003_crm_pipeline_mutations.sql",
  )

  assert.match(dataMigration, /auth\.uid\(\) is null/)
  assert.match(dataMigration, /"Auth_User_ID" = auth\.uid\(\)/)
  assert.match(dataMigration, /revoke all on function public\.multideck_crm_list_leads.*public, anon/s)
  assert.match(settingsMigration, /sys_Permission_Value" = 'Settings\.Manage'/)
  assert.match(settingsMigration, /revoke all on function public\.multideck_crm_mutate_pipeline_settings.*public, anon/s)
  assert.match(settingsMigration, /grant execute on function public\.multideck_crm_mutate_pipeline_settings.*authenticated/s)
})
