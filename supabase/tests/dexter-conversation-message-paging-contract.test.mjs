import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")
const [migration, edge, clientApi, page, translations] = await Promise.all([
  read("migrations/20260819112000_dexter_conversation_message_paging.sql"),
  read("functions/agent-dexter/index.ts"),
  read("../multideck.client/src/lib/dexter-api.ts"),
  read("../multideck.client/src/pages/agent-dexter-page.tsx"),
  read("../multideck.client/src/i18n/translate.ts"),
])

test("Dexter conversation messages use an exact bounded owner-private page", () => {
  assert.match(migration, /create or replace function public\.multideck_dexter_get_conversation_page/)
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 50\), 1\), 100\)/)
  assert.match(migration, /least\(greatest\(coalesce\(p_offset, 0\), 0\), 1000000\)/)
  assert.match(migration, /select count\(\*\)\s+into v_total/)
  assert.match(migration, /order by message\."AIMSG_CreatedAt" desc, message\."AIMSG_ID" desc\s+offset v_offset\s+limit v_limit/)
  assert.match(migration, /jsonb_agg\(page\.value order by page\.created_at, page\.id\)/)
  assert.match(migration, /'messageTotal', v_total/)
  assert.match(migration, /'hasOlderMessages', v_offset \+ jsonb_array_length\(v_messages\) < v_total/)
  assert.match(migration, /conversation\."AICNV_OwnerUserID" = v_context\.user_id/)
  assert.match(migration, /conversation\."AICNV_CompanyID" = v_context\.company_id/)
})

test("the message page has a matching partial conversation and date index", () => {
  assert.match(migration, /"IX_AI_Messages_DexterConversationPage"/)
  assert.match(migration, /\("AIMSG_ConversationID", "AIMSG_CreatedAt" desc, "AIMSG_ID" desc\)/)
  assert.match(migration, /where "AIMSG_ContentText" is not null/)
})

test("conversation paging preserves authenticated-only execution", () => {
  assert.match(migration, /revoke all on function public\.multideck_dexter_get_conversation_page.*from public, anon/)
  assert.match(migration, /grant execute on function public\.multideck_dexter_get_conversation_page.*to authenticated, service_role/)
  assert.match(migration, /adds no new write or Watching capability/)
})

test("the Edge function pages the existing read operation and fails closed when the RPC is missing", () => {
  const handler = edge.slice(edge.indexOf('if (operation === "get-conversation")'), edge.indexOf('if (operation === "usage")'))
  assert.match(handler, /userClient\.rpc\("multideck_dexter_get_conversation_page"/)
  assert.match(handler, /p_limit: limit/)
  assert.match(handler, /p_offset: offset/)
  assert.match(handler, /if \(!missingRpc\(error\)\)/)
  assert.match(handler, /dexter_conversation_paging_unavailable/)
  assert.doesNotMatch(handler, /userClient\.rpc\("multideck_dexter_get_conversation"|compatibilityMode: true/)
  assert.match(edge, /error\.code === "42883" \|\| error\.code === "PGRST202"/)
})

test("the client keeps the initial read bounded and can prepend older pages without duplicates or scroll jumps", () => {
  assert.match(clientApi, /operation: "get-conversation", conversationId, limit, offset/)
  assert.match(clientApi, /Dexter's paged conversation messages are still being prepared/)
  assert.doesNotMatch(clientApi, /const page = \[\.\.\.messages\]\.reverse\(\)\.slice\(offset, offset \+ limit\)/)
  assert.match(page, /getDexterConversation\(current\.id, \{ limit: current\.messageLimit \?\? 50, offset: nextOffset \}\)/)
  assert.match(page, /const messages = \[\.\.\.older\.messages, \.\.\.latest\.messages\]\.filter/)
  assert.match(page, /if \(seen\.has\(message\.id\)\) return false/)
  assert.match(page, /viewport\.scrollTop = previousScrollTop \+ Math\.max\(0, viewport\.scrollHeight - previousScrollHeight\)/)
  assert.match(page, /t\("Load earlier messages"\)/)
})
