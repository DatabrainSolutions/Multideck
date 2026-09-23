import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const root = new URL('../functions/warehouse/', import.meta.url);
const moduleUrls = new Map();
function moduleUrl(path) {
  if (moduleUrls.has(path)) return moduleUrls.get(path);
  let code = stripTypeScriptTypes(readFileSync(new URL(path, root), 'utf8'));
  code = code.replace(/from "(\.\/[^\"]+)"/g, (_, relative) => `from "${moduleUrl(path.slice(0, path.lastIndexOf('/') + 1) + relative.slice(2))}"`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  moduleUrls.set(path, url);
  return url;
}
const spreadsheet = await import(moduleUrl('shared/spreadsheet-import.ts'));
const item = await import(moduleUrl('shared/item-import.ts'));
const http = await import(moduleUrl('shared/http.ts'));
const database = await import(moduleUrl('shared/database.ts'));
function sheet(entries) {
  const rows = new Map(entries.map(([number, cells]) => [number, {
    getCell: index => ({ value: cells[index - 1] ?? null }),
    eachCell: callback => cells.forEach((value, index) => { if (value !== null && value !== undefined) callback({ value }, index + 1); }),
  }]));
  return { getRow: number => rows.get(number), eachRow: callback => rows.forEach((row, number) => callback(row, number)) };
}
const parse = entries => spreadsheet.parseImportSheet(sheet(entries), item.itemImportColumns);

test('minimum details and sparse Excel row numbers survive parsing', () => {
  const rows = parse([[1, [' sku ', 'DESCRIPTION']], [4, ['00001', 'Spare part']], [5, [null, null]], [10, ['B', 'Second']]]);
  assert.deepEqual(rows.map(row => row.row), [4, 10]);
  assert.equal(rows[0].values.sku, '00001');
  const input = item.prepareItemImportInput(rows[0].values);
  assert.equal(input.baseUomCode, 'EA');
  assert.equal(input.quantityScale, 0);
  assert.equal(input.minimumMovementQuantity, 1);
  assert.equal(input.requiresLot, false);
});

test('required, unknown and duplicate headers reject whole workbook', () => {
  assert.throws(() => parse([[1, ['SKU']], [2, ['A']]]), /Description/);
  assert.throws(() => parse([[1, ['SKU', 'Description', 'SKU']], [2, ['A', 'Item', 'B']]]), /more than once/);
  assert.throws(() => parse([[1, ['SKU', 'Description', 'Lot tracking']], [2, ['A', 'Item', 'Yes']]]), /Unknown column/);
  assert.throws(() => parse([[1, ['SKU', 'Description']]]), /at least one row/);
});

test('strict cells prevent formulas, unheaded data, truncation and coercion from being lost', () => {
  const rows = parse([[1, ['SKU', 'Description', 'Net weight KG', 'Requires lot']],
    [2, ['A', 'Item', '12kg', 'perhaps']],
    [3, ['B', { formula: 'A1', result: 'unsafe' }]],
    [4, ['C', 'Item', '', '', 'extra value']],
    [5, ['D'.repeat(121), 'Item']],
    [6, ['F', 'Item', -1, true]],
    [7, ['G', 'Item', { error: '#VALUE!' }]],
  ]);
  for (const row of rows) assert.ok(row.error, `row ${row.row} must report error`);
  assert.match(rows[0].error, /Net weight KG.*Requires lot/);
  assert.match(rows[2].error, /no column heading/);
});

test('all optional fields parse and quantity defaults are explicit', () => {
  const rows = parse([[1, item.itemImportColumns.map(column => column.header)], [2, item.itemImportColumns.map(column => {
    if (column.key === 'sku') return 'X';
    if (column.key === 'description') return 'Bulk liquid';
    if (column.key === 'quantityBasisCode') return 'weight';
    if (column.key === 'countryOfOriginCode') return 'gb';
    if (column.key === 'quantityScale') return 3;
    if (column.key === 'minimumMovementQuantity') return '0.005';
    if (column.kind === 'number') return 1.5;
    if (column.kind === 'boolean') return 'Yes';
    return 'text';
  })]]);
  assert.equal(rows[0].error, undefined);
  const prepared = item.prepareItemImportInput(rows[0].values);
  assert.equal(prepared.countryOfOriginCode, 'GB');
  assert.equal(prepared.netWeightKg, 1.5);
  assert.equal(prepared.requiresSerial, true);
  assert.equal(prepared.commodityDescription, 'text');
  assert.equal(prepared.minimumMovementQuantity, 0.005);
});

test('quantity consistency and workbook/file limits are enforced', () => {
  assert.throws(() => item.prepareItemImportInput({ quantityBasisCode: 'weight', allowsFractionalQuantity: false }), /require fractional/);
  assert.throws(() => item.prepareItemImportInput({ quantityScale: 2, minimumMovementQuantity: 0.001, allowsFractionalQuantity: true }), /decimal places/);
  assert.throws(() => item.prepareItemImportInput({ countryOfOriginCode: '1G' }), /two-letter/);
  assert.throws(() => spreadsheet.parseImportSheet(sheet([[1, ['SKU', 'Description']], [2, ['A', 'Item']], [3, ['B', 'Item']]]), item.itemImportColumns, { maxRows: 1 }), /up to 1/);
  assert.throws(() => spreadsheet.validateImportFile(new File(['data'], 'items.csv')), /\.xlsx/);
  assert.throws(() => spreadsheet.validateImportFile(new File([], 'items.xlsx')), /10 MB/);
  assert.throws(() => spreadsheet.validateImportFile(new File([new Uint8Array(spreadsheet.MAX_IMPORT_BYTES + 1)], 'items.xlsx')), /10 MB/);
});

const source = readFileSync(new URL('routes/items.ts', root), 'utf8');
const payload = source.slice(source.indexOf('function itemPayload('), source.indexOf('export async function handleItems('));
const importRoute = source.slice(source.indexOf('async function importItems(')).replace('await import("npm:exceljs@4.4.0")', '({ default: ExcelJSTest })');
const authentication = readFileSync(new URL('shared/authentication.ts', root), 'utf8');
const capability = authentication.slice(authentication.indexOf('export function requireCapability('), authentication.indexOf('export function requireInternalPermission(')).replace('export ', '');
const customerScope = authentication.slice(authentication.indexOf('export function requireCustomerScope('), authentication.indexOf('export async function companyOfficeIds(')).replace('export ', '');
const facilityId = '11111111-1111-1111-1111-111111111111';
const customerOrgId = '22222222-2222-2222-2222-222222222222';
async function runImport(entries, { preview = false, existing = [], active = true, permitted = true, scope = true, insertError = null, external = false } = {}) {
  let inserted = null;
  const filters = [];
  const admin = {
    from(table) {
      const query = {
        select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, limit() { return query; },
        maybeSingle: async () => ({ data: table === 'Org_Master' ? { Org_id: customerOrgId } : active ? { WMSFacility_ID: facilityId } : null }),
        insert: async values => { inserted = values; return { error: insertError }; },
      }; return query;
    },
    rpc: async () => ({ data: existing, error: null }),
  };
  const parsedSheet = sheet(entries);
  const ExcelJS = { Workbook: class { constructor() { this.xlsx = { load: async () => {} }; this.worksheets = [parsedSheet]; } getWorksheet() { return parsedSheet; } } };
  const dependencies = { ...http, ...database, ...spreadsheet, ...item, ExcelJSTest: ExcelJS, companyFacilityIds: async () => scope ? [facilityId] : [], customerFacilityPair: (org, facility) => `${org}:${facility}` };
  const fn = new Function(...Object.keys(dependencies), `${capability}\n${customerScope}\n${payload}\n${importRoute}\nreturn importItems;`)(...Object.values(dependencies));
  const actor = { companyId: external ? null : 'company', userId: 'user', capabilities: new Set(permitted ? ['warehouse_items:manage'] : []), organisationIds: new Set(external && !scope ? [] : [customerOrgId]), customerFacilityPairs: new Set(scope ? [`${customerOrgId}:${facilityId}`] : []) };
  const form = new FormData();
  form.set('customerOrgId', customerOrgId); form.set('facilityId', facilityId); form.set('file', new File(['fixture'], 'items.xlsx')); if (preview) form.set('preview', 'true');
  const response = await fn(new Request('https://example.test/items/import', { method: 'POST', body: form }), admin, actor);
  return { response, inserted, filters };
}

test('preview validates all optional values without writes, confirm persists them through itemPayload', async () => {
  const entries = [[1, ['SKU', 'Description', 'Net weight KG', 'Gross weight KG', 'Requires lot', 'Requires expiry', 'Length M', 'Minimum temperature C', 'Maximum temperature C']], [8, ['001', 'Cold food', 2, 3, 'Yes', 'Yes', 0.5, -10, -5]]];
  const preview = await runImport(entries, { preview: true });
  assert.equal(preview.inserted, null);
  assert.equal(preview.response.preview, true);
  assert.equal(preview.response.created, 0);
  assert.equal(preview.response.results[0].row, 8);
  assert.equal(preview.response.results[0].values.netWeightKg, 2);
  const confirmed = await runImport(entries);
  assert.equal(confirmed.response.created, 1);
  assert.equal(confirmed.response.preview, false);
  assert.equal(confirmed.inserted[0].WMSItem_NetWeightKG, 2);
  assert.equal(confirmed.inserted[0].WMSItem_RequiresLot, true);
  assert.equal(confirmed.inserted[0].WMSItem_RequiresExpiry, true);
  assert.equal(confirmed.inserted[0].WMSItem_TemperatureMinC, -10);
  assert.equal(confirmed.inserted[0].WMSItem_DefaultFacilityID, facilityId);
  assert.ok(confirmed.filters.some(([key, value]) => key === 'WMSFacility_IsActive' && value === true));
});

test('any invalid row blocks every write; duplicates report every duplicate row with real row numbers', async () => {
  const entries = [[1, ['SKU', 'Description', 'Net weight KG', 'Gross weight KG']], [3, ['Valid', 'Fine']], [9, ['Bad', 'Broken', 5, 2]], [12, ['dup', 'A']], [14, ['DUP', 'B']], [15, ['existing', 'Previously created']]];
  const { response, inserted } = await runImport(entries, { existing: ['existing'] });
  assert.equal(inserted, null);
  assert.equal(response.created, 0);
  assert.equal(response.failed, 4);
  assert.equal(response.preview, true);
  assert.deepEqual(response.results.filter(row => !row.success).map(row => row.row), [9, 12, 14, 15]);
  assert.match(response.results[1].error, /Gross weight/);
});

test('permission, active warehouse and customer scope checks deny writes and previews', async () => {
  const entries = [[1, ['SKU', 'Description']], [2, ['A', 'Item']]];
  await assert.rejects(runImport(entries, { permitted: false, preview: true }), error => error.status === 403);
  await assert.rejects(runImport(entries, { active: false }), /active facility/);
  await assert.rejects(runImport(entries, { scope: false }), /active facility/);
  await assert.rejects(runImport(entries, { scope: false, external: true, preview: true }), error => error.status === 403);
});

test('database duplicate race fails the whole atomic insert with a recoverable message', async () => {
  await assert.rejects(runImport([[1, ['SKU', 'Description']], [2, ['A', 'Item']]], { insertError: { code: '23505' } }), error => error.status === 409 && /No items were imported/.test(error.message));
});

test('capability handshake declares preview support only to item managers without mutating data', async () => {
  const handlerSource = source.replace(/^import \{[\s\S]*?\} from "[^"]+";\n/gm, '').replace('export async function handleItems', 'async function handleItems');
  const handler = new Function('HttpError', `${capability}\n${handlerSource}\nreturn handleItems;`)(http.HttpError);
  const url = new URL('https://example.test/items/import/capabilities');
  const request = new Request(url);
  assert.deepEqual(await handler(request, ['items', 'import', 'capabilities'], url, null, { companyId: 'company', capabilities: new Set(['warehouse_items:manage']) }), { version: 1, preview: true });
  await assert.rejects(handler(request, ['items', 'import', 'capabilities'], url, null, { companyId: 'company', capabilities: new Set(['warehouse_items:read']) }), error => error.status === 403);
});


test('item dimensions and temperatures reject silent database rounding and overflow', () => {
  assert.throws(() => item.prepareItemImportInput({ netWeightKg: 0.0000001 }), /6 decimal places/);
  assert.throws(() => item.prepareItemImportInput({ temperatureMinC: -2.0001 }), /3 decimal places/);
  assert.throws(() => item.prepareItemImportInput({ grossWeightKg: 1e12 }), /no greater than/);
  assert.equal(item.prepareItemImportInput({ netWeightKg: 0.000001 }).netWeightKg, 0.000001);
});
