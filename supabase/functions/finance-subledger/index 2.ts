import {
  AccountingProviderPartialError,
  accountingProvider,
  accountingProviders,
  exportFinanceRecord,
  preflightFinanceRecord,
  type AccountingProviderCode,
  type CanonicalFinanceExport,
} from "../_shared/accounting-providers.ts"
import { authenticate, body, corsHeaders, currentInternalUser, failure, HttpError, json, requirePermission, routeParts } from "../_shared/backend.ts"
import { erpNextCreate, erpNextList, erpNextOrigin, erpNextRequest } from "../_shared/erpnext.ts"
import { hyperExtConfigured, hyperExtRequest, hyperExtStatus } from "../_shared/hyperext.ts"

type LineInput = { description: string; quantity?: number; unitAmount?: number; taxRatePercent?: number; taxCode?: string | null; chargeCode?: string | null; jobCostingLineId?: string | null; lineType?: "service" | "ancillary" }
type DraftInput = { type: "sl_invoice" | "credit_note" | "pl_invoice" | "debit_note"; legalEntityId: string; partyOrgId: string; documentDate?: string; dueDate?: string | null; currencyCode?: string; exchangeRate?: number; lines: LineInput[]; sourceJobId?: string | null; idempotencyKey?: string; sourceExtractionId?: string }
type CashInput = { type: "customer_receipt" | "supplier_payment"; legalEntityId: string; partyOrgId: string; bankAccountId: string; transactionDate?: string; currencyCode?: string; exchangeRate?: number; amount: number; reference?: string | null; allocations?: Array<{ documentId: string; amount: number }>; idempotencyKey?: string }
type ConfigInput = { legalEntityId: string; chartTemplateCode: string; providerCode?: AccountingProviderCode; externalCompany: string; countryCode: string; taxRegistrationNo?: string | null; reportingBasisCode?: string | null; effectiveFrom?: string }
type AdministrationInput = { settings: Record<string, unknown>; reason?: string | null }
type PartyMappingInput = { connectionId: string; orgId: string; partyType: "customer" | "supplier"; providerPartyId: string }
type ProviderCustomerInput = {
  connectionId: string
  orgId: string
  customerType?: "Company" | "Individual"
  customerGroup?: string
  territory?: string
  currencyCode?: string | null
  paymentTerms?: string | null
  accountReference?: string | null
  vatNumber?: string | null
  creditLimit?: number | null
  paymentDueDays?: number | null
}
type Ledger = "receivables" | "payables"

function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : "" }
function isUuid(value: string) { return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) }
function currency(value: unknown) { const code = clean(value, 3).toUpperCase(); return /^[A-Z]{3}$/.test(code) ? code : null }
function finiteNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : null }
function sameAmount(left: number, right: number) { return Math.abs(left - right) <= 0.01 }
function taxAdviceConfirmed(value: any) { return value?.taxSettings?.localAdviceConfirmed === true }
function demoTaxConfirmed(value: any) { return value?.taxSettings?.demoOnlyConfirmed === true }
function erpNextEnvironment() { return new URL(erpNextOrigin()).hostname === "demo-finance.multideck.app" ? "sandbox" : "production" }
function pendingProviderCurrency(run: any) {
  const preflight = run?.FINConfigRun_PreviewJSON?.providerPreflight
  const code = currency(preflight?.baseCurrencyCode)
  const requestedAt = Date.parse(clean(run?.FINConfigRun_RequestedAt, 40))
  return run?.FINConfigRun_StatusCode === "awaiting_approval"
    && code
    && preflight?.providerRecordsChanged === false
    && clean(preflight?.providerCode, 40) === clean(run?.FINConfigRun_ProviderCode, 40)
    && clean(preflight?.externalCompany, 180) === clean(run?.FINConfigRun_ExternalCompany, 180)
    && Number.isFinite(requestedAt)
    && requestedAt >= Date.now() - 24 * 60 * 60 * 1000
    ? code
    : null
}
function ledger(value: string | undefined): Ledger { if (value === "receivables" || value === "payables") return value; throw new HttpError(400, "Choose receivables or payables.") }
function viewPermission(value: Ledger) { return value === "receivables" ? "Finance.Receivables.View" : "Finance.Payables.View" }
function draftPermission(value: Ledger) { return value === "receivables" ? "Finance.Receivables.Draft" : "Finance.Payables.Draft" }
function cashPermission(type: CashInput["type"]) { return type === "customer_receipt" ? "Finance.Receivables.Cash" : "Finance.Payables.Cash" }
function documentPermission(type: DraftInput["type"]) { return type === "sl_invoice" || type === "credit_note" ? "Finance.Receivables.Draft" : "Finance.Payables.Draft" }
function typeLedger(type: string): Ledger { return type === "sl_invoice" || type === "credit_note" || type === "customer_receipt" ? "receivables" : "payables" }

function rpcFailure(error: any, fallback: string) {
  if (!error) return
  const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" || error.code === "22P02" || error.code === "23514" ? 400 : 500
  throw new HttpError(status, clean(error.message, 500) || fallback)
}

async function entityIds(admin: any, current: any) {
  const { data, error } = await admin.from("cmp_LegalEntities").select("LegalEntity_ID").eq("Company_ID", current.Company_ID)
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((entity: any) => entity.LegalEntity_ID)
}

async function legalEntity(admin: any, current: any, id: string) {
  if (!isUuid(id)) throw new HttpError(400, "Choose a legal entity.")
  const { data, error } = await admin.from("cmp_LegalEntities").select("LegalEntity_ID,LegalEntity_Name,LegalEntity_BaseCurrencyCodeSnapshot,Company_ID").eq("LegalEntity_ID", id).eq("Company_ID", current.Company_ID).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, "That legal entity is not in this workspace.")
  return data
}

async function assertErpNextCompanySetup(entity: any, externalCompany: string) {
  const expectedCurrency = currency(entity.LegalEntity_BaseCurrencyCodeSnapshot)
  const companies = await erpNextList("Company", ["name", "default_currency"], [["name", "=", externalCompany]])
  const company = companies.find((candidate) => candidate.name === externalCompany)
  if (!company) throw new HttpError(409, `ERPNext Company ${externalCompany} is no longer available. Choose an existing Company, then retry.`)
  const providerCurrency = currency(company.default_currency)
  if (!providerCurrency) {
    throw new HttpError(409, `ERPNext Company ${externalCompany} has no valid default currency. Set Default Currency in ERPNext, then retry.`)
  }
  if (expectedCurrency && providerCurrency !== expectedCurrency) {
    throw new HttpError(409, `ERPNext Company ${externalCompany} uses ${providerCurrency}, but ${entity.LegalEntity_Name} uses ${expectedCurrency}. Align the base currencies before approving Finance Setup.`)
  }
  return providerCurrency
}

async function erpNextCatalog(admin: any, current: any, connectionId: string) {
  if (!isUuid(connectionId)) throw new HttpError(404, "Accounting connection not found.")
  const ids = await entityIds(admin, current)
  const { data: connection, error } = ids.length
    ? await admin.from("ACCI_Connections")
      .select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_LegalEntityID,ACCIC_StatusCode,ACCIC_ExternalTenantName,ACCIC_ExternalBaseCurrencyCode")
      .eq("ACCIC_ID", connectionId)
      .in("ACCIC_LegalEntityID", ids)
      .maybeSingle()
    : { data: null, error: null }
  if (error) throw new HttpError(500, error.message)
  if (!connection) throw new HttpError(404, "Accounting connection not found.")
  if (connection.ACCIC_StatusCode !== "active") throw new HttpError(409, "Activate this accounting connection before loading provider records.")
  if (connection.ACCIC_ProviderCode !== "erpnext") throw new HttpError(409, "Provider records are not available for this accounting adapter yet.")
  const externalCompany = clean(connection.ACCIC_ExternalTenantName, 180)
  const baseCurrencyCode = currency(connection.ACCIC_ExternalBaseCurrencyCode)
  if (!externalCompany || !baseCurrencyCode) throw new HttpError(409, "Re-approve this accounting connection before loading provider records.")

  const [customers, suppliers, items, accounts, taxTemplates] = await Promise.all([
    erpNextList("Customer", ["name", "customer_name", "disabled"]),
    erpNextList("Supplier", ["name", "supplier_name", "disabled"]),
    erpNextList("Item", ["name", "item_code", "item_name", "item_group", "stock_uom", "is_stock_item", "disabled"]),
    erpNextList("Account", ["name", "account_name", "root_type", "account_type", "account_currency", "company", "is_group", "disabled"], [["company", "=", externalCompany]]),
    erpNextList("Item Tax Template", ["name", "title", "company"], [["company", "=", externalCompany]]),
  ])
  const active = (record: any) => record.disabled !== true && record.disabled !== 1 && record.disabled !== "1"
  const byName = (left: any, right: any) => clean(left.name, 240).localeCompare(clean(right.name, 240))
  return {
    connectionId: connection.ACCIC_ID,
    externalCompany,
    baseCurrencyCode,
    customers: customers.filter(active).sort(byName),
    suppliers: suppliers.filter(active).sort(byName),
    items: items.filter(active).sort(byName),
    accounts: accounts.filter((record: any) => active(record) && record.company === externalCompany).sort(byName),
    taxTemplates: taxTemplates.filter((record: any) => record.company === externalCompany).sort(byName),
  }
}

async function upsertErpNextPartyMapping(admin: any, current: any, input: PartyMappingInput) {
  if (!isUuid(input.connectionId)) throw new HttpError(404, "Accounting connection not found.")
  if (!isUuid(input.orgId)) throw new HttpError(404, "Organisation not found.")
  const partyType = clean(input.partyType, 20)
  if (partyType !== "customer" && partyType !== "supplier") throw new HttpError(400, "Choose customer or supplier for this provider mapping.")
  const providerPartyId = clean(input.providerPartyId, 240)
  if (!providerPartyId) throw new HttpError(400, "Choose the exact ERPNext customer or supplier.")

  const ids = await entityIds(admin, current)
  const [connectionResult, organisationResult, profileResult] = await Promise.all([
    ids.length
      ? admin.from("ACCI_Connections")
        .select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_StatusCode,ACCIC_LegalEntityID,ACCIC_ExternalTenantName")
        .eq("ACCIC_ID", input.connectionId)
        .in("ACCIC_LegalEntityID", ids)
        .maybeSingle()
      : { data: null, error: null },
    admin.from("Org_Master").select("Org_id,Org_Name,Org_CRMRelationshipStatusCode").eq("Org_id", input.orgId).maybeSingle(),
    admin.from("CRM_AccountOperationalProfiles").select("CRMAccountOps_InvoicePreferencesJSON").eq("CRMAccountOps_OrgID", input.orgId).maybeSingle(),
  ])
  if (connectionResult.error || organisationResult.error || profileResult.error) {
    throw new HttpError(500, connectionResult.error?.message ?? organisationResult.error?.message ?? profileResult.error?.message)
  }
  const connection = connectionResult.data
  const organisation = organisationResult.data
  if (!connection) throw new HttpError(404, "Accounting connection not found.")
  if (!organisation) throw new HttpError(404, "Organisation not found.")
  if (connection.ACCIC_ProviderCode !== "erpnext" || connection.ACCIC_StatusCode !== "active") {
    throw new HttpError(409, "Activate the ERPNext connection before reviewing party mappings.")
  }
  if (clean(organisation.Org_CRMRelationshipStatusCode, 60).toLowerCase() === "blocked") {
    throw new HttpError(409, "This organisation is blocked. Restore its relationship status before mapping it to ERPNext.")
  }
  const preferences = profileResult.data?.CRMAccountOps_InvoicePreferencesJSON && typeof profileResult.data.CRMAccountOps_InvoicePreferencesJSON === "object"
    ? profileResult.data.CRMAccountOps_InvoicePreferencesJSON
    : {}
  const accountingStatus = clean(preferences[partyType === "customer" ? "customerAccountingStatusCode" : "supplierAccountingStatusCode"], 20) || "active"
  if (accountingStatus === "blocked") throw new HttpError(409, `This organisation's ${partyType} accounting status is blocked.`)

  const doctype = partyType === "customer" ? "Customer" : "Supplier"
  const providerRecords = await erpNextList(doctype, ["name", partyType === "customer" ? "customer_name" : "supplier_name", "disabled"], [["name", "=", providerPartyId]])
  const providerRecord = providerRecords.find((candidate: any) => candidate.name === providerPartyId)
  if (!providerRecord) throw new HttpError(409, `ERPNext ${partyType} ${providerPartyId} does not exist. Reload the provider catalogue, then choose an existing record.`)
  if (providerRecord.disabled === true || providerRecord.disabled === 1 || providerRecord.disabled === "1") {
    throw new HttpError(409, `ERPNext ${partyType} ${providerPartyId} is disabled. Enable it or choose another record.`)
  }

  const [localMappings, providerMappings] = await Promise.all([
    admin.from("ACCI_PartyMappings").select("ACCIPM_ID,ACCIPM_ProviderPartyID,ACCIPM_ProviderPartyName,ACCIPM_IsActive,ACCIPM_PartyType").eq("ACCIPM_ConnectionID", connection.ACCIC_ID).eq("ACCIPM_OrgID", organisation.Org_id).in("ACCIPM_PartyType", [partyType, "both"]),
    admin.from("ACCI_PartyMappings").select("ACCIPM_ID,ACCIPM_OrgID,ACCIPM_PartyType").eq("ACCIPM_ConnectionID", connection.ACCIC_ID).eq("ACCIPM_ProviderPartyID", providerPartyId).in("ACCIPM_PartyType", [partyType, "both"]).eq("ACCIPM_IsActive", true),
  ])
  if (localMappings.error || providerMappings.error) throw new HttpError(500, localMappings.error?.message ?? providerMappings.error?.message)
  if ((providerMappings.data ?? []).some((mapping: any) => mapping.ACCIPM_OrgID !== organisation.Org_id)) {
    throw new HttpError(409, `ERPNext ${partyType} ${providerPartyId} is already mapped to another Multideck organisation.`)
  }
  if ((localMappings.data ?? []).some((mapping: any) => mapping.ACCIPM_PartyType === "both")) {
    throw new HttpError(409, "This organisation already has a combined customer/supplier mapping. Review and retire it before adding a directional mapping.")
  }

  const providerName = clean(providerRecord[partyType === "customer" ? "customer_name" : "supplier_name"], 240) || providerPartyId
  const existing = (localMappings.data ?? []).find((mapping: any) => mapping.ACCIPM_PartyType === partyType)
  const changed = !existing || existing.ACCIPM_ProviderPartyID !== providerPartyId || existing.ACCIPM_ProviderPartyName !== providerName || existing.ACCIPM_IsActive !== true
  const verifiedAt = new Date().toISOString()
  const { data: mapping, error: mappingError } = await admin.from("ACCI_PartyMappings").upsert({
    ACCIPM_ConnectionID: connection.ACCIC_ID,
    ACCIPM_OrgID: organisation.Org_id,
    ACCIPM_PartyType: partyType,
    ACCIPM_ProviderPartyID: providerPartyId,
    ACCIPM_ProviderPartyCode: providerPartyId,
    ACCIPM_ProviderPartyName: providerName,
    ACCIPM_LastSyncedAt: verifiedAt,
    ACCIPM_IsActive: true,
  }, { onConflict: "ACCIPM_ConnectionID,ACCIPM_OrgID,ACCIPM_PartyType" })
    .select("ACCIPM_ID,ACCIPM_ConnectionID,ACCIPM_OrgID,ACCIPM_PartyType,ACCIPM_ProviderPartyID,ACCIPM_ProviderPartyCode,ACCIPM_ProviderPartyName,ACCIPM_LastSyncedAt,ACCIPM_IsActive")
    .single()
  if (mappingError || !mapping) {
    if (mappingError?.code === "23505") throw new HttpError(409, "That provider party is already mapped. Review the existing mapping before changing it.")
    throw new HttpError(500, mappingError?.message ?? "The reviewed provider party mapping could not be saved.")
  }
  if (changed) {
    const { error: eventError } = await admin.from("ACCI_SyncEvents").insert({
      ACCISE_ConnectionID: connection.ACCIC_ID,
      ACCISE_Severity: "info",
      ACCISE_EventCode: "party_mapping_verified",
      ACCISE_Message: `Verified one ERPNext ${partyType} mapping.`,
      ACCISE_LocalTable: "Org_Master",
      ACCISE_LocalID: organisation.Org_id,
      ACCISE_ExternalObjectType: doctype,
      ACCISE_ExternalID: providerPartyId,
      ACCISE_ResponsePayloadJSON: { partyType, providerName, verifiedAt },
    })
    if (eventError) throw new HttpError(500, "The party mapping was saved, but its provider audit event could not be retained. Retry to reconcile it.")
  }
  return { changed, mapping }
}

async function providerCustomerConnection(admin: any, current: any, connectionId: string) {
  if (!isUuid(connectionId)) throw new HttpError(404, "Accounting connection not found.")
  const ids = await entityIds(admin, current)
  const { data, error } = ids.length
    ? await admin.from("ACCI_Connections")
      .select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_StatusCode,ACCIC_LegalEntityID,ACCIC_ExternalTenantName,ACCIC_ExternalBaseCurrencyCode,ACCIC_Environment")
      .eq("ACCIC_ID", connectionId)
      .in("ACCIC_LegalEntityID", ids)
      .maybeSingle()
    : { data: null, error: null }
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, "Accounting connection not found.")
  if (data.ACCIC_StatusCode !== "active") throw new HttpError(409, "Activate this accounting connection before setting up customers.")
  if (data.ACCIC_ProviderCode !== "erpnext" && data.ACCIC_ProviderCode !== "sage_50") throw new HttpError(409, "This accounting system does not have a customer setup wizard yet.")
  return data
}

