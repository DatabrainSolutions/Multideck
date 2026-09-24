import {
  erpNextCreate,
  erpNextList,
  erpNextOrigin,
  erpNextRequest,
} from "./erpnext.ts";

type Row = Record<string, any>;
export class PartySyncBlocked extends Error {}
const block = (message: string): never => {
  throw new PartySyncBlocked(message);
};
const flag = (v: unknown) => v === true || v === 1 || v === "1";
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export const partyIdentityField = "custom_multideck_party_key";
export const addressIdentityField = "custom_multideck_address_key";

export type PartyTransport = {
  list: typeof erpNextList;
  create: typeof erpNextCreate;
  get: (doctype: string, id: string) => Promise<Row>;
  update: (doctype: string, id: string, payload: Row) => Promise<Row>;
};
export const transport: PartyTransport = {
  list: erpNextList,
  create: erpNextCreate,
  async get(type, id) {
    const r = await erpNextRequest<{ data: Row }>(
      `/api/resource/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    );
    return r.data;
  },
  async update(type, id, payload) {
    const r = await erpNextRequest<{ data: Row }>(
      `/api/resource/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
      { method: "PUT", body: payload },
    );
    return r.data;
  },
};

// Only compare the fields owned by this integration. Unexpected provider edits
// to those fields are reconciliation conflicts, never silent overwrites.
export function projectPartyFields(record: Row, expected: Row) {
  return Object.fromEntries(
    Object.keys(expected).map((key) => [key, record[key] ?? ""]),
  );
}
export function assertPartyReadback(record: Row, expected: Row) {
  if (!record || !text(record.name) || flag(record.disabled)) {
    block("The provider account is missing or disabled.");
  }
  const differences = Object.keys(expected).filter((key) =>
    !equal(record[key] ?? "", expected[key])
  );
  if (differences.length) {
    block(`Provider readback differs for: ${differences.join(", ")}.`);
  }
}

export async function uniqueField(type: string, field: string, io: PartyTransport) {
  const rows = await io.list("Custom Field", [
    "name",
    "fieldname",
    "unique",
    "fieldtype",
  ], [["dt", "=", type], ["fieldname", "=", field]]);
  if (
    rows.length !== 1 || !flag(rows[0].unique) || rows[0].fieldtype !== "Data"
  ) {
    block(
      `Configure a unique Data field ${field} on ERPNext ${type} before automatic sync.`,
    );
  }
}

