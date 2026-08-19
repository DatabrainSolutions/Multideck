import assert from "node:assert/strict"
import { readFileSync, statSync } from "node:fs"
import test from "node:test"

const template = readFileSync(new URL("../functions/_shared/email-template.ts", import.meta.url), "utf8")
const sender = readFileSync(new URL("../functions/_shared/email-sender.ts", import.meta.url), "utf8")
const authSender = readFileSync(new URL("../functions/send-auth-email/index.ts", import.meta.url), "utf8")
const notificationSender = readFileSync(new URL("../functions/send-notification-email/index.ts", import.meta.url), "utf8")
const teamSender = readFileSync(new URL("../functions/team/index.ts", import.meta.url), "utf8")
const bannerUrl = new URL("../../multideck.client/public/email/multideck-email-banner.jpg", import.meta.url)
const banner = readFileSync(bannerUrl)

test("every Multideck system-email sender uses the shared branded renderer", () => {
  assert.match(authSender, /renderBrandedEmail\(/)
  assert.match(notificationSender, /renderBrandedEmail\(/)
  assert.match(teamSender, /sendUserDeletionEmail[\s\S]*?renderBrandedEmail\(/)
})

test("every Multideck system email uses the approved support mailbox", () => {
  assert.match(sender, /Multideck <support@multideck\.co\.uk>/)
  assert.match(sender, /MULTIDECK_EMAIL_REPLY_TO = "support@multideck\.co\.uk"/)
  assert.doesNotMatch(sender, /support@multideck\.app/)
  assert.match(authSender, /from: MULTIDECK_EMAIL_FROM/)
  assert.match(authSender, /reply_to: MULTIDECK_EMAIL_REPLY_TO/)
  assert.match(notificationSender, /from: MULTIDECK_EMAIL_FROM/)
  assert.match(notificationSender, /reply_to: MULTIDECK_EMAIL_REPLY_TO/)
  assert.match(teamSender, /from: MULTIDECK_EMAIL_FROM/)
  assert.match(teamSender, /reply_to: MULTIDECK_EMAIL_REPLY_TO/)
})

test("the shared email template begins with the full-width Multideck banner", () => {
  assert.match(template, /EMAIL_BANNER_URL/)
  assert.match(template, /email\/multideck-email-banner\.jpg/)
  assert.match(template, /width="600" height="98" alt="Multideck"/)
  assert.ok(template.indexOf("defaults.bannerUrl") < template.indexOf("options.eyebrow"))
})

test("the email banner is a compressed, email-compatible JPEG", () => {
  assert.deepEqual([...banner.subarray(0, 2)], [0xff, 0xd8])
  assert.ok(statSync(bannerUrl).size <= 100_000)
})
