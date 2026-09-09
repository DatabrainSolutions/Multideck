import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "..", "..")
const migration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260803213435_dexter_conversation_search.sql"),
  "utf8",
)
const repairMigration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260803213816_fix_dexter_conversation_search_content_column.sql"),
  "utf8",
)
const sidebar = readFileSync(
  resolve(repoRoot, "multideck.client/src/components/multideck/app-sidebar.tsx"),
  "utf8",
)
const dexterApi = readFileSync(
  resolve(repoRoot, "multideck.client/src/lib/dexter-api.ts"),
  "utf8",
)

test("Dexter conversation search stays scoped to the signed-in user and tenant", () => {
  assert.match(migration, /_multideck_dexter_context\(\)/)
  assert.match(migration, /"AICNV_CompanyID" = v_company_id/)
  assert.match(migration, /"AICNV_OwnerUserID" = v_user_id/)
  assert.match(migration, /"AIMSG_ConversationID" = conversation\."AICNV_ID"/)
  assert.match(migration, /revoke all on function public\.multideck_dexter_search_conversations\(text, integer\) from public, anon/)
})

test("Dexter sidebar searches titles and saved message content with recovery copy", () => {
  assert.match(repairMigration, /conversation\."AICNV_Title"/)
  assert.match(repairMigration, /message\."AIMSG_ContentText"/)
  assert.match(sidebar, /listDexterConversationsPage\(\{ query, limit: 25, offset \}\)/)
  assert.match(dexterApi, /\{ operation: "list-conversations", query, limit, offset \}/)
  assert.match(sidebar, /Search conversations/)
  assert.match(sidebar, /No matching conversations/)
  assert.match(sidebar, /Clear search/)
})
