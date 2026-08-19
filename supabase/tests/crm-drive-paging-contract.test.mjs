import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")
const migration = read("supabase/migrations/20260818155000_crm_drive_register_paging.sql")
const api = read("multideck.client/src/lib/drive-api.ts")
const page = read("multideck.client/src/pages/crm-drive-page.tsx")

test("Drive paging RPCs are company-scoped, permission-gated and bounded", () => {
  assert.match(migration, /create or replace function public\.crm_drive_list_folders\(\s*p_parent_id uuid default null,\s*p_limit integer default 48,\s*p_cursor jsonb default null\s*\)/)
  assert.match(migration, /create or replace function public\.crm_drive_list_files\(\s*p_folder_id uuid default null,\s*p_limit integer default 48,\s*p_cursor jsonb default null\s*\)/)
  assert.match(migration, /create or replace function public\.crm_drive_folder_path\(p_folder_id uuid\)/)
  assert.equal((migration.match(/_crm_drive_require_permission\('CRM\.Drive\.Read'\)/g) ?? []).length, 3)
  assert.equal((migration.match(/greatest\(1, least\(coalesce\(p_limit, 48\), 100\)\)/g) ?? []).length, 2)
  assert.equal((migration.match(/limit v_limit \+ 1/g) ?? []).length, 2)
  assert.match(migration, /folder\."Company_ID" = v_company_id[\s\S]*folder\."DriveFolder_ParentID" is not distinct from p_parent_id/)
  assert.match(migration, /file\."Company_ID" = v_company_id[\s\S]*file\."DriveFile_FolderID" is not distinct from p_folder_id/)
  assert.match(migration, /'totalCount'/)
  assert.match(migration, /'nextCursor'/)
  assert.match(migration, /revoke all on function public\.crm_drive_list_folders\(uuid, integer, jsonb\) from public, anon/)
  assert.match(migration, /grant execute on function public\.crm_drive_list_files\(uuid, integer, jsonb\) to authenticated, service_role/)
})

test("Drive client requests pages and fails closed when paging RPCs are missing", () => {
  assert.match(api, /export type DrivePage<T>/)
  assert.match(api, /rpc\("crm_drive_list_folders"/)
  assert.match(api, /rpc\("crm_drive_list_files"/)
  assert.match(api, /rpc\("crm_drive_folder_path"/)
  assert.match(api, /error\.code === "42883" \|\| error\.code === "PGRST202"/)
  assert.match(api, /Drive folder paging is still being prepared/)
  assert.match(api, /Drive file paging is still being prepared/)
  assert.match(api, /Drive folder paths are still being prepared/)
  assert.doesNotMatch(api, /return pageFromRows|const fallback = await client\(\)\.from\(foldersTable\)/)
})

test("Drive page exposes accessible load-more controls while keeping stats separate", () => {
  assert.match(page, /listDriveFolders\(targetFolderId, \{ limit: driveListLimit \}\)/)
  assert.match(page, /listDriveFiles\(targetFolderId, \{ limit: driveListLimit \}\)/)
  assert.match(page, /loadDriveFolderStats\(targetFolderId\)/)
  assert.match(page, /loadDriveFolderPath\(targetFolderId\)/)
  assert.match(page, /t\("Load more folders"\)/)
  assert.match(page, /t\("Load more files"\)/)
  assert.match(page, /disabled=\{folderPage\.loading\}/)
  assert.match(page, /disabled=\{filePage\.loading\}/)
})
