import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")
const [migration, edge, clientApi, sidebar, translations] = await Promise.all([
  read("migrations/20260819113000_dexter_conversation_list_paging.sql"),
  read("functions/agent-dexter/index.ts"),
  read("../multideck.client/src/lib/dexter-api.ts"),
  read("../multideck.client/src/components/multideck/app-sidebar.tsx"),
  read("../multideck.client/src/i18n/translate.ts"),
])

test("Dexter conversation history is an exact bounded owner-private page", () => {
  assert.match(migration, /create or replace function public\.multideck_dexter_list_conversations_page/)
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 50\)/)
  assert.match(migration, /least\(greatest\(coalesce\(p_offset, 0\), 0\), 1000000\)/)
  assert.match(migration, /conversation\."AICNV_CompanyID" = v_context\.company_id/)
  assert.match(migration, /conversation\."AICNV_OwnerUserID" = v_context\.user_id/)
  assert.match(migration, /conversation\."AICNV_Channel" = 'chat'/)
  assert.match(migration, /conversation\."AICNV_EndedAt" is null/)
  assert.match(migration, /offset v_offset\s+limit v_limit/)
  assert.match(migration, /'total', \(select count\(\*\) from matched_ids\)/)
  assert.match(migration, /'hasMore', v_offset \+ \(select count\(\*\) from page\) < \(select count\(\*\) from matched_ids\)/)
})

test("default paging and substring search have matching indexes", () => {
  assert.match(migration, /"IX_AI_Conversations_DexterPage"/)
  assert.match(migration, /"AICNV_UpdatedAt" desc,\s+"AICNV_ID" desc/)
  assert.match(migration, /create extension if not exists pg_trgm with schema extensions/)
  assert.match(migration, /"IX_AI_Conversations_DexterTitleSearch"/)
  assert.match(migration, /"IX_AI_Messages_DexterContentSearch"/)
  assert.match(migration, /extensions\.gin_trgm_ops/)
  assert.match(migration, /lower\(message\."AIMSG_ContentText"\) like v_pattern/)
})

test("conversation history paging remains authenticated only and does not broaden Dexter capability", () => {
  assert.match(migration, /revoke all on function public\.multideck_dexter_list_conversations_page.*from public, anon/)
  assert.match(migration, /grant execute on function public\.multideck_dexter_list_conversations_page.*to authenticated, service_role/)
  assert.match(migration, /adds no new write or Watching capability/)
})

test("the Edge operation uses the new page and fails closed when its RPC is missing", () => {
  const handler = edge.slice(edge.indexOf('if (operation === "list-conversations")'), edge.indexOf('if (operation === "get-conversation")'))
  assert.match(handler, /userClient\.rpc\("multideck_dexter_list_conversations_page"/)
  assert.match(handler, /p_query: query \|\| null/)
  assert.match(handler, /p_limit: limit/)
  assert.match(handler, /p_offset: offset/)
  assert.match(handler, /if \(!missingRpc\(error\)\)/)
  assert.match(handler, /dexter_history_paging_unavailable/)
  assert.doesNotMatch(handler, /multideck_dexter_search_conversations|multideck_dexter_list_conversations\"\)/)
  assert.doesNotMatch(handler, /compatibilityMode: true/)
})

test("the sidebar caches pages, debounces search and explicitly loads older conversations", () => {
  assert.match(clientApi, /listDexterConversationsPage/)
  assert.match(clientApi, /readCachedRegisterPage\(session\.user\.id, resource/)
  assert.match(clientApi, /operation: "list-conversations", query, limit, offset/)
  assert.match(clientApi, /Dexter's paged conversation history is still being prepared/)
  assert.doesNotMatch(clientApi, /legacyRows\.slice\(offset, offset \+ limit\)/)
  assert.match(clientApi, /invalidateRegisterPages\("dexter:conversation-list:"\)/)
  assert.match(sidebar, /listDexterConversationsPage\(\{ query, limit: 25, offset \}\)/)
  assert.match(sidebar, /window\.setTimeout\(\(\) => void loadDexterConversations\(search\), search \? 180 : 0\)/)
  assert.match(sidebar, /conversations\.forEach\(\(conversation\) => byId\.set\(conversation\.id, conversation\)\)/)
  assert.match(sidebar, /loadDexterConversations\(dexterConversationSearch, dexterConversations\.length\)/)
  assert.match(sidebar, /"Load older conversations"/)
  assert.match(translations, /"Load older conversations": \{ de: .* fr: .* ar:/)
})
