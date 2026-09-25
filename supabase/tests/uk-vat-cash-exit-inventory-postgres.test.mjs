import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const migrations = [
  new URL("../migrations/20260925113000_uk_vat_cash_exit_invoice_inventory.sql", import.meta.url).pathname,
  new URL("../migrations/20260925114500_uk_vat_cash_exit_price_change_guard.sql", import.meta.url).pathname,
]
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

test("Cash exit inventory includes wholly unpaid invoices and rejects unsupported source", () => {
  const bin = process.env.PG_TEST_BIN || "/opt/homebrew/opt/postgresql@17/bin"
  const dir = mkdtempSync(join(tmpdir(), "uk-vat-cash-exit-inventory-"))
  const args = ["-X", "-qAt", "-h", dir, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
  let started = false
  const command = (name, input) => spawnSync(join(bin, name), name === "psql" ? args : input,
    { input: name === "psql" ? input : undefined, encoding: "utf8", timeout: 30000 })
  const sql = (statement) => {
    const result = command("psql", statement)
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const reject = (statement, expected) => {
    const result = command("psql", statement)
    assert.notEqual(result.status, 0, result.stdout)
    assert.match(result.stderr, expected)
  }
  try {
    const init = command("initdb", ["-D", join(dir, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    assert.equal(init.status, 0, init.stderr)
    const start = command("pg_ctl", ["-D", join(dir, "data"), "-l", join(dir, "log"), "-o", `-k ${dir} -c listen_addresses=''`, "-w", "start"])
    assert.equal(start.status, 0, start.stderr)
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create function public._multideck_uk_vat_read_access(actor uuid, entity uuid)
      returns void language plpgsql as $$ begin
        if actor<>'${id(1)}' or entity<>'${id(2)}' then
          raise exception 'VAT access denied';
        end if;
      end $$;
      create table public."cmp_LegalEntities"(
        "LegalEntity_ID" uuid primary key,"LegalEntity_CountryCode" text,
        "LegalEntity_BaseCurrencyCodeSnapshot" text);
      create table public."FIN_Documents"(
        "FINDoc_ID" uuid primary key,"FINDoc_LegalEntityID" uuid,
        "FINDoc_TypeCode" text,"FINDoc_DocumentDate" date,
        "FINDoc_NativePostingStatusCode" text,"FINDoc_NativePostedAt" timestamptz,
        "FINDoc_NativePostingBatchID" uuid,"FINDoc_CurrencyCodeSnapshot" text,
        "FINDoc_ExchangeRate" numeric,"FINDoc_GrossAmount" numeric,
        "FINDoc_LocalGrossAmount" numeric);
      create table public."FIN_CashTransactions"(
        "FINCash_ID" uuid primary key,"FINCash_LegalEntityID" uuid,
        "FINCash_NativePostingStatusCode" text,"FINCash_NativePostedAt" timestamptz,
        "FINCash_CurrencyCodeSnapshot" text,"FINCash_TypeCode" text);
      create table public."FIN_CashAllocations"(
        "FINCashAlloc_ID" uuid primary key,"FINCashAlloc_DocumentID" uuid,
        "FINCashAlloc_CashID" uuid,"FINCashAlloc_DocumentLineID" uuid,
        "FINCashAlloc_AllocationStatusCode" text,"FINCashAlloc_AllocatedAmount" numeric,
        "FINCashAlloc_AllocatedAt" timestamptz);
      create table public."FIN_IndirectTaxCashPaymentDateReviews"(
        cash_id uuid,legal_entity_id uuid,revision integer,vat_payment_date date);
      insert into public."cmp_LegalEntities" values
        ('${id(2)}','GB','GBP'),('${id(3)}','US','USD');
      insert into public."FIN_Documents" values
        ('${id(10)}','${id(2)}','sl_invoice','2026-01-10','posted','2026-01-10 12:00Z','${id(20)}','GBP',1,120,120),
        ('${id(11)}','${id(2)}','pl_invoice','2026-02-10','posted','2026-02-10 12:00Z','${id(21)}','GBP',1,240,240),
        ('${id(12)}','${id(2)}','sl_invoice','2026-02-12','posted','2026-02-12 12:00Z','${id(22)}','EUR',1.2,120,144),
        ('${id(13)}','${id(2)}','sl_invoice','2026-02-15','draft',null,null,'GBP',1,50,50),
        ('${id(14)}','${id(3)}','sl_invoice','2026-02-18','posted','2026-02-18 12:00Z','${id(23)}','GBP',1,999,999);
      insert into public."FIN_CashTransactions" values
        ('${id(30)}','${id(2)}','posted','2026-03-01 12:00Z','GBP','supplier_payment'),
        ('${id(31)}','${id(2)}','posted','2026-04-01 12:00Z','GBP','supplier_payment');
      insert into public."FIN_CashAllocations" values
        ('${id(40)}','${id(11)}','${id(30)}',null,'allocated',60,'2026-03-01 12:00Z'),
        ('${id(41)}','${id(11)}','${id(31)}',null,'allocated',40,'2026-04-01 12:00Z');
      insert into public."FIN_IndirectTaxCashPaymentDateReviews" values
        ('${id(30)}','${id(2)}',1,'2026-03-01'),
        ('${id(31)}','${id(2)}',1,'2026-04-01');`)
    for (const migration of migrations) {
      const apply = spawnSync(join(bin, "psql"), [...args, "-f", migration],
        { encoding: "utf8", timeout: 30000 })
      assert.equal(apply.status, 0, apply.stderr)
    }
    const call = `public.multideck_uk_vat_cash_exit_invoice_inventory('${id(1)}','${id(2)}','2026-01-01','2026-03-31')`
    const result = JSON.parse(sql(`select ${call};`))
    assert.equal(result.invoiceCount, 3)
    assert.equal(result.allocationCount, 2)
    assert.equal(result.postedPriceChangeCount, 0)
    assert.equal(result.requiresPriceChangeReview, false)
    assert.equal(result.unpostedInvoiceCount, 1)
    assert.equal(result.truncated, false)
    assert.match(result.sourceDigest, /^[0-9a-f]{64}$/)
    const byId = new Map(result.invoices.map((invoice) => [invoice.invoice_id, invoice]))
    assert.equal(byId.get(id(10)).paid_through_exit, 0)
    assert.equal(byId.get(id(10)).candidate_outstanding, 120)
    assert.equal(byId.get(id(11)).paid_through_exit, 60)
    assert.equal(byId.get(id(11)).candidate_outstanding, 180)
    assert.equal(byId.get(id(11)).future_allocation_count, 1)
    assert.equal(byId.get(id(11)).allocation_sources.length, 2)
    assert.equal(byId.get(id(12)).source_exception, true)
    sql(`insert into public."FIN_CashTransactions" values
      ('${id(32)}','${id(2)}','posted','2026-03-05 12:00Z','GBP','customer_receipt');
      insert into public."FIN_CashAllocations" values
      ('${id(42)}','${id(10)}','${id(32)}',null,'allocated',20,'2026-03-05 12:00Z');`)
    const changed = JSON.parse(sql(`select ${call};`))
    assert.notEqual(changed.sourceDigest, result.sourceDigest)
    assert.equal(changed.allocationCount, 3)
    assert.equal(changed.invoices.find((invoice) => invoice.invoice_id === id(10)).unsupported_allocation_count, 1)
    assert.equal(changed.invoices.find((invoice) => invoice.invoice_id === id(10)).source_exception, true)
    sql(`insert into public."FIN_Documents" values
      ('${id(15)}','${id(2)}','credit_note','2026-03-15','posted',
        '2026-03-15 12:00Z','${id(25)}','GBP',1,-12,-12);`)
    const changedPrice = JSON.parse(sql(`select ${call};`))
    assert.equal(changedPrice.postedPriceChangeCount, 1)
    assert.equal(changedPrice.requiresPriceChangeReview, true)
    assert.equal(changedPrice.priceChanges[0].document_id, id(15))
    assert.notEqual(changedPrice.sourceDigest, changed.sourceDigest)
    reject(`select public.multideck_uk_vat_cash_exit_invoice_inventory('${id(4)}','${id(2)}','2026-01-01','2026-03-31');`, /VAT access denied/)
    reject(`select public.multideck_uk_vat_cash_exit_invoice_inventory('${id(1)}','${id(3)}','2026-01-01','2026-03-31');`, /VAT access denied/)
    reject(`set role authenticated; select ${call};`, /permission denied/)
    sql(`insert into public."FIN_Documents"
      select gen_random_uuid(),'${id(2)}','sl_invoice','2026-03-10','posted',
        '2026-03-10 12:00Z','${id(24)}','GBP',1,120,120
      from generate_series(1,998);`)
    const bounded = JSON.parse(sql(`select ${call};`))
    assert.equal(bounded.invoiceCount, 1001)
    assert.equal(bounded.truncated, true)
    assert.deepEqual(bounded.invoices, [])
  } finally {
    if (started) spawnSync(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-m", "immediate", "-w", "stop"],
      { encoding: "utf8", timeout: 30000 })
    rmSync(dir, { recursive: true, force: true })
  }
})