export async function ensurePartyDocument(input: {
  type: string;
  keyField: string;
  key: string;
  expected: Row;
  previous?: Row | null;
  mappedId?: string | null;
  allowCreate: boolean;
  parentLink?: { type: string; id: string };
}, io: PartyTransport = transport) {
  const { type, keyField, key, expected, previous, mappedId, allowCreate } =
    input;
  await uniqueField(type, keyField, io);
  const matches = await io.list(type, ["name"], [[keyField, "=", key]]);
  if (matches.length > 1) {
    block("The stable Multideck identity matches multiple provider records.");
  }
  const identified = text(matches[0]?.name);
  if (mappedId && identified && mappedId !== identified) {
    block("The reviewed mapping conflicts with the stable provider identity.");
  }
  let id = mappedId || identified;
  let record: Row;
  let action = "verified";
  if (id) {
    record = await io.get(type, id);
    if (text(record[keyField]) && record[keyField] !== key) {
      block("The provider record belongs to a different Multideck identity.");
    }
    if (!text(record[keyField])) {
      block(
        "The existing mapping needs a reviewed identity link before automatic updates.",
      );
    }
    if (flag(record.disabled)) {
      block("The mapped provider account is disabled.");
    }
    if (!equal(projectPartyFields(record, expected), expected)) {
      if (!previous || !equal(projectPartyFields(record, previous), previous)) {
        block(
          "The provider account changed outside Multideck. Review the differences before updating it.",
        );
      }
      if (!text(record.modified)) {
        block(
          "The provider did not return a concurrency version for this record.",
        );
      }
      await io.update(type, id, { ...expected, modified: record.modified });
      action = "updated";
    }
  } else {
    if (!allowCreate) {
      block(
        "The mapped provider account is missing; review it before creating a replacement.",
      );
    }
    // An exact name is evidence of a potential duplicate, never authority to link.
    const nameField = type === "Customer"
      ? "customer_name"
      : type === "Supplier"
      ? "supplier_name"
      : "address_title";
    const names = await io.list(type, ["name"], [[
      nameField,
      "=",
      expected[nameField],
    ]]);
    let collision = names.length > 0;
    if (type === "Address" && input.parentLink) {
      if (names.length >= 200) block("Too many matching provider addresses. Review the accounting address manually.");
      const candidates = await Promise.all(names.map((row) => io.get(type, String(row.name))));
      collision = candidates.some((row) => Array.isArray(row.links) && row.links.some((link: Row) =>
        link.link_doctype === input.parentLink!.type && link.link_name === input.parentLink!.id));
    }
    if (collision) {
      block(
        "A provider record already has this name. Review and link the exact account before retrying.",
      );
    }
    try {
      record = await io.create(type, expected);
      id = text(record.name);
      action = "created";
    } catch (error) {
      // A unique provider field arbitrates competing creates and lost responses.
      const recovered = await io.list(type, ["name"], [[keyField, "=", key]]);
      if (recovered.length !== 1 || !text(recovered[0].name)) throw error;
      id = text(recovered[0].name);
      action = "recovered";
    }
  }
  if (!id) block("The provider did not return an account identifier.");
  record = await io.get(type, id!);
  if (record?.name !== id) {
    block("The provider readback returned a different record identifier.");
  }
  assertPartyReadback(record, expected);
  return { id: id!, payload: projectPartyFields(record, expected), action };
}

async function checked(query: any): Promise<any> {
  const { data, error } = await query;
  if (error) throw new Error("The account sync database query failed.");
  return data;
}

export async function assertAccountingPartyScope(
  admin: any,
  connection: Row,
  orgId: string,
  partyType: string,
) {
  if (!["customer", "supplier"].includes(partyType)) {
    block("Choose a customer or supplier role.");
  }
  const entity = await checked(
    admin.from("cmp_LegalEntities").select("*").eq(
      "LegalEntity_ID",
      connection.ACCIC_LegalEntityID,
    ).maybeSingle(),
  );
  if (!entity?.LegalEntity_IsActive) {
    block("The legal entity is inactive or missing.");
  }
  const profiles = await checked(
    admin.from("CRM_AccountProfiles").select(
      "CRMAccount_OrgID,CRMAccount_CompanyID,CRMAccount_LegalEntityID,CRMAccount_IsDeleted",
    ).eq("CRMAccount_OrgID", orgId).eq(
      "CRMAccount_CompanyID",
      entity.Company_ID,
    ).eq("CRMAccount_IsDeleted", false),
  );
  if (profiles.length !== 1) {
    block("An active CRM profile is missing or ambiguous for this organisation in this company. Ask an administrator to repair the organisation record before linking; do not create another accounts-system customer.");
  }
  if (profiles[0].CRMAccount_LegalEntityID &&
      profiles[0].CRMAccount_LegalEntityID !== entity.LegalEntity_ID) {
    block(
      "The organisation is no longer in this connection’s company and legal entity.",
    );
  }
  const links = await checked(
    admin.from("Org_Master_Type").select("OrgType_ID").eq("Org_ID", orgId),
  );
  const types = links.length
    ? await checked(
      admin.from("Org_Types").select("OrgType_Name").in(
        "OrgType_ID",
        links.map((r: Row) => r.OrgType_ID),
      ),
    )
    : [];
  if (
    !types.some((r: Row) => text(r.OrgType_Name).toLowerCase() === partyType)
  ) block("The organisation no longer has this customer or supplier role.");
  return entity;
}

