import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")

const store = read("multideck.client/src/lib/contact-card-store.ts")
const page = read("multideck.client/src/pages/contact-cards-page.tsx")
const components = read("multideck.client/src/components/multideck/contact-card-components.tsx")
const automation = read("multideck.client/src/components/multideck/contact-card-automation.tsx")
const design = read("multideck.client/src/components/multideck/contact-card-design.tsx")
const migration = read("supabase/migrations/20260818101834_crm_contact_card_atomic_drive_hardening.sql")
const cleanupMigration = read("supabase/migrations/20260818124500_crm_drive_durable_storage_cleanup.sql")
const driveStatsFixMigration = read("supabase/migrations/20260818134000_crm_drive_folder_stats_bigint_fix.sql")
const driveMutationClosureMigration = read("supabase/migrations/20260818151000_crm_drive_mutation_closure.sql")
const contactCardPermissionMigration = read("supabase/migrations/20260818152000_crm_contact_card_permission_closure.sql")
const contactCardBoundedReadsMigration = read("supabase/migrations/20260818157000_crm_contact_card_bounded_reads.sql")
const driveApi = read("multideck.client/src/lib/drive-api.ts")
const drivePage = read("multideck.client/src/pages/crm-drive-page.tsx")
const driveComponents = read("multideck.client/src/components/multideck/drive-components.tsx")
const app = read("multideck.client/src/App.tsx")
const topBar = read("multideck.client/src/components/multideck/top-bar.tsx")

test("contact-card persistence uses one transaction-owned save boundary", () => {
  assert.match(store, /multideck_contact_card_save_atomic/)
  assert.doesNotMatch(store, /persistCard[\s\S]{0,900}multideck_contact_card_set_tenant_name_visibility/)
  assert.match(migration, /create or replace function public\.multideck_contact_card_save_atomic\(p_card jsonb\)/)
  assert.match(migration, /perform public\.multideck_contact_card_(?:create|save)\(p_card\)/)
  assert.match(migration, /ContactCard_ShowTenantName/)
  assert.match(migration, /where "ContactCard_ID" = v_id[\s\S]*ContactCard_DeletedAt/)
})

