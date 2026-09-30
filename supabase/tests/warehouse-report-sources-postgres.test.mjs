import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { reportingDexterFixture } from "./reporting-dexter-fixture.mjs"

// Real reporting query engine plus the real warehouse source adapter, run
// against baseline warehouse tables. Proves colleague visibility, facility
// scope, permission, company and anonymous boundaries for Reports and Dexter.
const bin = process.env.PG_TEST_BIN || execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`
const migration = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8")
const baseline = readFileSync(new URL("../baseline/public-schema.sql", import.meta.url), "utf8")
const table = name => {
  const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
  assert.ok(start >= 0, name)
  return baseline.slice(start, baseline.indexOf("\n);", start) + 3)
}

test("warehouse report sources respect colleague, facility, permission and company boundaries", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "warehouse-reports-"))
  const port = "55497"
  const run = (cmd, args) => execFileSync(path.join(bin, cmd), args, { encoding: "utf8", stdio: "pipe" })
  const sql = input => execFileSync(path.join(bin, "psql"), ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", port, "-d", "postgres"], { input, encoding: "utf8", stdio: "pipe" })
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
  let started = false
  try {
    run("initdb", ["-D", path.join(dir, "data"), "-A", "trust", "--no-locale"])
    run("pg_ctl", ["-D", path.join(dir, "data"), "-l", path.join(dir, "postgres.log"), "-o", `-k ${dir} -h '' -p ${port}`, "-w", "start"])
    started = true
    sql(`create role authenticated; create role anon; create schema auth; create schema booking_api;
      create extension if not exists pgcrypto;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table "cmp_Company" ("Company_ID" uuid primary key);
      create table "cmp_Users" ("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text,"User_Firstname" text,"User_Lastname" text);
      create table test_permissions(actor uuid, permission text);
      create function booking_api.has_permission(actor uuid,p text) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.test_permissions t join public."cmp_Users" u on u."Auth_User_ID"=t.actor
          where t.actor=$1 and t.permission=$2 and u."User_AccessStatus"='active') $$;
      ${["cmp_Offices", "cmp_Users_Offices", "Org_Master", "WMS_Facilities", "WMS_Items", "WMS_Locations", "WMS_InventoryLots",
        "WMS_Orders", "WMS_OrderLines", "WMS_Receipts", "WMS_Dispatches", "WMS_InventoryTransactions", "WMS_InventoryBalances",
        "sys_WMSOrderStatuses", "sys_WMSTransactionTypes", "sys_WMSInventoryStatuses", "sys_WMSCustomsStatuses"].map(table).join("\n")}`)
    sql(migration("20260907220000_reporting_workspace"))
    sql(reportingDexterFixture())
    sql(migration("20260907225000_reporting_scope_and_preview"))
    sql(migration("20260907231000_reporting_restore_and_links"))
    sql(migration("20260930130000_warehouse_report_sources"))
    // Re-applying is a no-op and must not duplicate catalogue entries.
    sql(migration("20260930130000_warehouse_report_sources"))

    // Company 100: offices 501 (London) and 502 (Leeds); company 200 is foreign.
    // Users: 1 creator (London), 2 colleague (London), 3 Leeds-only colleague,
    // 4 London user without Warehouse.Read, 5 foreign user wrongly linked to London.
    sql(`insert into "cmp_Company" values('${id(100)}'),('${id(200)}');
      insert into "cmp_Users" values
        ('${id(1)}','${id(11)}','${id(100)}','active','Ada','Creator'),('${id(2)}','${id(12)}','${id(100)}','active','Ben','Colleague'),
        ('${id(3)}','${id(13)}','${id(100)}','active','Cara','Leeds'),('${id(4)}','${id(14)}','${id(100)}','active','Dev','NoAccess'),
        ('${id(5)}','${id(15)}','${id(200)}','active','Eve','Foreign');
      insert into test_permissions select actor,'Warehouse.Read' from unnest(array['${id(11)}','${id(12)}','${id(13)}','${id(15)}']::uuid[]) actor;
      insert into test_permissions values('${id(14)}','Bookings.Read');
      insert into "cmp_Offices"("Office_ID","Company_ID","Office_Name") values('${id(501)}','${id(100)}','London'),('${id(502)}','${id(100)}','Leeds'),('${id(503)}','${id(200)}','Foreign');
      insert into "cmp_Users_Offices" values('${id(1)}','${id(501)}'),('${id(2)}','${id(501)}'),('${id(3)}','${id(502)}'),('${id(4)}','${id(501)}'),('${id(5)}','${id(501)}'),('${id(5)}','${id(503)}');
      insert into "Org_Master"("Org_id","Org_Name","Org_BaseCurrency","Org_AccCode") values('${id(701)}','North Retail','${id(999)}','NORTH'),('${id(702)}','South Foods','${id(999)}','SOUTH');
      insert into "WMS_Facilities"("WMSFacility_ID","WMSFacility_Code","WMSFacility_Name","WMSFacility_TypeCode","WMSFacility_OrgOfficeID")
        values('${id(601)}','LON','London DC','warehouse','${id(501)}'),('${id(602)}','LDS','Leeds DC','warehouse','${id(502)}'),('${id(603)}','FOR','Foreign DC','warehouse','${id(503)}');
      insert into "WMS_Items"("WMSItem_ID","WMSItem_CustomerOrgID","WMSItem_SKU","WMSItem_Description")
        values('${id(801)}','${id(701)}','SKU-1','Blue chairs'),('${id(802)}','${id(702)}','SKU-2','Tinned tomatoes'),('${id(803)}','${id(701)}','SKU-3','Leeds only');
      insert into "WMS_Locations"("WMSLocation_ID","WMSLocation_FacilityID","WMSLocation_Code","WMSLocation_TypeCode")
        values('${id(901)}','${id(601)}','DOCK-1','dock'),('${id(902)}','${id(601)}','A-01-01','bin');
      insert into "sys_WMSOrderStatuses"("WMSOrderStatus_Code","WMSOrderStatus_Name") values('received','Received'),('released','Released');
      insert into "sys_WMSTransactionTypes"("WMSTransactionType_Code","WMSTransactionType_Name") values('receipt','Receipt'),('putaway','Putaway');
      insert into "sys_WMSInventoryStatuses"("WMSInventoryStatus_Code","WMSInventoryStatus_Name") values('available','Available');
      insert into "WMS_Orders"("WMSOrder_ID","WMSOrder_FacilityID","WMSOrder_CustomerOrgID","WMSOrder_OrderNumber","WMSOrder_TypeCode","WMSOrder_StatusCode","WMSOrder_SourceTypeCode","WMSOrder_SourceReference","WMSOrder_CreatedAt","WMSOrder_CreatedBy","WMSOrder_RequestedDate")
        values('${id(1001)}','${id(601)}','${id(701)}','IN-0001','inbound','received','customer_purchase_order','PO-77','2026-08-03T09:00:00Z','${id(1)}','2026-08-04'),
              ('${id(1002)}','${id(601)}','${id(702)}','OUT-0001','outbound','released','manual_exception','Phone call','2026-08-10T09:00:00Z','${id(1)}',null),
              ('${id(1003)}','${id(602)}','${id(701)}','IN-LEEDS','inbound','received','asn','ASN-1','2026-08-05T09:00:00Z','${id(3)}',null),
              ('${id(1004)}','${id(603)}','${id(701)}','IN-FOREIGN','inbound','received','asn','ASN-9','2026-08-05T09:00:00Z',null,null);
      insert into "WMS_Orders"("WMSOrder_ID","WMSOrder_FacilityID","WMSOrder_CustomerOrgID","WMSOrder_OrderNumber","WMSOrder_TypeCode","WMSOrder_SourceTypeCode","WMSOrder_SourceReference","WMSOrder_CreatedAt","WMSOrder_IsDeleted")
        values('${id(1005)}','${id(601)}','${id(701)}','IN-DELETED','inbound','asn','ASN-X','2026-08-06T09:00:00Z',true);
      insert into "WMS_OrderLines"("WMSOrderLine_OrderID","WMSOrderLine_LineNo","WMSOrderLine_ItemID","WMSOrderLine_OrderedQuantity","WMSOrderLine_ReceivedQuantity","WMSOrderLine_DispatchedQuantity")
        values('${id(1001)}',1,'${id(801)}',10,10,0),('${id(1001)}',2,'${id(801)}',5,4,0),('${id(1002)}',1,'${id(802)}',3,0,0);
      insert into "WMS_Receipts"("WMSReceipt_FacilityID","WMSReceipt_OrderID","WMSReceipt_ReceiptNumber","WMSReceipt_ReceivedAt")
        values('${id(601)}','${id(1001)}','RC-1','2026-08-05T10:00:00Z');
      insert into "WMS_InventoryTransactions"("WMSTransaction_FacilityID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_ToLocationID","WMSTransaction_FromLocationID","WMSTransaction_Quantity","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_OrderID","WMSTransaction_Reference","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy","WMSTransaction_ReasonCode")
        values('${id(601)}','receipt','${id(801)}','${id(701)}','${id(901)}',null,14,0,14,'${id(1001)}','RC-1','2026-08-05T10:00:00Z','${id(1)}',null),
              ('${id(601)}','putaway','${id(801)}','${id(701)}','${id(902)}','${id(901)}',14,14,14,'${id(1001)}','PT-1','2026-08-05T11:00:00Z','${id(1)}','putaway_task'),
              ('${id(602)}','receipt','${id(803)}','${id(701)}',null,null,2,0,2,'${id(1003)}','RC-LEEDS','2026-08-06T10:00:00Z','${id(3)}',null),
              ('${id(603)}','receipt','${id(803)}','${id(701)}',null,null,99,0,99,'${id(1004)}','RC-FOREIGN','2026-08-06T10:00:00Z',null,null);
      insert into "WMS_InventoryBalances"("WMSBalance_FacilityID","WMSBalance_CustomerOrgID","WMSBalance_ItemID","WMSBalance_LocationID","WMSBalance_OnHandQuantity","WMSBalance_AvailableQuantity","WMSBalance_FirstReceiptAt")
        values('${id(601)}','${id(701)}','${id(801)}','${id(902)}',14,14,'2026-08-05T10:00:00Z'),
              ('${id(601)}','${id(702)}','${id(802)}','${id(902)}',6,6,'2026-07-01T10:00:00Z'),
              ('${id(601)}','${id(702)}','${id(802)}','${id(901)}',0,0,'2026-07-01T10:00:00Z'),
              ('${id(602)}','${id(701)}','${id(803)}',null,2,2,'2026-08-06T10:00:00Z'),
              ('${id(603)}','${id(701)}','${id(803)}',null,99,99,'2026-08-06T10:00:00Z');`)

    const call = (action, payload = {}, actor = id(12)) => JSON.parse(sql(`set role authenticated;set request.jwt.claim.sub='${actor}';select public.reporting_workspace('${action}',${literal(payload)})`).trim())
    const period = { preset: "custom", start: "2026-06-01", end: "2026-09-30" }
    const rows = (source, dateField, columns, actor = id(12), extra = {}) => call("preview", { definition: { version: 1, kind: "table", query: {
      source, dateField, period, columns, mode: "rows", filters: [], filterMatch: "all", groupBy: "month", measure: "count", aggregation: "sum",
      currency: "", compare: "none", sort: { field: dateField, direction: "asc" }, ...extra } } }, actor).query

    // Existing sources are preserved and the three warehouse sources are added once.
    const allIds = JSON.parse(sql("select report_api.catalogue()")).map(source => source.id)
    assert.deepEqual(allIds, ["jobs", "sales", "quotes", "opportunities", "warehouse_orders", "warehouse_movements", "warehouse_stock"])
    assert.deepEqual(call("list").catalogue.map(source => source.id), ["warehouse_orders", "warehouse_movements", "warehouse_stock"])

    // A standard colleague opens orders another colleague created, with line totals and receipt date.
    const orders = rows("warehouse_orders", "created", ["reference", "customer", "warehouse", "direction", "status", "ordered", "received", "completed", "createdBy", "sourceType"])
    assert.deepEqual(orders.rows.map(row => row.reference), ["IN-0001", "OUT-0001"])
    assert.deepEqual(
      { ...orders.rows[0], id: undefined },
      { id: undefined, sourceUrl: "/warehouse/orders/in-0001", reference: "IN-0001", customer: "North Retail", warehouse: "London DC", direction: "Goods in", status: "Received", ordered: 15, received: 14, completed: "2026-08-05", createdBy: "Ada Creator", sourceType: "Customer Purchase Order" },
    )
    assert.equal(orders.rows[1].direction, "Goods out")
    assert.ok(!JSON.stringify(orders).includes("IN-DELETED"), "Deleted orders are excluded")

    // The movement ledger carries who, when, before and after.
    const movements = rows("warehouse_movements", "date", ["movement", "reference", "order", "fromLocation", "toLocation", "quantity", "onHandBefore", "onHandAfter", "recordedBy", "reason", "recordedAt"], id(12), { sort: { field: "recordedAt", direction: "asc" } })
    assert.equal(movements.total, 2)
    assert.deepEqual(movements.rows.map(row => [row.movement, row.fromLocation ?? null, row.toLocation, row.recordedBy]), [["Receipt", null, "DOCK-1", "Ada Creator"], ["Putaway", "DOCK-1", "A-01-01", "Ada Creator"]])
    assert.equal(movements.rows[1].reason, "Putaway Task")

    // Stock on hand excludes zero balances and supports a per-customer summary.
    const stock = rows("warehouse_stock", "received", ["customer", "sku", "location", "onHand", "daysInStorage"])
    assert.equal(stock.total, 2)
    assert.ok(stock.rows.every(row => row.daysInStorage > 0))
    // The default "as at today" date keeps all current stock in any period that includes today.
    const current = call("preview", { definition: { version: 1, kind: "table", query: { source: "warehouse_stock", dateField: "asAt", period: { preset: "thismonth" },
      columns: ["sku", "onHand"], mode: "rows", filters: [], filterMatch: "all", groupBy: "month", measure: "count", aggregation: "sum", currency: "", compare: "none",
      sort: { field: "sku", direction: "asc" } } } }).query
    assert.deepEqual(current.rows.map(row => [row.sku, row.onHand]), [["SKU-1", 14], ["SKU-2", 6]])
    const byCustomer = call("preview", { definition: { version: 1, kind: "chart", query: {
      source: "warehouse_stock", dateField: "received", period, columns: ["customer"], mode: "summary", filters: [], filterMatch: "all",
      groupBy: "customer", measure: "onHand", aggregation: "sum", currency: "", compare: "none", sort: { field: "received", direction: "asc" } } } }).query
    assert.deepEqual(byCustomer.rows.map(row => [row.label, row.value]), [["North Retail", 14], ["South Foods", 6]])

    // Facility scope follows office assignment: Leeds sees only Leeds.
    assert.deepEqual(rows("warehouse_orders", "created", ["reference"], id(13)).rows.map(row => row.reference), ["IN-LEEDS"])
    assert.deepEqual(rows("warehouse_movements", "date", ["reference"], id(13)).rows.map(row => row.reference), ["RC-LEEDS"])
    assert.equal(rows("warehouse_stock", "received", ["sku"], id(13)).total, 1)

    // No Warehouse.Read: the sources are hidden and direct queries are refused.
    assert.deepEqual(call("list", {}, id(14)).catalogue.map(source => source.id), ["jobs"])
    assert.throws(() => rows("warehouse_orders", "created", ["reference"], id(14)), /do not have access/)

    // A foreign-company user linked to a London office still sees only their own company's facility.
    const foreign = rows("warehouse_orders", "created", ["reference"], id(15))
    assert.deepEqual(foreign.rows.map(row => row.reference), ["IN-FOREIGN"])
    assert.ok(!JSON.stringify(rows("warehouse_stock", "received", ["sku", "onHand"], id(15))).includes("SKU-1"))

    // Saved reports on warehouse sources stop working when access is revoked.
    const saved = call("save", { name: "Stock by customer", visibility: "workspace", definition: { version: 1, kind: "table", query: {
      source: "warehouse_stock", dateField: "received", period, columns: ["customer", "sku", "onHand"], mode: "rows", filters: [], filterMatch: "all",
      groupBy: "month", measure: "count", aggregation: "sum", currency: "", compare: "none", sort: { field: "received", direction: "asc" } } } })
    assert.equal(call("run", { id: saved.id, runId: id(3001) }).status, "ready")
    assert.equal(call("list", {}, id(11)).reports.length, 1, "Workspace colleague can open the shared warehouse report")
    sql(`delete from test_permissions where actor='${id(11)}'`)
    assert.equal(call("list", {}, id(11)).reports.length, 0)
    assert.throws(() => call("run", { id: saved.id, runId: id(3002) }, id(11)), /unavailable/)

    // Dexter discovers warehouse sources only with the same permission.
    const dexter = actor => JSON.parse(sql(`set role authenticated;set request.jwt.claim.sub='${actor}';select public.multideck_dexter_query_domain('report_sources',null,20)`).trim())
    assert.deepEqual(dexter(id(12)).data.map(source => source.id).sort(), ["warehouse_movements", "warehouse_orders", "warehouse_stock"])
    assert.equal(dexter(id(14)).data.some(source => source.id.startsWith("warehouse_")), false)

    // Deactivated and anonymous callers are denied; the adapter is not directly callable.
    sql(`update "cmp_Users" set "User_AccessStatus"='deactivated' where "User_ID"='${id(2)}'`)
    assert.throws(() => rows("warehouse_orders", "created", ["reference"], id(12)), /active Multideck account/)
    assert.throws(() => sql(`set role anon;select public.reporting_workspace('list')`), /permission denied/)
    assert.throws(() => sql(`set role authenticated;set request.jwt.claim.sub='${id(13)}';select report_api.warehouse_source_rows('${id(13)}','warehouse_orders')`), /permission denied/)
  } finally {
    if (started) run("pg_ctl", ["-D", path.join(dir, "data"), "-m", "fast", "-w", "stop"])
    rmSync(dir, { recursive: true, force: true })
  }
})