export async function loadPartySource(admin: any, job: Row) {
  const connection = await checked(
    admin.from("ACCI_Connections").select("*").eq("ACCIC_ID", job.connection_id)
      .maybeSingle(),
  );
  if (!connection || connection.ACCIC_StatusCode !== "active") {
    block("The accounting connection is inactive or missing.");
  }
  const entity = await assertAccountingPartyScope(
    admin,
    connection,
    job.org_id,
    job.party_type,
  );
  const org = await checked(
    admin.from("Org_Master").select("*").eq("Org_id", job.org_id).single(),
  );
  const ops = await checked(
    admin.from("CRM_AccountOperationalProfiles").select(
      "CRMAccountOps_InvoicePreferencesJSON",
    ).eq("CRMAccountOps_OrgID", job.org_id).maybeSingle(),
  );
  if (
    org.Org_CRMRelationshipStatusCode === "blocked" ||
    ops?.CRMAccountOps_InvoicePreferencesJSON
        ?.[`${job.party_type}AccountingStatusCode`] === "blocked"
  ) block("This organisation is blocked for accounting.");
  const currency = await checked(
    admin.from("sys_Currency").select("Currency_Code").eq(
      "Currency_ID",
      org.Org_BaseCurrency,
    ).maybeSingle(),
  );
  if (!/^[A-Z]{3}$/.test(currency?.Currency_Code ?? "")) {
    block("A valid account currency is required.");
  }
  const mappings = await checked(
    admin.from("ACCI_PartyMappings").select("*").eq(
      "ACCIPM_ConnectionID",
      job.connection_id,
    ).eq("ACCIPM_OrgID", job.org_id).in("ACCIPM_PartyType", [
      job.party_type,
      "both",
    ]).eq("ACCIPM_IsActive", true),
  );
  if (
    mappings.length > 1 ||
    mappings.some((r: Row) => r.ACCIPM_PartyType === "both")
  ) block("Review conflicting or combined customer/supplier mappings.");
  const settings = connection.ACCIC_SettingsJSON?.partySync ?? {};
  const selection = await admin.rpc("multideck_accounting_address", {
    p_org: job.org_id,
    p_role: job.party_type,
  });
  if (selection.error?.code === "22023") block(selection.error.message);
  if (selection.error) throw new Error("The accounting address could not be read.");
  const selected = selection.data;
  if (!selected) block("A complete accounting address is required for this account.");
  let address = null;
  if (selected) {
    const country = await checked(
      admin.from("RefCountry").select("RN_Desc").eq(
        "RN_Code",
        selected.OrgAdd_Country,
      ).maybeSingle(),
    );
    if (
      !selected.OrgAdd_Line1 || !selected.OrgAdd_TownCity || !country?.RN_Desc
    ) block("Complete the accounting address line, town/city and country.");
    address = {
      address_title: org.Org_Name,
      address_type: "Billing",
      address_line1: selected.OrgAdd_Line1,
      address_line2: selected.OrgAdd_Line2 || "",
      city: selected.OrgAdd_TownCity,
      state: selected.OrgAdd_CountyState || "",
      pincode: selected.OrgAdd_PostZipCode || "",
      country: country.RN_Desc,
      email_id: selected.OrgAdd_MainEmail || "",
      phone: selected.OrgAdd_MainPhone || "",
    };
  }
  return {
    connection,
    entity,
    org,
    currency: currency.Currency_Code,
    mapping: mappings[0],
    settings,
    address,
  };
}

export async function accountingPartyIdentity(entity: Row, job: Row) {
  const namespace = text(Deno.env.get("SUPABASE_URL"));
  if (!namespace) block("The tenant identity is unavailable.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${namespace}|${entity.Company_ID}|${entity.LegalEntity_ID}|${job.org_id}|${job.party_type}`,
    ),
  );
  return Array.from(
    new Uint8Array(digest),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}

