import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")
const [migration, edge, clientApi, settingsPage] = await Promise.all([
  read("migrations/20260819111000_dexter_usage_history_paging.sql"),
  read("functions/agent-dexter/index.ts"),
  read("../multideck.client/src/lib/dexter-api.ts"),
  read("../multideck.client/src/pages/settings-page.tsx"),
])

test("Dexter usage history is an exact bounded authenticated page", () => {
  assert.match(migration, /create or replace function public\.multideck_dexter_get_usage_history/)
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 10\), 1\), 50\)/)
  assert.match(migration, /least\(greatest\(coalesce\(p_offset, 0\), 0\), 1000000\)/)
  assert.match(migration, /select count\(\*\)[\s\S]*?into v_total/)
  assert.match(migration, /offset v_offset\s+limit v_limit/)
  assert.match(migration, /'total', v_total/)
  assert.match(migration, /from public\._multideck_dexter_context\(\)/)
})

test("the newest page has a matching partial date and id index", () => {
  assert.match(migration, /"IX_AI_Messages_DexterUsagePage"/)
  assert.match(migration, /\("AIMSG_CreatedAt" desc, "AIMSG_ID" desc\)/)
  assert.match(migration, /where "AIMSG_Role" = 'assistant'/)
})

test("usage history preserves authenticated-only execution", () => {
  assert.match(migration, /revoke all on function public\.multideck_dexter_get_usage_history.*from public, anon/)
  assert.match(migration, /grant execute on function public\.multideck_dexter_get_usage_history.*to authenticated, service_role/)
})

test("Dexter Edge uses the page RPC and fails closed when it is missing", () => {
  assert.match(edge, /operation === "usage-history"/)
  assert.match(edge, /userClient\.rpc\("multideck_dexter_get_usage_history"/)
  assert.match(edge, /p_limit: limit/)
  assert.match(edge, /p_offset: offset/)
  assert.match(edge, /error\.code === "42883" \|\| error\.code === "PGRST202"/)
  assert.match(edge, /dexter_usage_history_paging_unavailable/)
  const handler = edge.slice(edge.indexOf('if (operation === "usage-history")'), edge.indexOf('if (operation === "rename-conversation")'))
  assert.doesNotMatch(handler, /multideck_dexter_get_usage\"\)|compatibilityMode: true/)
})

test("the Admin history screen reads and pages server history instead of recentEntries", () => {
  assert.match(clientApi, /getDexterUsageHistory/)
  assert.match(clientApi, /readCachedRegisterPage\(session\.user\.id, resource/)
  assert.match(clientApi, /operation: "usage-history"/)
  assert.doesNotMatch(clientApi, /const usage = await getDexterUsage\(\)|compatibilityMode: true/)
  assert.match(settingsPage, /getDexterUsageHistory\(\{ sort: order, limit: pageSize, offset \}, controller\.signal\)/)
  assert.match(settingsPage, /totalItems=\{history\?\.total \?\? 0\}/)
  const historyScreen = settingsPage.slice(settingsPage.indexOf("function AiUsageHistoryScreen"), settingsPage.indexOf("function BrandingTab"))
  assert.doesNotMatch(historyScreen, /usage\?\.recentEntries/)
  assert.doesNotMatch(historyScreen, /entries\.slice\(/)
})