async function providerCustomerOrganisation(admin: any, orgId: string) {
  if (!isUuid(orgId)) throw new HttpError(404, "Organisation not found.")
  const [organisationResult, profileResult, addressResult] = await Promise.all([
    admin.from("Org_Master").select("Org_id,Org_Name,Org_AccCode,Org_BaseCurrency,Org_CRMRelationshipStatusCode").eq("Org_id", orgId).maybeSingle(),
    admin.from("CRM_AccountOperationalProfiles").select("CRMAccountOps_InvoicePreferencesJSON").eq("CRMAccountOps_OrgID", orgId).maybeSingle(),
    admin.from("Org_Addresses").select("OrgAdd_ID,Org_NameOverride,OrgAdd_Line1,OrgAdd_Line2,OrgAdd_TownCity,OrgAdd_CountyState,OrgAdd_PostZipCode,OrgAdd_Country,OrgAdd_MainEmail,OrgAdd_MainPhone").eq("Org_ID", orgId).eq("OrgAdd_IsActive", true).order("OrgAdd_UpdatedAt", { ascending: false }),
  ])
  if (organisationResult.error || profileResult.error || addressResult.error) throw new HttpError(500, organisationResult.error?.message ?? profileResult.error?.message ?? addressResult.error?.message)
  const organisation = organisationResult.data
  if (!organisation) throw new HttpError(404, "Organisation not found.")
  if (clean(organisation.Org_CRMRelationshipStatusCode, 60).toLowerCase() === "blocked") throw new HttpError(409, "This organisation is blocked. Restore its relationship status before adding it to an accounting system.")
  const preferences = profileResult.data?.CRMAccountOps_InvoicePreferencesJSON && typeof profileResult.data.CRMAccountOps_InvoicePreferencesJSON === "object" ? profileResult.data.CRMAccountOps_InvoicePreferencesJSON : {}
  if (clean(preferences.customerAccountingStatusCode, 20) === "blocked") throw new HttpError(409, "This organisation's customer accounting status is blocked.")

  const addresses = addressResult.data ?? []
  const addressIds = addresses.map((address: any) => address.OrgAdd_ID)
  const [linksResult, typesResult, currencyResult] = await Promise.all([
    addressIds.length ? admin.from("Org_AddressTypes").select("OrgAdd_ID,OrgAddType_Type,OrgAddType_IsDefault").in("OrgAdd_ID", addressIds) : { data: [], error: null },
    admin.from("sys_AddressTypes").select("sys_AddressType_ID,sys_AddressType_Code").eq("sys_AddressType_IsActive", true),
    organisation.Org_BaseCurrency ? admin.from("sys_Currency").select("Currency_Code").eq("Currency_ID", organisation.Org_BaseCurrency).maybeSingle() : { data: null, error: null },
  ])
  if (linksResult.error || typesResult.error || currencyResult.error) throw new HttpError(500, linksResult.error?.message ?? typesResult.error?.message ?? currencyResult.error?.message)
  const typeCodes = new Map((typesResult.data ?? []).map((type: any) => [String(type.sys_AddressType_ID), type.sys_AddressType_Code]))
  const addressScore = new Map<string, number>()
  for (const link of linksResult.data ?? []) {
    const code = typeCodes.get(String(link.OrgAddType_Type))
    const score = (code === "billing" ? 30 : code === "main" ? 20 : code === "postal" ? 10 : 0) + (link.OrgAddType_IsDefault ? 5 : 0)
    addressScore.set(link.OrgAdd_ID, Math.max(addressScore.get(link.OrgAdd_ID) ?? 0, score))
  }
  const address = [...addresses].sort((left: any, right: any) => (addressScore.get(right.OrgAdd_ID) ?? 0) - (addressScore.get(left.OrgAdd_ID) ?? 0))[0] ?? null
  const countryCode = clean(address?.OrgAdd_Country, 2).toUpperCase() || null
  const { data: country, error: countryError } = countryCode ? await admin.from("RefCountry").select("RN_Desc").eq("RN_Code", countryCode).maybeSingle() : { data: null, error: null }
  if (countryError) throw new HttpError(500, countryError.message)
  return {
    organisation: {
      id: organisation.Org_id,
      name: organisation.Org_Name,
      accountCode: organisation.Org_AccCode,
      currencyCode: currency(currencyResult.data?.Currency_Code),
    },
    billingAddress: address ? {
      id: address.OrgAdd_ID,
      name: address.Org_NameOverride ?? null,
      line1: address.OrgAdd_Line1 ?? null,
      line2: address.OrgAdd_Line2 ?? null,
      townCity: address.OrgAdd_TownCity ?? null,
      countyState: address.OrgAdd_CountyState ?? null,
      postZipCode: address.OrgAdd_PostZipCode ?? null,
      countryCode,
      countryName: country?.RN_Desc ?? null,
      email: address.OrgAdd_MainEmail ?? null,
      phone: address.OrgAdd_MainPhone ?? null,
    } : null,
  }
}

async function providerCustomerContext(admin: any, current: any, connectionId: string, orgId: string) {
  const connection = await providerCustomerConnection(admin, current, connectionId)
  const source = await providerCustomerOrganisation(admin, orgId)
  const { data: mapping, error: mappingError } = await admin.from("ACCI_PartyMappings")
    .select("ACCIPM_ID,ACCIPM_ConnectionID,ACCIPM_OrgID,ACCIPM_PartyType,ACCIPM_ProviderPartyID,ACCIPM_ProviderPartyCode,ACCIPM_ProviderPartyName,ACCIPM_LastSyncedAt,ACCIPM_IsActive")
    .eq("ACCIPM_ConnectionID", connection.ACCIC_ID)
    .eq("ACCIPM_OrgID", orgId)
    .in("ACCIPM_PartyType", ["customer", "both"])
    .eq("ACCIPM_IsActive", true)
    .limit(1)
    .maybeSingle()
  if (mappingError) throw new HttpError(500, mappingError.message)
  const provider = accountingProvider(connection.ACCIC_ProviderCode)
  if (connection.ACCIC_ProviderCode === "erpnext") {
    const [customers, customerGroups, territories, paymentTerms] = await Promise.all([
      erpNextList("Customer", ["name", "customer_name", "customer_group", "territory", "default_currency", "disabled"]),
      erpNextList("Customer Group", ["name", "is_group"]),
      erpNextList("Territory", ["name", "is_group"]),
      erpNextList("Payment Terms Template", ["name", "template_name"]),
    ])
    const active = (record: any) => record.disabled !== true && record.disabled !== 1 && record.disabled !== "1"
    return {
      provider: { code: connection.ACCIC_ProviderCode, name: provider?.name ?? "ERPNext", connectionId: connection.ACCIC_ID, externalCompany: connection.ACCIC_ExternalTenantName },
      ...source,
      mapping,
      erpNext: {
        customers: customers.filter(active).sort((left: any, right: any) => clean(left.customer_name ?? left.name, 240).localeCompare(clean(right.customer_name ?? right.name, 240))),
        customerGroups: customerGroups.map((item: any) => item.name).filter(Boolean).sort(),
        territories: territories.map((item: any) => item.name).filter(Boolean).sort(),
        paymentTerms: paymentTerms.map((item: any) => item.name).filter(Boolean).sort(),
      },
      sage50: null,
    }
  }
  let connectorStatus: Awaited<ReturnType<typeof hyperExtStatus>> | null = null
  let connectorError: string | null = null
  if (hyperExtConfigured()) {
    try { connectorStatus = await hyperExtStatus() } catch (error) { connectorError = error instanceof Error ? error.message : "The HyperExt connector is not ready." }
  } else connectorError = "The tenant HyperExt Sage 50 connector has not been configured."
  return {
    provider: { code: connection.ACCIC_ProviderCode, name: provider?.name ?? "Sage 50 Desktop", connectionId: connection.ACCIC_ID, externalCompany: connection.ACCIC_ExternalTenantName },
    ...source,
    mapping,
    erpNext: null,
    sage50: {
      configured: hyperExtConfigured(),
      ready: Boolean(connectorStatus?.sdoStatusOk && connectorStatus?.odbcStatusOk),
      status: connectorStatus,
      error: connectorError,
      suggestedAccountReference: clean(source.organisation.accountCode, 20).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8),
    },
  }
}

async function saveSageCustomerMapping(admin: any, connection: any, organisation: any, accountReference: string) {
  const [localResult, externalResult] = await Promise.all([
    admin.from("ACCI_PartyMappings").select("ACCIPM_ID,ACCIPM_PartyType").eq("ACCIPM_ConnectionID", connection.ACCIC_ID).eq("ACCIPM_OrgID", organisation.id).in("ACCIPM_PartyType", ["customer", "both"]).eq("ACCIPM_IsActive", true),
    admin.from("ACCI_PartyMappings").select("ACCIPM_ID,ACCIPM_OrgID").eq("ACCIPM_ConnectionID", connection.ACCIC_ID).eq("ACCIPM_ProviderPartyID", accountReference).in("ACCIPM_PartyType", ["customer", "both"]).eq("ACCIPM_IsActive", true),
  ])
  if (localResult.error || externalResult.error) throw new HttpError(500, localResult.error?.message ?? externalResult.error?.message)
  if ((externalResult.data ?? []).some((item: any) => item.ACCIPM_OrgID !== organisation.id)) throw new HttpError(409, `Sage 50 account ${accountReference} is already mapped to another Multideck organisation.`)
  if ((localResult.data ?? []).some((item: any) => item.ACCIPM_PartyType === "both")) throw new HttpError(409, "This organisation already has a combined customer/supplier mapping. Review it before adding a customer mapping.")
  const verifiedAt = new Date().toISOString()
  const { data: mapping, error } = await admin.from("ACCI_PartyMappings").upsert({
    ACCIPM_ConnectionID: connection.ACCIC_ID,
    ACCIPM_OrgID: organisation.id,
    ACCIPM_PartyType: "customer",
    ACCIPM_ProviderPartyID: accountReference,
    ACCIPM_ProviderPartyCode: accountReference,
    ACCIPM_ProviderPartyName: organisation.name,
    ACCIPM_LastSyncedAt: verifiedAt,
    ACCIPM_IsActive: true,
  }, { onConflict: "ACCIPM_ConnectionID,ACCIPM_OrgID,ACCIPM_PartyType" }).select("ACCIPM_ID,ACCIPM_ConnectionID,ACCIPM_OrgID,ACCIPM_PartyType,ACCIPM_ProviderPartyID,ACCIPM_ProviderPartyCode,ACCIPM_ProviderPartyName,ACCIPM_LastSyncedAt,ACCIPM_IsActive").single()
  if (error || !mapping) throw new HttpError(500, error?.message ?? "The Sage 50 customer mapping could not be saved.")
  return mapping
}

async function createProviderCustomer(admin: any, current: any, input: ProviderCustomerInput) {
  const connection = await providerCustomerConnection(admin, current, input.connectionId)
  const source = await providerCustomerOrganisation(admin, input.orgId)
  const { data: existingMapping, error: mappingError } = await admin.from("ACCI_PartyMappings").select("*").eq("ACCIPM_ConnectionID", connection.ACCIC_ID).eq("ACCIPM_OrgID", source.organisation.id).in("ACCIPM_PartyType", ["customer", "both"]).eq("ACCIPM_IsActive", true).limit(1).maybeSingle()
  if (mappingError) throw new HttpError(500, mappingError.message)
  if (existingMapping) return { created: false, mapping: existingMapping, warning: null }

  if (connection.ACCIC_ProviderCode === "erpnext") {
    const customerGroup = clean(input.customerGroup, 140)
    const territory = clean(input.territory, 140)
    if (!customerGroup || !territory) throw new HttpError(400, "Choose the ERPNext customer group and territory.")
    const customerType = input.customerType === "Individual" ? "Individual" : "Company"
    const [groups, territories, duplicates] = await Promise.all([
      erpNextList("Customer Group", ["name"], [["name", "=", customerGroup]]),
      erpNextList("Territory", ["name"], [["name", "=", territory]]),
      erpNextList("Customer", ["name", "customer_name", "disabled"], [["customer_name", "=", source.organisation.name]]),
    ])
    if (!groups.some((item: any) => item.name === customerGroup)) throw new HttpError(409, "That ERPNext customer group is no longer available. Reload the wizard and choose again.")
    if (!territories.some((item: any) => item.name === territory)) throw new HttpError(409, "That ERPNext territory is no longer available. Reload the wizard and choose again.")
    const duplicate = duplicates.find((item: any) => item.disabled !== true && item.disabled !== 1 && item.disabled !== "1")
    if (duplicate) throw new HttpError(409, `ERPNext already has ${duplicate.customer_name || duplicate.name}. Choose Link existing customer instead of creating a duplicate.`)
    const defaultCurrency = currency(input.currencyCode) ?? source.organisation.currencyCode ?? undefined
    const paymentTerms = clean(input.paymentTerms, 140) || undefined
    const created = await erpNextCreate("Customer", {
      customer_name: source.organisation.name,
      customer_type: customerType,
      customer_group: customerGroup,
      territory,
      default_currency: defaultCurrency,
      payment_terms: paymentTerms,
    })
    const providerPartyId = clean(created?.name, 240)
    if (!providerPartyId) throw new HttpError(502, "ERPNext created the customer without returning its identifier. Review ERPNext before retrying.")
    const mapped = await upsertErpNextPartyMapping(admin, current, { connectionId: connection.ACCIC_ID, orgId: source.organisation.id, partyType: "customer", providerPartyId })
    let warning: string | null = null
    let addressCreated = false
    if (source.billingAddress?.line1 && source.billingAddress.countryName) {
      try {
        await erpNextCreate("Address", {
          address_title: source.billingAddress.name || source.organisation.name,
          address_type: "Billing",
          address_line1: source.billingAddress.line1,
          address_line2: source.billingAddress.line2 || undefined,
          city: source.billingAddress.townCity || source.billingAddress.countyState || "Not specified",
          state: source.billingAddress.countyState || undefined,
          pincode: source.billingAddress.postZipCode || undefined,
          country: source.billingAddress.countryName,
          email_id: source.billingAddress.email || undefined,
          phone: source.billingAddress.phone || undefined,
          is_primary_address: 1,
          links: [{ link_doctype: "Customer", link_name: providerPartyId }],
        })
        addressCreated = true
      } catch {
        warning = "The ERPNext customer and mapping were created, but the billing address needs review in ERPNext."
      }
    }
    const { error: eventError } = await admin.from("ACCI_SyncEvents").insert({ ACCISE_ConnectionID: connection.ACCIC_ID, ACCISE_Severity: warning ? "warning" : "info", ACCISE_EventCode: "provider_customer_created", ACCISE_Message: warning ?? "Created and mapped one ERPNext customer.", ACCISE_LocalTable: "Org_Master", ACCISE_LocalID: source.organisation.id, ACCISE_ExternalObjectType: "Customer", ACCISE_ExternalID: providerPartyId, ACCISE_RequestPayloadJSON: { customerGroup, territory, customerType }, ACCISE_ResponsePayloadJSON: { addressCreated, warning } })
    if (eventError) throw new HttpError(500, "The ERPNext customer was created, but its audit event could not be retained. Review the provider mapping before retrying.")
    return { created: true, mapping: mapped.mapping, warning }
  }

  if (!hyperExtConfigured()) throw new HttpError(409, "Configure the tenant HyperExt Sage 50 connector before creating customers.")
  const status = await hyperExtStatus()
  if (!status.sdoStatusOk || !status.odbcStatusOk) throw new HttpError(409, "HyperExt is reachable, but its Sage Data Objects or ODBC connection is not ready.")
  if (connection.ACCIC_ExternalTenantName && status.companyName && connection.ACCIC_ExternalTenantName !== status.companyName) throw new HttpError(409, `HyperExt is connected to ${status.companyName}, not ${connection.ACCIC_ExternalTenantName}. Correct the Sage company connection before continuing.`)
  const accountReference = clean(input.accountReference, 8).toUpperCase()
  if (!/^[A-Z0-9]{1,8}$/.test(accountReference)) throw new HttpError(400, "Enter a Sage 50 account reference using up to eight letters or numbers.")
  const address = source.billingAddress
  const requestPayload: Record<string, unknown> = {
    accountRef: accountReference,
    name: source.organisation.name,
    address1: address?.line1 ?? "",
    address2: address?.line2 ?? "",
    address3: address?.townCity ?? "",
    address4: address?.countyState ?? "",
    address5: address?.postZipCode ?? "",
    countryCode: address?.countryCode ?? undefined,
    telephone: address?.phone ?? undefined,
    email: address?.email ?? undefined,
    currency: currency(input.currencyCode) ?? source.organisation.currencyCode ?? undefined,
    vatNumber: clean(input.vatNumber, 40) || undefined,
    creditLimit: finiteNumber(input.creditLimit) ?? undefined,
    paymentDueDays: finiteNumber(input.paymentDueDays) ?? undefined,
  }
  const response = await hyperExtRequest("/api/customer/", { method: "POST", body: JSON.stringify(requestPayload) })
  const mapping = await saveSageCustomerMapping(admin, connection, source.organisation, accountReference)
  const { error: eventError } = await admin.from("ACCI_SyncEvents").insert({ ACCISE_ConnectionID: connection.ACCIC_ID, ACCISE_Severity: "info", ACCISE_EventCode: "provider_customer_created", ACCISE_Message: "Created and mapped one Sage 50 customer through HyperExt.", ACCISE_LocalTable: "Org_Master", ACCISE_LocalID: source.organisation.id, ACCISE_ExternalObjectType: "Customer", ACCISE_ExternalID: accountReference, ACCISE_RequestPayloadJSON: { accountReference, countryCode: address?.countryCode ?? null, currencyCode: requestPayload.currency ?? null }, ACCISE_ResponsePayloadJSON: { success: true, providerCode: connection.ACCIC_ProviderCode, responseCode: response?.code ?? null } })
  if (eventError) throw new HttpError(500, "The Sage 50 customer was created, but its audit event could not be retained. Review the provider mapping before retrying.")
  return { created: true, mapping, warning: null }
}

