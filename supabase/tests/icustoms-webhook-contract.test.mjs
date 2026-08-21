import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the iCustoms receiver owns authentication, limits and redacted capture", async () => {
  const source = await read("../functions/icustoms-webhook/index.ts");
  const core = await read("../functions/icustoms-webhook/core.ts");
  const config = await read("../config.toml");
  assert.match(config, /\[functions\.icustoms-webhook\][\s\S]*verify_jwt = false/);
  assert.match(source, /ICUSTOMS_WEBHOOK_SECRET/);
  assert.match(source, /routeSecret\(request\)/);
  assert.match(source, /constantTimeEqual\(supplied, expected\)/);
  assert.match(core, /MAX_WEBHOOK_BYTES = 50 \* 1024 \* 1024/);
  assert.match(core, /readBoundedBody/);
  assert.match(core, /secret\|token\|signature\|authorization\|password\|document\|pdf/);
  assert.match(source, /ICUSTOMS_WEBHOOK_CAPTURE_MODE/);
  assert.match(source, /ICUSWH_RawStoragePath/);
  assert.doesNotMatch(source, /console\.(?:info|error)\([^\n]*(?:rawJson|documentBytes|sanitizedPayload)/);
});

test("deliveries are exact-match, idempotent and quarantine unsafe events", async () => {
  const source = await read("../functions/icustoms-webhook/index.ts");
  const migration = await read("../migrations/20260821125644_icustoms_webhook_documents.sql");
  assert.match(migration, /UX_ICUS_WebhookEvents_delivery/);
  assert.match(migration, /revoke all on table public\."ICUS_WebhookEvents" from public, anon, authenticated/);
  assert.match(source, /\.eq\("ICUSS_iCustomsDeclarationID", correlationId\)/);
  assert.match(source, /new Set\(/);
  assert.match(source, /row\.ICUSS_CustomsID/);
  assert.match(source, /declarationIds\.size !== 1/);
  assert.match(source, /return rows\[0\]/);
  assert.doesNotMatch(source, /\(data \?\? \[\]\)\.length !== 1/);
  assert.match(source, /correlation_missing/);
  assert.match(source, /correlation_unmatched/);
  assert.match(source, /\["processed", "quarantined"\]/);
  assert.match(source, /canApplyStatus/);
  assert.match(migration, /UX_ICUS_SubmissionEvents_webhook_event/);
});

test("validated PDFs are private, immutable, checksummed and retained", async () => {
  const source = await read("../functions/icustoms-webhook/index.ts");
  const core = await read("../functions/icustoms-webhook/core.ts");
  const migration = await read("../migrations/20260821125644_icustoms_webhook_documents.sql");
  assert.match(core, /prefix === "%PDF-" && suffix\.includes\("%%EOF"\)/);
  assert.match(source, /const fileHash = await sha256\(bytes\)/);
  assert.match(source, /CUSTD_SourceCode: "icustoms_webhook"/);
  assert.match(source, /CUSTD_FileSHA256: fileHash/);
  assert.match(source, /retainUntil\.setUTCFullYear\(retainUntil\.getUTCFullYear\(\) \+ 7\)/);
  assert.match(source, /CUSTD_IsOfficial: providerEnvironment === "production"/);
  assert.match(migration, /TR_Customs_DeclarationDocuments_immutable/);
});

test("provider PDF URLs are fetched server-side and captured deliveries can only be replayed by an authorised user", async () => {
  const webhook = await read("../functions/icustoms-webhook/index.ts");
  const api = await read("../functions/icustoms-api/index.ts");
  assert.match(webhook, /current\.protocol !== "https:" \|\| !allowedDocumentHost\(current\.hostname\)/);
  assert.match(webhook, /host\.endsWith\("\.customscloud\.co"\)/);
  assert.match(webhook, /host\.endsWith\("\.amazonaws\.com"\)/);
  assert.match(webhook, /redirect: "manual"/);
  assert.match(webhook, /await authenticate\(request, admin\)/);
  assert.match(webhook, /customs_declaration_authorised/);
  assert.match(webhook, /parsed\.bodyHash !== safeText\(delivery\.ICUSWH_BodySHA256/);
  assert.match(webhook, /bucket !== WEBHOOK_CAPTURE_BUCKET/);
  assert.doesNotMatch(webhook, /does not contain a declaration document/);
  assert.match(api, /ICUSWH_SignatureVerified/);
  assert.match(api, /\.neq\("ICUSWH_ProcessStatus", "processed"\)/);
  assert.match(api, /icustoms-webhook\/replay/);
  assert.doesNotMatch(webhook, /console\.(?:info|error)\([^\n]*(?:documentUrl|RawStoragePath)/);
});

test("operator notifications and Dexter fields are event-driven", async () => {
  const source = await read("../functions/icustoms-webhook/index.ts");
  const migration = await read("../migrations/20260821125644_icustoms_webhook_documents.sql");
  assert.match(source, /CUST_AssignedUserID/);
  assert.match(source, /Auth_User_ID/);
  assert.match(source, /Declaration accepted — document ready/);
  assert.match(source, /Declaration document ready/);
  assert.match(source, /\?tab=review/);
  assert.match(migration, /documentAvailable/);
  assert.match(migration, /documentReceivedAt/);
  assert.match(migration, /AI_DexterWatchSignals/);
  assert.doesNotMatch(source, /setInterval|OpenAI|chat\.completions|responses\.create/);
});

test("tenant provisioning baseline includes the webhook and document boundary", async () => {
  const baseline = await read("../baseline/public-schema.sql");
  assert.match(baseline, /iCustoms webhook delivery and declaration-document provisioning parity/);
  assert.match(baseline, /CUST_DeclarationDocumentID/);
  assert.match(baseline, /UX_ICUS_WebhookEvents_delivery/);
  assert.match(baseline, /revoke all on table public\."ICUS_WebhookEvents" from public, anon, authenticated/);
});

test("pre-webhook provider PDF recovery has honest, distinct provenance", async () => {
  const migration = await read("../migrations/20260821173000_allow_icustoms_provider_recovery_documents.sql");
  const baseline = await read("../baseline/public-schema.sql");
  assert.match(migration, /icustoms_provider_recovery/);
  assert.match(migration, /must never be presented as a webhook delivery/);
  assert.match(baseline, /icustoms_provider_recovery/);
});
