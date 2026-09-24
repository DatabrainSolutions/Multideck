import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

function moduleUrl(name) {
  const source = readFileSync(new URL(`../functions/warehouse/shared/${name}.ts`, import.meta.url), "utf8")
    .replace(/from "\.\/(http|database|location-input)\.ts"/g, (_, dependency) => `from "${moduleUrl(dependency)}"`)
    .replace('import { permissionValues } from "../../_shared/backend.ts";', 'const permissionValues = () => { throw new Error("Actor resolution is not used in this test."); };');
  return `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`;
}
const { validateLocationInput, locationImportColumns } = await import(moduleUrl("location-input"));
const { importLocationRows } = await import(moduleUrl("location-import"));
const routeModule = readFileSync(new URL("../functions/warehouse/routes/locations.ts", import.meta.url), "utf8")
  .replace('"../shared/mod.ts"', JSON.stringify(`data:text/javascript;base64,${Buffer.from(["http", "database", "authentication"].map((name) => `export * from "${moduleUrl(name)}";`).join("\n")).toString("base64")}`))
  .replace(/"\.\.\/shared\/(location-input|location-import|spreadsheet-import)\.ts"/g, (_, name) => JSON.stringify(moduleUrl(name)));
const { handleLocations } = await import(`data:text/javascript;base64,${Buffer.from(routeModule).toString("base64")}`);
const references = {
  types: [{ WMSLocationType_Code: "rack" }, { WMSLocationType_Code: "floor" }],
  statuses: [{ WMSLocationStatus_Code: "available" }, { WMSLocationStatus_Code: "blocked" }],
  zoneTypes: [{ WMSZoneType_Code: "cold" }],
};

function fixture(records = []) {
  const queries = [], writes = [], batches = [];
  const admin = { from(table) {
    assert.equal(table, "WMS_Locations");
    const query = { filters: [], codes: [] };
    queries.push(query);
    const chain = {
      select() { return chain; },
      eq(key, value) { query.filters.push([key, value]); return chain; },
      in(key, values) { assert.equal(key, "WMSLocation_Code"); query.codes = values; return chain; },
      limit(value) { query.limit = value; return chain; },
      then(resolve) { return Promise.resolve({ data: records.filter((record) => query.filters.every(([key, value]) => record[key] === value) && query.codes.includes(record.WMSLocation_Code)) }).then(resolve); },
    };
    return chain;
  } };
  return { admin, queries, writes, batches, run: (rows, options = {}) => importLocationRows({
    rows, references, defaultTypeCode: "rack", facilityId: "facility-a", admin, preview: true,
    saveBatch: async (values) => { batches.push(values); for (const value of values) { writes.push(value); records.push({ WMSLocation_FacilityID: "facility-a", WMSLocation_Code: value.code }); } },
    ...options,
  }) };
}
const row = (code, values = {}, number = 2) => ({ row: number, values: { code, ...values } });

test("locations need only Code per row and use the editor defaults", () => {
  const values = validateLocationInput({ code: "0001" }, references, "rack");
  assert.equal(values.code, "0001");
  assert.equal(values.typeCode, "rack");
  assert.equal(values.statusCode, "available");
  assert.equal(values.allowsMultiSku, true);
  assert.equal(values.allowsBondedStock, false);
  assert.deepEqual(locationImportColumns.filter((column) => column.required).map((column) => column.key), ["code"]);
});

test("optional fields preserve overrides and reject values the database cannot store", () => {
  const values = validateLocationInput({ code: "A", typeCode: "floor", statusCode: "blocked", zoneTypeCode: "cold", temperatureMinC: -20, temperatureMaxC: -5, allowsMultiSku: false, allowsBondedStock: true, lengthM: 1.25 }, references);
  assert.equal(values.typeCode, "floor");
  assert.equal(values.temperatureMinC, -20);
  assert.equal(values.allowsMultiSku, false);
  for (const invalid of [
    { code: "x".repeat(81) }, { barcode: "x".repeat(161) }, { aisle: "x".repeat(41) },
    { typeCode: "missing" }, { statusCode: "missing" }, { zoneTypeCode: "missing" },
    { lengthM: -1 }, { maxVolumeCbm: "1,000" }, { heightM: Infinity }, { widthM: true },
    { temperatureMinC: 10, temperatureMaxC: 5 }, { temperatureMaxC: 1000000 }, { allowsMultiSku: "maybe" },
    { temperatureMinC: 0.1234 }, { widthM: 0.1234567 },
  ]) assert.throws(() => validateLocationInput({ code: "A", ...invalid }, references, "rack"));
});