async function verifyErpNextExternalReference(admin: any, current: any, externalRefId: string) {
  if (!isUuid(externalRefId)) throw new HttpError(404, "Provider reference not found.")
  const ids = await entityIds(admin, current)
  const { data: reference, error: referenceError } = await admin.from("ACCI_ExternalRefs")
    .select("ACCIER_ID,ACCIER_ConnectionID,ACCIER_LocalTable,ACCIER_LocalID,ACCIER_LocalNumber,ACCIER_ExternalObjectType,ACCIER_ExternalID,ACCIER_SyncStatusCode,ACCIER_LastSyncedAt")
    .eq("ACCIER_ID", externalRefId)
    .maybeSingle()
  if (referenceError) throw new HttpError(500, referenceError.message)
  if (!reference) throw new HttpError(404, "Provider reference not found.")
  const { data: connection, error: connectionError } = ids.length
    ? await admin.from("ACCI_Connections")
      .select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_StatusCode,ACCIC_LegalEntityID,ACCIC_ExternalTenantName")
      .eq("ACCIC_ID", reference.ACCIER_ConnectionID)
      .in("ACCIC_LegalEntityID", ids)
      .maybeSingle()
    : { data: null, error: null }
  if (connectionError) throw new HttpError(500, connectionError.message)
  if (!connection || connection.ACCIC_ProviderCode !== "erpnext" || connection.ACCIC_StatusCode !== "active") {
    throw new HttpError(404, "Provider reference not found.")
  }
  const doctype = clean(reference.ACCIER_ExternalObjectType, 120)
  if (!['Sales Invoice', 'Purchase Invoice', 'Payment Entry'].includes(doctype)) throw new HttpError(409, "This provider reference type cannot be verified through the finance adapter.")
  const externalId = clean(reference.ACCIER_ExternalID, 240)
  if (!externalId) throw new HttpError(409, "This provider reference has no external document identifier.")
  const payload = await erpNextRequest<{ data?: Record<string, unknown> }>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(externalId)}`)
  const providerDocument = payload.data
  if (!providerDocument || providerDocument.name !== externalId) throw new HttpError(502, "ERPNext did not return the exact referenced document.")
  if (providerDocument.company !== connection.ACCIC_ExternalTenantName) throw new HttpError(409, "The provider document belongs to a different accounting Company.")
  return {
    verifiedAt: new Date().toISOString(),
    reference: {
      id: reference.ACCIER_ID,
      localTable: reference.ACCIER_LocalTable,
      localId: reference.ACCIER_LocalID,
      localNumber: reference.ACCIER_LocalNumber,
      syncStatus: reference.ACCIER_SyncStatusCode,
      lastSyncedAt: reference.ACCIER_LastSyncedAt,
      externalObjectType: doctype,
      externalId,
    },
    providerDocument: {
      name: providerDocument.name,
      docstatus: providerDocument.docstatus,
      status: providerDocument.status,
      company: providerDocument.company,
      customer: providerDocument.customer,
      supplier: providerDocument.supplier,
      party: providerDocument.party,
      postingDate: providerDocument.posting_date,
      dueDate: providerDocument.due_date,
      currency: providerDocument.currency,
      conversionRate: providerDocument.conversion_rate,
      grandTotal: providerDocument.grand_total,
      outstandingAmount: providerDocument.outstanding_amount,
      isReturn: providerDocument.is_return,
      remarks: providerDocument.remarks,
      modifiedAt: providerDocument.modified,
    },
  }
}

async function refreshErpNextConnectionEnvironment(admin: any, current: any, connectionId: string) {
  if (!isUuid(connectionId)) throw new HttpError(404, "Accounting connection not found.")
  const ids = await entityIds(admin, current)
  const { data: connection, error } = ids.length
    ? await admin.from("ACCI_Connections")
      .select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_StatusCode,ACCIC_Environment,ACCIC_SettingsJSON")
      .eq("ACCIC_ID", connectionId)
      .in("ACCIC_LegalEntityID", ids)
      .maybeSingle()
    : { data: null, error: null }
  if (error) throw new HttpError(500, error.message)
  if (!connection) throw new HttpError(404, "Accounting connection not found.")
  if (connection.ACCIC_StatusCode !== "active" || connection.ACCIC_ProviderCode !== "erpnext") {
    throw new HttpError(409, "Activate the ERPNext connection before verifying its environment.")
  }
  const environment = erpNextEnvironment()
  const origin = erpNextOrigin()
  const settings = connection.ACCIC_SettingsJSON && typeof connection.ACCIC_SettingsJSON === "object" && !Array.isArray(connection.ACCIC_SettingsJSON) ? connection.ACCIC_SettingsJSON : {}
  const verifiedAt = new Date().toISOString()
  const { error: updateError } = await admin.from("ACCI_Connections").update({
    ACCIC_Environment: environment,
    ACCIC_LastAuthAt: verifiedAt,
    ACCIC_SettingsJSON: { ...settings, providerOrigin: origin, environmentVerifiedAt: verifiedAt },
    ACCIC_UpdatedAt: verifiedAt,
    ACCIC_UpdatedBy: current.User_ID,
  }).eq("ACCIC_ID", connection.ACCIC_ID)
  if (updateError) throw new HttpError(500, updateError.message)
  if (connection.ACCIC_Environment !== environment || settings.providerOrigin !== origin) {
    const { error: eventError } = await admin.from("ACCI_SyncEvents").insert({
      ACCISE_ConnectionID: connection.ACCIC_ID,
      ACCISE_Severity: "info",
      ACCISE_EventCode: "provider_environment_verified",
      ACCISE_Message: `ERPNext connection verified as ${environment}.`,
      ACCISE_ExternalObjectType: "Site",
      ACCISE_ExternalID: origin,
      ACCISE_ResponsePayloadJSON: { environment, origin, verifiedAt },
    })
    if (eventError) throw new HttpError(500, "The provider environment was verified, but its audit event could not be retained.")
  }
  return { connectionId: connection.ACCIC_ID, provider: "erpnext", environment, endpoint: origin, verifiedAt }
}

async function ensureErpNextDemoServiceItem(admin: any, current: any, connectionId: string) {
  if (new URL(erpNextOrigin()).hostname !== "demo-finance.multideck.app") {
    throw new HttpError(409, "Demo provider fixtures are available only on the approved ERPNext demonstration site.")
  }
  if (!isUuid(connectionId)) throw new HttpError(404, "Accounting connection not found.")
  const ids = await entityIds(admin, current)
  const { data: connection, error } = ids.length
    ? await admin.from("ACCI_Connections")
      .select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_StatusCode")
      .eq("ACCIC_ID", connectionId)
      .in("ACCIC_LegalEntityID", ids)
      .maybeSingle()
    : { data: null, error: null }
  if (error) throw new HttpError(500, error.message)
  if (!connection) throw new HttpError(404, "Accounting connection not found.")
  if (connection.ACCIC_StatusCode !== "active" || connection.ACCIC_ProviderCode !== "erpnext") {
    throw new HttpError(409, "Activate the ERPNext connection before preparing a demo provider item.")
  }

  const itemCode = "MULTIDECK-DEMO-SERVICE"
  const existing = await erpNextList("Item", ["name", "item_code", "item_name", "item_group", "stock_uom", "is_stock_item", "disabled"], [["name", "=", itemCode]])
  const item = existing.find((record: any) => record.name === itemCode)
  if (item?.disabled === true || item?.disabled === 1 || item?.disabled === "1") {
    throw new HttpError(409, `ERPNext Item ${itemCode} exists but is disabled. Enable it before using the demo mapping.`)
  }
  if (item) return { created: false, item }

  const requestPayload = {
    item_code: itemCode,
    item_name: "Multideck Demo Service",
    description: "Non-commercial Multideck integration test service. No operational or statutory use.",
    item_group: "Demo Item Group",
    stock_uom: "Nos",
    is_stock_item: 0,
    include_item_in_manufacturing: 0,
    is_sales_item: 1,
    is_purchase_item: 1,
  }
  const created = await erpNextCreate("Item", requestPayload)
  const { error: eventError } = await admin.from("ACCI_SyncEvents").insert({
    ACCISE_ConnectionID: connection.ACCIC_ID,
    ACCISE_Severity: "info",
    ACCISE_EventCode: "demo_service_item_created",
    ACCISE_Message: "Created the approved non-commercial ERPNext demo service item.",
    ACCISE_ExternalObjectType: "Item",
    ACCISE_ExternalID: clean(created.name, 240),
    ACCISE_RequestPayloadJSON: requestPayload,
    ACCISE_ResponsePayloadJSON: { name: clean(created.name, 240), itemCode },
  })
  if (eventError) throw new HttpError(500, "The demo item was created, but its Multideck audit event could not be retained. Retry to reconcile it.")
  return { created: true, item: { name: clean(created.name, 240), item_code: itemCode, item_name: requestPayload.item_name, item_group: requestPayload.item_group, stock_uom: requestPayload.stock_uom, is_stock_item: 0, disabled: 0 } }
}

async function assertCountryCode(admin: any, value: string) {
  const countryCode = clean(value, 2).toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new HttpError(400, "Enter a valid two-letter ISO country code.")
  const { data, error } = await admin.from("RefCountry").select("RN_Code").eq("RN_Code", countryCode).eq("RN_IsActive", true).limit(1).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(400, "Enter a valid two-letter ISO country code.")
  return countryCode
}

async function scopedDocument(admin: any, current: any, id: string) {
  if (!isUuid(id)) throw new HttpError(404, "Finance document not found.")
  const ids = await entityIds(admin, current)
  if (!ids.length) throw new HttpError(404, "Finance document not found.")
  const { data, error } = await admin.from("FIN_Documents").select("*").eq("FINDoc_ID", id).in("FINDoc_LegalEntityID", ids).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, "Finance document not found.")
  return data
}

async function scopedCash(admin: any, current: any, id: string) {
  if (!isUuid(id)) throw new HttpError(404, "Cash transaction not found.")
  const ids = await entityIds(admin, current)
  if (!ids.length) throw new HttpError(404, "Cash transaction not found.")
  const { data, error } = await admin.from("FIN_CashTransactions").select("*").eq("FINCash_ID", id).in("FINCash_LegalEntityID", ids).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, "Cash transaction not found.")
  return data
}

async function preview(admin: any, chartTemplateCode: string, countryCode: string) {
  const { data: template, error: templateError } = await admin.from("FIN_ChartTemplates").select("FINChartTemplate_ID,FINChartTemplate_Code,FINChartTemplate_Name,FINChartTemplate_Version").eq("FINChartTemplate_Code", chartTemplateCode).eq("FINChartTemplate_IsActive", true).maybeSingle()
  if (templateError) throw new HttpError(500, templateError.message)
  if (!template) throw new HttpError(400, "Choose an active chart template.")
  const countryPackCodes: Record<string, string> = { GB: "gb-v1", US: "us-v1", CA: "ca-v1", AU: "au-v1" }
  const preferredPackCode = countryPackCodes[countryCode] ?? "global-v1"
  const [accountsResult, packsResult] = await Promise.all([
    admin.from("FIN_ChartTemplateAccounts").select("FINChartTemplateAccount_Code,FINChartTemplateAccount_Name,FINChartTemplateAccount_TypeCode,FINChartTemplateAccount_CategoryCode,FINChartTemplateAccount_IsControlAccount,FINChartTemplateAccount_Required").eq("FINChartTemplateAccount_TemplateID", template.FINChartTemplate_ID).order("FINChartTemplateAccount_SortOrder"),
    admin.from("FIN_LocalisationPacks").select("FINLocPack_ID,FINLocPack_Code,FINLocPack_Name,FINLocPack_CountryCode").in("FINLocPack_Code", [...new Set([preferredPackCode, "global-v1"])]).eq("FINLocPack_IsActive", true),
  ])
  if (accountsResult.error || packsResult.error) throw new HttpError(500, accountsResult.error?.message ?? packsResult.error?.message)
  const localisationPack = (packsResult.data ?? []).find((pack: any) => pack.FINLocPack_Code === preferredPackCode)
    ?? (packsResult.data ?? []).find((pack: any) => pack.FINLocPack_Code === "global-v1")
  if (!localisationPack) throw new HttpError(409, "No active finance localisation pack is available for this country.")
  const { data: treatments, error: treatmentError } = await admin.from("FIN_LocalisationTaxTreatments").select("FINLocTaxTreatment_Code,FINLocTaxTreatment_Name,FINLocTaxTreatment_TransactionType,FINLocTaxTreatment_RatePercent,FINLocTaxTreatment_IsRecoverable").eq("FINLocTaxTreatment_PackID", localisationPack.FINLocPack_ID).eq("FINLocTaxTreatment_IsActive", true).order("FINLocTaxTreatment_Code")
  if (treatmentError) throw new HttpError(500, treatmentError.message)
  return { template, localisationPack, countryCode, accounts: accountsResult.data ?? [], treatments: treatments ?? [], requiresTaxAdvice: true }
}

async function reportOptions(admin: any, current: any) {
  const { data, error } = await admin.from("cmp_LegalEntities")
    .select("LegalEntity_ID,LegalEntity_Name,LegalEntity_CountryCode,LegalEntity_BaseCurrencyCodeSnapshot")
    .eq("Company_ID", current.Company_ID)
    .eq("LegalEntity_IsActive", true)
    .order("LegalEntity_Name")
  if (error) throw new HttpError(500, error.message)
  return { legalEntities: data ?? [] }
}

async function reportingSnapshot(admin: any, current: any, requestUrl: string) {
  const search = new URL(requestUrl).searchParams
  const legalEntityId = clean(search.get("legalEntityId"), 36)
  const fromDate = clean(search.get("from"), 10)
  const toDate = clean(search.get("to"), 10)
  await legalEntity(admin, current, legalEntityId)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new HttpError(400, "Choose valid reporting dates.")
  }
  const { data, error } = await admin.rpc("multideck_finance_reporting_snapshot", {
    p_company_id: current.Company_ID,
    p_user_id: current.User_ID,
    p_legal_entity_id: legalEntityId,
    p_from_date: fromDate,
    p_to_date: toDate,
  })
  rpcFailure(error, "The financial report could not be prepared.")
  return data
}

async function integrationAttention(admin: any, current: any, ids: string[]) {
  if (!ids.length) return []
  const statuses = ["queued", "processing", "blocked", "failed"]
  const [documents, cash] = await Promise.all([
    admin.from("FIN_Documents").select("FINDoc_ID,FINDoc_Number,FINDoc_TypeCode,FINDoc_ExportStatusCode").in("FINDoc_LegalEntityID", ids).in("FINDoc_ExportStatusCode", statuses).order("FINDoc_UpdatedAt", { ascending: false }).limit(50),
    admin.from("FIN_CashTransactions").select("FINCash_ID,FINCash_Number,FINCash_TypeCode,FINCash_ExportStatusCode").in("FINCash_LegalEntityID", ids).in("FINCash_ExportStatusCode", statuses).order("FINCash_UpdatedAt", { ascending: false }).limit(50),
  ])
  if (documents.error || cash.error) throw new HttpError(500, documents.error?.message ?? cash.error?.message)
  const localRecords = new Map<string, { localNumber: string; typeCode: string }>()
  for (const document of documents.data ?? []) localRecords.set(document.FINDoc_ID, { localNumber: document.FINDoc_Number, typeCode: document.FINDoc_TypeCode })
  for (const transaction of cash.data ?? []) localRecords.set(transaction.FINCash_ID, { localNumber: transaction.FINCash_Number, typeCode: transaction.FINCash_TypeCode })
  const localIds = [...localRecords.keys()]
  if (!localIds.length) return []
  const { data: queue, error } = await admin.from("FIN_IntegrationQueue").select("FINIntQ_ID,FINIntQ_LocalTable,FINIntQ_LocalID,FINIntQ_StatusCode,FINIntQ_AttemptCount,FINIntQ_LastAttemptAt,FINIntQ_LastError,FINIntQ_CreatedAt").in("FINIntQ_LocalID", localIds).in("FINIntQ_StatusCode", statuses).order("FINIntQ_CreatedAt", { ascending: false }).limit(50)
  if (error) throw new HttpError(500, error.message)
  const staleBefore = Date.now() - 15 * 60 * 1000
  return (queue ?? []).flatMap((item: any) => {
    const local = localRecords.get(item.FINIntQ_LocalID)
    const lastAttempt = item.FINIntQ_LastAttemptAt ? new Date(item.FINIntQ_LastAttemptAt).getTime() : 0
    return local ? [{ ...item, ...local, retryAvailable: item.FINIntQ_StatusCode !== "processing" || lastAttempt < staleBefore }] : []
  })
}

async function administrationWorkspace(admin: any, ids: string[], connectionIds: string[]) {
  const empty = { data: [], error: null }
  const [
    settings, localisations, currencies, banks, nominals, jurisdictions, taxes, sequences, terms,
    rateProviders, rateRules, accountMappings, chargeMappings, taxMappings, revisions, documentTypes, chartTemplateAccounts,
    localisationPacks, complianceObligations, complianceRegistrations,
  ] = await Promise.all([
    ids.length ? admin.from("FIN_Settings").select("FINSET_ID,FINSET_LegalEntityID,FINSET_BaseCurrencyCode,FINSET_DefaultOperatingModelCode,FINSET_AutoCreateSalesInvoices,FINSET_AutoCreatePurchaseAccruals,FINSET_AutoPostLowRiskItems,FINSET_UseAccountingDateRules,FINSET_BlockLockedPeriodDirectPosting,FINSET_DefaultROEProviderCode,FINSET_IncludeFXInOperationalProfit,FINSET_NativeLedgerEnabled,FINSET_ExternalMirrorModeCode,FINSET_SettingsJSON,FINSET_UpdatedAt").in("FINSET_LegalEntityID", ids).is("FINSET_OrgOfficeID", null).is("FINSET_BrandID", null) : empty,
    ids.length ? admin.from("FIN_LocalisationSettings").select("FINLocSet_ID,FINLocSet_LegalEntityID,FINLocSet_PackID,FINLocSet_TaxRegistrationNo,FINLocSet_ReportingBasisCode,FINLocSet_SettingsJSON,FINLocSet_EffectiveFrom,FINLocSet_IsActive,FINLocSet_UpdatedAt,FINLocPack:FINLocSet_PackID(FINLocPack_Code,FINLocPack_Name,FINLocPack_CountryCode,FINLocPack_AccountingStandardCode,FINLocPack_ComplianceStatusCode)").in("FINLocSet_LegalEntityID", ids).eq("FINLocSet_IsActive", true) : empty,
    ids.length ? admin.from("FIN_CurrencySettings").select("FINCurSet_ID,FINCurSet_LegalEntityID,FINCurSet_CurrencyCode,FINCurSet_Name,FINCurSet_DecimalPlaces,FINCurSet_RoundingMethodCode,FINCurSet_ToleranceAmount,FINCurSet_IsPermittedForQuote,FINCurSet_IsPermittedForInvoice,FINCurSet_IsBaseCurrency,FINCurSet_IsActive").in("FINCurSet_LegalEntityID", ids).order("FINCurSet_CurrencyCode") : empty,
    ids.length ? admin.from("FIN_BankAccounts").select("FINBank_ID,FINBank_Code,FINBank_Name,FINBank_LegalEntityID,FINBank_CurrencyCode,FINBank_InstitutionName,FINBank_AccountHolderName,FINBank_AccountNumberMasked,FINBank_IBANMasked,FINBank_SortCodeMasked,FINBank_BICMasked,FINBank_CountryCode,FINBank_NominalAccountID,FINBank_IsDefault,FINBank_AllowReceipts,FINBank_AllowPayments,FINBank_IsActive,FINBank_UpdatedAt").in("FINBank_LegalEntityID", ids).order("FINBank_Name") : empty,
    ids.length ? admin.from("FIN_NominalAccounts").select("FINNom_ID,FINNom_Code,FINNom_Name,FINNom_AccountTypeCode,FINNom_ReportCategoryCode,FINNom_LegalEntityID,FINNom_ExternalMappingHint,FINNom_IsControlAccount,FINNom_ControlTypeCode,FINNom_AllowManualPosting,FINNom_IsActive,FINNom_UpdatedAt").in("FINNom_LegalEntityID", ids).order("FINNom_Code") : empty,
    ids.length ? admin.from("FIN_TaxJurisdictions").select("FINTaxJur_ID,FINTaxJur_Code,FINTaxJur_Name,FINTaxJur_CountryCode,FINTaxJur_AuthorityName,FINTaxJur_LegalEntityID,FINTaxJur_RegistrationNo,FINTaxJur_EffectiveFrom,FINTaxJur_EffectiveTo,FINTaxJur_SettingsJSON,FINTaxJur_IsActive").in("FINTaxJur_LegalEntityID", ids).order("FINTaxJur_Code") : empty,
    ids.length ? admin.from("FIN_TaxCodes").select("FINTax_ID,FINTax_Code,FINTax_Name,FINTax_CountryCode,FINTax_RatePercent,FINTax_TaxTypeCode,FINTax_ProviderMappingHint,FINTax_IsRecoverable,FINTax_IsActive,FINTax_EffectiveFrom,FINTax_EffectiveTo,FINTax_LegalEntityID,FINTax_JurisdictionID,FINTax_TreatmentCategoryCode,FINTax_TransactionTypeCode,FINTax_OutputNominalID,FINTax_InputNominalID,FINTax_SettingsJSON,FINTax_ApprovedAt").in("FINTax_LegalEntityID", ids).order("FINTax_Code") : empty,
    ids.length ? admin.from("FIN_NumberSequences").select("FINSeq_ID,FINSeq_Code,FINSeq_Name,FINSeq_LegalEntityID,FINSeq_DocumentTypeCode,FINSeq_Prefix,FINSeq_Suffix,FINSeq_NextNumber,FINSeq_PaddingLength,FINSeq_ResetPeriodCode,FINSeq_IsActive").in("FINSeq_LegalEntityID", ids).order("FINSeq_Code") : empty,
    ids.length ? admin.from("FIN_PaymentTerms").select("FINTerm_ID,FINTerm_Code,FINTerm_Name,FINTerm_Days,FINTerm_DueDayOfMonth,FINTerm_EndOfMonth,FINTerm_IsCashAccount,FINTerm_IsActive,FINTerm_LegalEntityID").in("FINTerm_LegalEntityID", ids).order("FINTerm_Days") : empty,
    admin.from("FIN_ExchangeRateProviders").select("FINRateProvider_ID,FINRateProvider_Code,FINRateProvider_Name,FINRateProvider_ProviderTypeCode,FINRateProvider_IsOfficial,FINRateProvider_IsMidMarketSource,FINRateProvider_BaseCurrencyCode,FINRateProvider_IsActive").eq("FINRateProvider_IsActive", true).order("FINRateProvider_Name"),
    admin.from("FIN_ExchangeRatePullRules").select("FINRateRule_ID,FINRateRule_Code,FINRateRule_Name,FINRateRule_UsageTypeCode,FINRateRule_FromCurrencyCode,FINRateRule_ToCurrencyCode,FINRateRule_BaseRateTypeCode,FINRateRule_AdjustmentMethodCode,FINRateRule_AdjustmentAmount,FINRateRule_AdjustmentPercent,FINRateRule_MinimumSpread,FINRateRule_RoundingPrecision,FINRateRule_Priority,FINRateRule_IsActive,FINRateRule_EffectiveFrom,FINRateRule_EffectiveTo").eq("FINRateRule_IsActive", true).order("FINRateRule_Priority"),
    connectionIds.length ? admin.from("ACCI_AccountMappings").select("ACCIAM_ID,ACCIAM_ConnectionID,ACCIAM_DirectionCode,ACCIAM_LocalContextCode,ACCIAM_ProviderAccountID,ACCIAM_ProviderAccountCode,ACCIAM_ProviderAccountName,ACCIAM_IsDefault,ACCIAM_IsActive").in("ACCIAM_ConnectionID", connectionIds).order("ACCIAM_LocalContextCode") : empty,
    connectionIds.length ? admin.from("ACCI_ChargeCodeMappings").select("ACCICM_ID,ACCICM_ConnectionID,ACCICM_LocalChargeCodeSnapshot,ACCICM_DirectionCode,ACCICM_ProviderItemID,ACCICM_ProviderItemCode,ACCICM_ProviderItemName,ACCICM_ProviderAccountID,ACCICM_IsActive").in("ACCICM_ConnectionID", connectionIds).order("ACCICM_LocalChargeCodeSnapshot") : empty,
    connectionIds.length ? admin.from("ACCI_TaxCodeMappings").select("ACCITM_ID,ACCITM_ConnectionID,ACCITM_LocalTaxCode,ACCITM_LocalTaxDescription,ACCITM_LocalCountryCode,ACCITM_DirectionCode,ACCITM_ProviderTaxID,ACCITM_ProviderTaxCode,ACCITM_ProviderTaxName,ACCITM_TaxRatePercent,ACCITM_IsActive").in("ACCITM_ConnectionID", connectionIds).order("ACCITM_LocalTaxCode") : empty,
    ids.length ? admin.from("FIN_AdministrationRevisions").select("FINAdminRevision_ID,FINAdminRevision_LegalEntityID,FINAdminRevision_Number,FINAdminRevision_StatusCode,FINAdminRevision_ReadinessJSON,FINAdminRevision_Reason,FINAdminRevision_ApprovedAt,FINAdminRevision_ApprovedBy").in("FINAdminRevision_LegalEntityID", ids).order("FINAdminRevision_ApprovedAt", { ascending: false }).limit(100) : empty,
    admin.from("sys_FinanceDocumentTypes").select("FINDT_Code,FINDT_Name,FINDT_LedgerTypeCode,FINDT_IsCredit").eq("FINDT_IsActive", true).order("FINDT_SortOrder"),
    admin.from("FIN_ChartTemplateAccounts").select("FINChartTemplateAccount_ID,FINChartTemplateAccount_TemplateID,FINChartTemplateAccount_Code,FINChartTemplateAccount_Name,FINChartTemplateAccount_TypeCode,FINChartTemplateAccount_CategoryCode,FINChartTemplateAccount_IsControlAccount,FINChartTemplateAccount_Required,FINChartTemplateAccount_SortOrder,FINChartTemplate:FINChartTemplateAccount_TemplateID(FINChartTemplate_Code)").order("FINChartTemplateAccount_SortOrder"),
    admin.from("FIN_LocalisationPacks").select("FINLocPack_ID,FINLocPack_Code,FINLocPack_Name,FINLocPack_CountryCode,FINLocPack_AccountingStandardCode,FINLocPack_Version,FINLocPack_AuthorityName,FINLocPack_ReportingCurrencyCode,FINLocPack_ComplianceStatusCode,FINLocPack_SourceURL,FINLocPack_ReviewedAt").eq("FINLocPack_IsActive", true).order("FINLocPack_Name"),
    admin.from("FIN_ComplianceObligations").select("FINCompliance_ID,FINCompliance_PackID,FINCompliance_Code,FINCompliance_Name,FINCompliance_ObligationTypeCode,FINCompliance_AuthorityName,FINCompliance_FilingChannelCode,FINCompliance_FrequencyCode,FINCompliance_ReadinessStatusCode,FINCompliance_SourceURL,FINCompliance_EffectiveFrom,FINCompliance_EffectiveTo,FINCompliance_RequirementsJSON,FINCompliance_ReviewedAt").eq("FINCompliance_IsActive", true).order("FINCompliance_Name"),
    ids.length ? admin.from("FIN_LegalEntityComplianceRegistrations").select("FINComplianceReg_ID,FINComplianceReg_LegalEntityID,FINComplianceReg_ObligationID,FINComplianceReg_StatusCode,FINComplianceReg_RegistrationReference,FINComplianceReg_FilingMethodCode,FINComplianceReg_EffectiveFrom,FINComplianceReg_EffectiveTo,FINComplianceReg_SettingsJSON,FINComplianceReg_UpdatedAt").in("FINComplianceReg_LegalEntityID", ids).order("FINComplianceReg_UpdatedAt", { ascending: false }) : empty,
  ])
  for (const result of [settings, localisations, currencies, banks, nominals, jurisdictions, taxes, sequences, terms, rateProviders, rateRules, accountMappings, chargeMappings, taxMappings, revisions, documentTypes, chartTemplateAccounts, localisationPacks, complianceObligations, complianceRegistrations]) {
    if (result.error) throw new HttpError(500, result.error.message)
  }
  return {
    settings: settings.data ?? [], localisations: localisations.data ?? [], currencies: currencies.data ?? [], banks: banks.data ?? [], nominalAccounts: nominals.data ?? [],
    taxJurisdictions: jurisdictions.data ?? [], taxCodes: taxes.data ?? [], numberSequences: sequences.data ?? [], paymentTerms: terms.data ?? [], exchangeRateProviders: rateProviders.data ?? [], exchangeRateRules: rateRules.data ?? [],
    accountMappings: accountMappings.data ?? [], chargeMappings: chargeMappings.data ?? [], taxMappings: taxMappings.data ?? [], revisions: revisions.data ?? [], documentTypes: documentTypes.data ?? [], chartTemplateAccounts: chartTemplateAccounts.data ?? [],
    localisationPacks: localisationPacks.data ?? [], complianceObligations: complianceObligations.data ?? [], complianceRegistrations: complianceRegistrations.data ?? [],
  }
}

async function listSetup(admin: any, current: any) {
  const ids = await entityIds(admin, current)
  const [entities, templates, runs, connections, countries, currencies, integrationQueue] = await Promise.all([
    admin.from("cmp_LegalEntities").select("LegalEntity_ID,LegalEntity_Name,LegalEntity_TradingName,LegalEntity_CompanyRegistrationNo,LegalEntity_VATNumber,LegalEntity_TaxID,LegalEntity_CountryCode,LegalEntity_BaseCurrencyCodeSnapshot,LegalEntity_SettingsJSON").eq("Company_ID", current.Company_ID).order("LegalEntity_Name"),
    admin.from("FIN_ChartTemplates").select("FINChartTemplate_Code,FINChartTemplate_Name,FINChartTemplate_IndustryCode,FINChartTemplate_Version,FINChartTemplate_Description").eq("FINChartTemplate_IsActive", true).order("FINChartTemplate_IndustryCode"),
    ids.length ? admin.from("FIN_ConfigurationRuns").select("FINConfigRun_ID,FINConfigRun_ProviderCode,FINConfigRun_ExternalCompany,FINConfigRun_StatusCode,FINConfigRun_CountryCode,FINConfigRun_EffectiveFrom,FINConfigRun_RequestedAt,FINConfigRun_CompletedAt,FINConfigRun_ErrorMessage,FINConfigRun_LegalEntityID,FINChartTemplate:FINConfigRun_ChartTemplateID(FINChartTemplate_Code,FINChartTemplate_Name)").in("FINConfigRun_LegalEntityID", ids).order("FINConfigRun_RequestedAt", { ascending: false }).limit(30) : { data: [], error: null },
    ids.length ? admin.from("ACCI_Connections").select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_Name,ACCIC_StatusCode,ACCIC_LegalEntityID,ACCIC_ExternalTenantName,ACCIC_LastAuthAt,ACCIC_LastSyncAt,ACCIC_UpdatedAt").in("ACCIC_LegalEntityID", ids).order("ACCIC_UpdatedAt", { ascending: false }) : { data: [], error: null },
    admin.from("RefCountry").select("RN_Code,RN_Desc,RN_RX_NKLocalCurrency").eq("RN_IsActive", true).not("RN_Code", "is", null).order("RN_Desc"),
    admin.from("sys_Currency").select("Currency_Code,Currency_Name,Currency_Symbol").not("Currency_Code", "is", null).order("Currency_Code"),
    integrationAttention(admin, current, ids),
  ])
  for (const result of [entities, templates, runs, connections, countries, currencies]) if (result.error) throw new HttpError(500, result.error.message)
  const erpNextConfigured = Boolean(Deno.env.get("ERPNEXT_BASE_URL") && Deno.env.get("ERPNEXT_API_KEY") && Deno.env.get("ERPNEXT_API_SECRET"))
  const legalEntities = (entities.data ?? []).map((entity: any) => ({
    LegalEntity_ID: entity.LegalEntity_ID,
    LegalEntity_Name: entity.LegalEntity_Name,
    LegalEntity_TradingName: entity.LegalEntity_TradingName,
    LegalEntity_CompanyRegistrationNo: entity.LegalEntity_CompanyRegistrationNo,
    LegalEntity_VATNumber: entity.LegalEntity_VATNumber,
    LegalEntity_TaxID: entity.LegalEntity_TaxID,
    LegalEntity_CountryCode: entity.LegalEntity_CountryCode,
    LegalEntity_BaseCurrencyCodeSnapshot: entity.LegalEntity_BaseCurrencyCodeSnapshot,
    LegalEntity_SettingsJSON: entity.LegalEntity_SettingsJSON ?? {},
    preferredProviderCode: typeof entity.LegalEntity_SettingsJSON?.financeProvider?.providerCode === "string" ? entity.LegalEntity_SettingsJSON.financeProvider.providerCode : null,
    preferredExternalCompany: typeof entity.LegalEntity_SettingsJSON?.financeProvider?.externalCompany === "string" ? entity.LegalEntity_SettingsJSON.financeProvider.externalCompany : null,
  }))
  const validCountryCodes = new Set((countries.data ?? []).map((country: any) => clean(country.RN_Code, 2).toUpperCase()).filter(Boolean))
  const configurationRuns = (runs.data ?? []).map((run: any) => ({
    ...run,
    approvalBlocker: run.FINConfigRun_StatusCode === "awaiting_approval" && !validCountryCodes.has(clean(run.FINConfigRun_CountryCode, 2).toUpperCase()) ? "invalid_country_code" : null,
  }))
  const connectionIds = (connections.data ?? []).map((connection: any) => connection.ACCIC_ID)
  return {
    legalEntities,
    chartTemplates: templates.data ?? [],
    runs: configurationRuns,
    connections: connections.data ?? [],
    countries: countries.data ?? [],
    currencies: currencies.data ?? [],
    administration: await administrationWorkspace(admin, ids, connectionIds),
    integrationQueue,
    providers: accountingProviders.map((provider) => ({ ...provider, configured: provider.code === "erpnext" ? erpNextConfigured : false })),
    erpNext: { configured: erpNextConfigured, endpoint: erpNextConfigured ? erpNextOrigin() : null },
  }
}

async function documentWorkspace(admin: any, current: any, selectedLedger: Ledger, draftOptions = false) {
  await requirePermission(admin, current.User_ID, draftOptions ? draftPermission(selectedLedger) : viewPermission(selectedLedger))
  const ids = await entityIds(admin, current)
  const types = selectedLedger === "receivables" ? ["sl_invoice", "credit_note"] : ["pl_invoice", "debit_note"]
  const documentsResult = ids.length
    ? await admin.from("FIN_Documents").select("FINDoc_ID,FINDoc_Number,FINDoc_TypeCode,FINDoc_StatusCode,FINDoc_LegalEntityID,FINDoc_PartyOrgID,FINDoc_DocumentDate,FINDoc_DueDate,FINDoc_CurrencyCodeSnapshot,FINDoc_ExchangeRate,FINDoc_NetAmount,FINDoc_TaxAmount,FINDoc_GrossAmount,FINDoc_OutstandingAmount,FINDoc_SourceJobID,FINDoc_SourceKindCode,FINDoc_PostingStatusCode,FINDoc_ExportStatusCode,FINDoc_NativePostingStatusCode,FINDoc_NativePostingBatchID,FINDoc_NativePostedAt,FINDoc_MetadataJSON,FINDoc_UpdatedAt").in("FINDoc_LegalEntityID", ids).in("FINDoc_TypeCode", types).order("FINDoc_UpdatedAt", { ascending: false }).limit(250)
    : { data: [], error: null }
  if (documentsResult.error) throw new HttpError(500, documentsResult.error.message)
  const documents = documentsResult.data ?? []
  const partyIds = [...new Set(documents.map((item: any) => item.FINDoc_PartyOrgID).filter(Boolean))]
  const jobIds = [...new Set(documents.map((item: any) => item.FINDoc_SourceJobID).filter(Boolean))]
  const [partiesResult, jobsResult] = await Promise.all([
    partyIds.length ? admin.from("Org_Master").select("Org_id,Org_Name,Org_AccCode").in("Org_id", partyIds) : { data: [], error: null },
    jobIds.length ? admin.from("Job_Header").select("Job_ID,Job_Number,Job_Period").in("Job_ID", jobIds) : { data: [], error: null },
  ])
  if (partiesResult.error || jobsResult.error) throw new HttpError(500, partiesResult.error?.message ?? jobsResult.error?.message)
  const partyNames = new Map((partiesResult.data ?? []).map((party: any) => [party.Org_id, party.Org_Name]))
  const jobReferences = new Map((jobsResult.data ?? []).map((job: any) => [job.Job_ID, `${job.Job_Period}-${job.Job_Number}`]))
  const result: Record<string, unknown> = { documents: documents.map((document: any) => {
    const recordedTaxStatus = clean(document.FINDoc_MetadataJSON?.taxStatus, 20)
    const taxStatus = recordedTaxStatus === "approved" || recordedTaxStatus === "pending"
      ? recordedTaxStatus
      : document.FINDoc_StatusCode === "draft" ? "pending" : "approved"
    const { FINDoc_MetadataJSON: _metadata, ...safeDocument } = document
    return { ...safeDocument, FINDoc_TaxStatus: taxStatus, partyName: partyNames.get(document.FINDoc_PartyOrgID) ?? "Unknown organisation", jobReference: jobReferences.get(document.FINDoc_SourceJobID) ?? null }
  }) }
  if (!draftOptions) return result
  const { data: offices, error: officeError } = await admin.from("cmp_Offices").select("Office_ID").eq("Company_ID", current.Company_ID)
  if (officeError) throw new HttpError(500, officeError.message)
  const officeIds = (offices ?? []).map((office: any) => office.Office_ID)
  const [entities, parties, jobs, banks, treatments, revisions, pendingRuns, demoConnections, activeConnections, suggestions, openDocuments] = await Promise.all([
    admin.from("cmp_LegalEntities").select("LegalEntity_ID,LegalEntity_Name,LegalEntity_BaseCurrencyCodeSnapshot").eq("Company_ID", current.Company_ID).eq("LegalEntity_IsActive", true).order("LegalEntity_Name"),
    admin.from("Org_Master").select("Org_id,Org_Name,Org_AccCode").order("Org_Name").limit(500),
    officeIds.length ? admin.from("Job_Header").select("Job_ID,Job_Number,Job_Period,Job_Customer,Job_Supplier,Job_LegalEntityID,Job_Status").or(`Job_OfficeID.in.(${officeIds.join(",")}),Job_OrgOfficeID.in.(${officeIds.join(",")})`).eq("Job_IsDeleted", false).order("Job_UpdatedAt", { ascending: false }).limit(250) : { data: [], error: null },
    ids.length ? admin.from("FIN_BankAccounts").select("FINBank_ID,FINBank_Code,FINBank_Name,FINBank_LegalEntityID,FINBank_CurrencyCode").in("FINBank_LegalEntityID", ids).eq("FINBank_IsActive", true).order("FINBank_Name") : { data: [], error: null },
    ids.length ? admin.from("FIN_TaxCodes").select("FINTax_ID,FINTax_LegalEntityID,FINTax_Code,FINTax_Name,FINTax_TransactionTypeCode,FINTax_RatePercent,FINTax_EffectiveFrom,FINTax_EffectiveTo,FINTax_ApprovedAt").in("FINTax_LegalEntityID", ids).eq("FINTax_IsActive", true).not("FINTax_ApprovedAt", "is", null).order("FINTax_Name") : { data: [], error: null },
    ids.length ? admin.from("FIN_AdministrationRevisions").select("FINAdminRevision_LegalEntityID,FINAdminRevision_ConfigJSON").in("FINAdminRevision_LegalEntityID", ids).eq("FINAdminRevision_StatusCode", "approved") : { data: [], error: null },
    ids.length ? admin.from("FIN_ConfigurationRuns").select("FINConfigRun_LegalEntityID,FINConfigRun_ProviderCode,FINConfigRun_ExternalCompany,FINConfigRun_StatusCode,FINConfigRun_PreviewJSON,FINConfigRun_RequestedAt").in("FINConfigRun_LegalEntityID", ids).eq("FINConfigRun_StatusCode", "awaiting_approval").gte("FINConfigRun_RequestedAt", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).order("FINConfigRun_RequestedAt", { ascending: false }) : { data: [], error: null },
    ids.length ? admin.from("ACCI_Connections").select("ACCIC_LegalEntityID").in("ACCIC_LegalEntityID", ids).eq("ACCIC_ProviderCode", "erpnext").eq("ACCIC_StatusCode", "active").eq("ACCIC_Environment", "sandbox") : { data: [], error: null },
    ids.length ? admin.from("ACCI_Connections").select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_LegalEntityID,ACCIC_ExternalTenantName,ACCIC_StatusCode").in("ACCIC_LegalEntityID", ids).eq("ACCIC_StatusCode", "active").order("ACCIC_UpdatedAt", { ascending: false }) : { data: [], error: null },
    admin.from("FIN_LocalisationTaxTreatments").select("FINLocTaxTreatment_ID,FINLocTaxTreatment_Code,FINLocTaxTreatment_Name,FINLocTaxTreatment_TransactionType,FINLocTaxTreatment_RatePercent").eq("FINLocTaxTreatment_IsActive", true).order("FINLocTaxTreatment_Code"),
    ids.length ? admin.from("FIN_Documents").select("FINDoc_ID,FINDoc_Number,FINDoc_TypeCode,FINDoc_StatusCode,FINDoc_LegalEntityID,FINDoc_PartyOrgID,FINDoc_DocumentDate,FINDoc_DueDate,FINDoc_CurrencyCodeSnapshot,FINDoc_ExchangeRate,FINDoc_NetAmount,FINDoc_TaxAmount,FINDoc_GrossAmount,FINDoc_OutstandingAmount,FINDoc_SourceJobID,FINDoc_SourceKindCode,FINDoc_PostingStatusCode,FINDoc_ExportStatusCode,FINDoc_UpdatedAt").in("FINDoc_LegalEntityID", ids).eq("FINDoc_TypeCode", selectedLedger === "receivables" ? "sl_invoice" : "pl_invoice").in("FINDoc_StatusCode", ["approved", "submitted"]).gt("FINDoc_OutstandingAmount", 0).order("FINDoc_DueDate", { ascending: true, nullsFirst: false }).limit(1000) : { data: [], error: null },
  ])
  for (const query of [entities, parties, jobs, banks, treatments, revisions, pendingRuns, demoConnections, activeConnections, suggestions, openDocuments]) if (query.error) throw new HttpError(500, query.error.message)
  const connectionIds = (activeConnections.data ?? []).map((connection: any) => connection.ACCIC_ID)
  const { data: partyMappings, error: partyMappingError } = connectionIds.length
    ? await admin.from("ACCI_PartyMappings").select("ACCIPM_ID,ACCIPM_ConnectionID,ACCIPM_OrgID,ACCIPM_PartyType,ACCIPM_ProviderPartyID,ACCIPM_ProviderPartyCode,ACCIPM_ProviderPartyName,ACCIPM_LastSyncedAt,ACCIPM_IsActive").in("ACCIPM_ConnectionID", connectionIds).eq("ACCIPM_IsActive", true)
    : { data: [], error: null }
  if (partyMappingError) throw new HttpError(500, partyMappingError.message)
  const demoReadyEntityIds = new Set((demoConnections.data ?? []).map((connection: any) => connection.ACCIC_LegalEntityID))
  const taxReadyEntityIds = new Set((revisions.data ?? []).filter((revision: any) =>
    taxAdviceConfirmed(revision.FINAdminRevision_ConfigJSON)
    || (demoReadyEntityIds.has(revision.FINAdminRevision_LegalEntityID) && demoTaxConfirmed(revision.FINAdminRevision_ConfigJSON))
  ).map((revision: any) => revision.FINAdminRevision_LegalEntityID))
  const pendingCurrencies = new Map<string, string>()
  for (const run of pendingRuns.data ?? []) {
    const code = pendingProviderCurrency(run)
    if (code && !pendingCurrencies.has(run.FINConfigRun_LegalEntityID)) pendingCurrencies.set(run.FINConfigRun_LegalEntityID, code)
  }
  result.legalEntities = (entities.data ?? []).map((entity: any) => {
    const approvedCurrency = currency(entity.LegalEntity_BaseCurrencyCodeSnapshot)
    const pendingCurrency = pendingCurrencies.get(entity.LegalEntity_ID) ?? null
    return {
      ...entity,
      FinanceDraftCurrencyCode: approvedCurrency ?? pendingCurrency,
      FinanceDraftCurrencyStatus: approvedCurrency ? "approved" : pendingCurrency ? "pending_configuration" : "missing",
    }
  })
  result.parties = parties.data ?? []
  result.jobs = jobs.data ?? []
  const draftJobIds = (jobs.data ?? []).map((job: any) => job.Job_ID)
  const { data: jobCostingLines, error: costingError } = draftJobIds.length ? await admin.from("Job_Costing_Lines").select("JobCostingLine_ID,Job_ID,JobCostingLine_Number,JobCostingLine_ChargeCodeID,JobCostingLine_Description,JobCostingLine_DomainCode,JobCostingLine_SourceTable,JobCostingLine_SourceID,JobCostingLine_SourceLineID,JobCostingLine_CostAmountLocal,JobCostingLine_RevenueAmountLocal,JobCostingLine_CostNominalAccountID,JobCostingLine_RevenueNominalAccountID").in("Job_ID", draftJobIds).order("JobCostingLine_Number") : { data: [], error: null }
  if (costingError) throw new HttpError(500, costingError.message)
  result.jobCostingLines = jobCostingLines ?? []
  result.bankAccounts = banks.data ?? []
  result.accountingConnections = activeConnections.data ?? []
  result.partyMappings = partyMappings ?? []
  result.taxTreatments = (treatments.data ?? []).filter((treatment: any) => taxReadyEntityIds.has(treatment.FINTax_LegalEntityID)).map((treatment: any) => ({
    FINLocTaxTreatment_ID: treatment.FINTax_ID,
    FINLocTaxTreatment_LegalEntityID: treatment.FINTax_LegalEntityID,
    FINLocTaxTreatment_Code: treatment.FINTax_Code,
    FINLocTaxTreatment_Name: treatment.FINTax_Name,
    FINLocTaxTreatment_TransactionType: treatment.FINTax_TransactionTypeCode,
    FINLocTaxTreatment_RatePercent: treatment.FINTax_RatePercent,
    FINLocTaxTreatment_EffectiveFrom: treatment.FINTax_EffectiveFrom,
    FINLocTaxTreatment_EffectiveTo: treatment.FINTax_EffectiveTo,
  }))
  result.taxSuggestions = suggestions.data ?? []
  result.openDocuments = openDocuments.data ?? []
  return result
}

async function documentDetail(admin: any, current: any, id: string) {
  const document = await scopedDocument(admin, current, id)
  await requirePermission(admin, current.User_ID, viewPermission(typeLedger(document.FINDoc_TypeCode)))
  const [
    linesResult, partyResult, entityResult, jobResult, queueResult,
    historyResult, externalResult, issueResult, connectionResult,
  ] = await Promise.all([
    admin.from("FIN_DocumentLines")
      .select("FINDocLine_ID,FINDocLine_LineNo,FINDocLine_LineTypeCode,FINDocLine_ChargeCodeSnapshot,FINDocLine_Description,FINDocLine_Quantity,FINDocLine_UnitAmount,FINDocLine_NetAmount,FINDocLine_TaxCodeID,FINDocLine_TaxCodeSnapshot,FINDocLine_TaxRatePercent,FINDocLine_TaxAmount,FINDocLine_GrossAmount")
      .eq("FINDocLine_DocumentID", id).order("FINDocLine_LineNo"),
    document.FINDoc_PartyOrgID
      ? admin.from("Org_Master").select("Org_id,Org_Name,Org_AccCode").eq("Org_id", document.FINDoc_PartyOrgID).maybeSingle()
      : { data: null, error: null },
    admin.from("cmp_LegalEntities").select("LegalEntity_ID,LegalEntity_Name,LegalEntity_BaseCurrencyCodeSnapshot").eq("LegalEntity_ID", document.FINDoc_LegalEntityID).maybeSingle(),
    document.FINDoc_SourceJobID
      ? admin.from("Job_Header").select("Job_ID,Job_Number,Job_Period").eq("Job_ID", document.FINDoc_SourceJobID).maybeSingle()
      : { data: null, error: null },
    admin.from("FIN_IntegrationQueue")
      .select("FINIntQ_ID,FINIntQ_StatusCode,FINIntQ_AttemptCount,FINIntQ_LastAttemptAt,FINIntQ_LastError,FINIntQ_CreatedAt")
      .eq("FINIntQ_LocalTable", "FIN_Documents").eq("FINIntQ_LocalID", id)
      .order("FINIntQ_CreatedAt", { ascending: false }).limit(1).maybeSingle(),
    admin.from("FIN_DocumentStatusHistory")
      .select("FINDocStatus_ID,FINDocStatus_FromStatusCode,FINDocStatus_ToStatusCode,FINDocStatus_ChangedAt,FINDocStatus_ChangedBy,FINDocStatus_Reason,FINDocStatus_MetadataJSON")
      .eq("FINDocStatus_DocumentID", id).order("FINDocStatus_ChangedAt", { ascending: false }).limit(100),
    admin.from("ACCI_ExternalRefs")
      .select("ACCIER_ID,ACCIER_ExternalObjectType,ACCIER_ExternalID,ACCIER_ExternalNumber,ACCIER_ExternalURL,ACCIER_SyncStatusCode,ACCIER_LastSyncedAt")
      .eq("ACCIER_LocalTable", "FIN_Documents").eq("ACCIER_LocalID", id)
      .order("ACCIER_LastSyncedAt", { ascending: false }).limit(1).maybeSingle(),
    admin.from("ACCI_ReconciliationIssues")
      .select("ACCIRI_ID,ACCIRI_IssueType,ACCIRI_Severity,ACCIRI_StatusCode,ACCIRI_Title,ACCIRI_DetailText,ACCIRI_ResolutionText,ACCIRI_ResolvedAt,ACCIRI_CreatedAt")
      .eq("ACCIRI_LocalTable", "FIN_Documents").eq("ACCIRI_LocalID", id)
      .order("ACCIRI_CreatedAt", { ascending: false }).limit(25),
    admin.from("ACCI_Connections")
      .select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_Name,ACCIC_StatusCode,ACCIC_ExternalTenantName")
      .eq("ACCIC_LegalEntityID", document.FINDoc_LegalEntityID).eq("ACCIC_StatusCode", "active")
      .order("ACCIC_UpdatedAt", { ascending: false }).limit(1).maybeSingle(),
  ])
  for (const query of [linesResult, partyResult, entityResult, jobResult, queueResult, historyResult, externalResult, issueResult, connectionResult]) {
    if (query.error) throw new HttpError(500, query.error.message)
  }
  const { data: jobLinks, error: jobLinkError } = await admin.from("FIN_DocumentLineJobLinks").select("FINDocLineJob_DocumentLineID,FINDocLineJob_JobCostingLineID").eq("FINDocLineJob_DocumentID", id)
  if (jobLinkError) throw new HttpError(500, jobLinkError.message)
  const costingLineByDocumentLine = new Map((jobLinks ?? []).map((link: any) => [link.FINDocLineJob_DocumentLineID, link.FINDocLineJob_JobCostingLineID]))
  const recordedTaxStatus = clean(document.FINDoc_MetadataJSON?.taxStatus, 20)
  const taxStatus = recordedTaxStatus === "approved" || recordedTaxStatus === "pending"
    ? recordedTaxStatus
    : document.FINDoc_StatusCode === "draft" ? "pending" : "approved"
  const { FINDoc_MetadataJSON: _metadata, ...safeDocument } = document
  const lastAttempt = queueResult.data?.FINIntQ_LastAttemptAt ? Date.parse(queueResult.data.FINIntQ_LastAttemptAt) : 0
  const retryAvailable = document.FINDoc_StatusCode === "approved"
    && ["blocked", "failed"].includes(document.FINDoc_ExportStatusCode)
    && Boolean(queueResult.data)
    && (queueResult.data.FINIntQ_StatusCode !== "processing" || lastAttempt < Date.now() - 15 * 60 * 1000)
  return {
    document: {
      ...safeDocument,
      FINDoc_TaxStatus: taxStatus,
      partyName: partyResult.data?.Org_Name ?? "Unknown organisation",
      partyAccountCode: partyResult.data?.Org_AccCode ?? null,
      legalEntityName: entityResult.data?.LegalEntity_Name ?? "Unknown legal entity",
      jobReference: jobResult.data ? `${jobResult.data.Job_Period}-${jobResult.data.Job_Number}` : null,
    },
    lines: (linesResult.data ?? []).map((line: any) => ({ ...line, FINDocLine_JobCostingLineID: costingLineByDocumentLine.get(line.FINDocLine_ID) ?? null })),
    integrationQueue: queueResult.data ? { ...queueResult.data, retryAvailable } : null,
    history: historyResult.data ?? [],
    externalReference: externalResult.data ?? null,
    reconciliationIssues: issueResult.data ?? [],
    provider: connectionResult.data ?? null,
  }
}

async function cashWorkspace(admin: any, current: any, selectedLedger?: Ledger) {
  if (selectedLedger) await requirePermission(admin, current.User_ID, viewPermission(selectedLedger))
  else {
    await requirePermission(admin, current.User_ID, "Finance.Receivables.View")
    await requirePermission(admin, current.User_ID, "Finance.Payables.View")
  }
  const ids = await entityIds(admin, current)
  if (!ids.length) return { cashTransactions: [] }
  let query = admin.from("FIN_CashTransactions").select("FINCash_ID,FINCash_TypeCode,FINCash_StatusCode,FINCash_Number,FINCash_LegalEntityID,FINCash_BankAccountID,FINCash_PartyOrgID,FINCash_TransactionDate,FINCash_CurrencyCodeSnapshot,FINCash_ExchangeRate,FINCash_Amount,FINCash_UnallocatedAmount,FINCash_Reference,FINCash_PostingStatusCode,FINCash_ExportStatusCode,FINCash_NativePostingStatusCode,FINCash_NativePostingBatchID,FINCash_NativePostedAt,FINCash_UpdatedAt").in("FINCash_LegalEntityID", ids).order("FINCash_UpdatedAt", { ascending: false }).limit(250)
  if (selectedLedger) query = query.eq("FINCash_TypeCode", selectedLedger === "receivables" ? "customer_receipt" : "supplier_payment")
  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  const rows = data ?? []
  const partyIds = [...new Set(rows.map((row: any) => row.FINCash_PartyOrgID).filter(Boolean))]
  const { data: parties, error: partiesError } = partyIds.length ? await admin.from("Org_Master").select("Org_id,Org_Name").in("Org_id", partyIds) : { data: [], error: null }
  if (partiesError) throw new HttpError(500, partiesError.message)
  const names = new Map((parties ?? []).map((party: any) => [party.Org_id, party.Org_Name]))
  return { cashTransactions: rows.map((row: any) => ({ ...row, partyName: names.get(row.FINCash_PartyOrgID) ?? "Unknown organisation" })) }
}

async function controlledDocumentDraftInput(admin: any, input: DraftInput) {
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) throw new HttpError(400, "Add between one and 100 document lines.")
  const documentDate = clean(input.documentDate, 10) || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) throw new HttpError(400, "Enter a valid document date.")
  const requestedCodes = input.lines.map((line) => clean(line.taxCode, 80))
  const uniqueCodes = [...new Set(requestedCodes.filter(Boolean))]
  const [{ data: revision, error: revisionError }, { data: treatments, error: treatmentError }, { data: suggestions, error: suggestionError }, { data: demoConnection, error: demoConnectionError }] = await Promise.all([
    admin.from("FIN_AdministrationRevisions").select("FINAdminRevision_ConfigJSON").eq("FINAdminRevision_LegalEntityID", input.legalEntityId).eq("FINAdminRevision_StatusCode", "approved").limit(1).maybeSingle(),
    uniqueCodes.length ? admin.from("FIN_TaxCodes").select("FINTax_ID,FINTax_Code,FINTax_RatePercent,FINTax_TransactionTypeCode,FINTax_EffectiveFrom,FINTax_EffectiveTo").eq("FINTax_LegalEntityID", input.legalEntityId).eq("FINTax_IsActive", true).not("FINTax_ApprovedAt", "is", null).in("FINTax_Code", uniqueCodes) : { data: [], error: null },
    uniqueCodes.length ? admin.from("FIN_LocalisationTaxTreatments").select("FINLocTaxTreatment_Code,FINLocTaxTreatment_TransactionType").eq("FINLocTaxTreatment_IsActive", true).in("FINLocTaxTreatment_Code", uniqueCodes) : { data: [], error: null },
    admin.from("ACCI_Connections").select("ACCIC_ID").eq("ACCIC_LegalEntityID", input.legalEntityId).eq("ACCIC_ProviderCode", "erpnext").eq("ACCIC_StatusCode", "active").eq("ACCIC_Environment", "sandbox").limit(1).maybeSingle(),
  ])
  if (revisionError || treatmentError || suggestionError || demoConnectionError) throw new HttpError(500, revisionError?.message ?? treatmentError?.message ?? suggestionError?.message ?? demoConnectionError?.message)
  const hasApprovedTaxAdvice = Boolean(revision && (
    taxAdviceConfirmed(revision.FINAdminRevision_ConfigJSON)
    || (demoConnection && demoTaxConfirmed(revision.FINAdminRevision_ConfigJSON) && uniqueCodes.length > 0 && uniqueCodes.every((code) => code === "DEMO-NONTAX"))
  ))
  const direction = input.type === "sl_invoice" || input.type === "credit_note" ? "sales" : "purchase"
  const controlledLines = input.lines.map((line, index) => {
    const costingLineId = clean(line.jobCostingLineId, 36)
    if (costingLineId && !isUuid(costingLineId)) throw new HttpError(400, `Choose a valid job charge for line ${index + 1}.`)
    const controlledLine = { ...line, jobCostingLineId: costingLineId || null }
    const code = requestedCodes[index]
    if (!code) return { ...controlledLine, taxCode: null, taxRatePercent: 0 }
    const matches = (treatments ?? []).filter((treatment: any) => treatment.FINTax_Code === code && ["both", direction].includes(treatment.FINTax_TransactionTypeCode) && treatment.FINTax_EffectiveFrom <= documentDate && (!treatment.FINTax_EffectiveTo || treatment.FINTax_EffectiveTo >= documentDate))
    if (matches.length > 1) throw new HttpError(409, `Tax treatment ${code} has overlapping effective rules. Finance must correct the setup.`)
    if (hasApprovedTaxAdvice && matches.length === 1) return { ...controlledLine, taxCode: code, taxRatePercent: Number(matches[0].FINTax_RatePercent) }
    const isRecognisedSuggestion = (suggestions ?? []).some((suggestion: any) => suggestion.FINLocTaxTreatment_Code === code && ["both", direction].includes(suggestion.FINLocTaxTreatment_TransactionType))
    if (!isRecognisedSuggestion) throw new HttpError(400, `Tax classification ${code} is not available for this ledger.`)
    return { ...controlledLine, taxCode: code, taxRatePercent: 0 }
  })
  return { ...input, documentDate, lines: controlledLines }
}

async function linkDocumentChargeLines(admin: any, current: any, documentId: string, input: DraftInput) {
  if (!input.sourceJobId) return
  const links = input.lines.map((line, index) => ({ lineNo: index + 1, jobCostingLineId: line.jobCostingLineId || null }))
  const { error } = await admin.rpc("multideck_finance_link_document_charge_lines", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_document_id: documentId, p_lines: links })
  rpcFailure(error, "The document was saved, but its job charge lines could not be linked.")
}

async function createDocumentDraft(admin: any, current: any, input: DraftInput) {
  await requirePermission(admin, current.User_ID, documentPermission(input.type))
  await legalEntity(admin, current, input.legalEntityId)
  const evidence = await financePurchaseEvidence(admin, current, input)
  const controlledInput = await controlledDocumentDraftInput(admin, input)
  const { data, error } = await admin.rpc("multideck_finance_create_document_draft", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_input: { ...controlledInput, idempotencyKey: input.idempotencyKey || crypto.randomUUID() } })
  rpcFailure(error, "Could not create the finance draft.")
  await linkDocumentChargeLines(admin, current, data?.FINDoc_ID, controlledInput)
  if (evidence) await retainFinancePurchaseEvidence(admin, current, evidence, data?.FINDoc_ID)
  return data
}

async function financePurchaseEvidence(admin: any, current: any, input: DraftInput) {
  const extractionId = clean(input.sourceExtractionId, 36)
  if (!extractionId) return null
  if (!isUuid(extractionId) || (input.type !== "pl_invoice" && input.type !== "debit_note")) throw new HttpError(400, "Choose a valid supplier document extraction.")
  const { data, error } = await admin.from("Customs_InvoiceExtractions")
    .select("CUSTIE_ID,CUSTIE_FileName,CUSTIE_SHA256,CUSTIE_StoredObjectID,CUSTIE_ResultJSON")
    .eq("CUSTIE_ID", extractionId).eq("CUSTIE_CompanyID", current.Company_ID).eq("CUSTIE_UserID", current.User_ID).eq("CUSTIE_StatusCode", "ready").maybeSingle()
  if (error) throw new HttpError(500, "The supplier document evidence could not be checked.")
  if (!data || data.CUSTIE_ResultJSON?.sourceDocumentType !== "finance_purchase" || !data.CUSTIE_StoredObjectID) {
    throw new HttpError(409, "The reviewed supplier document is no longer available. Import it again before creating the draft.")
  }
  return data
}

async function retainFinancePurchaseEvidence(admin: any, current: any, evidence: any, documentId: string) {
  if (!isUuid(documentId)) throw new HttpError(500, "The finance draft was created without a valid evidence target.")
  const { data: document, error: documentError } = await admin.from("FIN_Documents").select("FINDoc_MetadataJSON").eq("FINDoc_ID", documentId).maybeSingle()
  if (documentError || !document) throw new HttpError(500, "The finance draft could not retain its source evidence.")
  const metadata = document.FINDoc_MetadataJSON && typeof document.FINDoc_MetadataJSON === "object" ? document.FINDoc_MetadataJSON : {}
  const [storedResult, financeResult] = await Promise.all([
    admin.from("DOC_StoredObjects").update({
      DOCStoredObject_ConcernCode: "finance",
      DOCStoredObject_AggregateType: "finance_document",
      DOCStoredObject_AggregateID: documentId,
    }).eq("DOCStoredObject_ID", evidence.CUSTIE_StoredObjectID).eq("DOCStoredObject_StatusCode", "active"),
    admin.from("FIN_Documents").update({ FINDoc_MetadataJSON: {
      ...metadata,
      source: "supplier_document_intake",
      sourceExtractionId: evidence.CUSTIE_ID,
      sourceFileName: evidence.CUSTIE_FileName,
      sourceSHA256: evidence.CUSTIE_SHA256,
      sourceStoredObjectId: evidence.CUSTIE_StoredObjectID,
    }, FINDoc_UpdatedBy: current.User_ID, FINDoc_UpdatedAt: new Date().toISOString() }).eq("FINDoc_ID", documentId),
  ])
  if (storedResult.error || financeResult.error) throw new HttpError(500, "The finance draft was created, but its source evidence could not be retained. Retry this item before posting.")
  const { error: releaseError } = await admin.from("Customs_InvoiceExtractions").update({
    CUSTIE_StoredObjectID: null,
    CUSTIE_PreviewExpiresAt: null,
    CUSTIE_UpdatedAt: new Date().toISOString(),
  }).eq("CUSTIE_ID", evidence.CUSTIE_ID).eq("CUSTIE_CompanyID", current.Company_ID).eq("CUSTIE_UserID", current.User_ID)
  if (releaseError) throw new HttpError(500, "The source evidence was retained, but its temporary extraction record needs reconciliation before posting.")
}

async function updateDocumentDraft(admin: any, current: any, id: string, input: DraftInput) {
  const document = await scopedDocument(admin, current, id)
  await requirePermission(admin, current.User_ID, documentPermission(document.FINDoc_TypeCode))
  if (document.FINDoc_StatusCode !== "draft" || document.FINDoc_IsLocked || document.FINDoc_PostedAt) {
    throw new HttpError(409, "Only an unlocked draft can be edited.")
  }
  const controlledInput = await controlledDocumentDraftInput(admin, {
    ...input,
    type: document.FINDoc_TypeCode,
    legalEntityId: document.FINDoc_LegalEntityID,
  })
  const { data, error } = await admin.rpc("multideck_finance_update_document_draft", {
    p_company_id: current.Company_ID,
    p_user_id: current.User_ID,
    p_document_id: id,
    p_input: controlledInput,
  })
  rpcFailure(error, "Could not save the finance draft.")
  await linkDocumentChargeLines(admin, current, id, controlledInput)
  return data
}

async function reopenDocumentDraft(admin: any, current: any, id: string, reason?: string) {
  const document = await scopedDocument(admin, current, id)
  await requirePermission(admin, current.User_ID, documentPermission(document.FINDoc_TypeCode))
  await requirePermission(admin, current.User_ID, "Finance.ReviewAndPost")
  const { data, error } = await admin.rpc("multideck_finance_reopen_document_draft", {
    p_company_id: current.Company_ID,
    p_user_id: current.User_ID,
    p_document_id: id,
    p_reason: clean(reason, 500) || null,
  })
  rpcFailure(error, "Could not return the finance document to draft.")
  return data
}

async function retryDocumentPosting(admin: any, current: any, id: string) {
  const document = await scopedDocument(admin, current, id)
  await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
  if (document.FINDoc_StatusCode !== "approved" || !["blocked", "failed"].includes(document.FINDoc_ExportStatusCode)) {
    throw new HttpError(409, "Only an approved blocked or failed external mirror delivery can be retried.")
  }
  const { data: queue, error } = await admin.from("FIN_IntegrationQueue")
    .select("FINIntQ_ID").eq("FINIntQ_LocalTable", "FIN_Documents").eq("FINIntQ_LocalID", id)
    .in("FINIntQ_StatusCode", ["blocked", "failed", "processing"])
    .order("FINIntQ_CreatedAt", { ascending: false }).limit(1).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!queue) throw new HttpError(409, "This document has no recoverable external mirror delivery item.")
  return await processQueue(admin, current, queue.FINIntQ_ID)
}

async function createCashDraft(admin: any, current: any, input: CashInput) {
  await requirePermission(admin, current.User_ID, cashPermission(input.type))
  const { data, error } = await admin.rpc("multideck_finance_create_cash_draft", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_input: { ...input, idempotencyKey: input.idempotencyKey || crypto.randomUUID() } })
  rpcFailure(error, "Could not create the cash draft.")
  return data
}

async function transitionDocument(admin: any, current: any, id: string, transition: "request_review" | "approve" | "reject", reason?: string) {
  const document = await scopedDocument(admin, current, id)
  await requirePermission(admin, current.User_ID, transition === "request_review" ? documentPermission(document.FINDoc_TypeCode) : "Finance.ReviewAndPost")
  const { data, error } = await admin.rpc("multideck_finance_transition_document", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_document_id: id, p_transition: transition, p_reason: clean(reason, 500) || null })
  rpcFailure(error, "Could not change the finance document status.")
  if (transition === "approve") {
    const { data: queue } = await admin.from("FIN_IntegrationQueue").select("FINIntQ_ID").eq("FINIntQ_LocalTable", "FIN_Documents").eq("FINIntQ_LocalID", id).eq("FINIntQ_StatusCode", "queued").order("FINIntQ_CreatedAt", { ascending: false }).limit(1).maybeSingle()
    if (queue?.FINIntQ_ID) await processQueue(admin, current, queue.FINIntQ_ID, true).catch(() => null)
    return await scopedDocument(admin, current, id)
  }
  return data
}

async function transitionCash(admin: any, current: any, id: string, transition: "request_review" | "approve" | "reject", reason?: string) {
  const cash = await scopedCash(admin, current, id)
  await requirePermission(admin, current.User_ID, transition === "request_review" ? cashPermission(cash.FINCash_TypeCode) : "Finance.ReviewAndPost")
  const { data, error } = await admin.rpc("multideck_finance_transition_cash", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_cash_id: id, p_transition: transition, p_reason: clean(reason, 500) || null })
  rpcFailure(error, "Could not change the cash transaction status.")
  if (transition === "approve") {
    const { data: queue } = await admin.from("FIN_IntegrationQueue").select("FINIntQ_ID").eq("FINIntQ_LocalTable", "FIN_CashTransactions").eq("FINIntQ_LocalID", id).eq("FINIntQ_StatusCode", "queued").order("FINIntQ_CreatedAt", { ascending: false }).limit(1).maybeSingle()
    if (queue?.FINIntQ_ID) await processQueue(admin, current, queue.FINIntQ_ID, true).catch(() => null)
    return await scopedCash(admin, current, id)
  }
  return data
}

async function saveExternalRef(admin: any, connection: any, localTable: string, localId: string, localNumber: string, typeCode: string, externalObjectType: string, externalId: string, externalNumber: string | null, externalUrl: string | null, payload: Record<string, unknown>, syncStatus = "synced") {
  const { data, error } = await admin.from("ACCI_ExternalRefs").upsert({
    ACCIER_ConnectionID: connection.ACCIC_ID, ACCIER_DocumentTypeCode: typeCode, ACCIER_LocalTable: localTable, ACCIER_LocalID: localId, ACCIER_LocalNumber: localNumber,
    ACCIER_ExternalObjectType: externalObjectType, ACCIER_ExternalID: externalId, ACCIER_ExternalNumber: externalNumber, ACCIER_ExternalURL: externalUrl,
    ACCIER_SyncStatusCode: syncStatus, ACCIER_LastSyncedAt: syncStatus === "synced" ? new Date().toISOString() : null, ACCIER_LastPayloadJSON: payload,
  }, { onConflict: "ACCIER_ConnectionID,ACCIER_DocumentTypeCode,ACCIER_LocalTable,ACCIER_LocalID" }).select("ACCIER_ID").single()
  if (error || !data) throw new HttpError(500, error?.message ?? "Provider reference could not be retained.")
  return data.ACCIER_ID
}

async function assertPartyFinancePostingAllowed(admin: any, partyId: string, typeCode: string) {
  const [organisationResult, profileResult] = await Promise.all([
    admin.from("Org_Master").select("Org_id,Org_CRMRelationshipStatusCode").eq("Org_id", partyId).maybeSingle(),
    admin.from("CRM_AccountOperationalProfiles").select("CRMAccountOps_InvoicePreferencesJSON").eq("CRMAccountOps_OrgID", partyId).maybeSingle(),
  ])
  if (organisationResult.error || profileResult.error) throw new HttpError(500, organisationResult.error?.message ?? profileResult.error?.message)
  if (!organisationResult.data) throw new HttpError(409, "The finance party no longer exists. Correct the document before exporting.")
  if (clean(organisationResult.data.Org_CRMRelationshipStatusCode, 60).toLowerCase() === "blocked") {
    throw new HttpError(409, "This organisation is blocked. Restore its relationship status before exporting finance records.")
  }
  const preferences = profileResult.data?.CRMAccountOps_InvoicePreferencesJSON && typeof profileResult.data.CRMAccountOps_InvoicePreferencesJSON === "object"
    ? profileResult.data.CRMAccountOps_InvoicePreferencesJSON
    : {}
  const sales = typeCode === "sl_invoice" || typeCode === "credit_note" || typeCode === "customer_receipt"
  const accountingStatus = clean(preferences[sales ? "customerAccountingStatusCode" : "supplierAccountingStatusCode"], 20) || "active"
  if (accountingStatus === "blocked") throw new HttpError(409, `This organisation's ${sales ? "customer" : "supplier"} accounting status is blocked.`)
  if (typeCode === "sl_invoice" && (accountingStatus === "on_hold" || preferences.creditHold === true)) {
    throw new HttpError(409, "This customer is on credit hold. Release the hold before exporting a sales invoice.")
  }
  if (typeCode === "supplier_payment" && (accountingStatus === "on_hold" || preferences.supplierPaymentHold === true)) {
    throw new HttpError(409, "This supplier is on payment hold. Release the hold before exporting a supplier payment.")
  }
}

