import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../functions/contact-card-profile/index.ts", import.meta.url), "utf8")
const config = readFileSync(new URL("../config.toml", import.meta.url), "utf8")

test("the public profile endpoint is limited to active published contact cards", () => {
  assert.match(source, /\.eq\("ContactCard_Status", "published"\)/)
  assert.match(source, /\.is\("ContactCard_DeletedAt", null\)/)
  assert.match(source, /throw new HttpError\(404, "This contact card is not active\."\)/)
})

test("private profile media is shared through a short-lived signed URL", () => {
  assert.match(source, /User_ProfilePhotoBucket === "profile-photos"/)
  assert.match(source, /\.createSignedUrl\(owner\.User_ProfilePhotoPath, 900\)/)
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/)
})

test("phone and website values respect each card's public visibility settings", () => {
  assert.match(source, /card\.ContactCard_ShowPhone \? metadataText/)
  assert.match(source, /card\.ContactCard_ShowWebsite \? metadataText/)
})

test("the endpoint accepts anonymous published-card reads", () => {
  assert.match(config, /\[functions\.contact-card-profile\]\s+verify_jwt = false/)
})
