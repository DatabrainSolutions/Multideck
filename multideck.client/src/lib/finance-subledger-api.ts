import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"
import { invalidateFinanceReferenceReads } from "@/lib/finance-api"
import { readFinanceRegisterPages } from "@/lib/finance-register-pages"

export type AccountingProviderCode = "erpnext" | "xero" | "quickbooks_online" | "sage_accounting" | "sage_intacct" | "sage_50" | "sage_200" | "business_central" | "netsuite" | "zoho_books"
export type FinanceLedger = "receivables" | "payables"
export type FinanceDocumentType = "sl_invoice" | "credit_note" | "pl_invoice" | "debit_note"
export type FinanceCashType = "customer_receipt" | "supplier_payment"
export type FinanceNativePostingStatus = "draft" | "pending_migration" | "posted" | "reversed" | "update_required"

export type FinanceChartTemplate = {
  FINChartTemplate_Code: string
  FINChartTemplate_Name: string
  FINChartTemplate_IndustryCode: "generic" | "freight_forwarding"
  FINChartTemplate_Version: number
  FINChartTemplate_Description: string | null
}

export type FinanceLegalEntity = {
  LegalEntity_ID: string
  LegalEntity_Name: string
  LegalEntity_TradingName: string | null
  LegalEntity_CompanyRegistrationNo: string | null
  LegalEntity_VATNumber: string | null
  LegalEntity_TaxID: string | null
  LegalEntity_CountryCode: string | null
  LegalEntity_BaseCurrencyCodeSnapshot: string | null
  LegalEntity_SettingsJSON: Record<string, unknown>
  preferredProviderCode: AccountingProviderCode | null
  preferredExternalCompany: string | null
}

export type AccountingProvider = {
  purpose: "external_mirror"
  code: AccountingProviderCode
  name: string
  connectionModel: "api_token" | "oauth2" | "local_agent"
  enabled: boolean
  configured: boolean
  requiresLocalAgent: boolean
  capabilities: string[]
  unavailableReason: string | null
}

export type FinanceConfigurationRun = {
  FINConfigRun_ID: string
  FINConfigRun_ProviderCode: AccountingProviderCode
  FINConfigRun_ExternalCompany: string
  FINConfigRun_StatusCode: string
  FINConfigRun_CountryCode: string
  FINConfigRun_RequestedAt: string
  FINConfigRun_CompletedAt: string | null
  FINConfigRun_LegalEntityID: string
  approvalBlocker: "invalid_country_code" | null
  FINChartTemplate?: { FINChartTemplate_Code: string; FINChartTemplate_Name: string } | null
}

