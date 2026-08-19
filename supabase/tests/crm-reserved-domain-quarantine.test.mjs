import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260818145200_crm_reserved_domain_fixture_quarantine.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");

test("reserved .example contacts quarantine their CRM account without deleting history", () => {
  assert.match(migration, /update public\."CRM_AccountProfiles" as account/i);
  assert.match(migration, /"CRMAccount_IsDeleted" = false/i);
  assert.match(migration, /lower\(btrim\(email\."OrgContactEmail_Email"\)\) like '%\.example'/i);
  assert.match(migration, /'developmentFixture', true/i);
  assert.match(migration, /'quarantineReason', 'reserved_example_contact_domain'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\."CRM_AccountProfiles"/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\."Org_Contacts"/i);
});

test("quarantine reuses the existing fixture visibility boundary", () => {
  assert.match(
    migration,
    /coalesce\(account\."CRMAccount_MetadataJSON"\s*->>\s*'developmentFixture',\s*'false'\)/i,
  );
  assert.match(migration, /'source', 'reserved_domain_quarantine'/i);
});
