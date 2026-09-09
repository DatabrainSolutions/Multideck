import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const page = read("../src/pages/public-booking-page.tsx")
const identity = read("../src/components/multideck/public-brand-identity.tsx")

test("public bookings show saved company identity inside the booking panel", () => {
  assert.match(page, /const brand = booking\?\.branding/)
  assert.match(page, /const identity = <PublicBrandIdentity key=\{brand\?\.logoUrl \?\? "no-logo"\} brand=\{brand\}/)
  assert.match(page, /<aside[\s\S]*?<div className="mb-5">\{identity\}<\/div>[\s\S]*?booking\.organiser\.name[\s\S]*?<h1/)
  assert.doesNotMatch(page, /Secure booking|ShieldCheck|MeetingProviderMark/)
  assert.match(page, /booking\.localPreview \? <p[^>]*>Test booking<\/p>/)
})

test("company logos have a real layout width and retain safe fallbacks", () => {
  assert.match(identity, /flex min-h-11 w-full min-w-0 max-w-\[200px\]/)
  assert.match(identity, /h-auto w-auto max-h-11 min-w-0 max-w-full object-contain/)
  assert.match(identity, /onError=\{\(\) => setFailedUrl\(logo\)\}/)
  assert.match(identity, /brand\.displayName/)
  assert.match(identity, /alt="Multideck"/)
})
