import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appRoot = new URL("../../", import.meta.url)
const readApp = (path) => readFile(new URL(path, appRoot), "utf8")

const [migration, paddingFix, alphabeticMigration, quoteWorkflow, dexter] = await Promise.all([
  readApp("supabase/migrations/20260820200000_reference_rule_safety_and_dexter.sql"),
  readApp("supabase/migrations/20260820205032_fix_reference_rule_padding_and_prefix.sql"),
  readApp("supabase/migrations/20260820220223_alphabetic_reference_sequences.sql"),
  readApp("supabase/functions/quotes-workflow/index.ts"),
  readApp("supabase/functions/agent-dexter/index.ts"),
])

test("existing quote, booking and customer references are reserved before counters restart", () => {
  assert.match(migration, /create table if not exists quote_api\.reference_reservations/)
  assert.match(migration, /primary key \(company_id, normalized_reference\)/)
  assert.match(migration, /from public\."CusQuote_Header" quote/)
  assert.match(migration, /from public\."Job_Header" job/)
  assert.match(migration, /from public\."CRM_AccountProfiles" profile/)
  assert.match(migration, /quote_next_number = 1/)
  assert.match(migration, /customer_next_number = 1/)
  assert.match(migration, /next_number = 1/)
  assert.match(migration, /'\{NUMBER:4\}'/)
})

test("the allocator serialises each sequence and skips every existing collision", () => {
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /loop[\s\S]*candidate_number := candidate_number \+ 1/)
  assert.match(migration, /upper\(btrim\(quote\."CusQuoteHeader_CustomerReference"\)\) = upper\(btrim\(candidate_reference\)\)/)
  assert.match(migration, /upper\(btrim\(job\."Job_BookingReference"\)\) = upper\(btrim\(candidate_reference\)\)/)
  assert.match(migration, /upper\(btrim\(organisation\."Org_AccCode"\)\) = upper\(btrim\(candidate_reference\)\)/)
  assert.match(migration, /on conflict \(company_id, normalized_reference\) do nothing/)
  assert.match(migration, /return query select reserved_reference, candidate_number \+ 1/)
})

test("number padding never truncates the continuous sequence", () => {
  assert.match(paddingFix, /greatest\(token_width, length\(reference_number::text\)\)/)
  assert.doesNotMatch(paddingFix, /lpad\(reference_number::text, token_width, '0'\)/)
  assert.doesNotMatch(paddingFix, /right\(\s*reference_number::text|substring\(\s*reference_number::text/i)
  assert.match(migration, /number_tokens <> 1/)
  assert.match(migration, /Every reference rule needs one continuous number/)
  assert.match(migration, /literal_text ~ '\[\{\}\]'/)
  assert.doesNotMatch(migration, /cleaned ~ '\\\{\[\^\}\]'/)
})

test("each rule can use one unbounded numeric or alphabetic sequence", () => {
  assert.match(alphabeticMigration, /\{\(\?:NUMBER\|LETTERS\)\(\?::\[0-9\]/)
  assert.match(alphabeticMigration, /counter_tokens <> 1/)
  assert.match(alphabeticMigration, /counter_kind = 'NUMBER'/)
  assert.match(alphabeticMigration, /alphabetic_value := reference_number - 1/)
  assert.match(alphabeticMigration, /alphabetic_value % 26/)
  assert.match(alphabeticMigration, /greatest\(token_width, length\(replacement\)\)/)
  assert.doesNotMatch(alphabeticMigration, /mod\([^)]*,\s*26\)\s*=\s*0[\s\S]*AAAA/i)
})

test("quote, booking and customer creation all use the shared reservation boundary", () => {
  assert.match(migration, /quote_api\.reserve_reference\(\s*workspace_company_id, 'quote'/)
  assert.match(migration, /quote_api\.reserve_reference\(\s*workspace_company_id, 'booking'/)
  assert.match(migration, /quote_api\.reserve_reference\(\s*workspace_company_id, 'customer'/)
  assert.match(migration, /Customer references must stay within the eight-character account-code limit/)
})

test("the CRM wrapper preserves the tenant's current account-creation implementation", () => {
  assert.match(migration, /alter function public\.multideck_crm_create_account\(uuid, jsonb\)[\s\S]*rename to _multideck_crm_create_account_pre_reference_rules_20260820/)
  assert.match(migration, /public\._multideck_crm_create_account_pre_reference_rules_20260820\(p_actor_user_id, p_input\)/)
  assert.doesNotMatch(migration, /_multideck_crm_create_account_pre_sage8_20260820/)
})

test("saving a recipe preserves legacy prefixes and removes the obsolete RPC overload", () => {
  assert.match(migration, /drop function if exists public\.quote_workflow_save_reference_settings\(uuid, text, bigint, jsonb\)/)
  const conflictUpdate = migration.slice(migration.indexOf("on conflict (company_id) do update set", migration.indexOf("create or replace function public.quote_workflow_save_reference_settings")))
  assert.doesNotMatch(conflictUpdate, /quote_prefix = excluded\.quote_prefix/)
  assert.match(migration, /coalesce\(nullif\(left\(split_part\(normalized_quote_pattern, '\{', 1\), 12\), ''\), 'Q'\)/)
  assert.match(paddingFix, /set quote_prefix = left\(split_part\(quote_pattern, '\{', 1\), 12\)/)
})

test("Dexter drafts one safe numeric or alphabetic sequence and keeps read, write and watch parity", () => {
  assert.match(quoteWorkflow, /exactly one counter: NUMBER or LETTERS, never both/)
  assert.match(quoteWorkflow, /LETTERS is an unbounded alphabetic sequence/)
  assert.match(quoteWorkflow, /Refuse requests based only on random values, dates, names/)
  assert.match(alphabeticMigration, /sys_AIDexterDataDomains/)
  assert.match(alphabeticMigration, /sys_AIDexterActions/)
  assert.match(migration, /multideck_dexter_domain_reference_settings/)
  assert.match(migration, /multideck_dexter_action_update_reference_settings/)
  assert.match(migration, /AI_DexterWatchSignals/)
  assert.match(dexter, /reference_settings/)
})

test("privileged reference operations remain service-role only", () => {
  for (const signature of [
    "quote_api.reserve_reference(uuid, text, text, text, bigint)",
    "quote_api.allocate_customer_reference(uuid)",
    "public.quote_workflow_save_reference_settings(uuid, text, bigint, jsonb, text, bigint)",
    "public.multideck_crm_create_account(uuid, jsonb)",
    "public.multideck_dexter_action_update_reference_settings(uuid, uuid, jsonb)",
  ]) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\ ", "\\s*")
    assert.match(migration, new RegExp(`revoke all on function ${escaped} from public, anon, authenticated`))
  }
  assert.match(migration, /grant execute on function public\.quote_workflow_save_reference_settings\(uuid, text, bigint, jsonb, text, bigint\) to service_role/)
})
