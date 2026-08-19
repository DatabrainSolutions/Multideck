import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")
const [migration, pagingMigration, supportingReadMigration, edgeFunction, config, dexter] = await Promise.all([
  read("migrations/20260818134500_admin_audit_workspace.sql"),
  read("migrations/20260819110000_admin_audit_register_paging.sql"),
  read("migrations/20260819142000_admin_presence_inbox_reply_bounds.sql"),
  read("functions/admin-audit/index.ts"),
  read("config.toml"),
  read("functions/agent-dexter/index.ts"),
])

test("audit data is service-role-only and both layers enforce tenant administrator roles", () => {
  assert.match(migration, /lower\(role\."sys_UserRole_Name"\) in \('administrator', 'company admin'\)/)
  assert.match(migration, /revoke all on function public\."Admin_AuditLog".*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\."Admin_AuditLog".*to service_role/)
  assert.match(migration, /alter table public\."Admin_UserPresence" enable row level security/)
  assert.match(migration, /revoke all on table public\."Admin_UserPresence" from public, anon, authenticated/)
  assert.match(edgeFunction, /tenantAdministratorRoles = new Set\(\["administrator", "company admin"\]\)/)
  assert.match(edgeFunction, /await requireTenantAdministrator\(admin, current\)/)
})

test("Activity and Detailed logs merge authentication and application audit evidence", () => {
  assert.match(migration, /from public\."Audit_Events"/)
  assert.match(migration, /left join public\."Audit_FieldChanges"/)
  assert.match(migration, /from auth\.audit_log_entries/)
  assert.match(migration, /when 'login' then 'Signed in'/)
  assert.match(migration, /when 'logout' then 'Signed out'/)
  assert.match(migration, /auth_event\.ip_address::text as ip_address/)
  assert.match(migration, /not in \('token_refreshed', 'token_revoked'\)/)
  assert.match(migration, /if p_detailed then/)
  assert.match(migration, /'auditedTableCount'/)
})

test("active presence is event-like browser evidence and not inferred from an open session", () => {
  assert.match(edgeFunction, /parts\[0\] === "presence".*request\.method === "POST"/s)
  assert.match(edgeFunction, /Presence_LastSeenAt: now/)
  assert.match(edgeFunction, /Date\.now\(\) - 2 \* 60_000/)
  assert.match(edgeFunction, /\.order\("Presence_LastSeenAt", \{ ascending: false \}\)\s+\.limit\(100\)/)
  assert.match(supportingReadMigration, /"IX_Admin_UserPresence_company_recent"/)
  assert.match(supportingReadMigration, /"Presence_CompanyID",\s+"Presence_LastSeenAt" desc/)
  assert.match(edgeFunction, /request\.headers\.get\("cf-connecting-ip"\)/)
  assert.match(config, /\[functions\.admin-audit\][\s\S]*?verify_jwt = true/)
})

test("sensitive admin evidence is an explicit Dexter and Watching for you exception", () => {
  assert.match(dexter, /Admin Active log, Detailed log, authentication IP addresses and live workspace presence are deliberately unavailable to Dexter reads, writes and Watching for you\./)
  assert.match(dexter, /direct a tenant administrator to Admin/)
  assert.doesNotMatch(edgeFunction, /openai|anthropic|chat\.completions|responses\.create/i)
})

test("Admin audit history is server paged without loading unused coverage counts", () => {
  assert.match(pagingMigration, /create or replace function public\."Admin_AuditLogPage"/)
  assert.match(pagingMigration, /p_limit integer default 25/)
  assert.match(pagingMigration, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 50\)/)
  assert.match(pagingMigration, /offset v_offset\s+limit v_limit/)
  assert.match(pagingMigration, /'total', v_total/)
  assert.match(pagingMigration, /private\.is_tenant_administrator\(p_actor_user_id\)/)
  assert.match(pagingMigration, /revoke all on function public\."Admin_AuditLogPage".*from public, anon, authenticated/)
  assert.match(pagingMigration, /grant execute on function public\."Admin_AuditLogPage".*to service_role/)
  assert.match(pagingMigration, /"IX_Audit_Events_AdminPage"/)
  assert.match(edgeFunction, /admin\.rpc\("Admin_AuditLogPage"/)
  assert.match(edgeFunction, /p_query: query/)
  assert.match(edgeFunction, /p_category: category/)
  assert.match(edgeFunction, /p_start_date: startDate/)
  assert.match(edgeFunction, /p_end_date: endDate/)
  assert.match(edgeFunction, /p_offset: offset/)
  assert.match(edgeFunction, /missingAuditPageReadModel/)
  assert.match(edgeFunction, /error\?\.code === "42883" \|\| error\?\.code === "PGRST202"/)
  assert.match(edgeFunction, /Paged audit history is still being prepared/)
  assert.doesNotMatch(edgeFunction, /p_limit: 500|compatibilityMode: true/)
  assert.doesNotMatch(edgeFunction, /Admin_AuditCoverage/)
})
