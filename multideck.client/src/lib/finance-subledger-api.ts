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
  vatReconciliation: null | {
    status: "not_posted" | "pending" | "partial" | "reconciled"
    totalLines: number
    reconciledLines: number
    vatReconciledAt: string | null
    firstCompleteVatReconciledAt: string | null
    sourceLocked: boolean
  }
  document: FinanceDocument & {
    FINDoc_AccountingDate: string
    FINDoc_PeriodID: string | null
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
    FINDocLine_SourceCurrencyCodeSnapshot: string | null
    FINDocLine_SourceUnitAmount: number | null
    FINDocLine_ROEToDocumentCurrency: number | null
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
  billingAddress: null | {
    id: string
    name: string | null
    line1: string | null
    line2: string | null
    townCity: string | null
    countyState: string | null
    postZipCode: string | null
    countryCode: string | null
    countryName: string | null
    email: string | null
    phone: string | null
  }
  accountingPeriod: null | {
    FINPeriod_ID: string
    FINPeriod_Code: string
    FINPeriod_Name: string
    FINPeriod_StartDate: string
    FINPeriod_EndDate: string
    FINPeriod_StatusCode: string
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
  accountingPeriodId?: string | null
  sourceJobId?: string | null
  idempotencyKey?: string
  sourceExtractionId?: string
  lines: Array<{ description: string; quantity: number; unitAmount: number; currencyCode: string; exchangeRate: number; taxRatePercent: number; taxCode?: string | null; chargeCode?: string | null; jobCostingLineId?: string | null; lineType: "service" | "ancillary" }>
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
  jobCostingLines: Array<{ JobCostingLine_ID: string; Job_ID: string; JobCostingLine_Number: number; JobCostingLine_ChargeCodeID: string | null; RATECharge_Code: string | null; JobCostingLine_Description: string; JobCostingLine_CostAmountLocal: number; JobCostingLine_RevenueAmountLocal: number; JobCostingLine_CostNominalAccountID: string | null; JobCostingLine_RevenueNominalAccountID: string | null }>
  chargeCodes: Array<{ RATECharge_ID: string; RATECharge_Code: string; RATECharge_Name: string; RATECharge_Description: string | null; RATECharge_DefaultApplicabilityCode: string; RATECharge_DefaultTaxCode: string | null }>
  currencies: Array<{ code: string }>
  accountingPeriods: Array<{ FINPeriod_ID: string; FINPeriod_LegalEntityID: string; FINPeriod_Code: string; FINPeriod_Name: string; FINPeriod_StartDate: string; FINPeriod_EndDate: string; FINPeriod_StatusCode: string; FINPeriod_BaseCurrencyCode: string }>
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
export type UkVatPeriod = {
  period_id: string; start_date: string; end_date: string; status: "draft" | "review_locked"; scheme_code: string;
  reporting_currency: string; authority_obligation_verified_at: string | null;
  latest_calculation_id: string | null; latest_revision: number | null;
  latest_boxes: Record<string, number> | null; control_status: string | null;
  transaction_count: number; signed_transaction_count: number;
}
export type UkVatPeriodList = { legalEntityId: string; total: number; periods: UkVatPeriod[] }
export type UkVatReviewItem = {
  evidence_id: string; recorded_at: string; recorded_by: string;
  capture_kind: string; capture_reason: string | null; source_version: string;
  source_kind: string; document_id: string | null; document_number: string | null;
  document_type: string | null; line_id: string | null; document_date: string | null;
  currency_code: string; net_gbp: number; vat_gbp: number; tax_code: string | null;
}
export type UkVatReviewQueue = {
  legalEntityId: string; totalUnreviewed: number; items: UkVatReviewItem[];
  nextCursor: null | { recordedAt: string; evidenceId: string }
}
export type UkVatCoverage = {
  legalEntityId: string; jurisdiction: "GB"; postedDocumentLines: number; missingCapturedLines: number;
  unreviewedEvents: number; pendingOrReversedDocuments: number; unsupportedSourceKinds: number;
  missingSample: Array<{ document_id: string; document_number: string | null; document_date: string; line_id: string }>;
  unreviewedSample: Array<{ evidence_id: string; document_id: string | null; line_id: string | null; document_date: string | null; net_gbp: number; vat_gbp: number; tax_code: string | null }>;
  complete: boolean;
}
export type UkVatDraftCalculation = {
  calculationId: string; revision: number; boxes: Record<string, number>; sourceDigest: string;
  controlStatus: "unreconciled";
  sourceLedger: { status: "matched" | "mismatch"; checked: number; mismatched: number; postingDigest: string;
    mismatchSample: Array<{ evidenceId: string; documentId: string; documentLineId: string;
      documentType: string; batchStatus: string | null;
      netGbp: number; vatGbp: number; netPosted: number; taxPosted: number; netLines: number; taxLines: number }> };
  approvalAvailable: false;
}
export type UkVatCalculationLine = {
  box_number: number; amount_gbp: number; evidence_id: string; decision_id: string;
  source_kind: string; source_id: string; source_version: string;
  document_id: string | null; document_line_id: string | null;
  document_number: string | null; document_type: string | null;
  decision_revision: number; tax_point: string; treatment_code: string;
  reviewed_rule_reference: string; rule_snapshot: Record<string, unknown>;
  net_gbp: number; vat_gbp: number;
  source_locked: boolean;
  vat_reconciled_at: string | null; vat_reconciled_by: string | null;
}
export type UkVatCalculationDetail = {
  calculationId: string; periodId: string; legalEntityId: string;
  startDate: string; endDate: string; periodStatus: string; scheme: string;
  revision: number; calculationVersion: string; sourceDigest: string;
  registration: Record<string, unknown>; boxes: Record<string, number>;
  exceptions: unknown[]; controlReconciliation: Record<string, unknown>;
  calculatedBy: string; calculatedAt: string; latestRevision: boolean;
  totalLines: number; offset: number; lines: UkVatCalculationLine[];
}
export type UkVatAccount = {
  calculationId: string; periodId: string; legalEntityId: string; revision: number;
  sourceDigest: string; returnBoxes: Record<string, number>; rawBoxTotals: Record<string, number>;
  controlStatus: "unreconciled"; totalTransactions: number; signedTransactions: number;
  offset: number; rows: Array<Omit<UkVatCalculationLine, "box_number" | "amount_gbp"> & {
    boxes: Record<string, number>;
    reverses_evidence_id: string | null;
    original_document_id: string | null;
    original_document_number: string | null;
    original_document_type: string | null;
    original_vat_reconciled_at: string | null;
    credit_original_evidence_id: string | null;
    credit_original_document_id: string | null;
    credit_original_document_number: string | null;
    credit_original_document_type: string | null;
    credit_linked_at: string | null;
  }>;
}
export type UkVatTaxPostingInventory = {
  calculationId: string; periodId: string; legalEntityId: string;
  scope: string; vatPeriodStart: string; vatPeriodEnd: string;
  postingDigest: string; accountingScopeDigest: string;
  totalLines: number; linkedLines: number; unlinkedLines: number; nonGbpLines: number;
  taxLinesOffVatAccounts: number;
  totalDebitGbp: number; totalCreditGbp: number; offset: number;
  linkedVatAccountDebitGbp: number; linkedVatAccountCreditGbp: number;
  unlinkedVatAccountDebitGbp: number; unlinkedVatAccountCreditGbp: number;
  taxOffVatAccountDebitGbp: number; taxOffVatAccountCreditGbp: number;
  linkedVatAccountTaxLines: number;
  controlBridge: {
    sourceVatDueGbp: number; vatAccountNetCreditGbp: number; differenceGbp: number;
    expectedTaxPostingLines: number; linkedVatAccountTaxLines: number;
    accountingCoverageExact: boolean; daysWithoutOneAccountingPeriod: number;
    straddlingAccountingPeriods: number; scope: string;
  };
  rows: Array<{
    posting_line_id: string; batch_id: string; batch_number: string | null;
    batch_source: string | null; posted_at: string | null;
    accounting_period_id: string; accounting_start: string; accounting_end: string; line_number: number;
    document_id: string | null; document_line_id: string | null;
    nominal_id: string | null; nominal_code: string | null; nominal_name: string | null; description: string | null;
    debit_gbp: number; credit_gbp: number; currency: string; linked_to_draft: boolean;
    tax_labelled: boolean; vat_account: boolean;
  }>;
}
const ukVatPath = (legalEntityId: string) => `/vat/${encodeURIComponent(legalEntityId)}`
export type UkVatRegistrationRow = {
  registrationId: string; status: string; vrn: string | null;
  schemeCode: string | null; accountingBasis: string | null;
  effectiveFrom: string; effectiveTo: string | null; updatedAt: string;
}
export type UkVatRegistration = { registration: UkVatRegistrationRow | null; scheduledRegistration: UkVatRegistrationRow | null }
export const getUkVatRegistration = (legalEntityId: string) =>
  call<UkVatRegistration>(`${ukVatPath(legalEntityId)}/registration`)
export const configureUkVatRegistration = (legalEntityId: string, input: {
  vrn: string; schemeCode: "standard"; effectiveFrom: string; invoiceBasisConfirmed: true;
}) => post<UkVatRegistration>(`${ukVatPath(legalEntityId)}/registration`, input)
export const scheduleUkVatRegistration = (legalEntityId: string, input: {
  vrn: string; schemeCode: "standard"; effectiveFrom: string;
  invoiceBasisConfirmed: true; reason: string;
}) => post<{ newRegistrationId: string; previousRegistrationId: string; effectiveFrom: string; hmrcVerification: "required" }>(
  `${ukVatPath(legalEntityId)}/registration/revisions`, input)
export const getUkVatEntities = () => call<{ entities: Array<{
  LegalEntity_ID: string; LegalEntity_Name: string; LegalEntity_BaseCurrencyCodeSnapshot: string
}> }>("/vat/entities")
export const getUkVatPeriods = (legalEntityId: string) => call<UkVatPeriodList>(`${ukVatPath(legalEntityId)}/periods`)
export const prepareUkVatDraftPeriod = (legalEntityId: string, startDate: string, endDate: string) =>
  post<{ periodId: string; status: "draft"; start: string; end: string; authorityObligationVerified: false }>(`${ukVatPath(legalEntityId)}/periods`, { startDate, endDate })
export type UkVatPriorPeriodErrorIntake = {
  legalEntityId: string; discoveryPeriodId: string; total: number;
  status: "unassessed_no_return_effect";
  items: Array<{
    id: string; original_period_start: string; original_period_end: string;
    discovered_on: string; source_reference: string; tax_side: "input" | "output";
    signed_vat_error_gbp: number; conduct: "undetermined" | "reasonable_care" | "careless" | "deliberate"; explanation: string;
    recorded_by: string; recorded_at: string;
    effective_conduct: "undetermined" | "reasonable_care" | "careless" | "deliberate";
    conduct_review_id: string | null; conduct_reviewed_at: string | null;
    conduct_review_history: Array<{ reviewId: string; revision: number;
      conduct: "reasonable_care" | "careless" | "deliberate";
      reviewedBy: string; reviewedAt: string; reason: string }>;
  }>;
}
export const getUkVatPriorPeriodErrors = (legalEntityId: string, periodId: string) =>
  call<UkVatPriorPeriodErrorIntake>(`${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/prior-errors`)
export type UkVatPriorPeriodErrorPreview = {
  periodId: string; legalEntityId: string; itemCount: number; itemsFingerprint: string;
  netErrorGbp: number; method: "no_errors" | "current_return_adjustment" | "separate_notification"
    | "needs_reviewed_current_box6" | "external_notification_evidence_recorded"
    | "notification_history_review_required";
  reason: string; reviewedBox6Gbp: number | null; filingProjectionId: string | null;
  projectionFingerprint: string | null; conductReviewRequired: boolean;
  carelessDisclosureAdvisory: boolean; timeLimitReviewRequired: boolean;
  immediateNotificationReviewRequired: boolean;
  externallyNotifiedCount: number; unnotifiedCount: number;
  status: "preview_only_no_return_effect";
}
export const previewUkVatPriorPeriodErrors = (legalEntityId: string, periodId: string, chooseSeparate: boolean) =>
  call<UkVatPriorPeriodErrorPreview>(`${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/prior-errors/preview?chooseSeparate=${chooseSeparate}`)
export const recordUkVatPriorPeriodError = (legalEntityId: string, periodId: string, input: {
  originalPeriodStart: string; originalPeriodEnd: string; discoveredOn: string;
  sourceReference: string; taxSide: "input" | "output"; signedVatErrorGbp: string;
  conduct: "undetermined" | "reasonable_care" | "careless" | "deliberate"; explanation: string;
}) => post<{ intakeId: string; recordedAt: string; inserted: boolean; status: "intake_only" }>(
  `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/prior-errors`, input)
export const reviewUkVatPriorErrorConduct = (legalEntityId: string, intakeId: string, input: {
  conduct: "reasonable_care" | "careless" | "deliberate"; reason: string;
}) => post<{ reviewId: string; intakeId: string; revision: number;
  conduct: "reasonable_care" | "careless" | "deliberate"; reviewedAt: string; inserted: boolean }>(
  `${ukVatPath(legalEntityId)}/prior-errors/${encodeURIComponent(intakeId)}/conduct`, input)
export type UkVatPriorErrorTimeLimitHistory = {
  intakeId: string; status: "assessment_only_no_return_effect";
  reviews: Array<{ id: string; revision: number; error_category: string;
    original_return_reference: string; original_return_due_on: string | null;
    statutory_deadline_on: string; assessment_on: string; within_time_limit: boolean;
    evidence_reference: string; reason: string; reviewed_by: string; reviewed_at: string }>;
}
export const getUkVatPriorErrorTimeLimitHistory = (legalEntityId: string, intakeId: string) =>
  call<UkVatPriorErrorTimeLimitHistory>(
    `${ukVatPath(legalEntityId)}/prior-errors/${encodeURIComponent(intakeId)}/time-limit`)
export const reviewUkVatPriorErrorTimeLimit = (legalEntityId: string, intakeId: string, input: {
  errorCategory: "output_underdeclared" | "output_overdeclared" | "input_overclaimed" | "input_underclaimed";
  originalReturnReference: string; originalReturnDueOn: string | null;
  evidenceReference: string; reason: string;
}) => post<{ reviewId: string; revision: number; deadlineOn: string;
  withinTimeLimit: boolean; assessmentOn: string; inserted: boolean;
  status: "assessment_only" }>(
  `${ukVatPath(legalEntityId)}/prior-errors/${encodeURIComponent(intakeId)}/time-limit`, input)
export type UkVatMethod1OffsetNominals = {
  legalEntityId: string; nominals: Array<{ id: string; code: string; name: string }>;
}
export const getUkVatMethod1OffsetNominals = (legalEntityId: string) =>
  call<UkVatMethod1OffsetNominals>(`${ukVatPath(legalEntityId)}/method1-offsets`)
export type UkVatMethod1Plans = {
  periodId: string; status: "reviewed_for_posting_only";
  plans: Array<{ id: string; base_source_digest: string; item_count: number;
    planned_items: Array<{ intakeId: string; signedVatErrorGbp: number;
      boxNetDeltaGbp: number; offsetNominalId: string; evidenceReference: string }>;
    net_error_gbp: number; box6_delta_gbp: number; box7_delta_gbp: number;
    planned_filed_box6_gbp: number; threshold_basis: string;
    plan_fingerprint: string; reviewed_by: string; reviewed_at: string; reason: string }>;
}
export const getUkVatMethod1Plans = (legalEntityId: string, periodId: string) =>
  call<UkVatMethod1Plans>(
    `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/prior-errors/method1-plans`)
export const reviewUkVatMethod1Plan = (legalEntityId: string, periodId: string, input: {
  baseCalculationId: string; sourceDigest: string;
  items: Array<{ intakeId: string; boxNetDeltaGbp: string;
    offsetNominalId: string; evidenceReference: string }>;
  reason: string; confirmed: true;
}) => post<{ planId: string; periodId: string; planFingerprint: string;
  itemCount: number; netErrorGbp: number; box6DeltaGbp: number;
  box7DeltaGbp: number; plannedFiledBox6Gbp: number; thresholdBasis: string;
  reviewedAt: string; inserted: boolean; status: "reviewed_for_posting_only" }>(
  `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/prior-errors/method1-plans`, input)
export type UkVatMethod1Postings = {
  periodId: string;
  postings: Array<{ id: string; planId: string; batchId: string; itemCount: number;
    planFingerprint: string; postedBy: string; postedAt: string; reason: string;
    items: Array<{ intakeId: string; evidenceId: string; decisionId: string;
      taxPostingLineId: string; offsetPostingLineId: string;
      signedVatErrorGbp: number; boxNetDeltaGbp: number; evidenceReference: string }> }>;
}
export const getUkVatMethod1Postings = (legalEntityId: string, periodId: string) =>
  call<UkVatMethod1Postings>(
    `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/prior-errors/method1-postings`)
export const postUkVatMethod1Plan = (legalEntityId: string, periodId: string,
  planId: string, input: { reason: string; confirmed: true }) =>
  post<{ postingId: string; periodId: string; planId: string; batchId: string;
    itemCount: number; status: "posted_pending_vat_calculation_and_signoff" }>(
    `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/prior-errors/method1-plans/${encodeURIComponent(planId)}`,
    input)
export type UkVatExternalErrorNotifications = {
  legalEntityId: string; discoveryPeriodId: string; total: number;
  notifiedIntakeIds: string[];
  status: "operator_recorded_unverified";
  items: Array<{ id: string; notified_on: string; channel: "hmrc_online" | "letter";
    evidence_reference: string; explanation: string; item_count: number;
    net_error_gbp: number; items_fingerprint: string; recorded_by: string;
    recorded_at: string; intake_ids: string[] }>;
}
export const getUkVatExternalErrorNotifications = (legalEntityId: string, periodId: string) =>
  call<UkVatExternalErrorNotifications>(
    `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/prior-errors/notifications`)
export const recordUkVatExternalErrorNotification = (legalEntityId: string, periodId: string, input: {
  intakeIds: string[]; notifiedOn: string; channel: "hmrc_online" | "letter";
  evidenceReference: string; explanation: string; confirmed: true;
}) => post<{ notificationId: string; recordedAt: string; inserted: boolean;
  status: "operator_recorded_unverified" }>(
  `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/prior-errors/notifications`, input)
export type UkVatCashPaymentDateQueue = {
  legalEntityId: string; total: number; offset: number; limit: number;
  status: "review_only_no_cash_return_effect";
  items: Array<{ cash_id: string; cash_number: string | null;
    cash_type: "customer_receipt" | "supplier_payment"; transaction_date: string;
    amount: number; currency_code: string; posting_batch_id: string;
    allocation_count: number; allocated_amount: number;
    review_id: string | null; revision: number | null;
    method_code: "cash_handover" | "bank_credit_or_debit" | "card_voucher" | "cheque" | "agent_collection" | null;
    method_event_date: string | null; cheque_date: string | null;
    vat_payment_date: string | null; evidence_reference: string | null;
    source_fingerprint: string | null; reason: string | null;
    reviewed_by: string | null; reviewed_at: string | null;
    review_history: Array<{ reviewId: string; revision: number; method: string;
      vatPaymentDate: string; evidenceReference: string; reason: string;
      reviewedBy: string; reviewedAt: string }> }>
}
export const getUkVatCashPaymentDateQueue = (legalEntityId: string, offset = 0, limit = 25) =>
  call<UkVatCashPaymentDateQueue>(`${ukVatPath(legalEntityId)}/cash-payment-dates?offset=${offset}&limit=${limit}`)
export type UkVatCashSourcePreview = {
  legalEntityId: string; startDate: string; endDate: string;
  sourceStatus: "source_only_not_filing"; calculationValid: boolean;
  issueCount: number; issues: string[]; candidateAllocationCount: number;
  excludedAllocationCount: number;
  excludedAllocations: Array<{ allocationId: string; cashId: string;
    invoiceId: string; paymentDate: string; standardAcceptedAt: string }>;
  sourceBoxesGbp: { 1: string; 4: string; 6: string; 7: string } | null;
  allocationLines: Array<{ allocationId: string; cashId: string; paymentReviewId: string;
    invoiceId: string; paymentDate: string; lineId: string; evidenceId: string;
    treatmentReviewId: string; treatment: string; netGbp: string; vatGbp: string }>;
}
export const getUkVatCashSourcePreview = (legalEntityId: string, start: string, end: string) =>
  call<UkVatCashSourcePreview>(`${ukVatPath(legalEntityId)}/cash-preview?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
export type UkVatCashEventProjectionHistory = {
  legalEntityId: string; startDate: string; endDate: string;
  currentSourceDigest: string; status: "source_projection_history_only";
  items: Array<{ id: string; source_digest: string; start_date: string; end_date: string;
    candidate_allocation_count: number; excluded_allocation_count: number;
    source_boxes_gbp: { 1: string; 4: string; 6: string; 7: string };
    excluded_allocations: UkVatCashSourcePreview["excludedAllocations"];
    projected_by: string; projected_at: string; source_current: boolean;
    event_lines: Array<{ id: string; allocation_id: string; invoice_id: string;
      payment_date: string; line_id: string; treatment_code: string;
      net_gbp: string; vat_gbp: string }> }>;
}
export const getUkVatCashEventProjections = (legalEntityId: string, start: string, end: string) =>
  call<UkVatCashEventProjectionHistory>(`${ukVatPath(legalEntityId)}/cash-projections?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
export const recordUkVatCashEventProjection = (legalEntityId: string, start: string, end: string) =>
  post<{ projectionId: string; sourceDigest: string; inserted: boolean;
    eventLineCount?: number; status: "source_projection_only_no_cash_return_effect" }>(
    `${ukVatPath(legalEntityId)}/cash-projections`, { start, end })
export const reviewUkVatCashPaymentDate = (legalEntityId: string, cashId: string, input: {
  method: "cash_handover" | "bank_credit_or_debit" | "card_voucher" | "cheque" | "agent_collection";
  methodDate: string; chequeDate: string | null; evidenceReference: string; reason: string;
}) => post<{ reviewId: string; cashId: string; revision: number; vatPaymentDate: string;
  reviewedAt: string; inserted: boolean; status: "payment_date_review_only" }>(
  `${ukVatPath(legalEntityId)}/cash-payment-dates/${encodeURIComponent(cashId)}/review`, input)
export const calculateUkVatDraft = (legalEntityId: string, periodId: string) =>
  post<UkVatDraftCalculation>(`${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/calculate`)
export type UkVatClawbackCandidates = {
  periodId: string; legalEntityId: string; periodEnd: string; totalCandidates: number;
  items: Array<{
    document_id: string; document_number: string | null; document_date: string;
    due_date: string | null; currency_code: string; gross_amount: number;
    paid_by_period_end: number; unpaid_at_period_end: number;
    first_possible_clawback_date: string;
  }>;
}
export const getUkVatClawbackCandidates = (legalEntityId: string, periodId: string) =>
  call<UkVatClawbackCandidates>(`${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/clawback-candidates`)
const supplierInputTaxPath = (legalEntityId: string, periodId: string, documentId: string) =>
  `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/supplier-input-tax/${encodeURIComponent(documentId)}`
export type UkVatSupplierInputTaxSource = {
  status: "source_verified_only" | "source_only_no_posting" | "source_only_no_tax_effect";
  periodId: string; documentId: string; sourceFingerprint: string;
  firstPossibleRepaymentDate?: string; originallyClaimedInputVatGbp?: number;
  grossSourceAmount?: number; paidByPeriodEnd?: number; unpaidAtPeriodEnd?: number;
  priorRepaymentOutstandingGbp?: number; restorationBox4Gbp?: number;
  unpaidAtPeriodEndGbp?: number;
  events?: Array<{ eventDate: string; kind: string; signedBox4DeltaGbp: number }>;
}
export type UkVatSupplierInputTaxHistory = {
  periodId: string; documentId: string;
  firstProposals: Array<{ proposalId: string; sourceFingerprint: string;
    proposedRepaymentGbp: number; proposedRestorationGbp: number;
    proposedBox4DeltaGbp: number; preparedAt: string; reason: string }>;
  firstReviews: Array<{ reviewId: string; proposalId: string;
    sourceFingerprint: string; offsetNominalId: string; reviewedAt: string;
    revokedAt: string | null; reason: string }>;
  firstPostings: Array<{ postingId: string; reviewId: string; batchId: string;
    box4DeltaGbp: number; eventCount: number; postedAt: string; reason: string;
    events: Array<{ eventDate: string; kind: string; signedBox4DeltaGbp: number }> }>;
  laterReviews: Array<{ reviewId: string; revision: number;
    sourceFingerprint: string; offsetNominalId: string; restorationBox4Gbp: number;
    reviewedAt: string; reason: string }>;
  laterPostings: Array<{ postingId: string; reviewId: string; batchId: string | null;
    status: "posted" | "zero_tax_effect_confirmed"; restorationBox4Gbp: number;
    eventCount: number; postedAt: string; reason: string;
    events: Array<{ eventDate: string; signedBox4DeltaGbp: number }> }>;
}
export const getUkVatSupplierInputTaxHistory = (legalEntityId: string, periodId: string, documentId: string) =>
  call<UkVatSupplierInputTaxHistory>(supplierInputTaxPath(legalEntityId, periodId, documentId))
export const getUkVatSupplierInputTaxSource = (
  legalEntityId: string, periodId: string, documentId: string, kind: "first" | "later",
) => call<UkVatSupplierInputTaxSource>(
  `${supplierInputTaxPath(legalEntityId, periodId, documentId)}/source?kind=${kind}`)
export const prepareUkVatFirstInputTaxRepayment = (
  legalEntityId: string, periodId: string, documentId: string, reason: string,
) => post<{ proposalId: string; inserted: boolean; proposedBox4DeltaGbp: number }>(
  `${supplierInputTaxPath(legalEntityId, periodId, documentId)}/first-proposals`, { reason })
export const reviewUkVatFirstInputTaxRepayment = (
  legalEntityId: string, periodId: string, documentId: string,
  proposalId: string, offsetNominalId: string, reason: string,
) => post<{ reviewId: string; reviewedAt: string }>(
  `${supplierInputTaxPath(legalEntityId, periodId, documentId)}/first-reviews`,
  { proposalId, offsetNominalId, reason, confirmed: true })
export const postUkVatFirstInputTaxRepayment = (
  legalEntityId: string, periodId: string, documentId: string, reviewId: string, reason: string,
) => post<{ postingId: string; batchId: string; box4DeltaGbp: number }>(
  `${supplierInputTaxPath(legalEntityId, periodId, documentId)}/first-postings`,
  { reviewId, reason, confirmed: true })
export const reviewUkVatLaterInputTaxRestoration = (
  legalEntityId: string, periodId: string, documentId: string,
  offsetNominalId: string, reason: string,
) => post<{ reviewId: string; revision: number; restorationBox4Gbp: number }>(
  `${supplierInputTaxPath(legalEntityId, periodId, documentId)}/later-reviews`,
  { offsetNominalId, reason, confirmed: true })
export const postUkVatLaterInputTaxRestoration = (
  legalEntityId: string, periodId: string, documentId: string, reviewId: string, reason: string,
) => post<{ postingId: string; batchId: string | null; restorationBox4Gbp: number;
  status: "posted_pending_vat_calculation_and_signoff" | "zero_tax_effect_confirmed" }>(
  `${supplierInputTaxPath(legalEntityId, periodId, documentId)}/later-postings`,
  { reviewId, reason, confirmed: true })
export const getUkVatCalculationDetail = (legalEntityId: string, calculationId: string, offset = 0, limit = 100) =>
  call<UkVatCalculationDetail>(`${ukVatPath(legalEntityId)}/calculations/${encodeURIComponent(calculationId)}/detail?offset=${offset}&limit=${limit}`)
export const getUkVatAccount = (legalEntityId: string, calculationId: string, offset = 0, limit = 100) =>
  call<UkVatAccount>(`${ukVatPath(legalEntityId)}/calculations/${encodeURIComponent(calculationId)}/account?offset=${offset}&limit=${limit}`)
export type UkVatCreditCandidate = {
  evidenceId: string; documentId: string; documentNumber: string | null;
  documentDate: string; lineId: string; lineNo: number; currencyCode: string;
  remainingNet: number; remainingVat: number;
  vatReconciledAt: string | null;
}
export const findUkVatCreditCandidates = (legalEntityId: string, creditEvidenceId: string, search: string) =>
  call<{ creditEvidenceId: string; candidates: UkVatCreditCandidate[] }>(
    `${ukVatPath(legalEntityId)}/credit-links/candidates?creditEvidenceId=${encodeURIComponent(creditEvidenceId)}&search=${encodeURIComponent(search)}`)
export const linkUkVatCredit = (legalEntityId: string, creditEvidenceId: string, originalEvidenceId: string, reason: string) =>
  post<{ linkId: string; linkedAt: string; creditEvidenceId: string; originalEvidenceId: string; inserted: boolean }>(
    `${ukVatPath(legalEntityId)}/credit-links`, { creditEvidenceId, originalEvidenceId, reason })
export const getUkVatTaxPostingInventory = (legalEntityId: string, calculationId: string, offset = 0, limit = 100) =>
  call<UkVatTaxPostingInventory>(`${ukVatPath(legalEntityId)}/calculations/${encodeURIComponent(calculationId)}/tax-postings?offset=${offset}&limit=${limit}`)
export const reconcileUkVatTransactions = (legalEntityId: string, calculationId: string,
  sourceDigest: string, evidenceIds: string[], reason: string) =>
  post<{ periodId: string; calculationId: string; sourceDigest: string; inserted: number;
    transactions: Array<{ evidenceId: string; decisionId: string; reconciliationId: string; vatReconciledAt: string }> }>(
    `${ukVatPath(legalEntityId)}/calculations/${encodeURIComponent(calculationId)}/reconcile`,
    { sourceDigest, evidenceIds, reason })
export const reviewUkVatControl = (legalEntityId: string, calculationId: string, sourceDigest: string, reason: string) =>
  post<{ reviewId: string; periodId: string; calculationId: string; reviewCalculationId: string;
    sourceDigest: string; controlFingerprint: string; reviewedAt: string; inserted: boolean;
    bridge: UkVatTaxPostingInventory["controlBridge"] }>(
    `${ukVatPath(legalEntityId)}/calculations/${encodeURIComponent(calculationId)}/control-review`,
    { sourceDigest, reason })
export type UkVatControlReviews = { periodId: string; reviews: Array<{
  review_id: string; calculation_id: string; source_digest: string; posting_digest: string;
  accounting_scope_digest: string; control_fingerprint: string;
  bridge_snapshot: UkVatTaxPostingInventory["controlBridge"];
  transaction_count: number; signed_transaction_count: number;
  reviewed_by: string; reviewed_at: string; reason: string;
}> }
export const getUkVatControlReviews = (legalEntityId: string, periodId: string) =>
  call<UkVatControlReviews>(`${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/control-reviews`)
export type UkVatFilingProjections = { periodId: string; reviews: Array<{
  review_id: string; calculation_id: string; source_digest: string; rule_version: string;
  control_review_id: string; control_fingerprint: string;
  source_boxes: Record<string, number>; filed_boxes: Record<string, number>;
  projection_fingerprint: string; reviewed_by: string; reviewed_at: string; reason: string;
}> }
export type UkVatFilingProjectionPreview = {
  calculationId: string; periodId: string; sourceDigest: string; ruleVersion: string;
  sourceBoxes: Record<string, number>; filedBoxes: Record<string, number>;
  currentDraft: boolean; controlReviewed: boolean;
}
export const getUkVatFilingProjectionPreview = (legalEntityId: string, calculationId: string) =>
  call<UkVatFilingProjectionPreview>(`${ukVatPath(legalEntityId)}/calculations/${encodeURIComponent(calculationId)}/filing-projection`)
export const getUkVatFilingProjections = (legalEntityId: string, periodId: string) =>
  call<UkVatFilingProjections>(`${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/filing-projections`)
export const reviewUkVatFilingProjection = (legalEntityId: string, calculationId: string, sourceDigest: string, reason: string) =>
  post<{ reviewId: string; periodId: string; calculationId: string; sourceDigest: string;
    projectionFingerprint: string; controlFingerprint: string; ruleVersion: string; sourceBoxes: Record<string, number>;
    filedBoxes: Record<string, number>; reviewedAt: string; inserted: boolean }>(
    `${ukVatPath(legalEntityId)}/calculations/${encodeURIComponent(calculationId)}/filing-projection`,
    { sourceDigest, reason })
export type UkVatReviewLocks = { periodId: string; activeLockId: string | null; locks: Array<{
  lock_id: string; calculation_id: string; source_digest: string;
  control_review_id: string; control_fingerprint: string; filing_projection_id: string;
  projection_fingerprint: string; lock_fingerprint: string; locked_by: string;
  locked_at: string; reason: string; unlock_id: string | null;
  unlocked_by: string | null; unlocked_at: string | null; unlock_reason: string | null;
}> }
export const getUkVatReviewLocks = (legalEntityId: string, periodId: string) =>
  call<UkVatReviewLocks>(`${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/review-locks`)
export type UkVatFilingStatus = {
  periodId: string; periodStatus: string; reviewLockId: string | null;
  obligation: null | { verificationId: string; environment: "sandbox" | "production";
    observedAt: string; freshForApproval: boolean };
  approval: null | { approvalId: string; environment: "sandbox" | "production";
    confirmedAt: string; confirmedBy: string;
    revocation: null | { revocationId: string; revokedAt: string; reason: string } };
  attempt: null | { attemptId: string; status: "reserved" | "dispatching" |
    "reconciliation_required" | "accepted" | "accepted_readback" | "cancelled";
    environment: "sandbox" | "production";
    reservedAt: string; dispatchingAt: string | null; uncertainAt: string | null;
    uncertaintyKind: string | null; acceptedAt: string | null; cancelledAt: string | null;
    httpStatus: number | null };
  receipt: null | { recordedAt: string; processingDate: string;
    formBundleNumber: string; correlationId: string; receiptId: string;
    receiptTimestamp: string; paymentIndicator: string | null; chargeRefNumber: string | null };
  readback: null | { readbackId: string; result: "matched" | "mismatch" | "not_found";
    httpStatus: number; correlationId: string | null; observedAt: string };
}
export const getUkVatFilingStatus = (legalEntityId: string, periodId: string) =>
  call<UkVatFilingStatus>(`${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/filing-status`)
export const confirmUkVatFilingApproval = (legalEntityId: string, periodId: string,
  verificationId: string, lockFingerprint: string) =>
  post<{ approvalId: string; periodId: string; environment: "sandbox" | "production";
    confirmedAt: string; status: "approved_for_dispatch_review" }>(
    `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/filing-approval`,
    { verificationId, lockFingerprint, confirmed: true })
export const revokeUkVatFilingApproval = (legalEntityId: string, approvalId: string, reason: string) =>
  post<{ revocationId: string; approvalId: string; periodId: string;
    revokedAt: string; status: "revoked" }>(
    `${ukVatPath(legalEntityId)}/filing-approvals/${encodeURIComponent(approvalId)}/revoke`, { reason })
export const lockUkVatReview = (legalEntityId: string, calculationId: string,
  sourceDigest: string, projectionId: string, reason: string) =>
  post<{ lockId: string; periodId: string; calculationId: string; sourceDigest: string;
    lockFingerprint: string; lockedAt: string; status: "review_locked" }>(
    `${ukVatPath(legalEntityId)}/calculations/${encodeURIComponent(calculationId)}/review-lock`,
    { sourceDigest, projectionId, reason })
export const reopenUkVatReview = (legalEntityId: string, periodId: string, reason: string) =>
  post<{ unlockId: string; periodId: string; lockId: string; unlockedAt: string; status: "draft" }>(
    `${ukVatPath(legalEntityId)}/periods/${encodeURIComponent(periodId)}/review-locks`, { reason })
export const getUkVatCoverage = (legalEntityId: string) => call<UkVatCoverage>(`${ukVatPath(legalEntityId)}/coverage`)
export const getUkVatReviewQueue = (legalEntityId: string, limit = 100, cursor?: UkVatReviewQueue["nextCursor"]) =>
  call<UkVatReviewQueue>(`${ukVatPath(legalEntityId)}/review-queue?limit=${limit}${cursor ? `&afterAt=${encodeURIComponent(cursor.recordedAt)}&afterId=${encodeURIComponent(cursor.evidenceId)}` : ""}`)
export const reviewUkVatEvidence = (legalEntityId: string, evidenceId: string, taxPoint: string, reason: string) =>
  post<{ decisionId: string; evidenceId: string; revision: number; taxPoint: string; treatment: string }>(
    `${ukVatPath(legalEntityId)}/evidence/${encodeURIComponent(evidenceId)}/review`, { taxPoint, reason })
export const backfillUkVatPostedLines = (legalEntityId: string, limit: number, reason: string) =>
  post<{ inserted: number; coverage: UkVatCoverage }>(`${ukVatPath(legalEntityId)}/backfill`, { limit, reason })
export function getErpNextCompanies() { return call<{ companies: Array<{ name: string; company_name?: string; country?: string; default_currency?: string }> }>("/erpnext/companies") }
export function getErpNextAccountCatalog(connectionId: string) { return call<{ accounts: Array<{ name: string; account_number?: string; account_name?: string; account_type?: string; root_type?: string; account_currency?: string; is_group?: boolean | number; disabled?: boolean | number }> }>(`/erpnext/catalog?connectionId=${encodeURIComponent(connectionId)}`) }
export function getSage50NominalCatalog(connectionId: string) { return call<{ connectionId: string; accounts: Array<{ name: string; account_number: string; account_name: string; is_group?: boolean | number }> }>(`/sage-50/nominals?connectionId=${encodeURIComponent(connectionId)}`) }
export function createFinanceConfigurationRun(input: FinanceConfigurationInput) { return post<{ FINConfigRun_ID: string; FINConfigRun_StatusCode: string; FINConfigRun_PreviewJSON: FinanceConfigurationPreview }>("/configuration-runs", input) }
export function approveFinanceConfigurationRun(id: string) { return post<{ runId: string; status: string; connectionId: string }>(`/configuration-runs/${encodeURIComponent(id)}/approve`) }
export function processFinanceIntegrationQueue(id: string) { return post<{ id: string; status: string; provider: AccountingProviderCode; externalObjectType: string; externalId: string; externalNumber: string | null; externalUrl: string | null }>(`/integration-queue/${encodeURIComponent(id)}/process`) }
export function saveFinanceAdministration(legalEntityId: string, settings: FinanceAdministrationDraft, reason?: string) { return put<{ legalEntityId: string; revision: number; ready: boolean; missing: string[] }>(`/administration/${encodeURIComponent(legalEntityId)}`, reason ? { settings, reason } : { settings }) }
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
export function correctFinanceDocumentBillingParty(id: string, partyOrgId: string, reason: string) { return post<{ sourceDocumentId: string; reversalDocumentId: string; replacementDocumentId: string; replacementNumber: string | null }>(`/documents/${encodeURIComponent(id)}/correct-billing-party`, { partyOrgId, reason }) }
export function createFinanceCashDraft(input: FinanceCashInput) { return post<FinanceCashTransaction>("/cash/draft", input) }
export function requestFinanceDocumentReview(id: string, reason?: string) { return post<FinanceDocument>(`/documents/${encodeURIComponent(id)}/request-review`, { reason }) }
export function approveFinanceDocument(id: string, reason?: string) { return post<FinanceDocument>(`/documents/${encodeURIComponent(id)}/approve`, { reason }) }
export function rejectFinanceDocument(id: string, reason: string) { return post<FinanceDocument>(`/documents/${encodeURIComponent(id)}/reject`, { reason }) }
export function requestFinanceCashReview(id: string, reason?: string) { return post<FinanceCashTransaction>(`/cash/${encodeURIComponent(id)}/request-review`, { reason }) }
export function approveFinanceCash(id: string, reason?: string) { return post<FinanceCashTransaction>(`/cash/${encodeURIComponent(id)}/approve`, { reason }) }
export function rejectFinanceCash(id: string, reason: string) { return post<FinanceCashTransaction>(`/cash/${encodeURIComponent(id)}/reject`, { reason }) }

export type AccountingPartySettings = { enabled: boolean; customerGroup?: string; supplierGroup?: string; territory?: string }
export type AccountingPartyHealth = {
  incoming: { scope: "document_delivery"; fullLedgerReconciled: false; pending: number; matched: number; attention: number; issues: Array<{ id: string; document_type: string; document_number: string; message: string | null; received_at: string }> };
  scope: "party_master"; workerEnabled: boolean; connectionId: string; checkedAt: string; total: number; synced: number; queued: number; attention: number; oldestVerification: string | null; fullLedgerReconciled: false;
  settings: AccountingPartySettings;
  issues: Array<{ id: string; org_id: string; organisation_name: string; party_type: "customer" | "supplier"; status: string; last_error: string | null; attempts: number; verified_at: string | null; provider_id: string | null }>;
}
export const getAccountingPartyHealth = (id: string) => call<AccountingPartyHealth>(`/account-sync/${encodeURIComponent(id)}`)
export const recheckAccountingParties = (id: string) => post<{ queued: number; scope: "party_master" }>(`/account-sync/${encodeURIComponent(id)}/check`, {})
export const saveAccountingPartySettings = (id: string, settings: AccountingPartySettings) => put<{ settings: AccountingPartySettings }>(`/account-sync/${encodeURIComponent(id)}/settings`, settings)

export type AccountingIdentityReview = { reviews: Array<{ jobId: string; orgId: string; partyType: string; organisationName: string; providerId: string; providerName: string; fingerprint: string; changes: Array<{ field: string; from: unknown; to: unknown }>; addressChanges: Array<{ field: string; from: unknown; to: unknown }>; addressAction: string }>; issues: Array<{ jobId: string; message: string }> }
export const getAccountingIdentityReview = (id: string) => call<AccountingIdentityReview>(`/account-sync/${encodeURIComponent(id)}/identity-review`)
export const confirmAccountingIdentityReview = (id: string, reviews: AccountingIdentityReview["reviews"]) => post<{ results: Array<{ jobId: string; queued: boolean; message?: string }> }>(`/account-sync/${encodeURIComponent(id)}/identity-review`, { reviews: reviews.map(({ jobId, fingerprint }) => ({ jobId, fingerprint })) })