async function canonicalExport(admin: any, current: any, queue: any, allowAwaitingApproval = false): Promise<{ input: CanonicalFinanceExport; connection: any }> {
  const localTable = queue.FINIntQ_LocalTable as "FIN_Documents" | "FIN_CashTransactions"
  const record = localTable === "FIN_Documents" ? await scopedDocument(admin, current, queue.FINIntQ_LocalID) : await scopedCash(admin, current, queue.FINIntQ_LocalID)
  const legalEntityId = localTable === "FIN_Documents" ? record.FINDoc_LegalEntityID : record.FINCash_LegalEntityID
  const statusCode = localTable === "FIN_Documents" ? record.FINDoc_StatusCode : record.FINCash_StatusCode
  if (statusCode !== "approved" && !(allowAwaitingApproval && statusCode === "awaiting_approval")) {
    throw new HttpError(409, "Only a reviewed finance record can pass provider preflight or export.")
  }
  const selectedEntity = await legalEntity(admin, current, legalEntityId)
  const baseCurrencyCode = currency(selectedEntity.LegalEntity_BaseCurrencyCodeSnapshot)
  if (!baseCurrencyCode) throw new HttpError(409, "Configure a valid base currency for this legal entity before exporting.")
  const { data: connection, error: connectionError } = await admin.from("ACCI_Connections").select("ACCIC_ID,ACCIC_ProviderCode,ACCIC_LegalEntityID,ACCIC_ExternalTenantName,ACCIC_ExternalBaseCurrencyCode,ACCIC_SettingsJSON").eq("ACCIC_LegalEntityID", legalEntityId).eq("ACCIC_StatusCode", "active").order("ACCIC_UpdatedAt", { ascending: false }).limit(1).maybeSingle()
  if (connectionError) throw new HttpError(500, connectionError.message)
  if (!connection) throw new HttpError(409, "Approve an accounting-provider connection for this legal entity before exporting.")
  const connectionCurrency = currency(connection.ACCIC_ExternalBaseCurrencyCode)
  if (!connectionCurrency) throw new HttpError(409, "The active accounting connection has no valid base currency. Re-approve it in Finance Setup, then retry.")
  if (connectionCurrency !== baseCurrencyCode) throw new HttpError(409, `The accounting connection uses ${connectionCurrency}, but this legal entity uses ${baseCurrencyCode}. Correct Finance Setup, then retry.`)
  const externalCompany = clean(connection.ACCIC_ExternalTenantName, 180)
  if (!externalCompany) throw new HttpError(409, "The active accounting connection has no Company. Correct Finance Setup, then retry.")
  const provider = accountingProvider(connection.ACCIC_ProviderCode)
  if (!provider?.enabled) throw new HttpError(409, provider?.unavailableReason ?? "This accounting provider adapter is not enabled.")
  const partyId = localTable === "FIN_Documents" ? record.FINDoc_PartyOrgID : record.FINCash_PartyOrgID
  const direction = typeLedger(localTable === "FIN_Documents" ? record.FINDoc_TypeCode : record.FINCash_TypeCode) === "receivables" ? "sales" : "purchase"
  const partyRole = direction === "sales" ? "customer" : "supplier"
  const typeCode = localTable === "FIN_Documents" ? record.FINDoc_TypeCode : record.FINCash_TypeCode
  await assertPartyFinancePostingAllowed(admin, partyId, typeCode)
  const { data: partyMappings, error: partyError } = await admin.from("ACCI_PartyMappings").select("ACCIPM_ProviderPartyID,ACCIPM_PartyType").eq("ACCIPM_ConnectionID", connection.ACCIC_ID).eq("ACCIPM_OrgID", partyId).in("ACCIPM_PartyType", [partyRole, "both"]).eq("ACCIPM_IsActive", true)
  if (partyError) throw new HttpError(500, partyError.message)
  const partyProviderIds = [...new Set<string>((partyMappings ?? []).map((mapping: any) => clean(mapping.ACCIPM_ProviderPartyID, 240)).filter(Boolean))]
  if (partyProviderIds.length > 1) throw new HttpError(409, `This ${partyRole} has conflicting active provider mappings. Keep one reviewed mapping, then retry.`)
  const { data: existingRef, error: refError } = await admin.from("ACCI_ExternalRefs").select("ACCIER_ExternalObjectType,ACCIER_ExternalID,ACCIER_SyncStatusCode").eq("ACCIER_ConnectionID", connection.ACCIC_ID).eq("ACCIER_DocumentTypeCode", typeCode).eq("ACCIER_LocalTable", localTable).eq("ACCIER_LocalID", queue.FINIntQ_LocalID).maybeSingle()
  if (refError) throw new HttpError(500, refError.message)
  if (existingRef?.ACCIER_SyncStatusCode === "synced") throw new HttpError(409, "This finance record is already synced to the accounting provider. Reconcile the existing reference instead of posting it again.")
  const currencyCode = currency(localTable === "FIN_Documents" ? record.FINDoc_CurrencyCodeSnapshot : record.FINCash_CurrencyCodeSnapshot)
  if (!currencyCode) throw new HttpError(409, "The approved finance record has no valid transaction currency. Correct it before exporting.")
  const exchangeRate = finiteNumber(localTable === "FIN_Documents" ? record.FINDoc_ExchangeRate : record.FINCash_ExchangeRate)
  if (exchangeRate === null || exchangeRate <= 0) throw new HttpError(409, "The approved finance record has no valid exchange rate. Correct it before exporting.")
  if (currencyCode === baseCurrencyCode && !sameAmount(exchangeRate, 1)) throw new HttpError(409, "A base-currency finance record must use an exchange rate of 1. Correct it before exporting.")
  const signedAmount = finiteNumber(localTable === "FIN_Documents" ? record.FINDoc_GrossAmount : record.FINCash_Amount)
  const signedLocalAmount = finiteNumber(localTable === "FIN_Documents" ? record.FINDoc_LocalGrossAmount : record.FINCash_LocalAmount)
  if (signedAmount === null || signedLocalAmount === null || Math.abs(signedAmount) <= 0 || Math.abs(signedLocalAmount) <= 0) throw new HttpError(409, "The approved finance record must have a positive posting value.")
  const amount = Math.abs(signedAmount)
  const localAmount = Math.abs(signedLocalAmount)
  if (!sameAmount(localAmount, amount * exchangeRate)) throw new HttpError(409, "The approved finance record no longer agrees with its reviewed exchange rate. Correct it before exporting.")
  if (localTable === "FIN_Documents") {
    const credit = typeCode === "credit_note" || typeCode === "debit_note"
    if ((credit && signedAmount >= 0) || (!credit && signedAmount <= 0)) throw new HttpError(409, "The finance document amount has the wrong invoice or credit polarity. Correct it before exporting.")
    if (record.FINDoc_DueDate && record.FINDoc_DueDate < record.FINDoc_DocumentDate) throw new HttpError(409, "The finance document due date cannot be before its document date.")
  }
  let lines: CanonicalFinanceExport["lines"] = []
  let allocations: CanonicalFinanceExport["allocations"] = []
  let bankProviderAccount: string | null = null
  let receivableProviderAccount: string | null = null
  let payableProviderAccount: string | null = null
  if (localTable === "FIN_Documents") {
    const { data: localLines, error: lineError } = await admin.from("FIN_DocumentLines").select("FINDocLine_Description,FINDocLine_Quantity,FINDocLine_UnitAmount,FINDocLine_NetAmount,FINDocLine_TaxAmount,FINDocLine_GrossAmount,FINDocLine_TaxCodeSnapshot,FINDocLine_TaxRatePercent,FINDocLine_ChargeID,FINDocLine_ChargeCodeSnapshot").eq("FINDocLine_DocumentID", record.FINDoc_ID).order("FINDocLine_LineNo")
    if (lineError) throw new HttpError(500, lineError.message)
    if (!(localLines ?? []).length) throw new HttpError(409, "The approved finance document has no lines to export.")
    const [chargeMappings, taxMappings] = await Promise.all([
      admin.from("ACCI_ChargeCodeMappings").select("ACCICM_LocalChargeCodeID,ACCICM_LocalChargeCodeSnapshot,ACCICM_ProviderItemID,ACCICM_ProviderItemCode,ACCICM_ProviderAccountID").eq("ACCICM_ConnectionID", connection.ACCIC_ID).eq("ACCICM_DirectionCode", direction).eq("ACCICM_IsActive", true),
      admin.from("ACCI_TaxCodeMappings").select("ACCITM_LocalTaxCode,ACCITM_ProviderTaxCode").eq("ACCITM_ConnectionID", connection.ACCIC_ID).eq("ACCITM_DirectionCode", direction).eq("ACCITM_IsActive", true),
    ])
    if (chargeMappings.error || taxMappings.error) throw new HttpError(500, chargeMappings.error?.message ?? taxMappings.error?.message)
    let lineNetTotal = 0
    let lineTaxTotal = 0
    let lineGrossTotal = 0
    lines = (localLines ?? []).map((line: any, index: number) => {
      const quantity = finiteNumber(line.FINDocLine_Quantity)
      const unitAmount = finiteNumber(line.FINDocLine_UnitAmount)
      const taxRatePercent = finiteNumber(line.FINDocLine_TaxRatePercent)
      const netAmount = finiteNumber(line.FINDocLine_NetAmount)
      const taxAmount = finiteNumber(line.FINDocLine_TaxAmount)
      const grossAmount = finiteNumber(line.FINDocLine_GrossAmount)
      if (!clean(line.FINDocLine_Description, 1000) || quantity === null || quantity <= 0 || unitAmount === null || unitAmount < 0 || taxRatePercent === null || taxRatePercent < 0 || taxRatePercent > 100 || netAmount === null || taxAmount === null || grossAmount === null) {
        throw new HttpError(409, `Finance line ${index + 1} is no longer valid. Correct the Multideck draft, then retry.`)
      }
      lineNetTotal += netAmount
      lineTaxTotal += taxAmount
      lineGrossTotal += grossAmount
      const idMatches = (chargeMappings.data ?? []).filter((candidate: any) => candidate.ACCICM_LocalChargeCodeID && candidate.ACCICM_LocalChargeCodeID === line.FINDocLine_ChargeID)
      const codeMatches = (chargeMappings.data ?? []).filter((candidate: any) => candidate.ACCICM_LocalChargeCodeSnapshot && candidate.ACCICM_LocalChargeCodeSnapshot === line.FINDocLine_ChargeCodeSnapshot)
      const matchingMappings = idMatches.length ? idMatches : codeMatches
      const mappingTargets = [...new Set(matchingMappings.map((mapping: any) => `${clean(mapping.ACCICM_ProviderItemID, 240) || clean(mapping.ACCICM_ProviderItemCode, 120)}\u0000${clean(mapping.ACCICM_ProviderAccountID, 240)}`))]
      if (mappingTargets.length > 1) throw new HttpError(409, `Finance line ${index + 1} has conflicting active charge-code mappings. Keep one reviewed mapping, then retry.`)
      const mapping = matchingMappings[0]
      const matchingTaxMappings = (taxMappings.data ?? []).filter((candidate: any) => candidate.ACCITM_LocalTaxCode === line.FINDocLine_TaxCodeSnapshot)
      const taxTargets = [...new Set(matchingTaxMappings.map((mapping: any) => clean(mapping.ACCITM_ProviderTaxCode, 80)).filter(Boolean))]
      if (taxTargets.length > 1) throw new HttpError(409, `Finance line ${index + 1} has conflicting active tax mappings. Keep one reviewed mapping, then retry.`)
      return { description: clean(line.FINDocLine_Description, 1000), quantity, unitAmount, taxRatePercent, providerTaxCode: taxTargets[0] ?? null, providerItemCode: clean(mapping?.ACCICM_ProviderItemID, 240) || clean(mapping?.ACCICM_ProviderItemCode, 120) || null, providerAccountCode: clean(mapping?.ACCICM_ProviderAccountID, 240) || null }
    })
    if (!sameAmount(lineNetTotal, Number(record.FINDoc_NetAmount)) || !sameAmount(lineTaxTotal, Number(record.FINDoc_TaxAmount)) || !sameAmount(lineGrossTotal, signedAmount)) {
      throw new HttpError(409, "The approved document header no longer agrees with its lines. Correct the Multideck draft, then retry.")
    }
  } else {
    if (!isUuid(clean(record.FINCash_BankAccountID, 80))) throw new HttpError(409, "Choose an active bank account before exporting this receipt or payment.")
    const [allocationResult, accountResult] = await Promise.all([
      admin.from("FIN_CashAllocations").select("FINCashAlloc_DocumentID,FINCashAlloc_AllocatedAmount").eq("FINCashAlloc_CashID", record.FINCash_ID).eq("FINCashAlloc_AllocationStatusCode", "allocated"),
      admin.from("ACCI_AccountMappings").select("ACCIAM_LocalContextCode,ACCIAM_ProviderAccountID,ACCIAM_ProviderAccountCode").eq("ACCIAM_ConnectionID", connection.ACCIC_ID).eq("ACCIAM_DirectionCode", direction).eq("ACCIAM_IsActive", true),
    ])
    if (allocationResult.error || accountResult.error) throw new HttpError(500, allocationResult.error?.message ?? accountResult.error?.message)
    const documentIds = (allocationResult.data ?? []).map((allocation: any) => allocation.FINCashAlloc_DocumentID).filter(Boolean)
    if (new Set(documentIds).size !== documentIds.length) throw new HttpError(409, "Allocate each receipt or payment to an invoice only once.")
    const { data: references, error: referencesError } = documentIds.length ? await admin.from("ACCI_ExternalRefs").select("ACCIER_LocalID,ACCIER_ExternalObjectType,ACCIER_ExternalID,ACCIER_SyncStatusCode").eq("ACCIER_ConnectionID", connection.ACCIC_ID).eq("ACCIER_LocalTable", "FIN_Documents").in("ACCIER_LocalID", documentIds) : { data: [], error: null }
    if (referencesError) throw new HttpError(500, referencesError.message)
    const expectedDocumentType = typeCode === "customer_receipt" ? "Sales Invoice" : "Purchase Invoice"
    let allocatedTotal = 0
    allocations = (allocationResult.data ?? []).map((allocation: any, index: number) => {
      const reference = (references ?? []).find((candidate: any) => candidate.ACCIER_LocalID === allocation.FINCashAlloc_DocumentID)
      const allocationAmount = finiteNumber(allocation.FINCashAlloc_AllocatedAmount)
      if (allocationAmount === null || allocationAmount <= 0) throw new HttpError(409, `Cash allocation ${index + 1} has no valid amount. Correct it before exporting.`)
      if (!reference || reference.ACCIER_SyncStatusCode !== "synced" || reference.ACCIER_ExternalObjectType !== expectedDocumentType || !clean(reference.ACCIER_ExternalID, 240)) {
        throw new HttpError(409, `Cash allocation ${index + 1} requires its exact ${expectedDocumentType} to be synced first. Post that invoice, then retry the cash delivery.`)
      }
      allocatedTotal += allocationAmount
      return { amount: allocationAmount, providerDocumentType: expectedDocumentType, providerDocumentId: clean(reference.ACCIER_ExternalID, 240) } as CanonicalFinanceExport["allocations"][number]
    })
    const account = (context: string) => {
      const mappedAccounts = [...new Set<string>((accountResult.data ?? []).filter((candidate: any) => candidate.ACCIAM_LocalContextCode === context).map((mapping: any) => clean(mapping.ACCIAM_ProviderAccountID, 240) || clean(mapping.ACCIAM_ProviderAccountCode, 80)).filter(Boolean))]
      if (mappedAccounts.length > 1) throw new HttpError(409, `Accounting context ${context} has conflicting active account mappings. Keep one reviewed mapping, then retry.`)
      return mappedAccounts[0] ?? null
    }
    bankProviderAccount = account(`bank:${record.FINCash_BankAccountID}`)
    receivableProviderAccount = account("receivables_control")
    payableProviderAccount = account("payables_control")
    const unallocatedAmount = finiteNumber(record.FINCash_UnallocatedAmount)
    if (unallocatedAmount === null || unallocatedAmount < 0 || allocatedTotal > amount || !sameAmount(allocatedTotal + unallocatedAmount, amount)) {
      throw new HttpError(409, "The receipt or payment allocations no longer agree with its amount. Correct the Multideck cash record, then retry.")
    }
  }
  return {
    connection,
    input: {
      providerCode: connection.ACCIC_ProviderCode, externalCompany, baseCurrencyCode, localTable, localId: queue.FINIntQ_LocalID,
      localNumber: localTable === "FIN_Documents" ? record.FINDoc_Number : record.FINCash_Number,
      typeCode, documentDate: localTable === "FIN_Documents" ? record.FINDoc_DocumentDate : record.FINCash_TransactionDate,
      dueDate: localTable === "FIN_Documents" ? record.FINDoc_DueDate : null,
      currencyCode, exchangeRate, amount, localAmount,
      reference: localTable === "FIN_Documents" ? record.FINDoc_Number : record.FINCash_Reference,
      partyProviderId: partyProviderIds[0] ?? null, bankProviderAccount, receivableProviderAccount, payableProviderAccount,
      lines, allocations, existingExternalId: existingRef?.ACCIER_ExternalID ?? null, existingExternalObjectType: existingRef?.ACCIER_ExternalObjectType ?? null,
    },
  }
}

