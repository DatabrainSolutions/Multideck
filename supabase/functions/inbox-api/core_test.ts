import { assert, assertEquals, assertMatch, assertThrows } from "jsr:@std/assert@1.0.18"
import {
  InboxHttpError,
  OUTBOUND_ATTACHMENT_LIMITS,
  base64Encode,
  buildMimeMessage,
  buildRfc2822,
  decodeCursor,
  decodeHtmlEntities,
  encodeCursor,
  gmailGroupQuery,
  gmailMessageMatchesGroup,
  mapWithConcurrency,
  normalizeAddresses,
  parseFunctionPath,
  readAllowedOrigins,
  readOutboundAttachments,
  repairMojibake,
  resolveResponseRecipients,
  safeFileName,
  sanitizeEmailHtml,
  emailHtmlContentIds,
  graphMessageNeedsAttachmentFetch,
  inferGraphContentIdFromFileName,
  appendInternetMessageReference,
  deliveryReportNeedsRawMime,
  isRecipientReplyMessage,
  parseDeliveryStatusReport,
  replyTargetMessageId,
  mimeInlineAttachmentHeaders,
} from "./core.ts"

Deno.test("parses hosted and local inbox-api route paths", () => {
  assertEquals(parseFunctionPath("https://project.supabase.co/functions/v1/inbox-api/threads/abc/summary"), ["threads", "abc", "summary"])
  assertEquals(parseFunctionPath("http://127.0.0.1:54321/functions/v1/inbox-api/providers"), ["providers"])
})

Deno.test("only exact HTTPS and local development origins are allowlisted", () => {
  const origins = readAllowedOrigins({
    EMAIL_ALLOWED_REDIRECT_ORIGINS: "https://jenkar.multideck.app,https://evil.test/path,http://not-local.test",
    EMAIL_CANONICAL_APP_ORIGIN: "https://databrain.multideck.app",
  })
  assert(origins.has("https://jenkar.multideck.app"))
  assert(origins.has("https://databrain.multideck.app"))
  assert(origins.has("http://localhost:3000"))
  assert(!origins.has("https://evil.test"))
  assert(!origins.has("http://not-local.test"))
})

Deno.test("cursor is opaque and rejects malformed input", () => {
  assertEquals(decodeCursor(encodeCursor({ offset: 50 })), 50)
  assertThrows(() => decodeCursor("not-json"), InboxHttpError)
})

Deno.test("provider detail reads preserve order and respect their concurrency ceiling", async () => {
  let active = 0
  let maximumActive = 0
  const values = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active -= 1
    return value * 10
  })

  assertEquals(values, [10, 20, 30, 40, 50, 60])
  assertEquals(maximumActive, 3)
})

Deno.test("recipient normalization deduplicates and rejects invalid addresses", () => {
  assertEquals(normalizeAddresses([
    { address: " Person@Example.com ", displayName: "Person" },
    { address: "person@example.com" },
    { address: "not-an-email" },
  ]), [{ address: "person@example.com", displayName: "Person" }])
})

Deno.test("Gmail group snapshots use an exact OR query across recipient and list delivery fields", () => {
  assertEquals(
    gmailGroupQuery(" Operations@Example.com "),
    "{to:operations@example.com cc:operations@example.com deliveredto:operations@example.com list:operations@example.com}",
  )
  assertThrows(() => gmailGroupQuery("not-an-address"), InboxHttpError)
})

Deno.test("Gmail group history accepts exact recipient and delivery headers without substring matches", () => {
  assert(gmailMessageMatchesGroup({
    groupAddress: "operations@example.com",
    recipients: [{ address: "operations@example.com" }],
  }))
  assert(gmailMessageMatchesGroup({
    groupAddress: "operations@example.com",
    headers: [
      { name: "Delivered-To", value: "Harry <harry@example.com>" },
      { name: "List-Post", value: "<mailto:operations@example.com>" },
    ],
  }))
  assert(!gmailMessageMatchesGroup({
    groupAddress: "operations@example.com",
    recipients: [{ address: "devoperations@example.com" }],
    headers: [{ name: "List-Post", value: "<mailto:devoperations@example.com>" }],
  }))
  assert(!gmailMessageMatchesGroup({
    groupAddress: "operations@example.com",
    headers: [{ name: "From", value: "operations@example.com" }],
  }))
})