test("preview preserves Excel row numbers and never invokes save even for a new zone", async () => {
  const f = fixture();
  const result = await f.run([row("A", { zoneTypeCode: "cold" }, 5)]);
  assert.equal(result.preview, true);
  assert.equal(result.created, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.results[0].row, 5);
  assert.equal(result.results[0].values.typeCode, "rack");
  assert.equal(f.writes.length, 0);
});

test("all repeated codes are rejected, with no writes when any row fails validation", async () => {
  const f = fixture();
  const result = await f.run([row("A"), row("A", {}, 4), row("B", {}, 7)], { preview: false });
  assert.equal(result.failed, 3);
  assert.equal(result.created, 0);
  assert.equal(f.writes.length, 0);
  assert.match(result.results[0].error, /more than once/);
  assert.ok(result.results.every((entry) => !entry.success));
});

test("duplicate checks are bounded to the chosen facility and include deleted codes", async () => {
  const f = fixture([
    { WMSLocation_FacilityID: "facility-b", WMSLocation_Code: "A" },
    { WMSLocation_FacilityID: "facility-a", WMSLocation_Code: "B", WMSLocation_IsDeleted: true },
  ]);
  const result = await f.run([row("A"), row("B", {}, 3)]);
  assert.equal(result.results[0].success, true);
  assert.equal(result.results[1].success, false);
  assert.deepEqual(f.queries[0].filters, [["WMSLocation_FacilityID", "facility-a"]]);
  assert.equal(f.queries[0].limit, 100);
});

test("malformed parser rows and invalid default type cannot create locations", async () => {
  const f = fixture();
  const result = await f.run([{ ...row("A"), error: "Length M: enter a number." }, row("B", {}, 3)], { preview: false });
  assert.equal(result.created, 0);
  assert.equal(result.failed, 2);
  assert.equal(f.writes.length, 0);
  await assert.rejects(f.run([row("A")], { defaultTypeCode: "unknown", preview: false }), /valid default location type/);
});

test("valid creation saves normalised values and a repeated upload cannot duplicate them", async () => {
  const f = fixture();
  const created = await f.run([row("A"), row("B", { typeCode: "floor" }, 3)], { preview: false });
  assert.equal(created.created, 2);
  assert.equal(f.writes[0].statusCode, "available");
  const retry = await f.run([row("A"), row("B", {}, 3)], { preview: false });
  assert.equal(retry.created, 0);
  assert.equal(retry.failed, 2);
  assert.equal(f.writes.length, 2);
});

test("large imports use bounded chunks and a duplicate race fails only its atomic chunk", async () => {
  const f = fixture();
  const batches = [];
  const rows = Array.from({ length: 205 }, (_, index) => row(`LOC-${index}`, {}, index + 2));
  const result = await f.run(rows, { preview: false, saveBatch: async (values) => {
    batches.push(values);
    if (values.some((value) => value.code === "LOC-150")) throw new Error("A record with those details already exists.");
  } });
  assert.deepEqual(batches.map((batch) => batch.length), [100, 100, 5]);
  assert.equal(result.created, 105);
  assert.equal(result.failed, 100);
  assert.ok(result.results.slice(0, 100).every((entry) => entry.success));
  assert.ok(result.results.slice(100, 200).every((entry) => !entry.success && /already exists/.test(entry.error)));
  assert.ok(result.results.slice(200).every((entry) => entry.success));
  assert.equal(result.results[150].row, 152);
  assert.equal(f.queries.length, 3);
});

test("the import route denies portal, read-only and out-of-scope facility callers before parsing the file", async () => {
  const facilityId = "11111111-1111-1111-1111-111111111111";
  const otherId = "22222222-2222-2222-2222-222222222222";
  const noDatabase = { from() { throw new Error("Denied callers must not read or write data."); } };
  const actor = { userId: "operator", companyId: "company", permissions: new Set(["Warehouse.Write"]), facilityScopeResolved: true, facilityIds: new Set([facilityId]) };
  const request = new Request("http://localhost/facilities/import", { method: "POST", body: "not a workbook" });
  const path = ["facilities", facilityId, "locations", "import"];
  await assert.rejects(handleLocations(request, path, new URL(request.url), noDatabase, { ...actor, userId: null, companyId: null }), (error) => error.status === 403);
  await assert.rejects(handleLocations(request, path, new URL(request.url), noDatabase, { ...actor, permissions: new Set(["Warehouse.Read"]) }), (error) => error.status === 403);
  await assert.rejects(handleLocations(request, ["facilities", otherId, "locations", "import"], new URL(request.url), noDatabase, actor), (error) => error.status === 404);
  const template = new Request("http://localhost/facilities/template");
  await assert.rejects(handleLocations(template, ["facilities", otherId, "locations", "import", "template"], new URL(template.url), noDatabase, actor), (error) => error.status === 404);
});

