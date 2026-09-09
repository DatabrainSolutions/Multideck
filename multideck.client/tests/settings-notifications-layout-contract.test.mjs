import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const page = await readFile(new URL("../src/pages/settings-page.tsx", import.meta.url), "utf8")
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8")
const notificationsStart = page.indexOf("function NotificationsTab()")
const notificationsEnd = page.indexOf("\nfunction ShortcutsTab()", notificationsStart)
const notifications = page.slice(notificationsStart, notificationsEnd)

test("Notifications uses one intentional settings column", () => {
  assert.match(notifications, /<div className="mt-\[var\(--md-page-stack-gap\)\]">\s*<div className="space-y-\[var\(--md-page-stack-gap\)\]">/)
  assert.doesNotMatch(notifications, /Signal routing|Delivery health|xl:grid-cols|<aside/)
  assert.doesNotMatch(notifications, /md-settings-notification-map|md-settings-signal-ping|enabledEmailCount/)
})

test("Notifications preserves the real preference load and save actions", () => {
  assert.match(notifications, /loadNotificationEmailPreferences\(\)/)
  assert.match(notifications, /saveNotificationEmailPreferences\(preferences\)/)
  assert.match(notifications, /sendNotificationTestEmail\(language\)/)
  assert.match(notifications, /Save notifications/)
  assert.match(notifications, /Digest delivery time/)
  assert.match(notifications, /Digest timezone/)
})

test("removed signal-routing motion has no remaining stylesheet rules", () => {
  assert.doesNotMatch(styles, /md-settings-signal-ping|md-settings-signal-arrive/)
})