// Called only after the existing Finance Integration mapping workflow has
// checked scope, role and reverse mappings and the operator selected an ID.
export async function adoptReviewedPartyIdentity(
  admin: any,
  connectionId: string,
  orgId: string,
  partyType: string,
  providerId: string,
  io: PartyTransport = transport,
) {
  const job = {
    connection_id: connectionId,
    org_id: orgId,
    party_type: partyType,
  };
  const source = await loadPartySource(admin, job);
  if (
    source.connection.ACCIC_ProviderCode !== "erpnext" ||
    source.settings.siteOrigin !== erpNextOrigin()
  ) {
    block(
      "The reviewed provider site does not match the configured tenant endpoint.",
    );
  }
  const type = partyType === "customer" ? "Customer" : "Supplier";
  const key = await accountingPartyIdentity(source.entity, job);
  await uniqueField(type, partyIdentityField, io);
  const records = await io.list(type, ["name"], [[
    partyIdentityField,
    "=",
    key,
  ]]);
  if (records.some((r) => r.name !== providerId)) {
    block("Another ERPNext record already owns this Multideck identity.");
  }
  const record = await io.get(type, providerId);
  if (record?.name !== providerId || flag(record.disabled)) {
    block("The reviewed provider account is missing or disabled.");
  }
  if (text(record[partyIdentityField]) && record[partyIdentityField] !== key) {
    block(
      "This provider account is already linked to another Multideck identity.",
    );
  }
  if (!text(record[partyIdentityField])) {
    if (!text(record.modified)) {
      block("The provider did not return a concurrency version.");
    }
    await io.update(type, providerId, {
      [partyIdentityField]: key,
      modified: record.modified,
    });
  }
  const saved = await io.get(type, providerId);
  if (saved?.name !== providerId || saved[partyIdentityField] !== key) {
    block("The reviewed provider identity was not saved correctly.");
  }
}