test("a permitted colleague can discover preview support within their facility", async () => {
  const facilityId = "11111111-1111-1111-1111-111111111111";
  const actor = { userId: "colleague", companyId: "company", permissions: new Set(["Warehouse.Read"]), facilityScopeResolved: true, facilityIds: new Set([facilityId]) };
  const request = new Request("http://localhost/warehouse/capabilities");
  const admin = { from(table) {
    assert.match(table, /^sys_WMS/);
    const chain = { select: () => chain, eq: () => Promise.resolve({ data: [] }) };
    return chain;
  } };
  assert.deepEqual(await handleLocations(request, ["facilities", facilityId, "locations", "import", "capabilities"], new URL(request.url), admin, actor), { version: 1, preview: true });
});

test("the route reuses zones and creates locations in bulk with accurate atomic-chunk failures", async () => {
  // A small workbook adapter isolates persistence from XLSX binary decoding,
  // which has separate shared-parser and workbook round-trip coverage.
  const excelAdapter = `export default { Workbook: class {
    constructor() { this.xlsx = { load: async (bytes) => { this.rows = JSON.parse(new TextDecoder().decode(bytes)); } }; }
    getWorksheet() {
      const row = (values) => ({ eachCell: (fn) => values.forEach((value, index) => fn({ value }, index + 1)), getCell: (index) => ({ value: values[index - 1] }) });
      return { getRow: (index) => row(this.rows[index - 1]), eachRow: (fn) => this.rows.forEach((values, index) => fn(row(values), index + 1)) };
    }
  } };`;
  const injectedRoute = routeModule.replaceAll('"npm:exceljs@4.4.0"', JSON.stringify(`data:text/javascript;base64,${Buffer.from(excelAdapter).toString("base64")}`));
  const { handleLocations: handle } = await import(`data:text/javascript;base64,${Buffer.from(injectedRoute).toString("base64")}`);
  const facilityId = "11111111-1111-1111-1111-111111111111";
  const actor = { userId: "colleague", companyId: "company", permissions: new Set(["Warehouse.Write"]), facilityScopeResolved: true, facilityIds: new Set([facilityId]) };
  const inserted = [], batchSizes = [];
  let zoneReads = 0, zoneCreates = 0;
  const admin = { from(table) {
    let payload;
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain, limit: () => chain, single: () => chain, maybeSingle: () => chain,
      insert(value) { payload = value; return chain; },
      then(resolve) {
        let data = [], error = null;
        if (table === "sys_WMSLocationTypes") data = references.types;
        if (table === "sys_WMSLocationStatuses") data = references.statuses;
        if (table === "sys_WMSZoneTypes") data = references.zoneTypes;
        if (table === "WMS_Zones") {
          if (payload) { zoneCreates++; data = payload; }
          else { zoneReads++; data = null; }
        }
        if (table === "WMS_Locations" && payload) {
          assert.ok(Array.isArray(payload));
          batchSizes.push(payload.length);
          if (batchSizes.length === 2) error = { code: "23505", message: "concurrent duplicate" };
          else { inserted.push(...payload); data = payload.map((entry) => ({ WMSLocation_ID: entry.WMSLocation_ID })); }
        }
        return Promise.resolve({ data, error }).then(resolve);
      },
    };
    return chain;
  } };
  const form = new FormData();
  form.set("defaultTypeCode", "rack");
  form.set("file", new File([JSON.stringify([["Code", "Zone"], ...Array.from({ length: 205 }, (_, index) => [`LOC-${index}`, "cold"])])], "locations.xlsx"));
  const request = new Request("http://localhost/warehouse/import", { method: "POST", body: form });
  const result = await handle(request, ["facilities", facilityId, "locations", "import"], new URL(request.url), admin, actor);
  assert.deepEqual(batchSizes, [100, 100, 5]);
  assert.equal(zoneReads, 1);
  assert.equal(zoneCreates, 1);
  assert.equal(inserted.length, 105);
  assert.equal(result.created, 105);
  assert.equal(result.failed, 100);
  assert.ok(result.results.slice(100, 200).every((entry) => !entry.success));
  assert.ok(inserted.every((entry) => entry.WMSLocation_FacilityID === facilityId && entry.WMSLocation_CreatedBy === actor.userId && entry.WMSLocation_IsActive && entry.WMSLocation_ZoneID));
});