Deno.test("a reply started from Sent items targets the original audience", () => {
  assertEquals(resolveResponseRecipients({
    mode: "reply",
    direction: "outbound",
    mailboxAddress: "me@example.com",
    from: [{ address: "me@example.com", displayName: "Me" }],
    to: [{ address: "customer@example.com", displayName: "Customer" }],
    cc: [], addedTo: [], addedCc: [], addedBcc: [], removedAddresses: [],
  }).to, [{ address: "customer@example.com", displayName: "Customer" }])
})

Deno.test("a self-addressed Sent reply keeps the mailbox as its sole recipient", () => {
  assertEquals(resolveResponseRecipients({
    mode: "reply",
    direction: "outbound",
    mailboxAddress: "me@example.com",
    from: [{ address: "me@example.com", displayName: "Me" }],
    to: [{ address: "me@example.com", displayName: "Me" }],
    cc: [], addedTo: [], addedCc: [], addedBcc: [], removedAddresses: [],
  }), {
    to: [{ address: "me@example.com", displayName: "Me" }], cc: [], bcc: [],
  })
})

Deno.test("sanitizer removes executable email markup", () => {
  const safe = sanitizeEmailHtml(`<div onclick="steal()"><script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="https://example.com/a.png" onerror="steal()"></div>`)
  assert(!/script|onclick|onerror|javascript:/i.test(safe))
  assertMatch(safe, /https:\/\/example\.com\/a\.png/)
})

Deno.test("Outlook inline-only images still trigger an attachment lookup", () => {
  const html = `<p>Hello</p><img src="cid:Signature.Logo%40example"><img src='cid:<photo-1>'>`
  assertEquals(emailHtmlContentIds(html), ["signature.logo@example", "photo-1"])
  assertEquals(graphMessageNeedsAttachmentFetch(false, html), true)
  assertEquals(graphMessageNeedsAttachmentFetch(false, "<p>No images</p>"), false)
  assertEquals(graphMessageNeedsAttachmentFetch(true, "<p>Invoice attached</p>"), true)
  assertEquals(inferGraphContentIdFromFileName("image001.png", ["image001.png@01dd2103", "image002.png@01dd2103"]), "image001.png@01dd2103")
  assertEquals(inferGraphContentIdFromFileName("image001.png", ["image001.png@one", "image001.png@two"]), null)
  assertEquals(inferGraphContentIdFromFileName("invoice.pdf", ["image001.png@example"]), null)
})

Deno.test("Outlook MIME headers map opaque inline Content-IDs to filenames", () => {
  const mime = [
    'Content-Type: multipart/related; boundary="example"',
    '',
    '--example',
    'Content-Type: image/png; name="image001.png"',
    'Content-Disposition: inline; filename="image001.png"',
    'Content-ID: <366d8887-f081-4b3a-afa8-9482215688ac>',
    '',
    'base64-data',
    '--example--',
  ].join('\r\n')
  assertEquals(mimeInlineAttachmentHeaders(mime), [{
    contentId: "366d8887-f081-4b3a-afa8-9482215688ac",
    fileName: "image001.png",
  }])
})

Deno.test("email previews decode safe named and numeric HTML entities", () => {
  assertEquals(decodeHtmlEntities("You&amp;me, you&#39;re &#x1F44D;"), "You&me, you're 👍")
})

Deno.test("double-decoded UTF-8 mail headers are repaired without changing normal text", () => {
  assertEquals(repairMojibake("Live test Ã¢Â€Â” complete"), "Live test — complete")
  assertEquals(repairMojibake("Normal English subject"), "Normal English subject")
})

Deno.test("filenames and RFC2822 headers cannot inject response or mail headers", () => {
  assertEquals(safeFileName("../../invoice\n.pdf"), "invoice_.pdf")
  const raw = buildRfc2822({
    from: { address: "me@example.com", displayName: "Me" },
    to: [{ address: "you@example.com", displayName: null }], cc: [], bcc: [],
    subject: "Hello\r\nBcc: attacker@example.com", bodyText: "Body",
  })
  assert(raw.length > 20)
})

Deno.test("RFC2822 subjects encode non-ASCII text as UTF-8 encoded words", () => {
  const raw = buildRfc2822({
    from: { address: "me@example.com", displayName: "Harry" },
    to: [{ address: "you@example.com", displayName: null }], cc: [], bcc: [],
    subject: "Live test — complete", bodyText: "Body",
  })
  const padding = "=".repeat((4 - raw.length % 4) % 4)
  const binary = atob(raw.replace(/-/g, "+").replace(/_/g, "/") + padding)
  const decoded = new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
  assertMatch(decoded, /Subject: =\?UTF-8\?B\?.+\?=/)
  assert(!decoded.includes("Subject: Live test — complete"))
})

