import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")
const migration = read("supabase/migrations/20260819200000_user_todo_list.sql")
const dexter = read("supabase/functions/agent-dexter/index.ts")
const security = read("supabase/functions/agent-dexter/security.ts")

test("personal tasks remain private behind owner-scoped RPCs", () => {
  assert.match(migration, /alter table public\."OPS_UserTasks" enable row level security/)
  assert.match(migration, /revoke all on table public\."OPS_UserTasks" from public, anon, authenticated/)
  assert.match(migration, /task\."TodoTask_OwnerUserID" = v_context\.user_id/)
  assert.match(migration, /task\."TodoTask_OwnerUserID" = p_user_id/)
  assert.match(migration, /task\."TodoTask_CompanyID" = p_company_id/)
  assert.match(migration, /"TodoTask_OwnerUserID", "TodoTask_SourceDexterMessageID"/)
})

test("task values and links are constrained at the database boundary", () => {
  assert.match(migration, /"TodoTask_PriorityCode" is null or "TodoTask_PriorityCode" in \('low','medium','high','urgent'\)/)
  assert.match(migration, /"TodoTask_StatusCode" in \('open','completed'\)/)
  assert.match(migration, /\^\(https\?:\/\/\|mailto:\|\/\)/)
  assert.match(migration, /jsonb_array_length\(p_value\) > 20/)
  assert.doesNotMatch(migration, /TodoTask_Description|p_description|'description',p_arguments/)
})

test("Dexter receives allowlisted To Do read and write parity", () => {
  assert.match(migration, /'todo','To Do list'/)
  assert.match(migration, /'multideck_dexter_domain_todo'/)
  for (const action of ["create", "update", "complete", "delete"]) {
    assert.match(migration, new RegExp(`multideck_dexter_action_${action}_todo_task`))
    assert.match(security, new RegExp(`${action}_todo_task`))
  }
  assert.match(dexter, /Use the todo domain for the operator's own tasks/)
  assert.match(dexter, /Before editing, completing, deleting or watching a task, query todo and use the exact returned recordId/)
})

test("Watching for you is exact-task, owner-private, and event driven", () => {
  assert.match(migration, /v_capability = 'todo'/)
  assert.match(migration, /watch\."AIDexterWatch_OwnerUserID" = new\."TodoTask_OwnerUserID"/)
  assert.match(migration, /watch\."AIDexterWatch_TargetID" = new\."TodoTask_ID"/)
  assert.match(migration, /after insert or update on public\."OPS_UserTasks"/)
  assert.match(migration, /insert into public\."AI_DexterWatchSignals"/)
  assert.doesNotMatch(migration, /cron|pg_cron|llm|openai/i)
})