export type FinanceAdministration = {
  settings: Array<{ FINSET_ID: string; FINSET_LegalEntityID: string; FINSET_BaseCurrencyCode: string; FINSET_DefaultOperatingModelCode: string; FINSET_AutoCreateSalesInvoices: boolean; FINSET_AutoCreatePurchaseAccruals: boolean; FINSET_AutoPostLowRiskItems: boolean; FINSET_UseAccountingDateRules: boolean; FINSET_BlockLockedPeriodDirectPosting: boolean; FINSET_DefaultROEProviderCode: string | null; FINSET_IncludeFXInOperationalProfit: boolean; FINSET_NativeLedgerEnabled: boolean; FINSET_ExternalMirrorModeCode: "disabled" | "optional" | "required"; FINSET_SettingsJSON: Record<string, any>; FINSET_UpdatedAt: string }>
  localisations: Array<{ FINLocSet_ID: string; FINLocSet_LegalEntityID: string; FINLocSet_PackID: string; FINLocSet_TaxRegistrationNo: string | null; FINLocSet_ReportingBasisCode: string | null; FINLocSet_SettingsJSON: Record<string, any>; FINLocSet_EffectiveFrom: string; FINLocSet_IsActive: boolean; FINLocSet_UpdatedAt: string; FINLocPack?: { FINLocPack_Code: string; FINLocPack_Name: string; FINLocPack_CountryCode: string | null; FINLocPack_AccountingStandardCode: string | null; FINLocPack_ComplianceStatusCode: string } | null }>
  currencies: Array<{ FINCurSet_ID: string; FINCurSet_LegalEntityID: string; FINCurSet_CurrencyCode: string; FINCurSet_Name: string; FINCurSet_DecimalPlaces: number; FINCurSet_RoundingMethodCode: string; FINCurSet_ToleranceAmount: number; FINCurSet_IsPermittedForQuote: boolean; FINCurSet_IsPermittedForInvoice: boolean; FINCurSet_IsBaseCurrency: boolean; FINCurSet_IsActive: boolean }>
  banks: Array<{ FINBank_ID: string; FINBank_Code: string; FINBank_Name: string; FINBank_LegalEntityID: string; FINBank_CurrencyCode: string; FINBank_InstitutionName: string | null; FINBank_AccountHolderName: string | null; FINBank_AccountNumberMasked: string | null; FINBank_IBANMasked: string | null; FINBank_SortCodeMasked: string | null; FINBank_BICMasked: string | null; FINBank_CountryCode: string | null; FINBank_NominalAccountID: string | null; FINBank_IsDefault: boolean; FINBank_AllowReceipts: boolean; FINBank_AllowPayments: boolean; FINBank_IsActive: boolean; FINBank_UpdatedAt: string }>
  nominalAccounts: Array<{ FINNom_ID: string; FINNom_Code: string; FINNom_Name: string; FINNom_AccountTypeCode: string; FINNom_ReportCategoryCode: "asset" | "liability" | "equity" | "income" | "direct_cost" | "expense" | "finance" | null; FINNom_LegalEntityID: string; FINNom_ExternalMappingHint: string | null; FINNom_IsControlAccount: boolean; FINNom_ControlTypeCode: string | null; FINNom_AllowManualPosting: boolean; FINNom_IsActive: boolean; FINNom_UpdatedAt: string }>
  taxJurisdictions: Array<{ FINTaxJur_ID: string; FINTaxJur_Code: string; FINTaxJur_Name: string; FINTaxJur_CountryCode: string; FINTaxJur_AuthorityName: string | null; FINTaxJur_LegalEntityID: string; FINTaxJur_RegistrationNo: string | null; FINTaxJur_EffectiveFrom: string; FINTaxJur_EffectiveTo: string | null; FINTaxJur_SettingsJSON: Record<string, any>; FINTaxJur_IsActive: boolean }>
  taxCodes: Array<{ FINTax_ID: string; FINTax_Code: string; FINTax_Name: string; FINTax_CountryCode: string | null; FINTax_RatePercent: number; FINTax_TaxTypeCode: string; FINTax_ProviderMappingHint: string | null; FINTax_IsRecoverable: boolean; FINTax_IsActive: boolean; FINTax_EffectiveFrom: string; FINTax_EffectiveTo: string | null; FINTax_LegalEntityID: string; FINTax_JurisdictionID: string | null; FINTax_TreatmentCategoryCode: string; FINTax_TransactionTypeCode: "sales" | "purchase" | "both"; FINTax_OutputNominalID: string | null; FINTax_InputNominalID: string | null; FINTax_SettingsJSON: Record<string, any>; FINTax_ApprovedAt: string | null }>
  numberSequences: Array<{ FINSeq_ID: string; FINSeq_Code: string; FINSeq_Name: string; FINSeq_LegalEntityID: string; FINSeq_DocumentTypeCode: string | null; FINSeq_Prefix: string; FINSeq_Suffix: string; FINSeq_NextNumber: number; FINSeq_PaddingLength: number; FINSeq_ResetPeriodCode: string; FINSeq_IsActive: boolean }>
  paymentTerms: Array<{ FINTerm_ID: string; FINTerm_Code: string; FINTerm_Name: string; FINTerm_Days: number; FINTerm_DueDayOfMonth: number | null; FINTerm_EndOfMonth: boolean; FINTerm_IsCashAccount: boolean; FINTerm_IsActive: boolean; FINTerm_LegalEntityID: string }>
  exchangeRateProviders: Array<{ FINRateProvider_ID: string; FINRateProvider_Code: string; FINRateProvider_Name: string; FINRateProvider_ProviderTypeCode: string; FINRateProvider_IsOfficial: boolean; FINRateProvider_IsMidMarketSource: boolean; FINRateProvider_BaseCurrencyCode: string | null; FINRateProvider_IsActive: boolean }>
  exchangeRateRules: Array<Record<string, any>>
  accountMappings: Array<{ ACCIAM_ID: string; ACCIAM_ConnectionID: string; ACCIAM_DirectionCode: "sales" | "purchase"; ACCIAM_LocalContextCode: string | null; ACCIAM_ProviderAccountID: string; ACCIAM_ProviderAccountCode: string | null; ACCIAM_ProviderAccountName: string | null; ACCIAM_IsDefault: boolean; ACCIAM_IsActive: boolean }>
  chargeMappings: Array<{ ACCICM_ID: string; ACCICM_ConnectionID: string; ACCICM_LocalChargeCodeSnapshot: string; ACCICM_DirectionCode: "sales" | "purchase"; ACCICM_ProviderItemID: string | null; ACCICM_ProviderItemCode: string | null; ACCICM_ProviderItemName: string | null; ACCICM_ProviderAccountID: string | null; ACCICM_IsActive: boolean }>
  taxMappings: Array<{ ACCITM_ID: string; ACCITM_ConnectionID: string; ACCITM_LocalTaxCode: string; ACCITM_LocalTaxDescription: string | null; ACCITM_LocalCountryCode: string | null; ACCITM_DirectionCode: "sales" | "purchase"; ACCITM_ProviderTaxID: string | null; ACCITM_ProviderTaxCode: string; ACCITM_ProviderTaxName: string | null; ACCITM_TaxRatePercent: number | null; ACCITM_IsActive: boolean }>
  revisions: Array<{ FINAdminRevision_ID: string; FINAdminRevision_LegalEntityID: string; FINAdminRevision_Number: number; FINAdminRevision_StatusCode: "approved" | "superseded"; FINAdminRevision_ReadinessJSON: { ready?: boolean; missing?: string[]; [key: string]: unknown }; FINAdminRevision_Reason: string | null; FINAdminRevision_ApprovedAt: string; FINAdminRevision_ApprovedBy: string }>
  documentTypes: Array<{ FINDT_Code: FinanceDocumentType; FINDT_Name: string; FINDT_LedgerTypeCode: FinanceLedger; FINDT_IsCredit: boolean }>
  chartTemplateAccounts: Array<{ FINChartTemplateAccount_ID: string; FINChartTemplateAccount_TemplateID: string; FINChartTemplateAccount_Code: string; FINChartTemplateAccount_Name: string; FINChartTemplateAccount_TypeCode: string; FINChartTemplateAccount_CategoryCode: string; FINChartTemplateAccount_IsControlAccount: boolean; FINChartTemplateAccount_Required: boolean; FINChartTemplateAccount_SortOrder: number; FINChartTemplate?: { FINChartTemplate_Code: string } | null }>
  localisationPacks: Array<{ FINLocPack_ID: string; FINLocPack_Code: string; FINLocPack_Name: string; FINLocPack_CountryCode: string | null; FINLocPack_AccountingStandardCode: string | null; FINLocPack_Version: number; FINLocPack_AuthorityName: string | null; FINLocPack_ReportingCurrencyCode: string | null; FINLocPack_ComplianceStatusCode: string; FINLocPack_SourceURL: string | null; FINLocPack_ReviewedAt: string | null }>
  complianceObligations: Array<{ FINCompliance_ID: string; FINCompliance_PackID: string; FINCompliance_Code: string; FINCompliance_Name: string; FINCompliance_ObligationTypeCode: string; FINCompliance_AuthorityName: string; FINCompliance_FilingChannelCode: string; FINCompliance_FrequencyCode: string; FINCompliance_ReadinessStatusCode: string; FINCompliance_SourceURL: string; FINCompliance_EffectiveFrom: string; FINCompliance_EffectiveTo: string | null; FINCompliance_RequirementsJSON: Record<string, any>; FINCompliance_ReviewedAt: string | null }>
  complianceRegistrations: Array<{ FINComplianceReg_ID: string; FINComplianceReg_LegalEntityID: string; FINComplianceReg_ObligationID: string; FINComplianceReg_StatusCode: string; FINComplianceReg_RegistrationReference: string | null; FINComplianceReg_FilingMethodCode: string | null; FINComplianceReg_EffectiveFrom: string; FINComplianceReg_EffectiveTo: string | null; FINComplianceReg_SettingsJSON: Record<string, any>; FINComplianceReg_UpdatedAt: string }>
}

