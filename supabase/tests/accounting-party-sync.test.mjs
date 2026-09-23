import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
const source = readFileSync(
  new URL("../functions/_shared/accounting-party-sync.ts", import.meta.url),
  "utf8",
).replace(
  /^import[\s\S]*?from ["\']\.\/erpnext\.ts["\'];?\n/,
  `const erpNextList=()=>{},erpNextCreate=()=>{},erpNextRequest=()=>{},erpNextOrigin=()=> 'https://erp.example';\n`,
);
const mod = await import(
  `data:text/javascript;base64,${
    Buffer.from(stripTypeScriptTypes(source)).toString("base64")
  }`
);
const {
  ensurePartyDocument: ensure,
  PartySyncBlocked,
  partyIdentityField: keyField,
} = mod;
const input = (patch = {}) => ({
  type: "Customer",
  keyField,
  key: "identity-1",
  expected: {
    [keyField]: "identity-1",
    customer_name: "Example Freight",
    default_currency: "GBP",
  },
  allowCreate: true,
  ...patch,
});
function provider(seed = [], options = {}) {
  const docs = new Map(seed.map((r) => [r.name, { ...r }]));
  const calls = [];
  const io = {
    async list(type, fields, filters) {
      calls.push(["list", type]);
      if (type === "Custom Field") {
        return [{
          name: "key",
          fieldtype: "Data",
          unique: options.unique === false ? 0 : 1,
        }];
      }
      return [...docs.values()].filter((r) =>
        filters.every(([k, op, v]) => r[k] === v)
      );
    },
    async get(type, id) {
      calls.push(["get", id]);
      if (!docs.has(id)) throw new Error("404");
      return { ...docs.get(id) };
    },
    async create(type, payload) {
      calls.push(["create"]);
      if ([...docs.values()].some((r) => r[keyField] === payload[keyField])) {
        throw new Error("Duplicate");
      }
      const doc = { ...payload, name: `ERP-${docs.size + 1}`, modified: "v1" };
      docs.set(doc.name, doc);
      if (options.lostResponse) throw new Error("Timeout");
      return { ...doc };
    },
    async update(type, id, payload) {
      calls.push(["update"]);
      if (options.concurrentEdit) throw new Error("TimestampMismatch");
      docs.set(id, { ...docs.get(id), ...payload });
      return docs.get(id);
    },
  };
  return { io, docs, calls };
}
test("creates then reads back; retry finds exact identity without another create", async () => {
  const p = provider();
  const first = await ensure(input(), p.io);
  assert.equal(first.action, "created");
  assert.equal(first.id, "ERP-1");
  const second = await ensure(input(), p.io);
  assert.equal(second.action, "verified");
  assert.equal(p.calls.filter((c) => c[0] === "create").length, 1);
});
test("lost create response recovers through provider-enforced unique identity", async () => {
  const p = provider([], { lostResponse: true });
  const r = await ensure(input(), p.io);
  assert.equal(r.action, "recovered");
  assert.equal(p.docs.size, 1);
});
test("concurrent creates converge on one unique provider account", async () => {
  const p = provider();
  const results = await Promise.all([
    ensure(input(), p.io),
    ensure(input(), p.io),
  ]);
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  assert.equal(p.docs.size, 1);
});
test("same name is a conflict, including disabled records; never auto-link", async () => {
  for (const disabled of [0, 1]) {
    const p = provider([{
      name: "OTHER",
      customer_name: "Example Freight",
      disabled,
    }]);
    await assert.rejects(ensure(input(), p.io), /already has this name/);
    assert.equal(p.calls.filter((c) => c[0] === "create").length, 0);
  }
});
test("requires unique identity metadata before any provider mutation", async () => {
  const p = provider([], { unique: false });
  await assert.rejects(ensure(input(), p.io), /unique Data field/);
  assert.equal(p.docs.size, 0);
});
test("reviewed mapping cannot point at another identity or silently adopt an untagged party", async () => {
  for (const key of [undefined, "foreign-identity"]) {
    const p = provider([{
      name: "MAPPED",
      customer_name: "Example Freight",
      [keyField]: key,
    }]);
    await assert.rejects(
      ensure(input({ mappedId: "MAPPED" }), p.io),
      PartySyncBlocked,
    );
    assert.equal(p.calls.filter((c) => c[0] === "update").length, 0);
  }
});
test("local changes update only a previously verified unchanged provider snapshot", async () => {
  const previous = input().expected;
  const p = provider([{ name: "ERP-1", ...previous, modified: "v1" }]);
  const r = await ensure(
    input({ previous, expected: { ...previous, customer_name: "New name" } }),
    p.io,
  );
  assert.equal(r.action, "updated");
  assert.equal(p.docs.get("ERP-1").customer_name, "New name");
});
test("external changes block rather than overwrite; disabled parties block too", async () => {
  for (const patch of [{ customer_name: "External edit" }, { disabled: 1 }]) {
    const previous = input().expected,
      p = provider([{ name: "ERP-1", ...previous, ...patch }]);
    await assert.rejects(
      ensure(
        input({
          previous,
          expected: { ...previous, customer_name: "Local edit" },
        }),
        p.io,
      ),
      PartySyncBlocked,
    );
    assert.equal(p.calls.filter((c) => c[0] === "update").length, 0);
  }
});
test("provider recalculation or dropped fields fail readback", async () => {
  const p = provider();
  const original = p.io.get;
  p.io.get = async (...a) => ({
    ...await original(...a),
    default_currency: "EUR",
  });
  await assert.rejects(ensure(input(), p.io), /readback differs/);
});
test("missing mapped provider record is never replaced automatically", async () => {
  const p = provider();
  await assert.rejects(
    ensure(input({ mappedId: "DELETED", allowCreate: false }), p.io),
  );
  assert.equal(p.docs.size, 0);
});
test("supplier roles use their own provider type and identity", async () => {
  const p = provider();
  const r = await ensure(
    input({
      type: "Supplier",
      key: "supplier-key",
      expected: {
        [keyField]: "supplier-key",
        supplier_name: "Supplier",
        default_currency: "GBP",
      },
    }),
    p.io,
  );
  assert.equal(r.payload.supplier_name, "Supplier");
});
test("provider concurrency rejection does not report success", async () => {
  const previous = input().expected,
    p = provider([{ name: "ERP-1", ...previous, modified: "v1" }], {
      concurrentEdit: true,
    });
  await assert.rejects(
    ensure(
      input({ previous, expected: { ...previous, customer_name: "Changed" } }),
      p.io,
    ),
    /TimestampMismatch/,
  );
});

function database(seed) {
  return {
    from(table) {
      let rows = seed[table] || [];
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          rows = rows.filter((r) => r[k] === v);
          return q;
        },
        in(k, vs) {
          rows = rows.filter((r) => vs.includes(r[k]));
          return q;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        single() {
          return q.maybeSingle();
        },
        then(resolve) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
}
const scopeSeed = () => ({
  cmp_LegalEntities: [{
    LegalEntity_ID: "entity",
    Company_ID: "company",
    LegalEntity_IsActive: true,
  }],
  CRM_AccountProfiles: [{
    CRMAccount_OrgID: "org",
    CRMAccount_CompanyID: "company",
    CRMAccount_IsDeleted: false,
    CRMAccount_LegalEntityID: "entity",
  }],
  Org_Master_Type: [{ Org_ID: "org", OrgType_ID: "customer" }],
  Org_Types: [{ OrgType_ID: "customer", OrgType_Name: "Customer" }],
});
test("scope permits shared company accounts without a creator restriction", async () => {
  const result = await mod.assertAccountingPartyScope(
    database(scopeSeed()),
    { ACCIC_LegalEntityID: "entity" },
    "org",
    "customer",
  );
  assert.equal(result.Company_ID, "company");
});
test("missing profile explains repair without suggesting a duplicate provider customer", async () => {
  const seed=scopeSeed(); seed.CRM_AccountProfiles=[];
  await assert.rejects(mod.assertAccountingPartyScope(database(seed),{ACCIC_LegalEntityID:'entity'},'org','customer'),
    /active CRM profile is missing or ambiguous.*do not create another accounts-system customer/);
});
test("foreign company, removed role, deleted profile and inactive entity fail closed", async () => {
  for (
    const mutate of [
      (s) => s.CRM_AccountProfiles[0].CRMAccount_CompanyID = "other",
      (s) => s.Org_Master_Type = [],
      (s) => s.CRM_AccountProfiles[0].CRMAccount_IsDeleted = true,
      (s) => s.cmp_LegalEntities[0].LegalEntity_IsActive = false,
      (s) =>
        s.CRM_AccountProfiles[0].CRMAccount_LegalEntityID = "another-entity",
    ]
  ) {
    const seed = scopeSeed();
    mutate(seed);
    await assert.rejects(
      mod.assertAccountingPartyScope(
        database(seed),
        { ACCIC_LegalEntityID: "entity" },
        "org",
        "customer",
      ),
      PartySyncBlocked,
    );
  }
});
test("absent provider concurrency version blocks updates", async () => {
  const previous = input().expected,
    p = provider([{ name: "ERP-1", ...previous }]);
  await assert.rejects(
    ensure(
      input({ previous, expected: { ...previous, customer_name: "Changed" } }),
      p.io,
    ),
    /concurrency version/,
  );
});
test("wrong provider ID in readback is rejected", async () => {
  const p = provider();
  const get = p.io.get;
  p.io.get = async (...args) => ({ ...await get(...args), name: "WRONG" });
  await assert.rejects(ensure(input(), p.io), /different record identifier/);
});

test("a customer and supplier may have separate accounting addresses with the same title", async () => {
  const docs = new Map([["other-address", { name: "other-address", address_title: "Dual role", links: [{ link_doctype: "Customer", link_name: "CUST-1" }] }]]);
  const io = {
    async list(type, fields, filters) { if (type === "Custom Field") return [{ unique: 1, fieldtype: "Data" }]; return [...docs.values()].filter(row => filters.every(([field,,value]) => row[field] === value)); },
    async get(type, id) { return docs.get(id); },
    async create(type, payload) { const record = { ...payload, name: "supplier-address", links: [{ link_doctype: "Supplier", link_name: "SUP-1" }] }; docs.set(record.name, record); return record; },
    async update() { throw new Error("Existing customer address must remain untouched"); },
  };
  const result = await ensure({ type: "Address", keyField: "custom_multideck_address_key", key: "supplier-key", expected: { address_title: "Dual role", custom_multideck_address_key: "supplier-key" }, allowCreate: true, parentLink: { type: "Supplier", id: "SUP-1" } }, io);
  assert.equal(result.id, "supplier-address");
  assert.equal(docs.get("other-address").custom_multideck_address_key, undefined);
});