Deno.test("outbound MIME preserves a stable per-message identity and complete reply references", () => {
  const messageId = "<send-2@messages.multideck.app>"
  const references = appendInternetMessageReference("<send-0@example.com>", "<send-1@example.com>")
  const mime = buildMimeMessage({
    from: { address: "me@example.com", displayName: "Me" },
    to: [{ address: "you@example.com", displayName: null }], cc: [], bcc: [],
    subject: "Re: Update", bodyText: "Latest update", messageId,
    inReplyTo: "<send-1@example.com>", references,
  })
  assertMatch(mime, /Message-ID: <send-2@messages\.multideck\.app>/)
  assertMatch(mime, /In-Reply-To: <send-1@example\.com>/)
  assertMatch(mime, /References: <send-0@example\.com> <send-1@example\.com>/)
})

Deno.test("recipient replies correlate to one exact outbound message in a busy thread", () => {
  const candidates = [
    { id: "local-1", internetMessageId: "<send-1@example.com>" },
    { id: "local-2", internetMessageId: "<send-2@example.com>" },
  ]
  assertEquals(replyTargetMessageId({
    "in-reply-to": "<send-2@example.com>",
    references: "<send-1@example.com> <send-2@example.com>",
  }, candidates), "local-2")
  assertEquals(replyTargetMessageId({ references: "<send-1@example.com> <unknown@example.com>" }, candidates), "local-1")
  assertEquals(replyTargetMessageId({ "in-reply-to": "<unknown@example.com>" }, candidates), null)
})

Deno.test("delivery reports and automatic responses never count as recipient replies", () => {
  const exchangeReceipt = {
    "content-type": "multipart/report",
    "auto-submitted": "auto-replied",
    "in-reply-to": "<first@example.com>",
    references: "<first@example.com>",
  }
  assert(deliveryReportNeedsRawMime(exchangeReceipt))
  assert(!isRecipientReplyMessage(exchangeReceipt))
  assert(!isRecipientReplyMessage({
    "auto-submitted": "auto-replied",
    "in-reply-to": "<first@example.com>",
  }))
  assert(isRecipientReplyMessage({
    "in-reply-to": "<first@example.com>",
    references: "<first@example.com>",
  }))
})

Deno.test("delivery reports require exact machine-readable evidence for one message", () => {
  assertEquals(parseDeliveryStatusReport("multipart/report", [
    "Content-Type: message/delivery-status",
    "Original-Message-ID: <send-2@example.com>",
    "Action: delivered",
    "Status: 2.0.0",
  ].join("\r\n")), {
    eventType: "delivered",
    originalMessageId: "<send-2@example.com>",
    statusCode: "2.0.0",
  })
  assertEquals(parseDeliveryStatusReport("multipart/report; report-type=delivery-status", [
    "Content-Type: message/delivery-status",
    "Original-Message-ID: <send-3@example.com>",
    "Action: failed",
    "Status: 5.1.1",
  ].join("\r\n"))?.eventType, "bounced")
  assertEquals(parseDeliveryStatusReport("text/plain", "Delivery failed for your message"), null)
  assertEquals(parseDeliveryStatusReport("multipart/report; report-type=delivery-status", "Action: delivered\r\nStatus: 2.0.0"), null)
  assertEquals(parseDeliveryStatusReport("multipart/report", [
    "Content-Type: message/delivery-status",
    "Action: relayed",
    "Status: 2.1.5",
  ].join("\r\n"), "<send-4@example.com>"), {
    eventType: "delivered",
    originalMessageId: "<send-4@example.com>",
    statusCode: "2.1.5",
  })
})

Deno.test("a message with no attachments stays a single text/plain part", () => {
  const mime = buildMimeMessage({
    from: { address: "me@example.com", displayName: "Me" },
    to: [{ address: "you@example.com", displayName: null }], cc: [], bcc: [],
    subject: "Plain", bodyText: "Body",
  })
  assertMatch(mime, /Content-Type: text\/plain; charset=UTF-8/)
  assert(!mime.includes("multipart/mixed"))
})

Deno.test("a tracked message keeps a plain-text alternative beside the HTML pixel", () => {
  const mime = buildMimeMessage({
    from: { address: "me@example.com", displayName: "Me" },
    to: [
      { address: "one@example.com", displayName: null },
      { address: "two@example.com", displayName: null },
    ],
    cc: [],
    bcc: [],
    subject: "Tracked",
    bodyText: "First line\nSecond line",
    bodyHtml: '<div>First line<br>Second line</div><img src="https://track.example/open?token=opaque" width="1" height="1" alt="">',
  })

  assertMatch(mime, /Content-Type: multipart\/alternative/)
  assertMatch(mime, /Content-Type: text\/plain; charset=UTF-8/)
  assertMatch(mime, /Content-Type: text\/html; charset=UTF-8/)
  assertMatch(mime, /First line\r\nSecond line/)
  assertMatch(mime, /https:\/\/track\.example\/open\?token=opaque/)
})

