import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260925143000_uk_vat_cash_control_journal_inventory.sql", import.meta.url), "utf8")
const pgBin = process.env.PG_TEST_BIN ?? "/opt/homebrew/opt/postgresql@17/bin"
const id = (last) => `00000000-0000-0000-0000-${String(last).padStart(12, "0")}`

test("Cash control journal inventory verifies source tax postings and catches orphan and altered lines", () => {
  const directory = mkdtempSync(join(tmpdir(), "multideck-cash-journal-"))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(pgBin, name), args, { input, encoding: "utf8", timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const sql = (input) => run("psql", ["-X", "-qAt", "-h", directory, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input)
  const inventory = () => JSON.parse(sql(`select public.multideck_uk_vat_cash_control_source_inventory('${id(1)}','${id(2)}','${id(3)}','${id(4)}')`))
  try {
    run("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "log"), "-o", `-k ${directory} -c listen_addresses=''`, "-w", "start"])
    started = true
    sql(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create table public."FIN_PostingBatches" ("FINPostBatch_ID" uuid primary key,"FINPostBatch_StatusCode" text,"FINPostBatch_LegalEntityID" uuid);
      create table public."FIN_IndirectTaxEvidence" (id uuid primary key,legal_entity_id uuid,jurisdiction_code text,source_kind text,source_document_id uuid,source_document_line_id uuid,source_posting_batch_id uuid,signed_tax_reporting numeric);
      create table public."FIN_IndirectTaxDecisions" (id uuid primary key,evidence_id uuid,scheme_code text,tax_code_id uuid);
      create table public."FIN_DocumentLines" ("FINDocLine_ID" uuid primary key,"FINDocLine_DocumentID" uuid,"FINDocLine_NominalAccountID" uuid);
      create table public."FIN_TaxCodes" ("FINTax_ID" uuid primary key,"FINTax_LegalEntityID" uuid,"FINTax_OutputNominalID" uuid,"FINTax_InputNominalID" uuid,"FINTax_IsRecoverable" boolean);
      create table public."FIN_PostingLines" ("FINPostLine_ID" uuid primary key,"FINPostLine_BatchID" uuid,"FINPostLine_DocumentID" uuid,"FINPostLine_DocumentLineID" uuid,"FINPostLine_Description" text,"FINPostLine_DebitAmount" numeric,"FINPostLine_CreditAmount" numeric,"FINPostLine_CurrencyCodeSnapshot" text,"FINPostLine_NominalAccountID" uuid);
      create function public._multideck_finance_resolve_nominal(uuid,uuid,text) returns uuid language sql as $$ select $2 $$;
      create function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
      returns jsonb language sql stable as $$ select jsonb_build_object(
        'truncated',false,'sourceDigest',repeat('a',64),
        'invoiceInventory',jsonb_build_object('invoices',jsonb_build_array(jsonb_build_object(
          'invoice_id','${id(5)}','document_type','sl_invoice','posting_batch_id','${id(6)}',
          'lines',jsonb_build_array(jsonb_build_object('lineId','${id(7)}',
            'evidenceId','${id(8)}','decisionId','${id(9)}',
            'treatment','domestic_sale','vatGbp','20.0000')))))) $$;
      insert into public."FIN_PostingBatches" values ('${id(6)}','posted','${id(2)}');
      insert into public."FIN_IndirectTaxEvidence" values ('${id(8)}','${id(2)}','GB','posted_document_line','${id(5)}','${id(7)}','${id(6)}',20);
      insert into public."FIN_IndirectTaxDecisions" values ('${id(9)}','${id(8)}','cash','${id(10)}');
      insert into public."FIN_DocumentLines" values ('${id(7)}','${id(5)}','${id(11)}');
      insert into public."FIN_TaxCodes" values ('${id(10)}','${id(2)}','${id(12)}',null,true);
      insert into public."FIN_PostingLines" values ('${id(13)}','${id(6)}','${id(5)}','${id(7)}','Tax: output VAT',0,20,'GBP','${id(12)}');
    `)
    sql(migration)
    let result = inventory()
    assert.equal(result.journalEvidence.status, "invoice_journals_matched")
    assert.equal(result.journalEvidence.lineCount, 1)
    assert.equal(result.journalEvidence.lines[0].postedVatGbp, "20")
    assert.match(result.sourceDigest, /^[a-f0-9]{64}$/)
    assert.equal(result.returnReady, false)
    assert.equal(sql(`select has_function_privilege('authenticated','public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)','EXECUTE')`), "f")
    assert.equal(sql(`select has_function_privilege('service_role','public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)','EXECUTE')`), "t")
    sql(`update public."FIN_PostingLines" set "FINPostLine_CreditAmount"=19 where "FINPostLine_ID"='${id(13)}'`)
    result = inventory()
    assert.equal(result.journalEvidence.status, "blocked")
    assert.equal(result.journalEvidence.unmatchedLines, 1)
    sql(`update public."FIN_PostingLines" set "FINPostLine_CreditAmount"=20 where "FINPostLine_ID"='${id(13)}'`)
    sql(`insert into public."FIN_PostingLines" values ('${id(14)}','${id(6)}','${id(5)}',null,'Tax: orphan',0,5,'GBP','${id(12)}')`)
    result = inventory()
    assert.equal(result.journalEvidence.status, "blocked")
    assert.equal(result.journalEvidence.orphanTaxPostings, 1)
    sql(`delete from public."FIN_PostingLines" where "FINPostLine_ID"='${id(14)}'`)
    sql(`update public."FIN_PostingBatches" set "FINPostBatch_LegalEntityID"='${id(99)}'`)
    assert.equal(inventory().journalEvidence.status, "blocked")
  } finally {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