export type FinanceAdministrationDraft = {
  organisation: { baseCurrencyCode: string; countryCode: string; taxRegistrationNo: string; reportingBasisCode: string; accountingStandardCode: string; fiscalYearStartMonth: number; timeZone: string; localisationPackCode: string; effectiveFrom: string }
  controls: Record<string, string | number | boolean | null>
  defaults: Record<string, string | number | boolean | null>
  taxSettings: Record<string, string | number | boolean | null>
  currencies: Array<Record<string, unknown>>
  banks: Array<Record<string, unknown>>
  nominalAccounts: Array<Record<string, unknown>>
  taxJurisdictions: Array<Record<string, unknown>>
  taxCodes: Array<Record<string, unknown>>
  numberSequences: Array<Record<string, unknown>>
  paymentTerms: Array<Record<string, unknown>>
  accountMappings: Array<Record<string, unknown>>
  chargeMappings: Array<Record<string, unknown>>
  taxMappings: Array<Record<string, unknown>>
}

export type FinanceSetup = {
  legalEntities: FinanceLegalEntity[]
  chartTemplates: FinanceChartTemplate[]
  runs: FinanceConfigurationRun[]
  connections: Array<{ ACCIC_ID: string; ACCIC_ProviderCode: AccountingProviderCode; ACCIC_Name: string; ACCIC_StatusCode: string; ACCIC_LegalEntityID: string; ACCIC_ExternalTenantName: string | null; ACCIC_LastAuthAt: string | null; ACCIC_LastSyncAt: string | null }>
  integrationQueue: Array<{ FINIntQ_ID: string; FINIntQ_LocalTable: "FIN_Documents" | "FIN_CashTransactions"; FINIntQ_LocalID: string; FINIntQ_StatusCode: string; FINIntQ_AttemptCount: number; FINIntQ_LastAttemptAt: string | null; FINIntQ_LastError: string | null; FINIntQ_CreatedAt: string; localNumber: string | null; typeCode: FinanceDocumentType | FinanceCashType; retryAvailable: boolean }>
  providers: AccountingProvider[]
  countries: Array<{ RN_Code: string; RN_Desc: string | null; RN_RX_NKLocalCurrency: string | null }>
  currencies: Array<{ Currency_Code: string; Currency_Name: string | null; Currency_Symbol: string | null }>
  administration: FinanceAdministration
  erpNext: { configured: boolean; endpoint: string | null }
  compatibility: { current: boolean; missingFields: string[] }
}

