import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")
const [migration, edge, clientApi, client, phrases] = await Promise.all([
  read("migrations/20260819114000_developer_broadcast_bounded_reads.sql"),
  read("functions/developer-broadcasts/index.ts"),
  read("../multideck.client/src/lib/developer-broadcast-api.ts"),
  read("../multideck.client/src/components/multideck/broadcast-settings.tsx"),
  read("../multideck.client/src/i18n/broadcast-settings-phrases.ts"),
])

test("Developer Broadcast user selection is an exact bounded service-role page", () => {
  assert.match(migration, /create or replace function public\.multideck_developer_broadcast_users_page/)
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 50\)/)
  assert.match(migration, /least\(greatest\(coalesce\(p_offset, 0\), 0\), 1000000\)/)
  assert.match(migration, /workspace_user\."Company_ID" = p_company_id/)
  assert.match(migration, /offset \(select page_offset from parameters\)\s+limit \(select page_limit from parameters\)/)
  assert.match(migration, /join page on page\.id = user_department\."User_ID"/)
  assert.match(migration, /'total', \(select count\(\*\) from filtered\)/)
  assert.match(migration, /'hasMore'/)
  assert.match(migration, /revoke all on function public\.multideck_developer_broadcast_users_page.*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.multideck_developer_broadcast_users_page.*to service_role/)
})

test("broadcast history, user ordering and user search have matching indexes", () => {
  assert.match(migration, /"IX_DEV_Broadcasts_CompanyPage"/)
  assert.match(migration, /"Broadcast_CreatedAt" desc, "Broadcast_ID" desc/)
  assert.match(migration, /"IX_cmp_Users_BroadcastPage"/)
  assert.match(migration, /create extension if not exists pg_trgm with schema extensions/)
  assert.match(migration, /"IX_cmp_Users_BroadcastNameSearch"/)
  assert.match(migration, /"IX_cmp_Users_BroadcastEmailSearch"/)
  assert.match(migration, /extensions\.gin_trgm_ops/g)
})

test("opening Broadcast defers users and returns only an exact history page", () => {
  assert.match(edge, /listHistory\(admin, current, historyLimit, historyOffset\)/)
  assert.match(edge, /\.select\(broadcastHistoryColumns, \{ count: "exact" \}\)/)
  assert.match(edge, /\.range\(offset, offset \+ limit - 1\)/)
  assert.match(edge, /users: \[\]/)
  assert.match(edge, /usersDeferred: true/)
  assert.match(edge, /historyTotal: historyPage\.total/)
  const initialRoute = edge.slice(edge.indexOf('if (request.method === "GET" && !parts.length)'), edge.indexOf('if (request.method === "GET" && parts[0] === "users")'))
  assert.doesNotMatch(initialRoute, /workspaceState\(/)
})

test("the user picker is server searched, cached and never loads the full workspace directory", () => {
  assert.match(edge, /parts\[0\] === "users"/)
  assert.match(edge, /admin\.rpc\("multideck_developer_broadcast_users_page"/)
  assert.match(edge, /missingBroadcastUsersPage/)
  assert.match(edge, /Broadcast user paging is still being prepared/)
  const picker = edge.slice(edge.indexOf("async function listBroadcastUsers"), edge.indexOf("function clientAudiencePreview"))
  assert.doesNotMatch(picker, /workspaceState\(|compatibilityMode: true/)
  assert.match(clientApi, /listBroadcastUsersPage/)
  assert.match(clientApi, /readCachedRegisterPage\(accessToken, resource/)
  assert.match(clientApi, /raw\.usersDeferred !== true/)
  assert.doesNotMatch(clientApi, /allHistory\.slice\(|allHistory\.length,\s*historyOffset/)
  assert.match(client, /listBroadcastUsersPage\(await accessToken\(\), \{ query, limit: 25, offset \}\)/)
  assert.doesNotMatch(client, /state\.users\.filter|matched\.slice/)
  assert.match(client, /broadcastUserQuery\.trim\(\) \? 220 : 0/)
  assert.match(client, /"Load more users"/)
})

test("history and recipient previews remain network bounded with localised recovery controls", () => {
  assert.match(edge, /preview\.recipients\.filter\(\(recipient\) => recipient\.status === "excluded"\)\.slice\(0, 50\)/)
  assert.match(edge, /selection\.userIds\.length > 500/)
  assert.match(client, /getBroadcastState\(await accessToken\(\), \{ historyLimit: state\.historyLimit \?\? 20, historyOffset: state\.history\.length \}\)/)
  assert.match(client, /"Load older broadcasts"/)
  assert.match(phrases, /"Load older broadcasts": \{ de: .* fr: .* ar:/)
  assert.match(phrases, /"Search users": \{ de: .* fr: .* ar:/)
  assert.match(phrases, /"Load more users": \{ de: .* fr: .* ar:/)
})
