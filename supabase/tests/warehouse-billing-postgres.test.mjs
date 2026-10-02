import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { reportingDexterFixture } from "./reporting-dexter-fixture.mjs"

// Real pricing cards plus the real billing foundation, run against baseline
// warehouse tables. Proves settings validation and audit, cut-off stock
// records, charge calculation from actual events, and access boundaries.
const bin = process.env.PG_TEST_BIN || execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const migration = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8")
const baseline = readFileSync(new URL("../baseline/public-schema.sql", import.meta.url), "utf8")
const table = name => {
  const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
  assert.ok(start >= 0, name)
  return baseline.slice(start, baseline.indexOf("\n);", start) + 3)
}

test("warehouse billing settings, cut-off stock records and charge statements", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "warehouse-billing-"))
  const port = "55498"
  const run = (cmd, args) => execFileSync(path.join(bin, cmd), args, { encoding: "utf8", stdio: "pipe" })
  const sql = input => execFileSync(path.join(bin, "psql"), ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", port, "-d", "postgres"], { input, encoding: "utf8", stdio: "pipe" })
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
  const as = (actor, expression) => {
    const output = sql(`set role authenticated;set request.jwt.claim.sub='${actor}';select ${expression}`).trim()
    return output ? JSON.parse(output) : null
  }
  let started = false
  try {
    run("initdb", ["-D", path.join(dir, "data"), "-A", "trust", "--no-locale", "-E", "UTF8"])
    run("pg_ctl", ["-D", path.join(dir, "data"), "-l", path.join(dir, "postgres.log"), "-o", `-k ${dir} -h '' -p ${port}`, "-w", "start"])
    started = true
    sql(`create role authenticated; create role anon; create schema auth; create schema booking_api;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table "cmp_Company" ("Company_ID" uuid primary key);
      create table "cmp_Users" ("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text,permissions text[]);
      create table "Org_Master" ("Org_id" uuid primary key,"Org_Name" text);
      create function booking_api.has_permission(caller uuid,p text) returns boolean language sql stable security definer as $$
        select coalesce((select p=any(permissions) and "User_AccessStatus"='active' from public."cmp_Users" where "Auth_User_ID"=caller),false) $$;
      create function public.multideck_crm_company_can_access_account(uuid,uuid) returns boolean language sql stable as $$select true$$;
      ${["cmp_Offices", "cmp_Users_Offices", "WMS_Facilities", "WMS_Items", "WMS_HandlingUnits", "WMS_Orders", "WMS_Receipts", "WMS_ReceiptLines",
        "WMS_Dispatches", "WMS_InventoryTransactions", "WMS_InventoryBalances"].map(table).join("\n")}`)
    sql("create role service_role")
    sql(migration("20260922160000_warehouse_pricing_cards"))
    sql(migration("20260930150000_warehouse_billing_foundation"))
    sql(migration("20260907220000_reporting_workspace"))
    sql(reportingDexterFixture().replace("create role service_role;", ""))
    sql(migration("20260930150100_warehouse_billing_dexter"))

    // Company 100: London office 501 (facility 601) and Leeds office 502 (602). Company 200 is foreign.
    // 1 manager (read+write), 2 read-only colleague, 3 Leeds-only, 4 no warehouse access, 5 foreign, 6 inactive.
    sql(`insert into "cmp_Company" values('${id(100)}'),('${id(200)}');
      insert into "cmp_Users" values
        ('${id(1)}','${id(11)}','${id(100)}','active',array['Warehouse.Read','Warehouse.Write']),
        ('${id(2)}','${id(12)}','${id(100)}','active',array['Warehouse.Read']),
        ('${id(3)}','${id(13)}','${id(100)}','active',array['Warehouse.Read']),
        ('${id(4)}','${id(14)}','${id(100)}','active',array['Bookings.Read']),
        ('${id(5)}','${id(15)}','${id(200)}','active',array['Warehouse.Read','Warehouse.Write']),
        ('${id(6)}','${id(16)}','${id(100)}','deactivated',array['Warehouse.Read']);
      insert into "cmp_Offices"("Office_ID","Company_ID","Office_Name") values('${id(501)}','${id(100)}','London'),('${id(502)}','${id(100)}','Leeds'),('${id(503)}','${id(200)}','Foreign');
      insert into "cmp_Users_Offices" values('${id(1)}','${id(501)}'),('${id(2)}','${id(501)}'),('${id(3)}','${id(502)}'),('${id(4)}','${id(501)}'),('${id(5)}','${id(503)}'),('${id(6)}','${id(501)}');
      insert into "Org_Master" values('${id(701)}','North Retail');
      insert into "WMS_Facilities"("WMSFacility_ID","WMSFacility_Code","WMSFacility_Name","WMSFacility_TypeCode","WMSFacility_OrgOfficeID")
        values('${id(601)}','LON','London DC','warehouse','${id(501)}'),('${id(602)}','LDS','Leeds DC','warehouse','${id(502)}'),('${id(603)}','FOR','Foreign DC','warehouse','${id(503)}');
      insert into "WMS_Items"("WMSItem_ID","WMSItem_CustomerOrgID","WMSItem_SKU","WMSItem_Description","WMSItem_GrossWeightKG","WMSItem_LengthM","WMSItem_WidthM","WMSItem_HeightM")
        values('${id(801)}','${id(701)}','SKU-1','Blue chairs',2,0.5,0.5,0.4);
      insert into "WMS_HandlingUnits"("WMSHU_ID","WMSHU_FacilityID","WMSHU_TypeCode","WMSHU_Code") values('${id(901)}','${id(601)}','pallet','PAL-1'),('${id(902)}','${id(601)}','pallet','PAL-2');
      insert into "WMS_Orders"("WMSOrder_ID","WMSOrder_FacilityID","WMSOrder_CustomerOrgID","WMSOrder_OrderNumber","WMSOrder_TypeCode","WMSOrder_StatusCode","WMSOrder_SourceTypeCode","WMSOrder_SourceReference")
        values('${id(1001)}','${id(601)}','${id(701)}','IN-1','inbound','received','customer_purchase_order','PO-1'),
              ('${id(1002)}','${id(601)}','${id(701)}','OUT-1','outbound','dispatched','sales_order','SO-1'),
              ('${id(1003)}','${id(601)}','${id(701)}','IN-2','inbound','booked','customer_purchase_order','PO-2-NOT-ARRIVED');
      -- Booked in on Monday 14 September 2026 at 11:00 London time.
      insert into "WMS_Receipts"("WMSReceipt_ID","WMSReceipt_FacilityID","WMSReceipt_OrderID","WMSReceipt_ReceiptNumber","WMSReceipt_ReceivedAt")
        values('${id(1101)}','${id(601)}','${id(1001)}','RC-1','2026-09-14T10:00:00Z');
      insert into "WMS_ReceiptLines"("WMSReceiptLine_ReceiptID","WMSReceiptLine_ItemID","WMSReceiptLine_LineNo","WMSReceiptLine_ReceivedQuantity","WMSReceiptLine_HU_ID")
        values('${id(1101)}','${id(801)}',1,10,'${id(901)}'),('${id(1101)}','${id(801)}',2,10,'${id(902)}'),('${id(1101)}','${id(801)}',3,4,null);
      insert into "WMS_InventoryBalances"("WMSBalance_ID","WMSBalance_FacilityID","WMSBalance_CustomerOrgID","WMSBalance_ItemID","WMSBalance_HU_ID","WMSBalance_OnHandQuantity","WMSBalance_AvailableQuantity","WMSBalance_FirstReceiptAt")
        values('${id(1201)}','${id(601)}','${id(701)}','${id(801)}','${id(901)}',10,10,'2026-09-14T10:00:00Z'),
              ('${id(1202)}','${id(601)}','${id(701)}','${id(801)}','${id(902)}',10,10,'2026-09-14T10:00:00Z'),
              ('${id(1203)}','${id(601)}','${id(701)}','${id(801)}',null,4,4,'2026-09-14T10:00:00Z'),
              ('${id(1204)}','${id(603)}','${id(701)}','${id(801)}',null,999,999,'2026-09-14T10:00:00Z');`)

    // Settings: defaults until saved, validated, audited, versioned and write-protected.
    const defaults = as(id(11), "public.warehouse_billing_settings()")
    assert.deepEqual([defaults.timeZone, defaults.cutoffTime, defaults.cycle, defaults.isDefault, defaults.version, defaults.canManage], ["Europe/London", "23:59", "monthly", true, 0, true])
    const settings = { timeZone: "Europe/London", cutoffTime: "18:00", cycle: "weekly", weekStart: 1, monthStart: 1 }
    const save = (actor, value, version) => as(actor, `public.warehouse_billing_settings(${literal(value)},${version})`)
    assert.throws(() => save(id(12), settings, 0), /write permission/)
    assert.throws(() => save(id(11), { ...settings, timeZone: "Mars/Olympus" }, 0), /valid time zone/)
    assert.throws(() => save(id(11), { ...settings, cutoffTime: "24:00" }, 0), /24-hour time/)
    assert.throws(() => save(id(11), { ...settings, cycle: "daily" }, 0), /weekly or monthly/)
    assert.throws(() => save(id(11), { ...settings, monthStart: 31 }, 0), /1 to 28/)
    assert.throws(() => save(id(11), { ...settings, weekStart: 1.5 }, 0), /Monday to Sunday/)
    const saved = save(id(11), settings, 0)
    assert.deepEqual([saved.cutoffTime, saved.cycle, saved.version, saved.isDefault], ["18:00", "weekly", 1, false])
    assert.throws(() => save(id(11), settings, 0), /changed since you opened/)
    const colleague = as(id(12), "public.warehouse_billing_settings()")
    assert.deepEqual([colleague.cutoffTime, colleague.canManage], ["18:00", false], "A read-only colleague sees the saved settings")
    assert.equal(as(id(15), "public.warehouse_billing_settings()").isDefault, true, "Another company keeps its own settings")
    assert.equal(sql(`select count(*) from booking_api.warehouse_billing_settings_audit where company_id='${id(100)}'`).trim(), "1")
    assert.throws(() => as(id(14), "public.warehouse_billing_settings()"), /Warehouse access is required/)
    assert.throws(() => as(id(16), "public.warehouse_billing_settings()"), /active workspace identity/)
    assert.throws(() => sql(`set role anon;select public.warehouse_billing_settings()`), /permission denied/)
    assert.throws(() => sql(`set role authenticated;select * from booking_api.warehouse_stock_snapshots`), /permission denied/)

    // Cut-off records: 18:00 London is 17:00 UTC in September.
    const capture = at => Number(sql(`select booking_api.warehouse_capture_stock_snapshots('${at}')`).trim())
    assert.equal(capture("2026-09-14T16:30:00Z"), 0, "Nothing is recorded before the cut-off, and yesterday's is outside the catch-up window")
    assert.equal(capture("2026-09-14T17:05:00Z"), 1)
    assert.equal(capture("2026-09-14T17:15:00Z"), 0, "A day is recorded once")
    capture("2026-09-15T17:30:00Z")
    // Wednesday is missed: nine hours late is outside the catch-up window.
    capture("2026-09-17T02:00:00Z")
    // Thursday: goods out of three units from pallet 1 before the cut-off.
    sql(`update "WMS_InventoryBalances" set "WMSBalance_OnHandQuantity"=7 where "WMSBalance_ID"='${id(1201)}';
      insert into "WMS_Dispatches"("WMSDispatch_ID","WMSDispatch_FacilityID","WMSDispatch_OrderID","WMSDispatch_DispatchNumber","WMSDispatch_DispatchedAt")
        values('${id(1301)}','${id(601)}','${id(1002)}','DS-1','2026-09-17T09:00:00Z');
      insert into "WMS_InventoryTransactions"("WMSTransaction_FacilityID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_OrderID")
        values('${id(601)}','dispatch','${id(801)}','${id(701)}','${id(901)}',3,'WMS_Dispatches','${id(1301)}','${id(1002)}');`)
    capture("2026-09-17T17:10:00Z")
    const recorded = sql(`select string_agg(stock_date::text||':'||balance_count,',' order by stock_date) from booking_api.warehouse_stock_snapshot_runs where company_id='${id(100)}'`).trim()
    assert.equal(recorded, "2026-09-14:3,2026-09-15:3,2026-09-17:3", "Only this company's own facilities are recorded, and missed days stay missed")

    // Rates: defaults plus a customer override on storage.
    const rate = (code, stage, basis, period, amount, extra = {}) => ({ id: code.toLowerCase(), code, name: code, stage, basis, period, amount, currency: "GBP", minimum: 0, freePeriods: 0, from: "2026-01-01", to: "", ...extra })
    as(id(11), `public.warehouse_pricing_card(null,${literal([
      rate("GIN", "receipt", "pallet", "once", 5, { minimum: 12 }),
      rate("GOUT", "dispatch", "unit", "once", 0.5),
      rate("STOR", "storage", "pallet", "night", 1, { freePeriods: 2 }),
      rate("STKG", "storage", "kg", "week", 0.01, { minimum: 3 }),
      rate("HAND", "transaction", "fixed", "once", 7),
    ])},0,null)`)
    as(id(11), `public.warehouse_pricing_card('${id(701)}',${literal([rate("STOR", "storage", "pallet", "night", 0.8, { id: "stor-k", freePeriods: 2 })])},0,1)`)

    const statement = (actor, start = "2026-09-14") => as(actor, `public.warehouse_charge_statement('${id(701)}','${start}')`)
    const result = statement(id(12))
    assert.deepEqual(result.period, { start: "2026-09-14", end: "2026-09-20", cycle: "weekly", previousStart: "2026-09-07", nextStart: "2026-09-21", isCurrent: false, isComplete: true })
    const byCode = Object.fromEntries(result.lines.map(line => [line.code, line]))
    // Goods in: 2 pallets × £5 = £10, raised to the £12 minimum. The not-yet-arrived order is not charged.
    assert.deepEqual([byCode.GIN.quantity, byCode.GIN.amount, byCode.GIN.minimumApplied, byCode.GIN.reference], [2, 12, true, "RC-1"])
    assert.equal(result.lines.filter(line => line.stage === "receipt").length, 1)
    // Goods out: 3 units × £0.50.
    assert.deepEqual([byCode.GOUT.quantity, byCode.GOUT.amount, byCode.GOUT.reference], [3, 1.5, "DS-1"])
    // Storage: two free nights (14th, 15th); Thursday 17th charges 2 pallets at the customer's £0.80.
    assert.deepEqual([byCode.STOR.quantity, byCode.STOR.periods, byCode.STOR.amount, byCode.STOR.source], [2, 1, 1.6, "customer"])
    // Weekly weight: peak 24 units × 2 kg = 48 kg × £0.01 = £0.48, raised to the £3 minimum.
    assert.deepEqual([byCode.STKG.quantity, byCode.STKG.amount, byCode.STKG.minimumApplied], [48, 3, true])
    assert.deepEqual(result.totals, [{ currency: "GBP", amount: 18.1 }])
    assert.deepEqual(result.nights, { expected: 7, recorded: 3 })
    const warnings = result.warnings.join("\n")
    assert.match(warnings, /not recorded at the cut-off on 4 of 7 days/)
    assert.match(warnings, /not on a pallet record/)
    assert.match(warnings, /transaction\) charges are not calculated automatically/)
    assert.doesNotMatch(warnings, /without a gross weight/)

    // Periods must align to the cycle; a later period has nothing yet.
    assert.throws(() => statement(id(12), "2026-09-15"), /billing cycle start day/)
    const later = statement(id(12), "2026-09-21")
    assert.equal(later.lines.every(line => line.amount === 0), true)

    // Access: Leeds-only colleague, no-access user, foreign company, inactive and anonymous callers are refused.
    assert.throws(() => statement(id(13)), /no warehouse activity in your warehouses/)
    assert.throws(() => statement(id(14)), /Warehouse access is required/)
    // The foreign company only reaches its own facility: none of company 100's events, rates or stock records.
    const foreign = statement(id(15), "2026-09-01")
    assert.equal(foreign.lines.length, 0)
    assert.ok(!JSON.stringify(foreign).includes("RC-1"))
    assert.match(foreign.warnings.join("\n"), /No warehouse rates apply/)
    assert.throws(() => statement(id(16)), /active workspace identity/)
    assert.throws(() => sql(`set role anon;select public.warehouse_charge_statement('${id(701)}','2026-09-14')`), /permission denied/)
    assert.throws(() => sql(`set role authenticated;set request.jwt.claim.sub='${id(11)}';select booking_api.warehouse_capture_stock_snapshots()`), /permission denied/)

    // Chargeable customers follow the same warehouse scope.
    assert.deepEqual(as(id(12), "public.warehouse_charge_customers()").map(customer => customer.name), ["North Retail"])
    assert.deepEqual(as(id(12), "public.warehouse_charge_customers('nor')").map(customer => customer.id), [id(701)])
    assert.deepEqual(as(id(12), "public.warehouse_charge_customers('100%_')"), [])
    assert.deepEqual(as(id(13), "public.warehouse_charge_customers()"), [])
    assert.throws(() => as(id(14), "public.warehouse_charge_customers()"), /Warehouse access is required/)

    // Dexter reads the same calculation through the same boundary.
    const dexter = (actor, search) => as(actor, `public.multideck_dexter_query_domain('warehouse_charges',${search ? `'${search}'` : "null"},10)`)
    const overview = dexter(id(12)).data[0]
    assert.equal(overview.settings.cutoffTime, "18:00")
    assert.deepEqual(overview.customers.map(customer => customer.name), ["North Retail"])
    const read = dexter(id(12), "north").data[0]
    assert.equal(read.recordId, id(701))
    const expectedCurrent = as(id(12), `public.warehouse_charge_statement('${id(701)}',null)`)
    assert.equal(read.currentPeriod.period.start, expectedCurrent.period.start)
    assert.equal(read.previousPeriod.period.start, expectedCurrent.period.previousStart)
    assert.deepEqual(read.currentPeriod.lines, expectedCurrent.lines)
    assert.equal(dexter(id(13)).data[0].customers.length, 0, "Leeds-only colleague sees no London customers in chat")
    assert.throws(() => dexter(id(14)), /Warehouse access is required/)
    assert.throws(() => as(id(15), `public.multideck_dexter_domain_warehouse_charges('${id(100)}',null,10)`), /workspace is unavailable/)

    // Changing to monthly periods recalculates the same events in the month.
    save(id(11), { ...settings, cycle: "monthly", monthStart: 1 }, 1)
    const month = statement(id(12), "2026-09-01")
    assert.equal(month.period.end, "2026-09-30")
    assert.equal(month.lines.find(line => line.code === "GIN").amount, 12)
  } finally {
    if (started) run("pg_ctl", ["-D", path.join(dir, "data"), "-m", "fast", "-w", "stop"])
    rmSync(dir, { recursive: true, force: true })
  }
})