export type FinanceConfigurationInput = { legalEntityId: string; chartTemplateCode: string; providerCode: AccountingProviderCode; externalCompany: string; countryCode: string; taxRegistrationNo?: string; reportingBasisCode?: string; effectiveFrom?: string }

export type FinanceConfigurationPreview = {
  accounts: Array<{
    FINChartTemplateAccount_Code: string
    FINChartTemplateAccount_Name: string
    FINChartTemplateAccount_IsControlAccount: boolean
  }>
  treatments: Array<{
    FINLocTaxTreatment_Code: string
    FINLocTaxTreatment_Name: string
    FINLocTaxTreatment_TransactionType: string
  }>
}

export type FinanceDocument = {
  FINDoc_ID: string
  FINDoc_Number: string | null
  FINDoc_TypeCode: FinanceDocumentType
  FINDoc_StatusCode: string
  FINDoc_LegalEntityID: string
  FINDoc_PartyOrgID: string | null
  FINDoc_DocumentDate: string
  FINDoc_DueDate: string | null
  FINDoc_CurrencyCodeSnapshot: string
  FINDoc_ExchangeRate: number
  FINDoc_NetAmount: number
  FINDoc_TaxAmount: number
  FINDoc_GrossAmount: number
  FINDoc_OutstandingAmount: number
  FINDoc_SourceJobID: string | null
  FINDoc_SourceKindCode: "manual" | "job"
  FINDoc_PostingStatusCode: string
  FINDoc_ExportStatusCode: string
  FINDoc_NativePostingStatusCode: FinanceNativePostingStatus
  FINDoc_NativePostingBatchID: string | null
  FINDoc_NativePostedAt: string | null
  FINDoc_TaxStatus: "approved" | "pending"
  FINDoc_UpdatedAt: string
  partyName: string
  jobReference: string | null
}

export type FinanceDocumentDetail = {
  document: FinanceDocument & {
    FINDoc_AccountingDate: string
    FINDoc_PostedAt: string | null
    FINDoc_PostedBy: string | null
    FINDoc_IsLocked: boolean
    partyAccountCode: string | null
    legalEntityName: string
  }
  lines: Array<{
    FINDocLine_ID: string
    FINDocLine_LineNo: number
    FINDocLine_LineTypeCode: string
    FINDocLine_JobCostingLineID: string | null
    FINDocLine_ChargeCodeSnapshot: string | null
    FINDocLine_Description: string
    FINDocLine_Quantity: number
    FINDocLine_UnitAmount: number
    FINDocLine_NetAmount: number
    FINDocLine_TaxCodeID: string | null
    FINDocLine_TaxCodeSnapshot: string | null
    FINDocLine_TaxRatePercent: number
    FINDocLine_TaxAmount: number
    FINDocLine_GrossAmount: number
  }>
  integrationQueue: null | {
    FINIntQ_ID: string
    FINIntQ_StatusCode: string
    FINIntQ_AttemptCount: number
    FINIntQ_LastAttemptAt: string | null
    FINIntQ_LastError: string | null
    FINIntQ_CreatedAt: string
    retryAvailable: boolean
  }
  history: Array<{
    FINDocStatus_ID: string
    FINDocStatus_FromStatusCode: string | null
    FINDocStatus_ToStatusCode: string
    FINDocStatus_ChangedAt: string
    FINDocStatus_ChangedBy: string | null
    FINDocStatus_Reason: string | null
    FINDocStatus_MetadataJSON: Record<string, unknown>
  }>
  externalReference: null | {
    ACCIER_ID: string
    ACCIER_ExternalObjectType: string
    ACCIER_ExternalID: string
    ACCIER_ExternalNumber: string | null
    ACCIER_ExternalURL: string | null
    ACCIER_SyncStatusCode: string
    ACCIER_LastSyncedAt: string
  }
  reconciliationIssues: Array<{
    ACCIRI_ID: string
    ACCIRI_IssueType: string
    ACCIRI_Severity: string
    ACCIRI_StatusCode: string
    ACCIRI_Title: string
    ACCIRI_DetailText: string | null
    ACCIRI_ResolutionText: string | null
    ACCIRI_ResolvedAt: string | null
    ACCIRI_CreatedAt: string
  }>
  provider: null | {
    ACCIC_ID: string
    ACCIC_ProviderCode: AccountingProviderCode
    ACCIC_Name: string
    ACCIC_StatusCode: string
    ACCIC_ExternalTenantName: string | null
  }
}