test("contact-card create and delete success wait for confirmed persistence", () => {
  assert.match(store, /export async function createCard/)
  assert.match(store, /await persistCard\(card\)[\s\S]*commit\(\[card, \.\.\.state\.cards\]\)/)
  assert.match(store, /persistCard[\s\S]*throw error/)
  assert.match(store, /export async function deleteCard[\s\S]*await callRpc<void>\("multideck_contact_card_delete"[\s\S]*commit\(state\.cards\.filter/)
  assert.match(page, /const card = await createCard/)
  assert.match(page, /saving=\{creating\}/)
  assert.match(page, /void deleteCard\(card\.id\)\.then\(\(\) => \{[\s\S]*toast\.success\(t\("Card deleted"\)\)/)
  assert.match(page, /deleteError \? <p role="alert"/)
  assert.match(store, /export async function setCardStatus[\s\S]*await persistCard\(next\)[\s\S]*status: previous\.status/)
  assert.match(page, /await setCardStatus\(cardId, nextStatus\)[\s\S]*toast\.success/)
  assert.match(store, /export async function retryCardSave/)
  assert.match(components, /retryCardSave\(cardId\)[\s\S]*Not saved — try again/)
})

test("contact-card writes are ordered per card and deletion waits for earlier saves", () => {
  assert.match(store, /const saveQueues = new Map<string, Promise<void>>\(\)/)
  assert.match(store, /const previous = saveQueues\.get\(card\.id\) \?\? Promise\.resolve\(\)/)
  assert.match(store, /previous\.catch\(\(\) => undefined\)\.then\(\(\) => persistCardNow\(card\)\)/)
  assert.match(store, /export async function deleteCard[\s\S]*window\.clearTimeout\(timer\)[\s\S]*await saveQueues\.get\(cardId\)\?\.catch[\s\S]*multideck_contact_card_delete/)
})

test("contact-card automation lifecycle waits for persistence and rolls back failed state changes", () => {
  assert.match(store, /async function persistAutomationTransition/)
  assert.match(store, /window\.clearTimeout\(timer\)[\s\S]*await persistCard\(next\)/)
  assert.match(store, /card\.automation === nextAutomation[\s\S]*automation: previous\.automation/)
  for (const action of ["publishAutomation", "pauseAutomation", "resumeAutomation", "turnAutomationOff"]) {
    assert.match(store, new RegExp(`export function ${action}\\(cardId: string\\): Promise<void>`))
  }
  assert.match(page, /const \[automationSaving, setAutomationSaving\]/)
  assert.match(page, /await \(active \? resumeAutomation\(cardId\) : pauseAutomation\(cardId\)\)[\s\S]*toast\.success/)
  assert.match(page, /The previous confirmed setting has been restored/)
  assert.match(automation, /async function run\([\s\S]*await mutation\(\)[\s\S]*toast\.success/)
  assert.match(automation, /The previous confirmed setting has been restored/)
  assert.match(automation, /disabled=\{automationMutation\.saving !== null\}/)
  assert.doesNotMatch(automation, /publishAutomation\(card\.id\);\s*toast\.success/)
  assert.match(page, /createProfilePhotoSignedUrl\(owner\.profilePhoto\)/)
  assert.doesNotMatch(page, /Profile photo changed\. Saving…/)
  assert.match(design, /Logo changed\. Saving…/)
  assert.doesNotMatch(page, /toast\.success\(t\("Profile photo updated"\)\)/)
  assert.doesNotMatch(design, /toast\.success\(t\("Logo updated"\)\)/)
})

test("Contact Card register and detail reads stay bounded as history grows", () => {
  assert.match(contactCardBoundedReadsMigration, /create or replace function public\.multideck_contact_cards_page/)
  assert.match(contactCardBoundedReadsMigration, /v_limit integer := least\(greatest\(coalesce\(p_limit, 25\), 1\), 100\)/)
  assert.match(contactCardBoundedReadsMigration, /limit v_limit offset v_offset/)
  assert.match(contactCardBoundedReadsMigration, /create or replace function public\.multideck_contact_card_detail\(p_card_id uuid\)/)
  assert.match(contactCardBoundedReadsMigration, /limit 20/)
  assert.match(contactCardBoundedReadsMigration, /limit 25/)
  assert.match(contactCardBoundedReadsMigration, /_crm_contact_card_require_permission\('CRM\.Read'\)/)
  assert.match(contactCardBoundedReadsMigration, /card\."Company_ID" = v_context\.company_id/)
  assert.match(store, /multideck_contact_cards_page/)
  assert.match(store, /multideck_contact_card_detail/)
  assert.match(store, /missingContactCardReadRpc/)
  assert.match(store, /Contact card paging is still being prepared/)
  assert.doesNotMatch(store, /legacyWorkspacePage\(await callRpc/)
  assert.match(store, /registerRequestSequence/)
  assert.match(page, /pagination=\{\{ offset, limit: 25, total: page\.total/)
  assert.match(page, /serverSorting=\{\{ value: sort/)
})

test("authenticated Contact Card RPCs enforce CRM read and write permissions", () => {
  assert.match(contactCardPermissionMigration, /_crm_contact_card_require_permission/)
  assert.match(contactCardPermissionMigration, /_multideck_crm_has_permission\(v_context\.user_id, p_permission\)/)
  assert.equal((contactCardPermissionMigration.match(/_crm_contact_card_require_permission\('CRM\.Read'\)/g) ?? []).length, 2)
  assert.equal((contactCardPermissionMigration.match(/_crm_contact_card_require_permission\('CRM\.Write'\)/g) ?? []).length, 4)
  for (const signature of [
    "multideck_contact_cards_workspace\\(\\)",
    "multideck_contact_card_save_atomic\\(jsonb\\)",
    "multideck_contact_card_delete\\(uuid\\)",
    "multideck_contact_card_preview\\(text\\)",
    "multideck_contact_card_test_automation\\(uuid\\)",
    "multideck_contact_card_rerun\\(uuid\\)",
  ]) {
    assert.match(contactCardPermissionMigration, new RegExp(`grant execute on function public\\.${signature} to authenticated`))
  }
  assert.match(contactCardPermissionMigration, /revoke all on function public\.multideck_contact_card_save\(jsonb\) from authenticated/)
  assert.match(contactCardPermissionMigration, /revoke all on function public\.multideck_contact_card_create\(jsonb\) from authenticated/)
  assert.match(contactCardPermissionMigration, /revoke all on function public\.multideck_contact_card_set_tenant_name_visibility\(uuid, boolean\) from authenticated/)
})

test("read-only Contact Card users cannot reach authoring controls", () => {
  assert.match(app, /<ContactCardsPage navigate=\{navigate\} currentUser=\{currentUser\}/)
  assert.match(app, /<ContactCardDetailPage[\s\S]{0,180}currentUser=\{currentUser\}/)
  assert.match(page, /hasPermission\(currentUser, "CRM\.Write"\)/)
  assert.match(page, /if \(!canWrite\) return[\s\S]{0,100}subscribeTopBarAction/)
  assert.match(page, /action=\{canWrite \? \(/)
  assert.match(page, /canWrite \? <CreateCardWizard/)
  assert.match(page, /const visibleTabs = canWrite \? TABS : \(\["Overview", "Analytics"\]/)
  assert.match(page, /canWrite && tab === "Settings"/)
  assert.match(topBar, /crmCreateAction && canWriteCrm/)
})

test("Drive tables and storage require role permissions", () => {
  assert.match(migration, /CRM\.Drive\.Read/)
  assert.match(migration, /CRM\.Drive\.Write/)
  assert.match(migration, /_crm_drive_has_permission\('CRM\.Drive\.Read'\)/)
  assert.match(migration, /_crm_drive_has_permission\('CRM\.Drive\.Write'\)/)
  assert.match(migration, /Company users can read drive objects[\s\S]*_crm_drive_has_permission\('CRM\.Drive\.Read'\)/)
  assert.match(migration, /Company users can add drive objects[\s\S]*_crm_drive_has_permission\('CRM\.Drive\.Write'\)/)
  assert.match(migration, /crm_drive_delete_folder[\s\S]*_crm_drive_require_permission\('CRM\.Drive\.Write'\)/)
})

test("Drive metadata and storage paths are constrained to canonical company shapes", () => {
  assert.match(migration, /_crm_drive_storage_path_allowed\(p_company_id uuid, p_path text\)/)
  assert.match(migration, /files\//)
  assert.match(migration, /thumbs\//)
  assert.match(migration, /_crm_drive_file_path_allowed_v2\("DriveFile_ID", "DriveFile_StoragePath", false\)/)
  assert.match(migration, /_crm_drive_file_path_allowed_v2\("DriveFile_ID", "DriveFile_ThumbnailPath", true\)/)
  assert.match(migration, /storage\.objects[\s\S]*_crm_drive_storage_path_allowed\(public\.app_current_company_id\(\), name\)/)
})

test("Dexter Drive read and watch capability follow the Drive permission", () => {
  assert.match(migration, /sys_AIDexterDataDomains[\s\S]*CRM\.Drive\.Read/)
  assert.match(migration, /sys_AIDexterWatchCapabilities[\s\S]*CRM\.Drive\.Read/)
})

test("Drive deletion persists storage cleanup before removing metadata and retries safely", () => {
  assert.match(cleanupMigration, /CRM_DriveObjectCleanupQueue/)
  assert.match(cleanupMigration, /perform public\._crm_drive_enqueue_cleanup[\s\S]*delete from public\."CRM_DriveFiles"/)
  assert.match(cleanupMigration, /perform public\._crm_drive_enqueue_cleanup[\s\S]*delete from public\."CRM_DriveFolders"/)
  assert.match(cleanupMigration, /crm_drive_pending_cleanup/)
  assert.match(cleanupMigration, /crm_drive_complete_cleanup/)
  assert.match(cleanupMigration, /Explicit Dexter exception/)
  assert.match(driveApi, /crm_drive_delete_file/)
  assert.match(driveApi, /retryPendingDriveCleanup/)
  assert.match(driveApi, /storageCleanupPending/)
  assert.match(drivePage, /Secure storage cleanup remains queued for the next authorised Drive visit/)
})

test("Drive folder stats preserve the declared bigint response contract", () => {
  assert.match(driveStatsFixMigration, /create or replace function public\.crm_drive_folder_stats\(p_parent_id uuid default null\)/)
  assert.match(driveStatsFixMigration, /coalesce\(sum\(file\."DriveFile_SizeBytes"\), 0\)::bigint/)
  assert.match(driveStatsFixMigration, /_crm_drive_require_permission\('CRM\.Drive\.Read'\)/)
  assert.match(driveStatsFixMigration, /revoke all on function public\.crm_drive_folder_stats\(uuid\) from public, anon/)
  assert.match(driveStatsFixMigration, /grant execute on function public\.crm_drive_folder_stats\(uuid\) to authenticated, service_role/)
})

test("Drive metadata mutations cannot bypass permission-checked functions", () => {
  assert.match(driveMutationClosureMigration, /revoke update, delete on table public\."CRM_DriveFolders" from authenticated/)
  assert.match(driveMutationClosureMigration, /revoke update, delete on table public\."CRM_DriveFiles" from authenticated/)
  assert.match(driveMutationClosureMigration, /create or replace function public\.crm_drive_update_folder/)
  assert.match(driveMutationClosureMigration, /create or replace function public\.crm_drive_rename_file/)
  assert.equal((driveMutationClosureMigration.match(/_crm_drive_require_permission\('CRM\.Drive\.Write'\)/g) ?? []).length, 2)
  assert.match(driveMutationClosureMigration, /"Company_ID" = v_company_id/g)
  assert.match(driveMutationClosureMigration, /revoke all on function public\.crm_drive_update_folder[\s\S]*from public, anon/)
  assert.match(driveMutationClosureMigration, /grant execute on function public\.crm_drive_rename_file[\s\S]*to authenticated, service_role/)
  assert.match(driveApi, /rpc\("crm_drive_update_folder"/)
  assert.match(driveApi, /rpc\("crm_drive_rename_file"/)
  assert.doesNotMatch(driveApi, /from\(foldersTable\)[\s\S]{0,120}\.update\(/)
  assert.doesNotMatch(driveApi, /from\(filesTable\)[\s\S]{0,120}\.update\(/)
})

test("Drive handles uncertain uploads, verifies downloads, and preserves failed work", () => {
  assert.match(driveApi, /written\.push\(storagePath\)[\s\S]{0,120}await putObject/)
  assert.match(driveApi, /written\.push\(thumbnailPath\)[\s\S]{0,160}\.upload\(thumbnailPath/)
  assert.match(driveApi, /data\.size !== file\.sizeBytes/)
  assert.match(drivePage, /error: errorMessage\(cause, t\("That file could not be uploaded\."\)\)/)
  assert.match(drivePage, /onRetry=\{\(target\)/)
  assert.match(drivePage, /onDismiss=\{\(target\)/)
  assert.match(driveComponents, /t\("Upload failed"\)/)
  assert.match(driveComponents, /t\("Retry"\)/)
})

test("Drive hides write controls from operators without CRM.Drive.Write", () => {
  assert.match(app, /<CrmDrivePage currentUser=\{currentUser\}/)
  assert.match(drivePage, /hasPermission\(currentUser, "CRM\.Drive\.Write"\)/)
  assert.match(drivePage, /canWriteDrive \? <div[\s\S]*t\("New folder"\)[\s\S]*t\("Upload"\)/)
  assert.match(drivePage, /DriveSurfaceContextMenu canEdit=\{canWriteDrive\}/)
  assert.match(drivePage, /canEdit=\{canWriteDrive\}/)
  assert.match(drivePage, /canDelete=\{canWriteDrive\}/)
  assert.match(driveComponents, /canEdit \? \([\s\S]*Rename[\s\S]*Delete/)
  assert.match(driveComponents, /canDelete \? \([\s\S]*t\("Delete"\)/)
})