async function preflightDocument(admin: any, current: any, id: string) {
  await requirePermission(admin, current.User_ID, "Finance.ReviewAndPost")
  await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
  const document = await scopedDocument(admin, current, id)
  if (document.FINDoc_StatusCode !== "awaiting_approval") throw new HttpError(409, "Send this document for finance review before running provider preflight.")
  const { input } = await canonicalExport(admin, current, { FINIntQ_LocalTable: "FIN_Documents", FINIntQ_LocalID: id }, true)
  const provider = await preflightFinanceRecord(input)
  return {
    documentId: document.FINDoc_ID,
    documentNumber: document.FINDoc_Number,
    status: "ready",
    provider,
  }
}

async function processQueue(admin: any, current: any, id: string, approvalAlreadyAuthorised = false) {
  if (!approvalAlreadyAuthorised) await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
  if (!isUuid(id)) throw new HttpError(404, "Finance export item not found.")
  const { data: queue, error: queueError } = await admin.from("FIN_IntegrationQueue").select("*").eq("FINIntQ_ID", id).maybeSingle()
  if (queueError) throw new HttpError(500, queueError.message)
  if (!queue || !["FIN_Documents", "FIN_CashTransactions"].includes(queue.FINIntQ_LocalTable)) throw new HttpError(404, "Finance export item not found.")
  if (queue.FINIntQ_LocalTable === "FIN_Documents") await scopedDocument(admin, current, queue.FINIntQ_LocalID)
  else await scopedCash(admin, current, queue.FINIntQ_LocalID)
  if (queue.FINIntQ_StatusCode === "processing") {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    let release = admin.from("FIN_IntegrationQueue").update({ FINIntQ_StatusCode: "failed", FINIntQ_LastError: "The previous provider delivery stopped before completion and is ready to retry." }).eq("FINIntQ_ID", id).eq("FINIntQ_StatusCode", "processing")
    release = queue.FINIntQ_LastAttemptAt ? release.lt("FINIntQ_LastAttemptAt", staleBefore) : release.is("FINIntQ_LastAttemptAt", null)
    const { data: released, error: releaseError } = await release.select("FINIntQ_ID").maybeSingle()
    if (releaseError) throw new HttpError(500, releaseError.message)
    if (!released) throw new HttpError(409, "This finance export is already processing.")
  }
  const claimedAt = new Date().toISOString()
  const { data: claimed, error: claimError } = await admin.from("FIN_IntegrationQueue").update({ FINIntQ_StatusCode: "processing", FINIntQ_LastAttemptAt: claimedAt, FINIntQ_LastError: null }).eq("FINIntQ_ID", id).in("FINIntQ_StatusCode", ["queued", "blocked", "failed"]).select("FINIntQ_ID").maybeSingle()
  if (claimError) throw new HttpError(500, claimError.message)
  if (!claimed) throw new HttpError(409, "This finance export is already processing or has completed.")
  let resolved: { input: CanonicalFinanceExport; connection: any }
  try {
    resolved = await canonicalExport(admin, current, queue)
  } catch (error) {
    const status = error instanceof HttpError && error.status === 409 ? "blocked" : "failed"
    const message = clean(error instanceof Error ? error.message : "Finance export preparation failed.", 500)
    await Promise.all([
      admin.from("FIN_IntegrationQueue").update({ FINIntQ_StatusCode: status, FINIntQ_LastError: message }).eq("FINIntQ_ID", id),
      queue.FINIntQ_LocalTable === "FIN_Documents"
        ? admin.from("FIN_Documents").update({ FINDoc_ExportStatusCode: status, FINDoc_UpdatedAt: new Date().toISOString(), FINDoc_UpdatedBy: current.User_ID }).eq("FINDoc_ID", queue.FINIntQ_LocalID)
        : admin.from("FIN_CashTransactions").update({ FINCash_ExportStatusCode: status, FINCash_UpdatedAt: new Date().toISOString(), FINCash_UpdatedBy: current.User_ID }).eq("FINCash_ID", queue.FINIntQ_LocalID),
    ])
    throw error
  }
  const { input, connection } = resolved
  const { data: batch, error: batchError } = await admin.from("ACCI_ExportBatches").insert({ ACCIEB_ConnectionID: connection.ACCIC_ID, ACCIEB_StatusCode: "processing", ACCIEB_LegalEntityID: connection.ACCIC_LegalEntityID, ACCIEB_DocumentCount: 1, ACCIEB_GrossTotalLocal: input.localAmount, ACCIEB_ApprovedAt: new Date().toISOString(), ACCIEB_ApprovedBy: current.User_ID, ACCIEB_ExportStartedAt: new Date().toISOString(), ACCIEB_CreatedBy: current.User_ID }).select("ACCIEB_ID").single()
  if (batchError || !batch) {
    await admin.from("FIN_IntegrationQueue").update({ FINIntQ_StatusCode: "failed", FINIntQ_LastError: clean(batchError?.message, 500) || "Finance export batch could not be created." }).eq("FINIntQ_ID", id)
    throw new HttpError(500, batchError?.message ?? "Finance export batch could not be created.")
  }
  const { data: item, error: itemError } = await admin.from("ACCI_ExportItems").insert({ ACCIEI_BatchID: batch.ACCIEB_ID, ACCIEI_DocumentTypeCode: input.typeCode, ACCIEI_LocalTable: input.localTable, ACCIEI_LocalID: input.localId, ACCIEI_LocalNumber: input.localNumber, ACCIEI_StatusCode: "processing", ACCIEI_AttemptCount: Number(queue.FINIntQ_AttemptCount ?? 0) + 1, ACCIEI_LastAttemptAt: new Date().toISOString() }).select("ACCIEI_ID").single()
  if (itemError || !item) {
    await Promise.all([
      admin.from("ACCI_ExportBatches").update({ ACCIEB_StatusCode: "failed", ACCIEB_ExportCompletedAt: new Date().toISOString() }).eq("ACCIEB_ID", batch.ACCIEB_ID),
      admin.from("FIN_IntegrationQueue").update({ FINIntQ_StatusCode: "failed", FINIntQ_LastError: clean(itemError?.message, 500) || "Finance export item could not be created." }).eq("FINIntQ_ID", id),
    ])
    throw new HttpError(500, itemError?.message ?? "Finance export item could not be created.")
  }
  await admin.from("FIN_IntegrationQueue").update({ FINIntQ_ExportBatchID: batch.ACCIEB_ID, FINIntQ_AttemptCount: Number(queue.FINIntQ_AttemptCount ?? 0) + 1, FINIntQ_LastAttemptAt: claimedAt }).eq("FINIntQ_ID", id)
  try {
    const exported = await exportFinanceRecord(input)
    const externalRefId = await saveExternalRef(admin, connection, input.localTable, input.localId, input.localNumber, input.typeCode, exported.externalObjectType, exported.externalId, exported.externalNumber, exported.externalUrl, exported.responsePayload)
    await Promise.all([
      admin.from("ACCI_ExportItems").update({ ACCIEI_StatusCode: "synced", ACCIEI_ExternalRefID: externalRefId, ACCIEI_RequestPayloadJSON: exported.requestPayload, ACCIEI_ResponsePayloadJSON: exported.responsePayload }).eq("ACCIEI_ID", item.ACCIEI_ID),
      admin.from("ACCI_ExportBatches").update({ ACCIEB_StatusCode: "synced", ACCIEB_ExportCompletedAt: new Date().toISOString() }).eq("ACCIEB_ID", batch.ACCIEB_ID),
      admin.from("FIN_IntegrationQueue").update({ FINIntQ_StatusCode: "synced", FINIntQ_LastError: null }).eq("FINIntQ_ID", id),
      admin.from("ACCI_ReconciliationIssues").update({ ACCIRI_StatusCode: "synced", ACCIRI_ResolutionText: "Provider delivery completed successfully on retry.", ACCIRI_ResolvedAt: new Date().toISOString(), ACCIRI_ResolvedBy: current.User_ID }).eq("ACCIRI_LocalTable", input.localTable).eq("ACCIRI_LocalID", input.localId).in("ACCIRI_StatusCode", ["queued", "processing", "blocked", "failed"]),
      input.localTable === "FIN_Documents"
        ? admin.from("FIN_Documents").update({ FINDoc_StatusCode: "submitted", FINDoc_ExportStatusCode: "synced", FINDoc_UpdatedAt: new Date().toISOString(), FINDoc_UpdatedBy: current.User_ID }).eq("FINDoc_ID", input.localId)
        : admin.from("FIN_CashTransactions").update({ FINCash_StatusCode: "submitted", FINCash_ExportStatusCode: "synced", FINCash_UpdatedAt: new Date().toISOString(), FINCash_UpdatedBy: current.User_ID }).eq("FINCash_ID", input.localId),
    ])
    return { id, status: "synced", provider: input.providerCode, externalObjectType: exported.externalObjectType, externalId: exported.externalId, externalNumber: exported.externalNumber, externalUrl: exported.externalUrl }
  } catch (error) {
    const blocked = error instanceof HttpError && error.status === 409
    const status = blocked ? "blocked" : "failed"
    const message = clean(error instanceof Error ? error.message : "Accounting provider export failed.", 500)
    let partialExternalRefId: string | null = null
    if (error instanceof AccountingProviderPartialError) {
      partialExternalRefId = await saveExternalRef(admin, connection, input.localTable, input.localId, input.localNumber, input.typeCode, error.externalObjectType, error.externalId, error.externalId, null, { state: "provider_draft_created", message }, "failed")
    }
    await Promise.all([
      admin.from("ACCI_ExportItems").update({ ACCIEI_StatusCode: status, ACCIEI_ExternalRefID: partialExternalRefId, ACCIEI_LastErrorCode: blocked ? "mapping_required" : "provider_error", ACCIEI_LastErrorMessage: message }).eq("ACCIEI_ID", item.ACCIEI_ID),
      admin.from("ACCI_ExportBatches").update({ ACCIEB_StatusCode: status, ACCIEB_ExportCompletedAt: new Date().toISOString() }).eq("ACCIEB_ID", batch.ACCIEB_ID),
      admin.from("FIN_IntegrationQueue").update({ FINIntQ_StatusCode: status, FINIntQ_LastError: message }).eq("FINIntQ_ID", id),
      admin.from("ACCI_ReconciliationIssues").insert({ ACCIRI_ConnectionID: connection.ACCIC_ID, ACCIRI_LocalTable: input.localTable, ACCIRI_LocalID: input.localId, ACCIRI_IssueType: blocked ? "mapping_required" : "provider_export_failed", ACCIRI_Severity: blocked ? "warning" : "error", ACCIRI_StatusCode: "queued", ACCIRI_Title: blocked ? "Finance export needs a mapping" : "Finance export failed", ACCIRI_DetailText: message }),
      input.localTable === "FIN_Documents" ? admin.from("FIN_Documents").update({ FINDoc_ExportStatusCode: status, FINDoc_UpdatedAt: new Date().toISOString(), FINDoc_UpdatedBy: current.User_ID }).eq("FINDoc_ID", input.localId) : admin.from("FIN_CashTransactions").update({ FINCash_ExportStatusCode: status, FINCash_UpdatedAt: new Date().toISOString(), FINCash_UpdatedBy: current.User_ID }).eq("FINCash_ID", input.localId),
    ])
    throw error
  }
}