export type FinanceCashTransaction = {
  FINCash_ID: string
  FINCash_TypeCode: FinanceCashType
  FINCash_StatusCode: string
  FINCash_Number: string | null
  FINCash_LegalEntityID: string
  FINCash_BankAccountID: string | null
  FINCash_PartyOrgID: string | null
  FINCash_TransactionDate: string
  FINCash_CurrencyCodeSnapshot: string
  FINCash_ExchangeRate: number
  FINCash_Amount: number
  FINCash_UnallocatedAmount: number
  FINCash_Reference: string | null
  FINCash_PostingStatusCode: string
  FINCash_ExportStatusCode: string
  FINCash_NativePostingStatusCode: FinanceNativePostingStatus
  FINCash_NativePostingBatchID: string | null
  FINCash_NativePostedAt: string | null
  FINCash_UpdatedAt: string
  partyName: string
}

export type FinanceReportOptions = {
  legalEntities: Array<{ LegalEntity_ID: string; LegalEntity_Name: string; LegalEntity_CountryCode: string | null; LegalEntity_BaseCurrencyCodeSnapshot: string | null }>
}

export type FinanceReportingSnapshot = {
  legalEntityId: string
  legalEntity: string
  currency: string
  fromDate: string
  toDate: string
  nativeLedgerEnabled: boolean
  externalMirrorModeCode: "disabled" | "optional" | "required"
  externalMirrorConnected: boolean
  trialBalance: Array<{ accountId: string; accountCode: string; accountName: string; accountType: string; category: string; openingBalance: number; debit: number; credit: number; closingBalance: number }>
  profitAndLoss: Array<{ accountId: string; accountCode: string; accountName: string; category: string; amount: number }>
  balanceSheet: Array<{ accountId: string; accountCode: string; accountName: string; category: string; amount: number }>
  totals: { profitOrLoss: number; assets: number; liabilities: number; equity: number; currentEarnings: number; balanceDifference: number }
  coverage: { pendingDocumentMigrations: number; pendingCashMigrations: number; postedBatches: number }
  evidence: { sourceTable: string; legalEntityId: string; generatedAt: string }
}

export type FinanceDraftInput = {
  type: FinanceDocumentType
  partyOrgId: string
  documentDate: string
  dueDate?: string | null
  currencyCode: string
  exchangeRate: number
  sourceJobId?: string | null
  idempotencyKey?: string
  sourceExtractionId?: string
  lines: Array<{ description: string; quantity: number; unitAmount: number; taxRatePercent: number; taxCode?: string | null; chargeCode?: string | null; jobCostingLineId?: string | null; lineType: "service" | "ancillary" }>
}

export type FinanceCashInput = {
  type: FinanceCashType
  partyOrgId: string
  bankAccountId: string
  transactionDate: string
  currencyCode: string
  exchangeRate: number
  amount: number
  reference?: string | null
  allocations: Array<{ documentId: string; amount: number }>
}

export type FinanceDraftOptions = {
  documents: FinanceDocument[]
  openDocuments: FinanceDocument[]
  legalEntities: Array<{
    LegalEntity_ID: string
    LegalEntity_Name: string
    LegalEntity_BaseCurrencyCodeSnapshot: string | null
    FinanceDraftCurrencyCode: string | null
    FinanceDraftCurrencyStatus: "approved" | "pending_configuration" | "missing"
  }>
  parties: Array<{ Org_id: string; Org_Name: string; Org_AccCode: string }>
  accountingConnections: Array<{ ACCIC_ID: string; ACCIC_ProviderCode: AccountingProviderCode; ACCIC_LegalEntityID: string; ACCIC_ExternalTenantName: string | null; ACCIC_StatusCode: string }>
  partyMappings: Array<{ ACCIPM_ID: string; ACCIPM_ConnectionID: string; ACCIPM_OrgID: string; ACCIPM_PartyType: "customer" | "supplier" | "both"; ACCIPM_ProviderPartyID: string; ACCIPM_ProviderPartyCode: string | null; ACCIPM_ProviderPartyName: string | null; ACCIPM_LastSyncedAt: string | null; ACCIPM_IsActive: boolean }>
  jobs: Array<{ Job_ID: string; Job_Number: number; Job_Period: string; Job_Customer: string; Job_Supplier: string | null; Job_LegalEntityID: string | null; Job_Status: string }>
  jobCostingLines: Array<{ JobCostingLine_ID: string; Job_ID: string; JobCostingLine_Number: number; JobCostingLine_ChargeCodeID: string | null; JobCostingLine_Description: string; JobCostingLine_CostAmountLocal: number; JobCostingLine_RevenueAmountLocal: number; JobCostingLine_CostNominalAccountID: string | null; JobCostingLine_RevenueNominalAccountID: string | null }>
  bankAccounts: Array<{ FINBank_ID: string; FINBank_Code: string; FINBank_Name: string; FINBank_LegalEntityID: string; FINBank_CurrencyCode: string }>
  taxTreatments: Array<{
    FINLocTaxTreatment_ID: string
    FINLocTaxTreatment_LegalEntityID: string
    FINLocTaxTreatment_Code: string
    FINLocTaxTreatment_Name: string
    FINLocTaxTreatment_TransactionType: string
    FINLocTaxTreatment_RatePercent: number
    FINLocTaxTreatment_EffectiveFrom: string
    FINLocTaxTreatment_EffectiveTo: string | null
  }>
  taxSuggestions: Array<{
    FINLocTaxTreatment_ID: string
    FINLocTaxTreatment_Code: string
    FINLocTaxTreatment_Name: string
    FINLocTaxTreatment_TransactionType: string
    FINLocTaxTreatment_RatePercent: number
  }>
}

