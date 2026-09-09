import {
  canApplyStatus,
  constantTimeEqual,
  isBoundedPdf,
  MAX_WEBHOOK_BYTES,
  normalizedLifecycle,
  parseWebhook,
  readBoundedBody,
  WebhookInputError,
} from "./core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fakePdf() {
  return new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
}

Deno.test("secret comparison rejects length and value differences", () => {
  assert(constantTimeEqual("tenant-secret", "tenant-secret"), "Expected equal secrets.");
  assert(!constantTimeEqual("tenant-secret", "tenant-secreu"), "Expected different secrets to fail.");
  assert(!constantTimeEqual("tenant-secret", "tenant-secret-long"), "Expected different lengths to fail.");
});

Deno.test("captured JSON is normalized and its inline PDF is redacted", async () => {
  const pdf = fakePdf();
  let binary = "";
  for (const byte of pdf) binary += String.fromCharCode(byte);
  const body = new TextEncoder().encode(JSON.stringify({
    event_id: "evt-1",
    event_type: "declaration.accepted",
    co_relation_id: "corr-1",
    status: "accepted",
    mrn: "26GB123",
    declaration_document: btoa(binary),
    file_name: "Acceptance.pdf",
  }));
  const parsed = await parseWebhook(body, "application/json", new Headers());
  assert(parsed.eventId === "evt-1", "Expected provider event ID.");
  assert(parsed.correlationId === "corr-1", "Expected exact correlation ID.");
  assert(parsed.providerStatus === "accepted", "Expected accepted status.");
  assert(parsed.documentBytes?.byteLength === pdf.byteLength, "Expected decoded PDF.");
  assert(!parsed.documentUrl, "Expected no document URL for inline PDF.");
  assert(String(parsed.sanitizedPayload.declaration_document).startsWith("[redacted:"), "Expected PDF redaction.");
});

Deno.test("observed iCustoms PDF URL remains redacted and is classified as a document", async () => {
  const body = new TextEncoder().encode(JSON.stringify({
    co_relation_ID: "corr-pdf-1",
    MRN: "26GB98GC3CF7FGPAA1",
    PDF: "https://icustoms.s3.eu-west-2.amazonaws.com/private/example.pdf?signature=redacted",
    Product: "CDS",
  }));
  const parsed = await parseWebhook(body, "application/json", new Headers());
  assert(parsed.eventType === "declaration_document", "Expected PDF URL event classification.");
  assert(parsed.documentUrl.startsWith("https://"), "Expected the private download URL in memory.");
  assert(String(parsed.sanitizedPayload.PDF).startsWith("[redacted:"), "Expected signed URL redaction.");
});

Deno.test("raw PDF requires a real header and EOF marker", async () => {
  const valid = fakePdf();
  assert(isBoundedPdf(valid), "Expected valid bounded PDF.");
  const parsed = await parseWebhook(valid, "application/pdf", new Headers({
    "x-correlation-id": "corr-2",
    "x-event-id": "evt-2",
  }));
  assert(parsed.documentBytes?.byteLength === valid.byteLength, "Expected raw PDF.");
  assert(!isBoundedPdf(new TextEncoder().encode("%PDF-not-complete")), "Expected incomplete PDF rejection.");
});

Deno.test("observed iCustoms CDS notification contract decodes the HMRC lifecycle safely", async () => {
  const xml = [
    "<MetaData>",
    "<WCOTypeName>RES</WCOTypeName>",
    "<FunctionCode>03</FunctionCode>",
    "<ValidationCode>CDS12062</ValidationCode>",
    "</MetaData>",
  ].join("");
  const payload = btoa(xml);
  const body = new TextEncoder().encode(JSON.stringify({
    co_relation_ID: "corr-observed-1",
    notification_ID: "notice-observed-1",
    MRN: "26GB98FZM8G7C12AA2",
    notification_issue_time: "21/08/26 03:47:07 PM",
    payload,
    Product: "CDS",
  }));
  const parsed = await parseWebhook(body, "application/json", new Headers());
  assert(parsed.correlationId === "corr-observed-1", "Expected observed correlation field.");
  assert(parsed.eventId === "notice-observed-1", "Expected observed notification field.");
  assert(parsed.eventType === "hmrc_notification", "Expected an HMRC notification event.");
  assert(parsed.providerStatus === "rejected", "Expected FunctionCode 03 to normalize as rejected.");
  assert(parsed.eventCode === "CDS12062", "Expected the validation code from Base64 XML.");
  assert(parsed.documentBytes === null, "Expected notification XML not to be mistaken for a PDF.");
  assert(String(parsed.sanitizedPayload.payload) === `[redacted:${payload.length}]`, "Expected Base64 payload redaction.");
});

Deno.test("malformed JSON and oversized bodies fail safely", async () => {
  let malformed = false;
  try {
    await parseWebhook(new TextEncoder().encode("{"), "application/json", new Headers());
  } catch (error) {
    malformed = error instanceof WebhookInputError && error.status === 400;
  }
  assert(malformed, "Expected malformed body failure.");
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "content-length": String(MAX_WEBHOOK_BYTES + 1) },
    body: "x",
  });
  let oversized = false;
  try {
    await readBoundedBody(request);
  } catch (error) {
    oversized = error instanceof WebhookInputError && error.status === 413;
  }
  assert(oversized, "Expected oversized body failure.");
});

Deno.test("status normalization prevents terminal-state downgrades", () => {
  assert(normalizedLifecycle("released") === "accepted", "Expected released to remain accepted internally.");
  assert(!canApplyStatus("accepted", "acknowledged"), "Expected out-of-order downgrade rejection.");
  assert(canApplyStatus("submitted", "accepted"), "Expected accepted progression.");
  assert(canApplyStatus("submitted", "rejected"), "Expected rejected completion.");
});
