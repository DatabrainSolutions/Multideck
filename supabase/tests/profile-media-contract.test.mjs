import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const supabaseRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(supabaseRoot, "..")

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

test("profile and cover photos persist through authenticated Supabase contracts", () => {
  const client = read("multideck.client/src/lib/profile-photo.ts")

  assert.match(client, /rpc\("set_current_user_profile_photo"/)
  assert.match(client, /rpc\("set_current_user_cover_photo"/)
  assert.match(client, /rpc\("clear_current_user_cover_photo"/)
  assert.equal(client.includes("saveApiCurrentUserCoverPhoto"), false)
  assert.equal(client.includes("removeApiCurrentUserCoverPhoto"), false)
})

test("cover photo RPCs validate ownership and uploaded storage objects", () => {
  const migration = read(
    "supabase/migrations/202607300004_user_cover_photos.sql",
  )

  assert.match(migration, /v_auth_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /where bucket_id = p_bucket\s+and name = p_path/s)
  assert.match(migration, /"Auth_User_ID" = v_auth_user_id/)
  assert.match(migration, /revoke all on function public\.set_current_user_cover_photo.*public, anon/s)
  assert.match(migration, /grant execute on function public\.set_current_user_cover_photo.*authenticated/s)
})

test("the sidebar receives a signed URL before authenticated content mounts", () => {
  const app = read("multideck.client/src/App.tsx")
  const sidebar = read("multideck.client/src/components/multideck/app-sidebar.tsx")

  assert.match(app, /await preloadImage\(signedUrl\)\s+nextUser\.profilePhotoUrl = signedUrl/)
  assert.match(app, /setCurrentUser\(nextUser\)\s+setAuthStatus\("authenticated"\)/)
  assert.match(sidebar, /currentUser\?\.profilePhotoUrl/)
  assert.match(sidebar, /currentUser\?\.profilePhoto \? null : accountInitials/)
})
