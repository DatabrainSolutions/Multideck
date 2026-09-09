import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const iphone = await readFile(new URL("../src/components/ui/iphone.tsx", import.meta.url), "utf8")
const design = await readFile(new URL("../src/components/multideck/contact-card-design.tsx", import.meta.url), "utf8")
const publicView = await readFile(new URL("../src/components/multideck/contact-card-public-view.tsx", import.meta.url), "utf8")
const galleryData = await readFile(new URL("../src/data/multideck-data.ts", import.meta.url), "utf8")
const galleryPage = await readFile(new URL("../src/pages/components-gallery-page.tsx", import.meta.url), "utf8")

test("Magic UI iPhone can host the real interactive preview surface", () => {
  assert.match(iphone, /children\?: ReactNode/)
  assert.match(iphone, /hasVideo \|\| !!src \|\| !!children/)
  assert.match(iphone, /overflow-x-hidden overflow-y-auto/)
  assert.match(iphone, /screenMaskId/)
})

test("Contact Card design uses the shared iPhone frame around the real public card", () => {
  assert.match(design, /import \{ Iphone, IPHONE_CONTENT_SAFE_TOP \} from "@\/components\/ui\/iphone"/)
  assert.match(design, /<Iphone[^>]*>[\s\S]*<PublicCardShell card=\{card\}/)
  assert.match(design, /deviceSafeAreaTop=\{IPHONE_CONTENT_SAFE_TOP\}/)
  assert.match(iphone, /export const IPHONE_CONTENT_SAFE_TOP = "16%"/)
  assert.match(publicView, /contentSafeTop[\s\S]*headerStyle === "none" \|\| headerStyle === "bar"/)
  assert.match(publicView, /CardHeader card=\{card\} spec=\{spec\} deviceSafeAreaTop=\{deviceSafeAreaTop\}/)
  assert.match(publicView, /paddingTop: deviceSafeAreaTop \? `max\(20px, \$\{deviceSafeAreaTop\}\)`/)
  assert.doesNotMatch(design, /A plain device frame/)
})

test("the reusable frame is documented on the Components page", () => {
  assert.match(galleryData, /id: "iphone-device-frame"/)
  assert.match(galleryData, /Contact Card design/)
  assert.match(galleryPage, /id === "iphone-device-frame"/)
  assert.match(galleryPage, /<Iphone className=/)
})
