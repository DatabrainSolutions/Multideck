import assert from "node:assert/strict"
import test from "node:test"
import { contactCardChannel, escapeVCard, localCardUrl, publicCardUrl, vCardDocument } from "../src/lib/contact-card-links.ts"

test("QR and copied links keep the tenant origin, card slug and distinct sources", () => {
  for (const source of ["qr", "link"] as const) {
    const url = new URL(publicCardUrl("https://tenant.multideck.app", "harry-phillips", source))
    assert.equal(url.origin, "https://tenant.multideck.app")
    assert.equal(url.pathname, "/card/harry-phillips")
    assert.equal(contactCardChannel(url.search), source === "qr" ? "direct-scan" : "shared-link")
  }
  assert.equal(contactCardChannel(""), "unknown")
  assert.equal(contactCardChannel("?source=untrusted"), "unknown")
  assert.equal(localCardUrl(publicCardUrl("http://localhost:3000", "test")), true)
  assert.equal(localCardUrl(publicCardUrl("https://tenant.multideck.app", "test")), false)
})

test("vCards use CRLF, escape injected fields and fold UTF-8 without splitting characters", () => {
  const name = "Élodie, " + "長".repeat(40)
  const escaped = escapeVCard("Name; company\nEMAIL:injected@example.com\\")
  assert.equal(escaped, "Name\\; company\\nEMAIL:injected@example.com\\\\")
  const card = vCardDocument(["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVCard(name)}`, "END:VCARD"])
  assert.ok(card.endsWith("END:VCARD\r\n"))
  assert.ok(card.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75))
  assert.ok(card.replace(/\r\n /g, "").includes(`FN:${escapeVCard(name)}`))
  assert.ok(!card.includes("�"))
})
