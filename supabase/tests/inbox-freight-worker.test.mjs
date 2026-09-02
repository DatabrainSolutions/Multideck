import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(new URL("../../multideck.client/package.json", import.meta.url))
const ts = require("typescript")
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const [workerCode, policyCode, matchCode] = await Promise.all([
  compile("../functions/_shared/inbox-suggested-updates.ts"),
  compile("../functions/_shared/inbox-freight-relevance.ts"),
  compile("../functions/_shared/inbox-booking-match.ts"),
])

function load(code, dependencies = {}) {
  const exports = {}
  new Function("require", "exports", "Deno", code)((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports, { env: { get: (name) => name.endsWith("API_KEY") ? "test-key" : undefined } })
  return exports
}

const job = { job_id: "11111111-1111-4111-8111-111111111111", company_id: "company-a", owner_user_id: "user-a", mailbox_id: "mailbox-a", message_id: "message-a", attachment_id: "attachment-a" }
const cleanString = (value, max = 8_000) => typeof value === "string" ? value.trim().slice(0, max) : ""

function harness({ document, extracted, body = "", subject = "Invoice attached", enabled = true, aiRead = true, bookingRead = true, providerReadable = true, bookingCompany = "company-a", booking = false, reviewed = null, stale = false, modelError = null }) {
  const calls = { model: [], uploads: [], completions: [], deletes: [], queries: [], downloads: 0 }
  const tables = {
    cmp_Users: [{ User_ID: "user-a", Auth_User_ID: "auth-a", Company_ID: "company-a", User_Email: "operator@example.com", User_AccessStatus: "active" }],
    Comm_MessageAttachments: [{ CommAttachment_ID: "attachment-a", CommAttachment_MessageID: "message-a", CommAttachment_FileName: "document.pdf" }],
    Comm_Messages: [{ CommMessage_ID: "message-a", CommMessage_MailboxID: "mailbox-a", CommMessage_Subject: subject, CommMessage_BodyText: body }],
    AI_InboxSuggestionSettings: [{ AIInboxSetting_MailboxID: "mailbox-a", AIInboxSetting_CompanyID: "company-a", AIInboxSetting_EnabledByUserID: "user-a", AIInboxSetting_IsEnabled: enabled, AIInboxSetting_AllowedDocumentTypesJSON: ["commercial_invoice", "booking_confirmation"] }],
    Comm_MessageRecipients: [{ CommRecipient_MessageID: "message-a", CommRecipient_RecipientTypeCode: "from", CommRecipient_Address: "sender@shop.example", CommRecipient_DisplayNameSnapshot: "Supplier", CommRecipient_OrgID: "org-a" }],
    AI_InboxProcessingJobs: [{ AIInboxJob_ID: job.job_id, AIInboxJob_StatusCode: "processing" }],
    AI_InboxSuggestedUpdates: stale || reviewed ? [{ AIInboxSuggestion_ID: job.job_id, AIInboxSuggestion_JobID: job.job_id, AIInboxSuggestion_StatusCode: reviewed || "needs_match" }] : [],
    Job_Header: booking ? [{ Job_ID: "booking-a", Job_BookingReference: "JQ20015", Job_OfficeID: "office-a", Job_IsDeleted: false, Job_Status: "active" }] : [],
    cmp_Offices: [{ Office_ID: "office-a", Company_ID: bookingCompany }],
  }
  const admin = {
    from(table) {
      const query = { table, operation: "read", filters: [], single: false, data: null }
      const chain = {
        select() { return chain },
        eq(key, value) { query.filters.push((row) => key === "AIInboxJob_LeaseToken" || row[key] === value); return chain },
        neq(key, value) { query.filters.push((row) => row[key] !== value); return chain },
        in(key, values) { query.filters.push((row) => values.includes(row[key])); return chain },
        ilike() { return chain },
        limit() { return chain },
        order() { return chain },
        maybeSingle() { query.single = true; return chain },
        update(data) { query.operation = "update"; query.data = data; return chain },
        insert(data) { query.operation = "insert"; query.data = data; return chain },
        delete() { query.operation = "delete"; return chain },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.queries.push({ table, operation: query.operation })
            const rows = (tables[table] ?? []).filter((row) => query.filters.every((predicate) => predicate(row)))
            if (query.operation === "update") rows.forEach((row) => Object.assign(row, query.data))
            if (query.operation === "delete") {
              tables[table] = (tables[table] ?? []).filter((row) => !rows.includes(row))
              calls.deletes.push({ table, ids: rows.map((row) => row.AIInboxSuggestion_ID) })
            }
            if (query.operation === "insert") tables[table] = [...(tables[table] ?? []), query.data]
            return { data: query.single ? rows[0] ?? null : rows, error: null }
          }).then(resolve, reject)
        },
      }
      return chain
    },
    async rpc(name, args) {
      if (name === "multideck_inbox_claim_suggestion_jobs") return { data: [job], error: null }
      assert.equal(name, "multideck_inbox_complete_suggestion_job")
      calls.completions.push(args)
      return { data: job.job_id, error: null }
    },
    storage: { from: () => ({
      upload: async (path) => { calls.uploads.push(path); return { error: null } },
      remove: async () => ({ error: null }),
    }) },
  }
  const worker = load(workerCode, {
    "../inbox-api/core.ts": { cleanString, safeFileName: cleanString, safeMimeType: () => "application/pdf", base64Encode: (value) => Buffer.from(value).toString("base64") },
    "../inbox-api/runtime.ts": {
      hasPermission: async () => bookingRead,
      requirePermission: async (_db, actor, permission) => { assert.equal(permission, "Email.AIRead"); assert.equal(actor.companyId, "company-a"); if (!aiRead) throw new Error("permission_denied") },
      attachment: async () => { if (!providerReadable) throw new Error("attachment_not_found"); calls.downloads++; return { bytes: new Uint8Array([1, 2, 3]), fileName: "document.pdf", mimeType: "application/pdf" } },
    },
    "./customs-invoice-ocr.ts": { MISTRAL_OCR_MODEL: "test-ocr" },
    "./invoice-document-normalizer.ts": { prepareInvoiceDocument: async ({ bytes }) => ({ pdfBytes: bytes, pageCount: 1, conversion: "none" }) },
    "./model-gateway.ts": { governedModelFetch: async (_context, request) => {
      calls.model.push(request)
      if (modelError) throw new Error(modelError)
      return Response.json(request.provider === "mistral" ? { pages: [{ markdown: document }] } : { output_text: JSON.stringify(extracted) })
    } },
    "./inbox-freight-relevance.ts": load(policyCode),
    "./inbox-booking-match.ts": load(matchCode),
  })
  return { run: () => worker.processInboxSuggestionJobs(admin, 1), calls, tables }
}