export async function syncAccountingParty(
  admin: any,
  job: Row,
  io: PartyTransport = transport,
) {
  const source = await loadPartySource(admin, job);
  const { connection, entity, org, settings } = source;
  if (connection.ACCIC_ProviderCode !== "erpnext") {
    block(
      `Automatic verified account sync is not enabled for ${connection.ACCIC_ProviderCode}. Use its reviewed workflow until its recovery/readback adapter is validated.`,
    );
  }
  if (settings.enabled !== true) {
    block(
      "Enable automatic account sync and configure the provider defaults for this connection.",
    );
  }
  if (settings.siteOrigin !== erpNextOrigin()) {
    block(
      "The configured connection site does not match the tenant ERPNext endpoint.",
    );
  }
  const company = text(connection.ACCIC_ExternalTenantName);
  if (!company) block("Configure the exact ERPNext company.");
  const companies = await io.list("Company", ["name"], [[
    "name",
    "=",
    company,
  ]]);
  if (companies.length !== 1 || companies[0].name !== company) {
    block("The exact connected ERPNext company is unavailable.");
  }
  const customer = job.party_type === "customer",
    type = customer ? "Customer" : "Supplier";
  const group = text(
    customer ? settings.customerGroup : settings.supplierGroup,
  );
  const territory = text(settings.territory);
  if (!group || (customer && !territory)) {
    block(
      "Configure the customer/supplier group and customer territory before automatic account creation.",
    );
  }
  const groups = await io.list(customer ? "Customer Group" : "Supplier Group", [
    "name",
    "is_group",
  ], [["name", "=", group]]);
  if (groups.length !== 1 || flag(groups[0].is_group)) {
    block(
      "The configured accounting group is unavailable or is a parent group.",
    );
  }
  if (customer) {
    const rows = await io.list("Territory", ["name", "is_group"], [[
      "name",
      "=",
      territory,
    ]]);
    if (rows.length !== 1 || flag(rows[0].is_group)) {
      block(
        "The configured customer territory is unavailable or is a parent territory.",
      );
    }
  }
  const key = await accountingPartyIdentity(entity, job);
  const expected: Row = {
    [partyIdentityField]: key,
    [customer ? "customer_name" : "supplier_name"]: org.Org_Name,
    [customer ? "customer_type" : "supplier_type"]: "Company",
    [customer ? "customer_group" : "supplier_group"]: group,
    default_currency: source.currency,
    ...(customer ? { territory } : {}),
  };
  // Check all prerequisites before a provider create, including address identity.
  if (source.address) await uniqueField("Address", addressIdentityField, io);
  if (!source.address && job.verified_payload?.address) {
    block(
      "The accounting address was removed. Review the provider address before continuing.",
    );
  }
  const party = await ensurePartyDocument({
    type,
    keyField: partyIdentityField,
    key,
    expected,
    previous: job.verified_payload?.party,
    mappedId: source.mapping?.ACCIPM_ProviderPartyID || job.provider_id,
    allowCreate: !source.mapping && !job.provider_id,
  }, io);
  let address = null;
  if (source.address) {
    const expectedAddress = { ...source.address, [addressIdentityField]: key };
    // Frappe child-link rows carry generated metadata; verify the exact parent link
    // separately while retaining only the integration-owned address scalar fields.
    const addressIo = {
      ...io,
      create: async (t: string, p: Row) =>
        io.create(t, {
          ...p,
          links: [{ link_doctype: type, link_name: party.id }],
        }),
    };
    address = await ensurePartyDocument({
      type: "Address",
      keyField: addressIdentityField,
      key,
      expected: expectedAddress,
      previous: job.verified_payload?.address?.payload,
      mappedId: job.verified_payload?.address?.id,
      allowCreate: !job.verified_payload?.address,
      parentLink: { type, id: party.id },
    }, addressIo);
    const saved = await io.get("Address", address.id);
    if (
      !Array.isArray(saved.links) || saved.links.length !== 1 ||
      saved.links[0].link_doctype !== type ||
      saved.links[0].link_name !== party.id
    ) block("The provider address links do not match this exact account.");
  }
  // Revalidate scope/source immediately before finalisation. The database revision
  // fence catches CRM edits; this catches connection revocation during network IO.
  const latest = await loadPartySource(admin, job);
  if (!equal(source, latest)) {
    block(
      "The account or connection changed during delivery. Retry using the latest details.",
    );
  }
  return {
    status: "synced",
    providerId: party.id,
    providerName: org.Org_Name,
    action: party.action,
    verifiedPayload: { party: party.payload, address },
    message: `Verified the ERPNext ${job.party_type} and accounting address.`,
    evidence: {
      scope: "party_master",
      providerOrigin: settings.siteOrigin,
      externalCompany: company,
      fields: Object.keys(expected),
      addressId: address?.id ?? null,
      checkedAt: new Date().toISOString(),
    },
  };
}

export async function processAccountingParties(admin: any) {
  const jobs = await checked(
    admin.rpc("multideck_accounting_claim_parties", { p_limit: 5 }),
  );
  const results = await Promise.all((jobs ?? []).map(async (job: Row) => {
    let result: Row;
    try {
      result = await syncAccountingParty(admin, job);
    } catch (error) {
      result = {
        status: error instanceof PartySyncBlocked ? "blocked" : "failed",
        message: error instanceof PartySyncBlocked
          ? error.message
          : "The provider or database could not complete this sync. The durable job will retry; inspect service logs for the failed dependency.",
        evidence: { scope: "party_master" },
      };
    }
    const completed = await checked(
      admin.rpc("multideck_accounting_finish_party", {
        p_id: job.id,
        p_token: job.lease_token,
        p_revision: job.revision,
        p_result: result,
      }),
    );
    return { id: job.id, status: completed ? result.status : "queued" };
  }));
  return { processed: results.length, results };
}