export type ProviderCustomerContext = {
  provider: { code: "erpnext" | "sage_50"; name: string; connectionId: string; externalCompany: string | null }
  organisation: { id: string; name: string; accountCode: string; currencyCode: string | null }
  billingAddress: { id: string; name: string | null; line1: string | null; line2: string | null; townCity: string | null; countyState: string | null; postZipCode: string | null; countryCode: string | null; countryName: string | null; email: string | null; phone: string | null } | null
  mapping: FinanceDraftOptions["partyMappings"][number] | null
  erpNext: {
    customers: Array<{ name: string; customer_name?: string; customer_group?: string; territory?: string; default_currency?: string; disabled?: boolean | number }>
    customerGroups: string[]
    territories: string[]
    paymentTerms: string[]
  } | null
  sage50: {
    configured: boolean
    ready: boolean
    status: { apiVersion: string | null; sageVersion: string | null; companyName: string | null; sdoStatusOk: boolean; odbcStatusOk: boolean } | null
    error: string | null
    suggestedAccountReference: string
  } | null
}

export type ProviderCustomerInput = {
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

export type ProviderPartyType = "customer" | "supplier"
export type ProviderPartySyncResult = {
  organisationId: string
  organisationName: string
  accountCode: string
  status: "synced" | "failed"
  action: "created" | "linked" | "verified" | "failed"
  providerPartyId: string | null
  message: string
}
export type ProviderPartySyncRun = {
  id: string
  connectionId: string
  status: string
  startedAt: string | null
  completedAt: string | null
  total: number
  synced: number
  failed: number
  results: ProviderPartySyncResult[]
}
export type ProviderPartySyncOverview = {
  connections: Array<{ id: string; providerCode: "erpnext" | "sage_50"; providerName: string; name: string; externalCompany: string | null }>
  runs: ProviderPartySyncRun[]
}
export type ProviderPartySyncResponse = {
  runId: string
  connectionId: string
  providerCode: "erpnext" | "sage_50"
  partyType: ProviderPartyType
  startedAt: string
  completedAt: string
  total: number
  synced: number
  failed: number
  results: ProviderPartySyncResult[]
}

export class FinanceSubledgerApiError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const nativePostingStatuses = new Set<FinanceNativePostingStatus>(["draft", "pending_migration", "posted", "reversed"])

function statusString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback
}

function normaliseNativePostingStatus(value: unknown): FinanceNativePostingStatus {
  return typeof value === "string" && nativePostingStatuses.has(value as FinanceNativePostingStatus)
    ? value as FinanceNativePostingStatus
    : "update_required"
}

export function normaliseFinanceDocument(value: unknown): FinanceDocument {
  if (!isRecord(value)) throw new FinanceSubledgerApiError("Finance returned an invalid document record.")
  const source = value as unknown as FinanceDocument
  return {
    ...source,
    FINDoc_StatusCode: statusString(value.FINDoc_StatusCode, "unknown"),
    FINDoc_PostingStatusCode: statusString(value.FINDoc_PostingStatusCode, "not_available"),
    FINDoc_ExportStatusCode: statusString(value.FINDoc_ExportStatusCode, statusString(value.FINDoc_PostingStatusCode, "not_available")),
    FINDoc_NativePostingStatusCode: normaliseNativePostingStatus(value.FINDoc_NativePostingStatusCode),
    FINDoc_NativePostingBatchID: typeof value.FINDoc_NativePostingBatchID === "string" ? value.FINDoc_NativePostingBatchID : null,
    FINDoc_NativePostedAt: typeof value.FINDoc_NativePostedAt === "string" ? value.FINDoc_NativePostedAt : null,
  }
}