const retail = {
  documentType: "commercial_invoice", documentCategory: "retail_purchase", freightRelevance: "irrelevant", relevanceConfidence: 0.99, freightEvidence: [],
}
const freightText = "Ocean freight charges for shipment 000143: GBP 950."
const freight = {
  documentType: "commercial_invoice", documentCategory: "freight_service", freightRelevance: "relevant", relevanceConfidence: 0.96,
  freightEvidence: [{ kind: "freight_service", source: "document", quote: freightText }],
}

for (const [name, subject, extracted, document] of [
  ["retail receipt", "Your Amazon invoice", retail, "Amazon receipt. USB cable £12. Shipping £4. VAT £3.20."],
  ["uncertain generic invoice", "Invoice 42", { ...retail, documentCategory: "uncertain", freightRelevance: "uncertain", relevanceConfidence: 0.55 }, "Invoice 42. Total £35."],
  ["hotel confirmation", "Booking confirmation", { ...retail, documentType: "booking_confirmation", documentCategory: "personal_booking" }, "Hotel booking confirmation. Arrival 3 September. Two nights."],
  ["EC membership invoice", "Entrepreneurs Circle invoice", { ...retail, documentCategory: "business_overhead" }, "Entrepreneurs Circle. Business membership. Invoice EC-29082026-211669. Total £118.80."],
]) {
  test(`${name}: the actual worker stops before storage, suggestion completion and watch creation`, async () => {
    const h = harness({ document, extracted, subject })
    const result = await h.run()
    assert.equal(result[0].status, "ignored")
    assert.equal(h.calls.model.length, 2, "one OCR and one extraction; no recurring classifier call")
    assert.equal(h.calls.uploads.length, 0)
    assert.equal(h.calls.completions.length, 0, "completion is the transaction that emits notifications and watch signals")
    assert.equal(h.tables.AI_InboxProcessingJobs[0].AIInboxJob_RelevanceJSON.version, "freight-relevance-v2")
    assert.equal(h.calls.deletes.some((item) => ["Comm_Messages", "Comm_MessageAttachments"].includes(item.table)), false)
  })
}