Deno.test("a tracked message with a file nests the alternatives inside multipart mixed", () => {
  const mime = buildMimeMessage({
    from: { address: "me@example.com", displayName: "Me" },
    to: [{ address: "you@example.com", displayName: null }],
    cc: [],
    bcc: [],
    subject: "Tracked attachment",
    bodyText: "See attached",
    bodyHtml: '<div>See attached</div><img src="https://track.example/open?token=opaque" width="1" height="1" alt="">',
    attachments: [{ fileName: "invoice.pdf", mimeType: "application/pdf", bytes: new Uint8Array([1, 2, 3]) }],
  })

  assertMatch(mime, /Content-Type: multipart\/mixed/)
  assertMatch(mime, /Content-Type: multipart\/alternative/)
  assertMatch(mime, /Content-Disposition: attachment; filename="invoice\.pdf"/)
})

Deno.test("attachments become base64 multipart parts under a single boundary", () => {
  const mime = buildMimeMessage({
    from: { address: "me@example.com", displayName: "Me" },
    to: [{ address: "you@example.com", displayName: null }], cc: [], bcc: [],
    subject: "With files", bodyText: "See attached",
    attachments: [
      { fileName: "invoice.pdf", mimeType: "application/pdf", bytes: new TextEncoder().encode("PDF-BYTES") },
      { fileName: "photo.png", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) },
    ],
  })
  const boundary = mime.match(/boundary="([^"]+)"/)?.[1]
  assert(boundary)
  assertMatch(mime, /Content-Type: multipart\/mixed/)
  assertMatch(mime, /Content-Disposition: attachment; filename="invoice.pdf"/)
  assertMatch(mime, /Content-Type: image\/png; name="photo.png"/)
  assert(mime.includes(base64Encode(new Uint8Array([1, 2, 3, 4]))))
  assert(mime.trimEnd().endsWith(`--${boundary}--`))
  // Three openings and one closing: the body part plus one per file.
  assertEquals(mime.split(`--${boundary}\r\n`).length - 1, 3)
})

Deno.test("an attachment filename cannot inject mail headers or escape its folder", () => {
  const [attachment] = readOutboundAttachments([
    { fileName: "../../secrets\r\nBcc: attacker@example.com.pdf", mimeType: "application/pdf", contentBase64: base64Encode(new Uint8Array([9])) },
  ])
  assertEquals(attachment.fileName, "secrets__Bcc_ attacker@example.com.pdf")
  const mime = buildMimeMessage({
    from: { address: "me@example.com", displayName: null },
    to: [{ address: "you@example.com", displayName: null }], cc: [], bcc: [],
    subject: "Files", bodyText: "Body", attachments: [attachment],
  })
  assert(!/^Bcc:/m.test(mime))
})

Deno.test("an unknown media type falls back rather than being relayed as described", () => {
  const [attachment] = readOutboundAttachments([
    { fileName: "run.sh", mimeType: "application/x-sh", contentBase64: base64Encode(new Uint8Array([9])) },
  ])
  assertEquals(attachment.mimeType, "application/octet-stream")
})

Deno.test("attachments are refused past the count, per-file and total limits", () => {
  const one = { fileName: "a.txt", mimeType: "text/plain", contentBase64: base64Encode(new Uint8Array([1])) }
  assertThrows(
    () => readOutboundAttachments(Array.from({ length: OUTBOUND_ATTACHMENT_LIMITS.maxCount + 1 }, () => one)),
    InboxHttpError,
    "files",
  )
  assertThrows(
    () => readOutboundAttachments([{ ...one, contentBase64: base64Encode(new Uint8Array(OUTBOUND_ATTACHMENT_LIMITS.maxFileBytes + 1)) }]),
    InboxHttpError,
    "too large to send",
  )
  const nearLimit = base64Encode(new Uint8Array(OUTBOUND_ATTACHMENT_LIMITS.maxFileBytes))
  assertThrows(
    () => readOutboundAttachments([{ ...one, contentBase64: nearLimit }, { ...one, contentBase64: nearLimit }]),
    InboxHttpError,
    "together",
  )
  assertEquals(readOutboundAttachments(undefined).length, 0)
})