async function optionalReason(request: Request) {
  const raw = await request.text()
  if (!raw.trim()) return undefined
  try {
    const parsed = JSON.parse(raw)
    return clean(parsed?.reason, 500) || undefined
  } catch {
    throw new HttpError(400, "The finance review reason is invalid.")
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    const parts = routeParts(request, "finance-subledger")
    if (request.method === "GET" && parts[0] === "setup") { await requirePermission(admin, current.User_ID, "Finance.Configuration.Manage"); return json(request, await listSetup(admin, current)) }
    if (request.method === "GET" && parts[0] === "report-options") {
      await requirePermission(admin, current.User_ID, "Finance.Reporting.View")
      return json(request, await reportOptions(admin, current))
    }
    if (request.method === "GET" && parts[0] === "reports") {
      await requirePermission(admin, current.User_ID, "Finance.Reporting.View")
      return json(request, await reportingSnapshot(admin, current, request.url))
    }
    if (request.method === "PUT" && parts[0] === "administration" && parts.length === 2) {
      await requirePermission(admin, current.User_ID, "Finance.Configuration.Manage")
      await requirePermission(admin, current.User_ID, "Finance.Banks.Manage")
      if (!isUuid(parts[1])) throw new HttpError(404, "Legal entity not found.")
      await legalEntity(admin, current, parts[1])
      const input = await body<AdministrationInput>(request)
      if (!input.settings || typeof input.settings !== "object" || Array.isArray(input.settings)) throw new HttpError(400, "Finance settings are invalid.")
      const changesProviderMappings = ["accountMappings", "chargeMappings", "taxMappings"]
        .some((key) => Array.isArray(input.settings[key]) && (input.settings[key] as unknown[]).length > 0)
      if (changesProviderMappings) await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
      const { data, error } = await admin.rpc("multideck_finance_save_administration", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_legal_entity_id: parts[1], p_settings: input.settings, p_reason: clean(input.reason, 500) || null })
      rpcFailure(error, "Finance administration settings could not be saved.")
      const { data: approvedRevision, error: revisionError } = await admin.from("FIN_AdministrationRevisions").select("FINAdminRevision_Number,FINAdminRevision_ReadinessJSON").eq("FINAdminRevision_LegalEntityID", parts[1]).eq("FINAdminRevision_StatusCode", "approved").limit(1).maybeSingle()
      if (revisionError) throw new HttpError(500, revisionError.message)
      return json(request, approvedRevision ? { legalEntityId: parts[1], revision: approvedRevision.FINAdminRevision_Number, ready: approvedRevision.FINAdminRevision_ReadinessJSON?.ready === true, missing: Array.isArray(approvedRevision.FINAdminRevision_ReadinessJSON?.missing) ? approvedRevision.FINAdminRevision_ReadinessJSON.missing : [] } : data)
    }
    if (request.method === "POST" && parts[0] === "configuration-runs" && parts.length === 1) {
      await requirePermission(admin, current.User_ID, "Finance.Configuration.Manage")
      const input = await body<ConfigInput>(request)
      const selectedEntity = await legalEntity(admin, current, input.legalEntityId)
      const countryCode = await assertCountryCode(admin, input.countryCode)
      const providerCode = clean(input.providerCode, 40) || "erpnext"
      const provider = accountingProvider(providerCode)
      if (!provider?.enabled) throw new HttpError(409, provider?.unavailableReason ?? "This accounting provider is not enabled yet.")
      const externalCompany = clean(input.externalCompany, 180)
      if (!externalCompany) throw new HttpError(400, "Choose the accounting Company.")
      const proposed = await preview(admin, clean(input.chartTemplateCode, 80), countryCode)
      const providerCurrency = providerCode === "erpnext" ? await assertErpNextCompanySetup(selectedEntity, externalCompany) : null
      const reviewedPreview = { ...proposed, providerPreflight: { providerCode, externalCompany, baseCurrencyCode: providerCurrency, environmentCode: providerCode === "erpnext" ? erpNextEnvironment() : "production", providerOrigin: providerCode === "erpnext" ? erpNextOrigin() : null, checkedAt: new Date().toISOString(), providerRecordsChanged: false } }
      const { data: run, error } = await admin.from("FIN_ConfigurationRuns").insert({ FINConfigRun_LegalEntityID: input.legalEntityId, FINConfigRun_ChartTemplateID: proposed.template.FINChartTemplate_ID, FINConfigRun_LocalisationPackID: proposed.localisationPack?.FINLocPack_ID ?? null, FINConfigRun_ProviderCode: providerCode, FINConfigRun_ExternalCompany: externalCompany, FINConfigRun_StatusCode: "awaiting_approval", FINConfigRun_CountryCode: countryCode, FINConfigRun_TaxRegistrationNo: clean(input.taxRegistrationNo, 120) || null, FINConfigRun_ReportingBasisCode: clean(input.reportingBasisCode, 80) || null, FINConfigRun_EffectiveFrom: clean(input.effectiveFrom, 10) || new Date().toISOString().slice(0, 10), FINConfigRun_PreviewJSON: reviewedPreview, FINConfigRun_RequestedBy: current.User_ID }).select("FINConfigRun_ID,FINConfigRun_StatusCode,FINConfigRun_PreviewJSON").single()
      if (error || !run) throw new HttpError(500, error?.message ?? "Could not create the configuration review.")
      await admin.from("FIN_ConfigurationRunEvents").insert({ FINConfigRunEvent_RunID: run.FINConfigRun_ID, FINConfigRunEvent_TypeCode: "requested", FINConfigRunEvent_By: current.User_ID, FINConfigRunEvent_DetailJSON: { taxAdviceRequired: true, providerPreflightPassed: true, providerCurrency } })
      return json(request, run, 201)
    }
    if (request.method === "POST" && parts[0] === "configuration-runs" && parts[2] === "approve") {
      await requirePermission(admin, current.User_ID, "Finance.Configuration.Manage")
      if (!isUuid(parts[1])) throw new HttpError(404, "Finance configuration not found.")
      const ids = await entityIds(admin, current)
      const { data: run, error: runError } = ids.length ? await admin.from("FIN_ConfigurationRuns").select("FINConfigRun_ID,FINConfigRun_LegalEntityID,FINConfigRun_ProviderCode,FINConfigRun_ExternalCompany,FINConfigRun_StatusCode,FINConfigRun_CountryCode,FINConfigRun_PreviewJSON").eq("FINConfigRun_ID", parts[1]).in("FINConfigRun_LegalEntityID", ids).maybeSingle() : { data: null, error: null }
      if (runError) throw new HttpError(500, runError.message)
      if (!run) throw new HttpError(404, "Finance configuration not found.")
      if (run.FINConfigRun_StatusCode !== "awaiting_approval") throw new HttpError(409, "That finance configuration is not awaiting approval.")
      const selectedEntity = await legalEntity(admin, current, run.FINConfigRun_LegalEntityID)
      await assertCountryCode(admin, run.FINConfigRun_CountryCode)
      if (run.FINConfigRun_ProviderCode === "erpnext") {
        const externalCompany = clean(run.FINConfigRun_ExternalCompany, 180)
        const providerCurrency = await assertErpNextCompanySetup(selectedEntity, externalCompany)
        const previewJson = run.FINConfigRun_PreviewJSON && typeof run.FINConfigRun_PreviewJSON === "object" && !Array.isArray(run.FINConfigRun_PreviewJSON) ? run.FINConfigRun_PreviewJSON : {}
        const { error: evidenceError } = await admin.from("FIN_ConfigurationRuns").update({ FINConfigRun_PreviewJSON: { ...previewJson, providerPreflight: { providerCode: "erpnext", externalCompany, baseCurrencyCode: providerCurrency, checkedAt: new Date().toISOString(), providerRecordsChanged: false } } }).eq("FINConfigRun_ID", run.FINConfigRun_ID).eq("FINConfigRun_StatusCode", "awaiting_approval")
        if (evidenceError) throw new HttpError(500, evidenceError.message)
      }
      const { data, error } = await admin.rpc("multideck_finance_approve_configuration", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_run_id: parts[1] })
      rpcFailure(error, "Finance configuration could not be approved.")
      if (run.FINConfigRun_ProviderCode === "erpnext" && data?.connectionId) await refreshErpNextConnectionEnvironment(admin, current, data.connectionId)
      return json(request, data)
    }
    if (request.method === "GET" && parts[0] === "documents" && parts.length === 2) return json(request, await documentDetail(admin, current, parts[1]))
    if (request.method === "GET" && parts[0] === "documents" && parts.length === 1) return json(request, await documentWorkspace(admin, current, ledger(new URL(request.url).searchParams.get("ledger") ?? undefined)))
    if (request.method === "GET" && parts[0] === "draft-options") return json(request, await documentWorkspace(admin, current, ledger(new URL(request.url).searchParams.get("ledger") ?? undefined), true))
    if (request.method === "GET" && parts[0] === "cash") {
      const value = new URL(request.url).searchParams.get("ledger") ?? undefined
      return json(request, await cashWorkspace(admin, current, value ? ledger(value) : undefined))
    }
    if (request.method === "POST" && parts[0] === "documents" && parts[1] === "draft") return json(request, await createDocumentDraft(admin, current, await body<DraftInput>(request)), 201)
    if (request.method === "PUT" && parts[0] === "documents" && parts[2] === "draft") return json(request, await updateDocumentDraft(admin, current, parts[1], await body<DraftInput>(request)))
    if (request.method === "POST" && parts[0] === "documents" && parts[2] === "reopen-draft") return json(request, await reopenDocumentDraft(admin, current, parts[1], await optionalReason(request)))
    if (request.method === "POST" && parts[0] === "documents" && parts[2] === "retry-posting") return json(request, await retryDocumentPosting(admin, current, parts[1]))
    if (request.method === "POST" && parts[0] === "cash" && parts[1] === "draft") return json(request, await createCashDraft(admin, current, await body<CashInput>(request)), 201)
    if (request.method === "POST" && parts[0] === "documents" && parts[2] === "provider-preflight") return json(request, await preflightDocument(admin, current, parts[1]))
    if (request.method === "POST" && parts[0] === "documents" && parts[2] === "request-review") return json(request, await transitionDocument(admin, current, parts[1], "request_review", await optionalReason(request)))
    if (request.method === "POST" && parts[0] === "documents" && parts[2] === "approve") return json(request, await transitionDocument(admin, current, parts[1], "approve", await optionalReason(request)))
    if (request.method === "POST" && parts[0] === "documents" && parts[2] === "reject") return json(request, await transitionDocument(admin, current, parts[1], "reject", await optionalReason(request)))
    if (request.method === "POST" && parts[0] === "cash" && parts[2] === "request-review") return json(request, await transitionCash(admin, current, parts[1], "request_review", await optionalReason(request)))
    if (request.method === "POST" && parts[0] === "cash" && parts[2] === "approve") return json(request, await transitionCash(admin, current, parts[1], "approve", await optionalReason(request)))
    if (request.method === "POST" && parts[0] === "cash" && parts[2] === "reject") return json(request, await transitionCash(admin, current, parts[1], "reject", await optionalReason(request)))
    if (request.method === "POST" && parts[0] === "integration-queue" && parts[2] === "process") return json(request, await processQueue(admin, current, parts[1]))
    if (request.method === "GET" && parts[0] === "provider-customers" && parts[1] === "context") {
      await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
      const search = new URL(request.url).searchParams
      return json(request, await providerCustomerContext(admin, current, search.get("connectionId") ?? "", search.get("orgId") ?? ""))
    }
    if (request.method === "POST" && parts[0] === "provider-customers" && parts.length === 1) {
      await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
      return json(request, await createProviderCustomer(admin, current, await body<ProviderCustomerInput>(request)), 201)
    }
    if (request.method === "GET" && parts[0] === "erpnext" && parts[1] === "companies") {
      await requirePermission(admin, current.User_ID, "Finance.Configuration.Manage")
      return json(request, { companies: await erpNextList("Company", ["name", "company_name", "country", "default_currency"]) })
    }
    if (request.method === "GET" && parts[0] === "erpnext" && parts[1] === "catalog") {
      await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
      return json(request, await erpNextCatalog(admin, current, new URL(request.url).searchParams.get("connectionId") ?? ""))
    }
    if (request.method === "PUT" && parts[0] === "erpnext" && parts[1] === "party-mappings" && parts.length === 2) {
      await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
      return json(request, await upsertErpNextPartyMapping(admin, current, await body<PartyMappingInput>(request)))
    }
    if (request.method === "GET" && parts[0] === "erpnext" && parts[1] === "external-references" && parts[3] === "verify") {
      await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
      return json(request, await verifyErpNextExternalReference(admin, current, parts[2]))
    }
    if (request.method === "POST" && parts[0] === "erpnext" && parts[1] === "demo-fixtures" && parts[2] === "service-item") {
      await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
      return json(request, await ensureErpNextDemoServiceItem(admin, current, new URL(request.url).searchParams.get("connectionId") ?? ""))
    }
    if (request.method === "POST" && parts[0] === "erpnext" && parts[1] === "connections" && parts[2] === "verify-environment") {
      await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")
      return json(request, await refreshErpNextConnectionEnvironment(admin, current, new URL(request.url).searchParams.get("connectionId") ?? ""))
    }
    throw new HttpError(404, "Finance endpoint not found.")
  } catch (error) { return failure(request, error) }
})