export function normaliseFinanceCashTransaction(value: unknown): FinanceCashTransaction {
  if (!isRecord(value)) throw new FinanceSubledgerApiError("Finance returned an invalid cash record.")
  const source = value as unknown as FinanceCashTransaction
  return {
    ...source,
    FINCash_StatusCode: statusString(value.FINCash_StatusCode, "unknown"),
    FINCash_PostingStatusCode: statusString(value.FINCash_PostingStatusCode, "not_available"),
    FINCash_ExportStatusCode: statusString(value.FINCash_ExportStatusCode, statusString(value.FINCash_PostingStatusCode, "not_available")),
    FINCash_NativePostingStatusCode: normaliseNativePostingStatus(value.FINCash_NativePostingStatusCode),
    FINCash_NativePostingBatchID: typeof value.FINCash_NativePostingBatchID === "string" ? value.FINCash_NativePostingBatchID : null,
    FINCash_NativePostedAt: typeof value.FINCash_NativePostedAt === "string" ? value.FINCash_NativePostedAt : null,
  }
}

function financeSetupCollection<T>(source: Record<string, unknown>, key: string, missingFields: string[]) {
  const value = source[key]
  if (Array.isArray(value)) return value as T[]
  missingFields.push(key)
  return [] as T[]
}

export function normaliseFinanceSetup(value: unknown): FinanceSetup {
  if (!isRecord(value)) {
    throw new FinanceSubledgerApiError("Finance Setup returned an invalid service response. Reload after the finance service has been updated.")
  }

  const missingFields: string[] = []
  const erpNext = isRecord(value.erpNext) ? value.erpNext : null
  if (!erpNext) missingFields.push("erpNext")

  return {
    legalEntities: financeSetupCollection<FinanceLegalEntity>(value, "legalEntities", missingFields),
    chartTemplates: financeSetupCollection<FinanceChartTemplate>(value, "chartTemplates", missingFields),
    runs: financeSetupCollection<FinanceConfigurationRun>(value, "runs", missingFields),
    connections: financeSetupCollection<FinanceSetup["connections"][number]>(value, "connections", missingFields),
    integrationQueue: financeSetupCollection<FinanceSetup["integrationQueue"][number]>(value, "integrationQueue", missingFields),
    providers: financeSetupCollection<AccountingProvider>(value, "providers", missingFields),
    countries: financeSetupCollection<FinanceSetup["countries"][number]>(value, "countries", missingFields),
    currencies: financeSetupCollection<FinanceSetup["currencies"][number]>(value, "currencies", missingFields),
    administration: isRecord(value.administration) ? value.administration as FinanceAdministration : (() => { missingFields.push("administration"); return { settings: [], localisations: [], currencies: [], banks: [], nominalAccounts: [], taxJurisdictions: [], taxCodes: [], numberSequences: [], paymentTerms: [], exchangeRateProviders: [], exchangeRateRules: [], accountMappings: [], chargeMappings: [], taxMappings: [], revisions: [], documentTypes: [], chartTemplateAccounts: [], localisationPacks: [], complianceObligations: [], complianceRegistrations: [] } })(),
    erpNext: {
      configured: erpNext?.configured === true,
      endpoint: typeof erpNext?.endpoint === "string" ? erpNext.endpoint : null,
    },
    compatibility: { current: missingFields.length === 0, missingFields },
  }
}

async function call<T>(path: string, init?: RequestInit) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new FinanceSubledgerApiError("Sign in again to continue.")
  const response = await edgeFetch("finance-subledger", path, session.access_token, init)
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new FinanceSubledgerApiError(error?.detail ?? "Finance could not complete that request.")
  }
  const result = await response.json() as T
  if (init?.method && init.method !== "GET" && (/^\/administration\//.test(path) || /^\/configuration-runs\/.+\/approve$/.test(path))) invalidateFinanceReferenceReads()
  return result
}

const post = <T>(path: string, value: unknown = {}) => call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) })
const put = <T>(path: string, value: unknown) => call<T>(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) })

