import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"
import ts from "../../multideck.client/node_modules/typescript/lib/typescript.js"

const root = new URL("../functions/inbox-api/", import.meta.url)
const source = await readFile(new URL("runtime.ts", root), "utf8")
const repairSource = source.slice(source.indexOf("async function hydrateOutlookInlineContentIds"), source.indexOf("export async function getThread"))
const coreSource = await readFile(new URL("core.ts", root), "utf8")
const core = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(coreSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`)

function fixture({ denied = false, duplicateName = false, failWrite = false } = {}) {
  const requests = []
  const writes = []
  const attachment = {
    CommAttachment_ID: "stored-image", CommAttachment_MessageID: "message",
    CommAttachment_ContentID: null, CommAttachment_IsInline: true,
    CommAttachment_MetadataJSON: JSON.stringify({ providerAttachmentId: "provider-image" }),
  }
  const messages = [{ CommMessage_ID: "message", CommMessage_MailboxID: "mailbox", CommMessage_ProviderMessageID: "provider-message", CommMessage_BodyHTML: '<img src="cid:photo"><img src="cid:other">' }]
  const attachments = [attachment]
  const dependencies = {
    ...core,
    requireMailbox: async () => { if (denied) throw new Error("Denied"); return { mailbox: {}, connection: {} } },
    credential: async () => ({ accessToken: "test-token" }),
    publicProvider: () => "outlook",
    providerJson: async (url) => {
      requests.push(url)
      return url.includes("/attachments?") ? { value: [{ id: "provider-image", name: "photo.png" }] } : {}
    },
    outlookMimeInlineAttachmentHeaders: async () => {
      requests.push("mime")
      return [{ fileName: "photo.png", contentId: "photo" }, ...(duplicateName ? [{ fileName: "photo.png", contentId: "other" }] : [])]
    },
    result: async (value) => value,
  }
  const repair = new Function(...Object.keys(dependencies), `${stripTypeScriptTypes(repairSource, { mode: "strip" })}; return hydrateOutlookInlineContentIds`)(...Object.values(dependencies))
  const admin = { from: (table) => ({
    update: (values) => ({ eq: async (column, id) => {
      if (failWrite) throw new Error("Write failed")
      writes.push({ table, values, column, id })
    } }),
    insert: async () => { throw new Error("Existing attachment must not be duplicated") },
  }) }
  return { run: () => repair(admin, { userId: "actor" }, messages, attachments), attachment, messages, requests, writes }
}

test("MIME recovery repairs the existing attachment and returns the ID on this read", async () => {
  const f = fixture()
  // One actual CID means a fully repaired message needs no provider work again.
  f.messages[0].CommMessage_BodyHTML = '<img src="cid:photo">'
  await f.run()
  assert.equal(f.attachment.CommAttachment_ContentID, "photo")
  assert.equal(f.attachment.CommAttachment_IsInline, true)
  assert.equal(f.writes.filter(w => w.table === "Comm_MessageAttachments").length, 1)
  assert.equal(f.requests.filter(url => url.includes("/attachments/provider-image?")).length, 1)
  const requestCount = f.requests.length
  const writeCount = f.writes.length
  await f.run()
  assert.equal(f.requests.length, requestCount)
  assert.equal(f.writes.length, writeCount)
})

test("ambiguous MIME filenames do not assign the wrong signature image", async () => {
  const f = fixture({ duplicateName: true })
  await f.run()
  assert.equal(f.attachment.CommAttachment_ContentID, null)
  assert.equal(f.writes.filter(w => w.table === "Comm_MessageAttachments").length, 0)
})

test("denied mailbox access cannot fetch or repair private images", async () => {
  const f = fixture({ denied: true })
  await f.run()
  assert.equal(f.requests.length, 0)
  assert.equal(f.writes.length, 0)
})

test("a failed repair preserves readable mail and does not claim a saved ID", async () => {
  const f = fixture({ failWrite: true })
  await f.run()
  assert.equal(f.attachment.CommAttachment_ContentID, null)
})