test("qualified freight reaches the existing atomic completion with evidence and an honest unmatched status", async () => {
  const h = harness({ document: freightText, extracted: freight, body: "Please review the attached ocean freight invoice." })
  assert.equal((await h.run())[0].status, "needs_match")
  assert.equal(h.calls.uploads.length, 1)
  assert.equal(h.calls.completions.length, 1)
  const suggestion = h.calls.completions[0].p_suggestion
  assert.equal(suggestion.model.relevanceVersion, "freight-relevance-v2")
  assert.equal(suggestion.evidence.freightRelevance.evidence[0].quote, freightText)
  assert.equal(suggestion.targetId, null)
  assert.deepEqual(h.calls.completions[0].p_fields, [])
  const modelInput = JSON.parse(h.calls.model[1].body.input[0].content[0].text)
  assert.equal(modelInput.emailContext.bodyText, "Please review the attached ocean freight invoice.")
  assert.equal(modelInput.emailContext.sender.address, "sender@shop.example")
})

const jobEmail = "Please use this supplier invoice for job reference JQ20015."
const unclearJobInvoice = {
  ...freight, documentCategory: "uncertain", freightRelevance: "uncertain", relevanceConfidence: 0.7, bookingReference: "JQ20015",
  freightEvidence: [{ kind: "job_reference", source: "email", quote: jobEmail }],
}

test("only an exact source-backed reference in the same company rescues an uncertain invoice", async () => {
  for (const [bookingCompany, expected] of [["company-a", "needs_match"], ["company-b", "ignored"]]) {
    const h = harness({ document: "Supplier invoice 009. Machinery £20,000.", extracted: unclearJobInvoice, body: jobEmail, booking: true, bookingCompany })
    assert.equal((await h.run())[0].status, expected)
    if (expected === "needs_match") assert.equal(h.calls.completions[0].p_suggestion.evidence.freightRelevance.verifiedBookingId, "booking-a")
  }
})

test("sender organisation alone cannot rescue an unrelated or unclear attachment", async () => {
  const h = harness({ document: "Invoice 5 for stationery.", extracted: { ...unclearJobInvoice, bookingReference: null, freightEvidence: [] }, booking: true })
  assert.equal((await h.run())[0].status, "ignored")
  assert.equal(h.calls.queries.some((query) => query.table === "Job_Header"), false)
})

test("a user without booking read access cannot use live records as relevance evidence", async () => {
  const h = harness({ document: "Supplier invoice 009.", extracted: unclearJobInvoice, body: jobEmail, booking: true, bookingRead: false })
  assert.equal((await h.run())[0].status, "ignored")
  assert.equal(h.calls.queries.some((query) => ["Job_Header", "Org_Contacts", "OrgContact_Emails"].includes(query.table)), false)
})

test("disabled automation and revoked access stop before OCR or model processing", async () => {
  for (const options of [{ enabled: false }, { aiRead: false }, { providerReadable: false }]) {
    const h = harness({ document: freightText, extracted: freight, ...options })
    assert.notEqual((await h.run())[0].status, "needs_match")
    assert.equal(h.calls.model.length, 0)
    assert.equal(h.calls.uploads.length, 0)
  }
})

test("rechecking an unrelated pending suggestion removes only the generated suggestion", async () => {
  const h = harness({ document: "Retail receipt.", extracted: retail, stale: true })
  assert.equal((await h.run())[0].status, "ignored")
  assert.equal(h.tables.AI_InboxSuggestedUpdates.length, 0)
  assert.equal(h.tables.Comm_Messages.length, 1)
  assert.equal(h.tables.Comm_MessageAttachments.length, 1)
  assert.equal(h.calls.completions.length, 0)
})

test("a recheck cannot remove or replace an applied or dismissed suggestion", async () => {
  for (const reviewed of ["applied", "dismissed", "applying"]) {
    const h = harness({ document: freightText, extracted: freight, reviewed })
    const result = await h.run()
    assert.equal(result[0].code, "inbox_suggestion_already_reviewed")
    assert.equal(h.tables.AI_InboxSuggestedUpdates[0].AIInboxSuggestion_StatusCode, reviewed)
    assert.equal(h.calls.uploads.length, 0)
    assert.equal(h.calls.completions.length, 0)
    assert.equal(h.calls.deletes.some((item) => ["Comm_Notifications", "AI_DexterWatchSignals", "DOC_StoredObjects"].includes(item.table)), false)
  }
})

test("OCR concurrency is retried without removing the existing suggestion; a real budget denial is not bypassed", async () => {
  for (const [modelError, expected] of [["ocr_concurrency_limit", "queued"], ["usage_allowance_reached", "failed"]]) {
    const h = harness({ document: freightText, extracted: freight, stale: true, modelError })
    await h.run()
    assert.equal(h.tables.AI_InboxProcessingJobs[0].AIInboxJob_StatusCode, expected)
    assert.equal(h.tables.AI_InboxSuggestedUpdates.length, 1)
    assert.equal(h.calls.completions.length, 0)
  }
})