export async function getFinanceSetup() { return normaliseFinanceSetup(await call<unknown>("/setup")) }
export function getFinanceReportOptions() { return call<FinanceReportOptions>("/report-options") }
export function getFinanceReports(legalEntityId: string, from: string, to: string) { return call<FinanceReportingSnapshot>(`/reports?legalEntityId=${encodeURIComponent(legalEntityId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) }
export function getErpNextCompanies() { return call<{ companies: Array<{ name: string; company_name?: string; country?: string; default_currency?: string }> }>("/erpnext/companies") }
export function createFinanceConfigurationRun(input: FinanceConfigurationInput) { return post<{ FINConfigRun_ID: string; FINConfigRun_StatusCode: string; FINConfigRun_PreviewJSON: FinanceConfigurationPreview }>("/configuration-runs", input) }
export function approveFinanceConfigurationRun(id: string) { return post<{ runId: string; status: string; connectionId: string }>(`/configuration-runs/${encodeURIComponent(id)}/approve`) }
export function processFinanceIntegrationQueue(id: string) { return post<{ id: string; status: string; provider: AccountingProviderCode; externalObjectType: string; externalId: string; externalNumber: string | null; externalUrl: string | null }>(`/integration-queue/${encodeURIComponent(id)}/process`) }
export function saveFinanceAdministration(legalEntityId: string, settings: FinanceAdministrationDraft, reason: string) { return put<{ legalEntityId: string; revision: number; ready: boolean; missing: string[] }>(`/administration/${encodeURIComponent(legalEntityId)}`, { settings, reason }) }
export async function getFinanceDocuments(ledger: FinanceLedger) {
  const documents = await readFinanceRegisterPages((offset, limit) => call<unknown>(`/documents?ledger=${ledger}&offset=${offset}&limit=${limit}`), "documents")
  return { documents: documents.map(normaliseFinanceDocument) }
}
export async function getFinanceDocument(id: string) {
  const result = await call<unknown>(`/documents/${encodeURIComponent(id)}`)
  if (!isRecord(result) || !isRecord(result.document)) throw new FinanceSubledgerApiError("Finance returned an invalid document workspace.")
  return { ...result, document: normaliseFinanceDocument(result.document) } as unknown as FinanceDocumentDetail
}
export async function getFinanceCash(ledger?: FinanceLedger) {
  const cashTransactions = await readFinanceRegisterPages((offset, limit) => call<unknown>(`/cash?offset=${offset}&limit=${limit}${ledger ? `&ledger=${ledger}` : ""}`), "cashTransactions")
  return { cashTransactions: cashTransactions.map(normaliseFinanceCashTransaction) }
}
export function getFinanceDraftOptions(ledger: FinanceLedger) { return call<FinanceDraftOptions>(`/draft-options?ledger=${ledger}`) }
export function getProviderCustomerContext(connectionId: string, orgId: string) { return call<ProviderCustomerContext>(`/provider-customers/context?connectionId=${encodeURIComponent(connectionId)}&orgId=${encodeURIComponent(orgId)}`) }
export function createProviderCustomer(input: ProviderCustomerInput) { return post<{ created: boolean; mapping: FinanceDraftOptions["partyMappings"][number]; warning: string | null }>("/provider-customers", input) }
export function linkErpNextCustomer(connectionId: string, orgId: string, providerPartyId: string) { return put<{ changed: boolean; mapping: FinanceDraftOptions["partyMappings"][number] }>("/erpnext/party-mappings", { connectionId, orgId, partyType: "customer", providerPartyId }) }
export function getProviderPartySyncOverview(partyType: ProviderPartyType) { return call<ProviderPartySyncOverview>(`/provider-parties/sync?partyType=${encodeURIComponent(partyType)}`) }
export function syncProviderParties(connectionId: string, partyType: ProviderPartyType) { return post<ProviderPartySyncResponse>("/provider-parties/sync", { connectionId, partyType }) }
export function createFinanceDraft(input: FinanceDraftInput) { return post<FinanceDocument>("/documents/draft", input) }
export function updateFinanceDraft(id: string, input: FinanceDraftInput) { return put<FinanceDocument>(`/documents/${encodeURIComponent(id)}/draft`, input) }
export function reopenFinanceDocumentDraft(id: string, reason: string) { return post<FinanceDocument>(`/documents/${encodeURIComponent(id)}/reopen-draft`, { reason }) }
export function retryFinanceDocumentPosting(id: string) { return post<{ id: string; status: string; provider: AccountingProviderCode; externalObjectType: string; externalId: string; externalNumber: string | null; externalUrl: string | null }>(`/documents/${encodeURIComponent(id)}/retry-posting`) }
export function createFinanceCashDraft(input: FinanceCashInput) { return post<FinanceCashTransaction>("/cash/draft", input) }
export function requestFinanceDocumentReview(id: string, reason?: string) { return post<FinanceDocument>(`/documents/${encodeURIComponent(id)}/request-review`, { reason }) }
export function approveFinanceDocument(id: string, reason?: string) { return post<FinanceDocument>(`/documents/${encodeURIComponent(id)}/approve`, { reason }) }
export function rejectFinanceDocument(id: string, reason: string) { return post<FinanceDocument>(`/documents/${encodeURIComponent(id)}/reject`, { reason }) }
export function requestFinanceCashReview(id: string, reason?: string) { return post<FinanceCashTransaction>(`/cash/${encodeURIComponent(id)}/request-review`, { reason }) }
export function approveFinanceCash(id: string, reason?: string) { return post<FinanceCashTransaction>(`/cash/${encodeURIComponent(id)}/approve`, { reason }) }
export function rejectFinanceCash(id: string, reason: string) { return post<FinanceCashTransaction>(`/cash/${encodeURIComponent(id)}/reject`, { reason }) }
