import {
  useCallback,
  useId,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react"
import {
  AlertCircle,
  CircleCheck,
  Landmark,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Wallet,
} from "@/components/icons/hugeicons"
import {
  SettingsFieldRow,
  SettingsIntegrationRow,
  SettingsPageHeader,
  SettingsPanel,
  SettingsToggleRow,
} from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { TabsRail } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/i18n/language-provider"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import {
  approveFinanceConfigurationRun,
  createFinanceConfigurationRun,
  getErpNextCompanies,
  getErpNextAccountCatalog,
  getSage50NominalCatalog,
  getFinanceSetup,
  processFinanceIntegrationQueue,
  saveFinanceAdministration,
  type AccountingProviderCode,
  type FinanceAdministrationDraft,
  type FinanceConfigurationInput,
  type FinanceSetup,
} from "@/lib/finance-subledger-api"
import { toast } from "sonner"
import { suggestNominalAccount, type NominalMappingTarget } from "@/lib/nominal-mapping-suggestions"
import { CustomsReadinessReview } from "@/components/multideck/customs-readiness-review"
import { Surface, SectionHeader } from "@/components/multideck/surface"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { DataTable } from "@/components/multideck/data-table"
import { FinanceNominalStructurePanel } from "./finance-nominal-structure-panel"
import { FinanceMigrationPanel } from "./finance-migration-panel"
import { getFinanceCash, type FinanceCashTransaction } from "@/lib/finance-subledger-api"
import {
  getFinanceApprovalPolicies,
  saveFinanceApprovalPolicy,
  type FinanceApprovalMode,
  type FinanceApprovalPolicy,
  type FinanceApprovalWorkflow,
} from "@/lib/finance-approval-api"
import erpNextLogo from "@/assets/integrations/erpnext.svg"
import xeroLogo from "@/assets/integrations/xero.svg"
import quickBooksLogo from "@/assets/integrations/quickbooks.svg"
import sageLogo from "@/assets/integrations/sage.svg"
import businessCentralLogo from "@/assets/integrations/business-central.svg"
import netSuiteLogo from "@/assets/integrations/netsuite.svg"
import zohoBooksLogo from "@/assets/integrations/zoho-books.png"

const accountingProviderLogos: Record<AccountingProviderCode, string> = {
  erpnext: erpNextLogo,
  xero: xeroLogo,
  quickbooks_online: quickBooksLogo,
  sage_accounting: sageLogo,
  sage_intacct: sageLogo,
  sage_50: sageLogo,
  sage_200: sageLogo,
  business_central: businessCentralLogo,
  netsuite: netSuiteLogo,
  zoho_books: zohoBooksLogo,
}

export type FinanceSetupTab =
  | "overview"
  | "systems"
  | "currencies"
  | "banks"
  | "ledger"
  | "tax"
  | "documents"
  | "mappings"
  | "compliance"
  | "controls"
type DraftRow = Record<string, unknown> & {
  _key: string
  id?: string
  isActive?: boolean
}

const financeSetupTitleByTab: Record<FinanceSetupTab, string> = {
  overview: "Finance administration",
  systems: "Integrations",
  currencies: "Currencies & FX",
  banks: "Bank accounts",
  ledger: "General ledger",
  tax: "Tax",
  documents: "Documents",
  mappings: "Mappings",
  compliance: "Compliance",
  controls: "Controls & audit",
}

const financeSetupRouteByTab: Record<FinanceSetupTab, string> = {
  overview: "/finance/administration",
  systems: "/finance/systems",
  currencies: "/finance/currencies",
  banks: "/finance/banks",
  ledger: "/finance/ledger",
  tax: "/finance/tax",
  documents: "/finance/documents",
  mappings: "/finance/mappings",
  compliance: "/finance/compliance",
  controls: "/finance/controls",
}

const today = () => new Date().toISOString().slice(0, 10)
const key = () => crypto.randomUUID()
const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}
const text = (value: unknown, fallback = "") =>
  typeof value === "string"
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : fallback
const number = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback
const bool = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback
const rowKey = (row: DraftRow) => row.id || row._key
const activeRows = (rows: Array<Record<string, unknown>>) =>
  rows.filter((row) => row.isActive !== false)

const documentNumberExample = (row: DraftRow) => {
  const nextNumber = Math.max(1, Math.trunc(number(row.nextNumber, 1)))
  const numberDigits = Math.max(
    1,
    Math.min(12, Math.trunc(number(row.paddingLength, 6))),
  )

  return `${text(row.prefix)}${String(nextNumber).padStart(numberDigits, "0")}${text(row.suffix)}`
}

const universalTaxTreatments = [
  ["domestic-standard", "Domestic standard", "domestic_standard", "both"],
  ["reduced-rate", "Reduced rate", "reduced_rate", "both"],
  ["zero-rated", "Zero rated", "zero_rated", "both"],
  ["exempt", "Exempt", "exempt", "both"],
  ["export", "Export", "export", "sales"],
  ["reverse-charge", "Reverse charge", "reverse_charge", "both"],
  ["out-of-scope", "Out of scope", "out_of_scope", "both"],
] as const

const defaultSequences = [
  ["sales-invoice", "Sales invoice", "sl_invoice", "SI-"],
  ["customer-credit", "Customer credit note", "credit_note", "SC-"],
  ["purchase-invoice", "Purchase invoice", "pl_invoice", "PI-"],
  ["supplier-credit", "Supplier credit note", "debit_note", "PC-"],
] as const

// Finance-only compositions keep dense editors aligned without changing shared settings surfaces.
function FinancePanel({
  title,
  description,
  action,
  children,
  className = "",
}: ComponentProps<typeof SettingsPanel>) {
  return (
    <Surface
      padding="none"
      className={`@container/panel min-w-0 overflow-hidden ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
        <SectionHeader
          title={title}
          meta={description}
          metaPlacement="stacked"
          className="min-w-0 flex-1 basis-56"
          metaClassName="max-w-[80ch] text-pretty leading-5"
        />
        {action ? (
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {action}
          </div>
        ) : null}
      </div>
      <div className="divide-y divide-[var(--md-line)] shadow-[var(--md-stroke-top)]">
        {children}
      </div>
    </Surface>
  )
}

function FinanceToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  meta,
}: ComponentProps<typeof SettingsToggleRow>) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="cursor-pointer text-[13px] font-medium text-[var(--md-ink)]"
        >
          {title}
        </label>
        {description ? (
          <p
            id={`${id}-help`}
            className="mt-0.5 max-w-[70ch] text-pretty text-[12px] leading-5 text-[var(--md-text)]"
          >
            {description}
          </p>
        ) : null}
      </div>
      {meta}
      <Switch
        id={id}
        aria-describedby={description ? `${id}-help` : undefined}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  )
}

function FinanceFieldRow(props: ComponentProps<typeof SettingsFieldRow>) {
  return (
    <SettingsFieldRow
      {...props}
      className="gap-2 px-4 py-3 md:grid-cols-1 @min-[480px]/panel:grid-cols-[minmax(0,1fr)_180px] [&_p]:max-w-none [&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:min-w-0"
    />
  )
}

function noticeClass(tone: "default" | "danger" | "success" = "default") {
  if (tone === "danger")
    return "bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] text-[var(--md-red)]"
  if (tone === "success")
    return "bg-[var(--md-accent-a10)] text-[var(--md-green)]"
  return "bg-[var(--md-surface-soft)] text-[var(--md-text)]"
}

function Notice({
  tone = "default",
  children,
}: {
  tone?: "default" | "danger" | "success"
  children: ReactNode
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`grid grid-cols-[auto_1fr] gap-2.5 rounded-[var(--md-radius-lg)] px-4 py-3 text-[12px] leading-5 shadow-[var(--md-shadow-line)] ${noticeClass(tone)}`}
    >
      <AlertCircle className="mt-0.5 size-4" strokeWidth={1.4} />
      {children}
    </div>
  )
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string
  children: ReactNode
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[12px] font-medium text-[var(--md-text)]"
    >
      {children}
    </label>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
  ltr = false,
}: {
  id: string
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  ltr?: boolean
}) {
  return (
    <div className="min-w-0 space-y-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        className="tabular-nums"
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        data-i18n-skip={ltr ? true : undefined}
        dir={ltr ? "ltr" : undefined}
      />
    </div>
  )
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
}) {
  const { t } = useLanguage()
  const available = options.some((option) => option.value === value)
  return (
    <div className="min-w-0 space-y-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || "__none__"}
        onValueChange={(next) => onChange(next === "__none__" ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="w-full min-w-0 active:scale-[0.96] motion-reduce:transform-none"
        >
          <SelectValue placeholder={t("Choose an option")}>
            {value && !available ? value : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {value && !available ? (
            <SelectItem value={value} disabled>
              {value} · {t("Unavailable")}
            </SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem
              key={option.value || "__none__"}
              value={option.value || "__none__"}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function RowShell({
  title,
  meta,
  active = true,
  onRemove,
  children,
  compact = false,
  persisted = true,
}: {
  title: string
  meta?: string
  active?: boolean
  onRemove: () => void
  children: ReactNode
  compact?: boolean
  persisted?: boolean
}) {
  const { t } = useLanguage()
  const removeLabel = t(!persisted ? "Remove" : active ? "Disable" : "Disabled")
  if (compact)
    return (
      <div
        role="group"
        aria-label={title}
        className={`@container/record flex items-end gap-3 px-4 py-3 ${active ? "" : "bg-[var(--md-surface-soft)]"}`}
      >
        <div className="min-w-0 flex-1">{children}</div>
        <div className="shrink-0 pb-0.5">
          {!active ? (
            <p className="mb-1 text-[11px] text-[var(--md-subtle)]">
              {t("Disabled")}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-[var(--md-subtle)] hover:text-[var(--md-red)]"
            aria-label={`${removeLabel} ${title}`}
            disabled={persisted && !active}
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
            <span className="hidden @min-[600px]/record:inline">
              {removeLabel}
            </span>
          </Button>
        </div>
      </div>
    )
  return (
    <div
      className={`min-w-0 px-4 py-3 ${active ? "" : "bg-[var(--md-surface-soft)]"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="break-words text-[13px] font-medium text-[var(--md-ink)] [overflow-wrap:anywhere]"
            data-i18n-skip
          >
            {title}
            {!active ? (
              <span className="ml-2 text-[11px] font-normal text-[var(--md-subtle)]">
                {t("Disabled")}
              </span>
            ) : null}
          </p>
          {meta ? (
            <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{meta}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`${removeLabel} ${title}`}
          className="shrink-0 text-[var(--md-subtle)] hover:text-[var(--md-red)]"
          disabled={persisted && !active}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
          {removeLabel}
        </Button>
      </div>
      {children}
    </div>
  )
}

function buildDraft(
  setup: FinanceSetup,
  legalEntityId: string,
): FinanceAdministrationDraft {
  const entity = setup.legalEntities.find(
    (item) => item.LegalEntity_ID === legalEntityId,
  )
  const id = entity?.LegalEntity_ID ?? ""
  const administration = setup.administration
  const settings = administration.settings.find(
    (item) => item.FINSET_LegalEntityID === id,
  )
  const localisation = administration.localisations.find(
    (item) => item.FINLocSet_LegalEntityID === id,
  )
  const administrationJson = asRecord(
    settings?.FINSET_SettingsJSON?.administration,
  )
  const defaultsJson = asRecord(settings?.FINSET_SettingsJSON?.defaults)
  const entityAdministration = asRecord(
    asRecord(entity?.LegalEntity_SettingsJSON).financeAdministration,
  )
  const baseCurrency = (
    entity?.LegalEntity_BaseCurrencyCodeSnapshot ||
    settings?.FINSET_BaseCurrencyCode ||
    "GBP"
  ).toUpperCase()
  const countryCode = (entity?.LegalEntity_CountryCode || "GB").toUpperCase()
  const preferredLocalisationPack =
    administration.localisationPacks.find(
      (item) => item.FINLocPack_CountryCode === countryCode,
    ) ??
    administration.localisationPacks.find(
      (item) => item.FINLocPack_Code === "global-v1",
    )
  const existingNominals = administration.nominalAccounts.filter(
    (item) => item.FINNom_LegalEntityID === id,
  )
  // Start a new native ledger with the document/cash control codes. Operators can
  // add the actual/accrued chart for WIP after reviewing the base chart.
  const preferredTemplate = administration.chartTemplateAccounts.some(
    (item) => item.FINChartTemplate?.FINChartTemplate_Code === "freight-forwarder-v1",
  ) ? "freight-forwarder-v1" : "generic-v1"
  const templateNominals = administration.chartTemplateAccounts.filter(
    (item) => item.FINChartTemplate?.FINChartTemplate_Code === preferredTemplate,
  )
  const existingCurrencies = administration.currencies.filter(
    (item) => item.FINCurSet_LegalEntityID === id,
  )
  const existingTaxes = administration.taxCodes.filter(
    (item) => item.FINTax_LegalEntityID === id,
  )
  const existingJurisdictions = administration.taxJurisdictions.filter(
    (item) => item.FINTaxJur_LegalEntityID === id,
  )
  const existingSequences = administration.numberSequences.filter(
    (item) => item.FINSeq_LegalEntityID === id,
  )
  const existingTerms = administration.paymentTerms.filter(
    (item) => item.FINTerm_LegalEntityID === id,
  )
  const connectionIds = new Set(
    setup.connections
      .filter((item) => item.ACCIC_LegalEntityID === id)
      .map((item) => item.ACCIC_ID),
  )

  return {
    organisation: {
      baseCurrencyCode: baseCurrency,
      countryCode,
      taxRegistrationNo:
        entity?.LegalEntity_VATNumber ||
        localisation?.FINLocSet_TaxRegistrationNo ||
        "",
      reportingBasisCode:
        localisation?.FINLocSet_ReportingBasisCode || "accrual",
      accountingStandardCode: text(
        entityAdministration.accountingStandardCode,
        localisation?.FINLocPack?.FINLocPack_AccountingStandardCode || "IFRS",
      ),
      fiscalYearStartMonth: number(
        entityAdministration.fiscalYearStartMonth,
        1,
      ),
      timeZone: text(entityAdministration.timeZone, "Europe/London"),
      localisationPackCode:
        localisation?.FINLocPack?.FINLocPack_Code ||
        preferredLocalisationPack?.FINLocPack_Code ||
        "global-v1",
      effectiveFrom: localisation?.FINLocSet_EffectiveFrom || today(),
    },
    controls: {
      bankStatementImportProfiles: text(administrationJson.bankStatementImportProfiles, "[]"),
      nativeLedgerEnabled: settings?.FINSET_NativeLedgerEnabled ?? true,
      externalMirrorModeCode:
        settings?.FINSET_ExternalMirrorModeCode || "optional",
      defaultOperatingModelCode:
        settings?.FINSET_DefaultOperatingModelCode || "hybrid",
      autoCreateSalesInvoices:
        settings?.FINSET_AutoCreateSalesInvoices ?? false,
      autoCreatePurchaseAccruals:
        settings?.FINSET_AutoCreatePurchaseAccruals ?? true,
      autoPostLowRiskItems: settings?.FINSET_AutoPostLowRiskItems ?? false,
      useAccountingDateRules: settings?.FINSET_UseAccountingDateRules ?? true,
      blockLockedPeriodDirectPosting:
        settings?.FINSET_BlockLockedPeriodDirectPosting ?? true,
      defaultRoeProviderCode:
        settings?.FINSET_DefaultROEProviderCode || "accounting_provider",
      includeFxInOperationalProfit:
        settings?.FINSET_IncludeFXInOperationalProfit ?? false,
      requireFinanceReview: bool(administrationJson.requireFinanceReview, true),
      allowOperatorTaxOverride: bool(
        administrationJson.allowOperatorTaxOverride,
        false,
      ),
      allowOperatorAccountOverride: bool(
        administrationJson.allowOperatorAccountOverride,
        false,
      ),
      allowBackdatedPosting: bool(
        administrationJson.allowBackdatedPosting,
        false,
      ),
      postingLockDate: text(administrationJson.postingLockDate),
      exchangeRateSource: text(
        administrationJson.exchangeRateSource,
        "approved_manual",
      ),
      exchangeRateOverrideRequiresApproval: bool(
        administrationJson.exchangeRateOverrideRequiresApproval,
        true,
      ),
      exchangeRatePrecision: number(
        administrationJson.exchangeRatePrecision,
        6,
      ),
      allocationTolerance: number(administrationJson.allocationTolerance, 0.01),
      roundingTolerance: number(administrationJson.roundingTolerance, 0.01),
    },
    defaults: {
      salesPaymentTermCode: text(defaultsJson.salesPaymentTermCode, "NET30"),
      purchasePaymentTermCode: text(
        defaultsJson.purchasePaymentTermCode,
        "NET30",
      ),
      salesInvoiceSequenceCode: text(
        defaultsJson.salesInvoiceSequenceCode,
        "sales-invoice",
      ),
      customerCreditSequenceCode: text(
        defaultsJson.customerCreditSequenceCode,
        "customer-credit",
      ),
      purchaseInvoiceSequenceCode: text(
        defaultsJson.purchaseInvoiceSequenceCode,
        "purchase-invoice",
      ),
      supplierCreditSequenceCode: text(
        defaultsJson.supplierCreditSequenceCode,
        "supplier-credit",
      ),
      salesTaxCode: text(defaultsJson.salesTaxCode, "domestic-standard"),
      purchaseTaxCode: text(defaultsJson.purchaseTaxCode, "domestic-standard"),
    },
    taxSettings: {
      priceIncludesTax: bool(
        localisation?.FINLocSet_SettingsJSON?.priceIncludesTax,
        false,
      ),
      taxPointRule: text(
        localisation?.FINLocSet_SettingsJSON?.taxPointRule,
        "invoice_date",
      ),
      reverseChargeEnabled: bool(
        localisation?.FINLocSet_SettingsJSON?.reverseChargeEnabled,
        true,
      ),
      localAdviceConfirmed: bool(
        localisation?.FINLocSet_SettingsJSON?.localAdviceConfirmed,
        false,
      ),
    },
    currencies: existingCurrencies.length
      ? existingCurrencies.map((item) => ({
          _key: item.FINCurSet_ID,
          id: item.FINCurSet_ID,
          code: item.FINCurSet_CurrencyCode,
          name: item.FINCurSet_Name,
          decimalPlaces: item.FINCurSet_DecimalPlaces,
          roundingMethodCode: item.FINCurSet_RoundingMethodCode,
          toleranceAmount: item.FINCurSet_ToleranceAmount,
          permittedForQuote: item.FINCurSet_IsPermittedForQuote,
          permittedForInvoice: item.FINCurSet_IsPermittedForInvoice,
          isActive: item.FINCurSet_IsActive,
        }))
      : [
          {
            _key: key(),
            code: baseCurrency,
            name: baseCurrency,
            decimalPlaces: 2,
            roundingMethodCode: "round_half_up",
            toleranceAmount: 0.01,
            permittedForQuote: true,
            permittedForInvoice: true,
            isActive: true,
          },
        ],
    banks: administration.banks
      .filter((item) => item.FINBank_LegalEntityID === id)
      .map((item) => ({
        _key: item.FINBank_ID,
        id: item.FINBank_ID,
        code: item.FINBank_Code,
        name: item.FINBank_Name,
        currencyCode: item.FINBank_CurrencyCode,
        institutionName: item.FINBank_InstitutionName || "",
        accountHolderName: item.FINBank_AccountHolderName || "",
        accountNumberMasked: item.FINBank_AccountNumberMasked || "",
        ibanMasked: item.FINBank_IBANMasked || "",
        sortCodeMasked: item.FINBank_SortCodeMasked || "",
        bicMasked: item.FINBank_BICMasked || "",
        accountNumberLast4: "",
        ibanLast4: "",
        sortCodeLast4: "",
        bicLast4: "",
        countryCode: item.FINBank_CountryCode || countryCode,
        nominalAccountId: item.FINBank_NominalAccountID || "",
        isDefault: item.FINBank_IsDefault,
        allowReceipts: item.FINBank_AllowReceipts,
        allowPayments: item.FINBank_AllowPayments,
        isActive: item.FINBank_IsActive,
      })),
    nominalAccounts: existingNominals.length
      ? existingNominals.map((item) => ({
          _key: item.FINNom_ID,
          id: item.FINNom_ID,
          code: item.FINNom_Code,
          name: item.FINNom_Name,
          accountTypeCode: item.FINNom_AccountTypeCode,
          reportCategoryCode: item.FINNom_ReportCategoryCode || "",
          externalMappingHint: item.FINNom_ExternalMappingHint || "",
          isControlAccount: item.FINNom_IsControlAccount,
          controlTypeCode: item.FINNom_ControlTypeCode || "",
          allowManualPosting: item.FINNom_AllowManualPosting,
          isActive: item.FINNom_IsActive,
        }))
      : templateNominals.map((item) => ({
          _key: key(),
          code: item.FINChartTemplateAccount_Code,
          name: item.FINChartTemplateAccount_Name,
          accountTypeCode: item.FINChartTemplateAccount_TypeCode,
          reportCategoryCode: item.FINChartTemplateAccount_CategoryCode,
          externalMappingHint: "",
          isControlAccount: item.FINChartTemplateAccount_IsControlAccount,
          controlTypeCode: item.FINChartTemplateAccount_IsControlAccount
            ? item.FINChartTemplateAccount_Name.toLowerCase().replaceAll(
                " ",
                "_",
              )
            : "",
          allowManualPosting: !item.FINChartTemplateAccount_IsControlAccount,
          isActive: true,
        })),
    taxJurisdictions: existingJurisdictions.length
      ? existingJurisdictions.map((item) => ({
          _key: item.FINTaxJur_ID,
          id: item.FINTaxJur_ID,
          code: item.FINTaxJur_Code,
          name: item.FINTaxJur_Name,
          countryCode: item.FINTaxJur_CountryCode,
          authorityName: item.FINTaxJur_AuthorityName || "",
          registrationNo: item.FINTaxJur_RegistrationNo || "",
          effectiveFrom: item.FINTaxJur_EffectiveFrom,
          effectiveTo: item.FINTaxJur_EffectiveTo || "",
          isActive: item.FINTaxJur_IsActive,
        }))
      : [
          {
            _key: key(),
            code: `${countryCode}-TAX`,
            name: `${countryCode} tax jurisdiction`,
            countryCode,
            authorityName: "",
            registrationNo: entity?.LegalEntity_VATNumber || "",
            effectiveFrom: today(),
            effectiveTo: "",
            isActive: true,
          },
        ],
    taxCodes: existingTaxes.length
      ? existingTaxes.map((item) => ({
          _key: item.FINTax_ID,
          id: item.FINTax_ID,
          code: item.FINTax_Code,
          name: item.FINTax_Name,
          countryCode: item.FINTax_CountryCode || countryCode,
          ratePercent: item.FINTax_RatePercent,
          taxTypeCode: item.FINTax_TaxTypeCode,
          providerMappingHint: item.FINTax_ProviderMappingHint || "",
          isRecoverable: item.FINTax_IsRecoverable,
          isActive: item.FINTax_IsActive,
          effectiveFrom: item.FINTax_EffectiveFrom,
          effectiveTo: item.FINTax_EffectiveTo || "",
          jurisdictionId: item.FINTax_JurisdictionID || "",
          treatmentCategoryCode: item.FINTax_TreatmentCategoryCode,
          transactionTypeCode: item.FINTax_TransactionTypeCode,
          outputNominalId: item.FINTax_OutputNominalID || "",
          inputNominalId: item.FINTax_InputNominalID || "",
        }))
      : universalTaxTreatments.map(
          ([code, name, category, transactionType]) => ({
            _key: key(),
            code,
            name,
            countryCode,
            ratePercent: 0,
            taxTypeCode: "vat",
            providerMappingHint: "",
            isRecoverable: !["exempt", "out-of-scope"].includes(code),
            isActive: true,
            effectiveFrom: today(),
            effectiveTo: "",
            jurisdictionId: "",
            treatmentCategoryCode: category,
            transactionTypeCode: transactionType,
            outputNominalId: "",
            inputNominalId: "",
          }),
        ),
    numberSequences: existingSequences.length
      ? existingSequences.map((item) => ({
          _key: item.FINSeq_ID,
          id: item.FINSeq_ID,
          code: item.FINSeq_Code,
          name: item.FINSeq_Name,
          documentTypeCode: item.FINSeq_DocumentTypeCode || "",
          prefix: item.FINSeq_Prefix,
          suffix: item.FINSeq_Suffix,
          nextNumber: item.FINSeq_NextNumber,
          paddingLength: item.FINSeq_PaddingLength,
          resetPeriodCode: item.FINSeq_ResetPeriodCode,
          isActive: item.FINSeq_IsActive,
        }))
      : defaultSequences.map(([code, name, documentTypeCode, prefix]) => ({
          _key: key(),
          code,
          name,
          documentTypeCode,
          prefix,
          suffix: "",
          nextNumber: 1,
          paddingLength: 6,
          resetPeriodCode: "never",
          isActive: true,
        })),
    paymentTerms: existingTerms.length
      ? existingTerms.map((item) => ({
          _key: item.FINTerm_ID,
          id: item.FINTerm_ID,
          code: item.FINTerm_Code,
          name: item.FINTerm_Name,
          days: item.FINTerm_Days,
          dueDayOfMonth: item.FINTerm_DueDayOfMonth || "",
          endOfMonth: item.FINTerm_EndOfMonth,
          isCashAccount: item.FINTerm_IsCashAccount,
          isActive: item.FINTerm_IsActive,
        }))
      : [
          {
            _key: key(),
            code: "NET30",
            name: "30 days",
            days: 30,
            dueDayOfMonth: "",
            endOfMonth: false,
            isCashAccount: false,
            isActive: true,
          },
          {
            _key: key(),
            code: "CASH",
            name: "Due immediately",
            days: 0,
            dueDayOfMonth: "",
            endOfMonth: false,
            isCashAccount: true,
            isActive: true,
          },
        ],
    accountMappings: administration.accountMappings
      .filter((item) => connectionIds.has(item.ACCIAM_ConnectionID))
      .map((item) => ({
        _key: item.ACCIAM_ID,
        id: item.ACCIAM_ID,
        connectionId: item.ACCIAM_ConnectionID,
        directionCode: item.ACCIAM_DirectionCode,
        localContextCode: item.ACCIAM_LocalContextCode || "",
        providerAccountId: item.ACCIAM_ProviderAccountID,
        providerAccountCode: item.ACCIAM_ProviderAccountCode || "",
        providerAccountName: item.ACCIAM_ProviderAccountName || "",
        isDefault: item.ACCIAM_IsDefault,
        isActive: item.ACCIAM_IsActive,
      })),
    chargeMappings: administration.chargeMappings
      .filter((item) => connectionIds.has(item.ACCICM_ConnectionID))
      .map((item) => ({
        _key: item.ACCICM_ID,
        id: item.ACCICM_ID,
        connectionId: item.ACCICM_ConnectionID,
        localChargeCode: item.ACCICM_LocalChargeCodeSnapshot,
        directionCode: item.ACCICM_DirectionCode,
        providerItemId: item.ACCICM_ProviderItemID || "",
        providerItemCode: item.ACCICM_ProviderItemCode || "",
        providerItemName: item.ACCICM_ProviderItemName || "",
        providerAccountId: item.ACCICM_ProviderAccountID || "",
        isActive: item.ACCICM_IsActive,
      })),
    taxMappings: administration.taxMappings
      .filter((item) => connectionIds.has(item.ACCITM_ConnectionID))
      .map((item) => ({
        _key: item.ACCITM_ID,
        id: item.ACCITM_ID,
        connectionId: item.ACCITM_ConnectionID,
        localTaxCode: item.ACCITM_LocalTaxCode,
        localTaxDescription: item.ACCITM_LocalTaxDescription || "",
        countryCode: item.ACCITM_LocalCountryCode || countryCode,
        directionCode: item.ACCITM_DirectionCode,
        providerTaxId: item.ACCITM_ProviderTaxID || "",
        providerTaxCode: item.ACCITM_ProviderTaxCode,
        providerTaxName: item.ACCITM_ProviderTaxName || "",
        taxRatePercent: item.ACCITM_TaxRatePercent ?? "",
        isActive: item.ACCITM_IsActive,
      })),
  }
}

function completeness(
  setup: FinanceSetup,
  draft: FinanceAdministrationDraft,
  legalEntityId: string,
) {
  const activeConnection = setup.connections.some(
    (item) =>
      item.ACCIC_LegalEntityID === legalEntityId &&
      item.ACCIC_StatusCode === "active",
  )
  const mirrorMode = text(draft.controls.externalMirrorModeCode, "optional")
  const controls = activeRows(draft.nominalAccounts).filter(
    (item) => item.isControlAccount === true,
  ).length
  return [
    {
      label: "Organisation",
      ready:
        /^[A-Z]{3}$/.test(draft.organisation.baseCurrencyCode) &&
        /^[A-Z]{2}$/.test(draft.organisation.countryCode),
    },
    {
      label: "Multideck ledger",
      ready: draft.controls.nativeLedgerEnabled === true,
    },
    {
      label: "External mirror policy",
      ready: mirrorMode !== "required" || activeConnection,
    },
    { label: "Currencies", ready: activeRows(draft.currencies).length > 0 },
    { label: "Bank accounts", ready: activeRows(draft.banks).length > 0 },
    { label: "Control accounts", ready: controls >= 6 },
    {
      label: "Tax treatments",
      ready:
        activeRows(draft.taxCodes).length > 0 &&
        draft.taxSettings.localAdviceConfirmed === true,
    },
    {
      label: "Document numbering",
      ready: activeRows(draft.numberSequences).length >= 4,
    },
    {
      label: "Payment terms",
      ready: activeRows(draft.paymentTerms).length > 0,
    },
  ]
}

export function FinanceSetupPage({
  navigate,
  initialTab = "overview",
  currentUser,
}: {
  navigate: (path: string) => void
  initialTab?: FinanceSetupTab
  currentUser?: AuthUserSummary | null
}) {
  const { t } = useLanguage()
  const [setup, setSetup] = useState<FinanceSetup | null>(null)
  const [draft, setDraft] = useState<FinanceAdministrationDraft | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingChange, setPendingChange] = useState<
    { type: "refresh" | "discard" } | { type: "entity"; id: string } | null
  >(null)
  const saveInFlight = useRef(false)
  const [companies, setCompanies] = useState<
    Array<{
      name: string
      company_name?: string
      country?: string
      default_currency?: string
    }>
  >([])
  const [providerBusy, setProviderBusy] = useState<string | null>(null)
  const [providerForm, setProviderForm] = useState<FinanceConfigurationInput>({
    legalEntityId: "",
    chartTemplateCode: "freight-forwarder-v1",
    providerCode: "erpnext",
    externalCompany: "",
    countryCode: "GB",
    taxRegistrationNo: "",
    reportingBasisCode: "accrual",
    effectiveFrom: today(),
  })
  const baseline = useRef("")

  const load = useCallback(async (preferredEntityId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getFinanceSetup()
      setSetup(result)
      let rememberedEntityId = ""
      try {
        rememberedEntityId = sessionStorage.getItem("multideck.finance.daily.entity") || ""
      } catch { /* Browser storage may be unavailable. */ }
      const validEntityId = (id: string) =>
        result.legalEntities.some((item) => item.LegalEntity_ID === id)
      const entityId = validEntityId(preferredEntityId || "")
        ? preferredEntityId || ""
        : validEntityId(rememberedEntityId)
          ? rememberedEntityId
          : result.legalEntities.length === 1
            ? result.legalEntities[0].LegalEntity_ID
            : ""
      setSelectedEntityId(entityId)
      const nextDraft = entityId ? buildDraft(result, entityId) : null
      setDraft(nextDraft)
      baseline.current = nextDraft ? JSON.stringify(nextDraft) : ""
      const entity = result.legalEntities.find(
        (item) => item.LegalEntity_ID === entityId,
      )
      setProviderForm((current) => ({
        ...current,
        legalEntityId: entityId,
        chartTemplateCode: result.administration.chartTemplateAccounts.some(
          (item) => item.FINChartTemplate?.FINChartTemplate_Code === "freight-accrual-v1",
        ) ? "freight-accrual-v1" : current.chartTemplateCode,
        countryCode:
          entity?.LegalEntity_CountryCode || nextDraft?.organisation.countryCode || "GB",
        taxRegistrationNo: entity?.LegalEntity_VATNumber || "",
        externalCompany: entity?.preferredExternalCompany || "",
      }))
      if (result.erpNext.configured) {
        try {
          setCompanies((await getErpNextCompanies()).companies)
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "ERPNext companies could not be loaded.",
          )
        }
      } else setCompanies([])
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Finance administration could not be loaded.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  const tab = initialTab
  const bankAccountsSurface = tab === "banks"
  const statementProfiles: Array<Record<string, string>> = (() => {
    try {
      const value = JSON.parse(String(draft?.controls.bankStatementImportProfiles || "[]"))
      return Array.isArray(value) ? value.filter(item => item && typeof item === "object" && typeof item.id === "string") : []
    } catch { return [] }
  })()
  const updateStatementProfile = (id: string, patch: Record<string, string>) => {
    setDraft(current => current ? { ...current, controls: { ...current.controls, bankStatementImportProfiles: JSON.stringify(statementProfiles.map(profile => profile.id === id ? { ...profile, ...patch } : profile)) } } : current)
  }
  useEffect(() => {
    document.title = `${t(financeSetupTitleByTab[tab])} · Finance · Multideck`
  }, [tab, t])

  const setOrganisation = (
    patch: Partial<FinanceAdministrationDraft["organisation"]>,
  ) =>
    setDraft((current) =>
      current
        ? { ...current, organisation: { ...current.organisation, ...patch } }
        : current,
    )
  const setControls = (
    patch: Record<string, string | number | boolean | null>,
  ) =>
    setDraft((current) =>
      current
        ? { ...current, controls: { ...current.controls, ...patch } }
        : current,
    )
  const setDefaults = (
    patch: Record<string, string | number | boolean | null>,
  ) =>
    setDraft((current) =>
      current
        ? { ...current, defaults: { ...current.defaults, ...patch } }
        : current,
    )
  const setTaxSettings = (
    patch: Record<string, string | number | boolean | null>,
  ) =>
    setDraft((current) =>
      current
        ? { ...current, taxSettings: { ...current.taxSettings, ...patch } }
        : current,
    )
  const patchRow = (
    collection: keyof FinanceAdministrationDraft,
    row: DraftRow,
    patch: Record<string, unknown>,
  ) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            [collection]: (current[collection] as DraftRow[]).map(
              (candidate) =>
                rowKey(candidate) === rowKey(row)
                  ? { ...candidate, ...patch }
                  : candidate,
            ),
          }
        : current,
    )
  const addRow = (
    collection: keyof FinanceAdministrationDraft,
    value: Record<string, unknown>,
  ) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            [collection]: [
              ...(current[collection] as DraftRow[]),
              { _key: key(), ...value },
            ],
          }
        : current,
    )
  const removeRow = (
    collection: keyof FinanceAdministrationDraft,
    row: DraftRow,
  ) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            [collection]: row.id
              ? (current[collection] as DraftRow[]).map((candidate) =>
                  rowKey(candidate) === rowKey(row)
                    ? { ...candidate, isActive: false }
                    : candidate,
                )
              : (current[collection] as DraftRow[]).filter(
                  (candidate) => rowKey(candidate) !== rowKey(row),
                ),
          }
        : current,
    )
  const selectEntity = (legalEntityId: string) => {
    if (!setup?.legalEntities.some((item) => item.LegalEntity_ID === legalEntityId)) return
    const nextDraft = buildDraft(setup, legalEntityId)
    setSelectedEntityId(legalEntityId)
    setDraft(nextDraft)
    baseline.current = JSON.stringify(nextDraft)
    try { sessionStorage.setItem("multideck.finance.daily.entity", legalEntityId) } catch { /* Browser storage may be unavailable. */ }
    const entity = setup.legalEntities.find(
      (item) => item.LegalEntity_ID === legalEntityId,
    )
    setProviderForm((current) => ({
      ...current,
      legalEntityId,
      externalCompany: entity?.preferredExternalCompany || "",
      countryCode:
        entity?.LegalEntity_CountryCode || nextDraft.organisation.countryCode,
      taxRegistrationNo: entity?.LegalEntity_VATNumber || "",
    }))
  }

  const save = async () => {
    if (
      !draft ||
      !selectedEntityId ||
      saveInFlight.current ||
      !setup?.compatibility.current
    )
      return
    saveInFlight.current = true
    setSaving(true)
    try {
      const result = await saveFinanceAdministration(selectedEntityId, draft)
      toast.success(
        t(
          result.ready
            ? "Finance settings saved and ready."
            : "Finance settings saved with readiness items remaining.",
        ),
      )
      await load(selectedEntityId)
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : t("Finance settings could not be saved."),
      )
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  const prepareProvider = async () => {
    setProviderBusy("prepare")
    try {
      await createFinanceConfigurationRun(providerForm)
      toast.success(t("Accounting connection is ready for finance approval."))
      await load(selectedEntityId)
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : t("The accounting connection review could not be prepared."),
      )
    } finally {
      setProviderBusy(null)
    }
  }
  const approveProvider = async (runId: string) => {
    setProviderBusy(runId)
    try {
      await approveFinanceConfigurationRun(runId)
      toast.success(t("Accounting connection approved."))
      await load(selectedEntityId)
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : t("The accounting connection could not be approved."),
      )
    } finally {
      setProviderBusy(null)
    }
  }
  const retryDelivery = async (queueId: string) => {
    setProviderBusy(queueId)
    try {
      await processFinanceIntegrationQueue(queueId)
      toast.success(t("Accounts system delivery completed."))
      await load(selectedEntityId)
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : t("Accounts system delivery could not be completed."),
      )
      await load(selectedEntityId)
    } finally {
      setProviderBusy(null)
    }
  }

  const selectedEntity = setup?.legalEntities.find(
    (item) => item.LegalEntity_ID === selectedEntityId,
  )
  const checks =
    setup && draft ? completeness(setup, draft, selectedEntityId) : []
  const readyCount = checks.filter((item) => item.ready).length
  const latestRevision = setup?.administration.revisions.find(
    (item) =>
      item.FINAdminRevision_LegalEntityID === selectedEntityId &&
      item.FINAdminRevision_StatusCode === "approved",
  )
  const hasEdits = draft ? JSON.stringify(draft) !== baseline.current : false
  const dirty = draft
    ? !latestRevision || JSON.stringify(draft) !== baseline.current
    : false
  const entityConnections =
    setup?.connections.filter(
      (item) => item.ACCIC_LegalEntityID === selectedEntityId,
    ) ?? []
  const activeConnection = entityConnections.find(
    (item) => item.ACCIC_StatusCode === "active",
  )
  const tabs = [
    { id: "overview", label: t("Overview") },
    {
      id: "systems",
      label: t("Integrations"),
      value: String(entityConnections.length),
    },
    {
      id: "currencies",
      label: t("Currencies & FX"),
      value: String(draft ? activeRows(draft.currencies).length : 0),
    },
    {
      id: "ledger",
      label: t("General ledger"),
      value: String(draft ? activeRows(draft.nominalAccounts).length : 0),
    },
    {
      id: "tax",
      label: t("Tax"),
      value: String(draft ? activeRows(draft.taxCodes).length : 0),
    },
    { id: "documents", label: t("Documents") },
    { id: "mappings", label: t("Mappings") },
    { id: "compliance", label: t("Compliance") },
    { id: "controls", label: t("Controls & audit") },
  ]

  if (loading)
    return (
      <div
        className="grid min-h-72 place-items-center"
        role="status"
        aria-label={t("Loading finance settings")}
      >
        <DotGridLoader />
      </div>
    )
  if (setup && setup.legalEntities.length > 1 && !selectedEntityId)
    return (
      <div className="@container/finance min-w-0">
        <SettingsPageHeader title={t(bankAccountsSurface ? "Bank accounts" : "Finance administration")} icon={Landmark} />
        <div className="mt-3 max-w-xl rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <SelectField id="finance-admin-entity" label={t("Legal entity")} value="" onChange={selectEntity}
            options={setup.legalEntities.map((item) => ({ value: item.LegalEntity_ID, label: item.LegalEntity_Name }))} />
          <p className="mt-3 text-sm text-[var(--md-subtle)]">{t("Choose a legal entity to view and change its finance settings.")}</p>
        </div>
      </div>
    )
  if (!setup || !draft)
    return (
      <Notice tone="danger">
        <div>
          <p>{t(error || "Finance settings could not be loaded.")}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void load()}
          >
            {t("Try again")}
          </Button>
        </div>
      </Notice>
    )

  return (
    <div className="@container/finance min-w-0">
      <SettingsPageHeader
        title={t(bankAccountsSurface ? "Bank accounts" : "Finance administration")}
        descriptionPlacement="under-title"
        icon={Landmark}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigate(bankAccountsSurface ? "/finance/cash" : "/finance/receivables")
              }
            >
              {t(bankAccountsSurface ? "Open cashbook" : "Open sales ledger")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() =>
                hasEdits
                  ? setPendingChange({ type: "refresh" })
                  : void load(selectedEntityId)
              }
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
              {t("Refresh")}
            </Button>
          </div>
        }
      />
      <div className="mt-3 space-y-[var(--md-page-stack-gap-compact)]">
        {error ? <Notice tone="danger">{t(error)}</Notice> : null}
        {!setup.compatibility.current ? (
          <Notice tone="danger">
            <div>
              <p className="font-medium">
                {t("Finance service update required")}
              </p>
              <p className="mt-1">
                {t(
                  "Deploy the latest finance migration and finance-subledger Edge Function before editing these settings.",
                )}
              </p>
            </div>
          </Notice>
        ) : null}
        <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-4 py-3 shadow-[var(--md-shadow-line)] @min-[680px]/finance:grid-cols-[minmax(200px,300px)_minmax(0,1fr)] @min-[680px]/finance:items-center">
          <SelectField
            id="finance-admin-entity"
            label={t("Legal entity")}
            value={selectedEntityId}
            onChange={(id) =>
              hasEdits
                ? setPendingChange({ type: "entity", id })
                : selectEntity(id)
            }
            options={setup.legalEntities.map((item) => ({
              value: item.LegalEntity_ID,
              label: item.LegalEntity_Name,
            }))}
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] @min-[420px]/finance:grid-cols-4">
            <div>
              <p className="text-[var(--md-subtle)]">{t("Base currency")}</p>
              <p
                className="mt-1 font-medium text-[var(--md-ink)]"
                data-i18n-skip
                dir="ltr"
              >
                {draft.organisation.baseCurrencyCode}
              </p>
            </div>
            <div>
              <p className="text-[var(--md-subtle)]">{t("Country")}</p>
              <p
                className="mt-1 font-medium text-[var(--md-ink)]"
                data-i18n-skip
                dir="ltr"
              >
                {draft.organisation.countryCode}
              </p>
            </div>
            <div>
              <p className="text-[var(--md-subtle)]">{t("External mirror")}</p>
              <p className="mt-1 font-medium text-[var(--md-ink)]">
                {activeConnection
                  ? setup.providers.find(
                      (item) =>
                        item.code === activeConnection.ACCIC_ProviderCode,
                    )?.name
                  : t("Not connected")}
              </p>
            </div>
            <div>
              <p className="text-[var(--md-subtle)]">{t("Readiness")}</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="font-medium tabular-nums text-[var(--md-ink)]">
                  {readyCount}/{checks.length}
                </p>{" "}
                <StatusPill
                  tone={readyCount === checks.length ? "teal" : "amber"}
                >
                  {t(readyCount === checks.length ? "Ready" : "Needs setup")}
                </StatusPill>
              </div>
            </div>
          </div>
        </div>
        {!bankAccountsSurface ? (
          <TabsRail
            className="gap-4 [&>button]:h-11 [&>button]:text-[13px]"
            tabs={tabs}
            activeTab={tab}
            onChange={(value) =>
              navigate(financeSetupRouteByTab[value as FinanceSetupTab])
            }
          />
        ) : null}

        {tab === "overview" ? (
          <OverviewTab
            setup={setup}
            draft={draft}
            entityName={selectedEntity?.LegalEntity_Name || ""}
            checks={checks}
            latestRevision={latestRevision}
            setOrganisation={setOrganisation}
            t={t}
          />
        ) : null}
        {tab === "systems" ? (
          <SystemsTab
            setup={setup}
            selectedEntityId={selectedEntityId}
            connections={entityConnections}
            companies={companies}
            form={providerForm}
            setForm={setProviderForm}
            busy={providerBusy}
            prepare={prepareProvider}
            approve={approveProvider}
            retry={retryDelivery}
            navigate={navigate}
            t={t}
          />
        ) : null}
        {tab === "currencies" ? (
          <CurrenciesTab
            setup={setup}
            draft={draft}
            patchRow={patchRow}
            addRow={addRow}
            removeRow={removeRow}
            setOrganisation={setOrganisation}
            setControls={setControls}
            t={t}
          />
        ) : null}
        {tab === "banks" ? (
          <BanksTab
            key={selectedEntityId}
            setup={setup}
            draft={draft}
            patchRow={patchRow}
            addRow={addRow}
            removeRow={removeRow}
            t={t}
          />
        ) : null}
        {tab === "ledger" ? (
          <>
          <LedgerTab
            setup={setup}
            draft={draft}
            patchRow={patchRow}
            addRow={addRow}
            removeRow={removeRow}
            setDraft={setDraft}
            t={t}
          />
          <FinanceNominalStructurePanel key={selectedEntityId} entityId={selectedEntityId} accounts={setup.administration.nominalAccounts} chartDirty={Boolean(dirty)} />
          <FinanceMigrationPanel key={`migration-${selectedEntityId}`} entityId={selectedEntityId} baseCurrency={selectedEntity?.LegalEntity_BaseCurrencyCodeSnapshot || ""} chartDirty={Boolean(dirty)} canDeliverOpeningMirror={hasPermission(currentUser, "Finance.Integration.Manage")} canPrepareFX={hasPermission(currentUser, "Finance.Management.Prepare")} canPostFX={hasPermission(currentUser, "Finance.Management.Post")} />
          </>
        ) : null}
        {tab === "tax" ? (
          <TaxTab
            setup={setup}
            draft={draft}
            patchRow={patchRow}
            addRow={addRow}
            removeRow={removeRow}
            setOrganisation={setOrganisation}
            setTaxSettings={setTaxSettings}
            t={t}
          />
        ) : null}
        {tab === "documents" ? (
          <DocumentsTab
            setup={setup}
            draft={draft}
            patchRow={patchRow}
            addRow={addRow}
            removeRow={removeRow}
            setDefaults={setDefaults}
            t={t}
          />
        ) : null}
        {tab === "mappings" ? (
          <MappingsTab
            setup={setup}
            draft={draft}
            connections={entityConnections.filter((item) => item.ACCIC_StatusCode === "active")}
            connection={activeConnection}
            patchRow={patchRow}
            addRow={addRow}
            removeRow={removeRow}
            t={t}
          />
        ) : null}
        {tab === "compliance" ? (
          <ComplianceTab
            setup={setup}
            draft={draft}
            selectedEntityId={selectedEntityId}
            t={t}
          />
        ) : null}
        {tab === "controls" ? (
          <><ApprovalPolicyPanel key={selectedEntityId} entityId={selectedEntityId} baseCurrency={draft.organisation.baseCurrencyCode} t={t} />
          <ControlsTab
            setup={setup}
            draft={draft}
            selectedEntityId={selectedEntityId}
            setControls={setControls}
            t={t}
          /></>
        ) : null}

        {tab === "controls" && <FinancePanel
          title={t("Bank statement imports")}
          description={t("Bank-specific import profiles for this legal entity only. Review is always required; importing must not create ledger postings.")}
          action={<Button type="button" variant="outline" onClick={() => setControls({ bankStatementImportProfiles: JSON.stringify([...statementProfiles, { id: crypto.randomUUID(), name: "New bank format", bankId: "", format: "excel", dateFormat: "DD/MM/YYYY", headerRow: "1", dateColumn: "Date", descriptionColumn: "Description", debitColumn: "Money out", creditColumn: "Money in", referenceColumn: "Reference", balanceColumn: "Balance", pdfNotes: "" }]) })}>{t("Add bank format")}</Button>}
        >
          <div className="divide-y divide-[var(--md-line)]">
            {!statementProfiles.length && <p className="p-4 text-[13px] text-[var(--md-subtle)]">{t("Add a separate profile for each bank export layout. Different tenants can use different banks and formats.")}</p>}
            {statementProfiles.map(profile => <div key={profile.id} className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3"><p className="text-[13px] font-medium">{profile.name}</p><Button type="button" variant="ghost" aria-label={`${t("Remove format")} ${profile.name}`} onClick={() => setControls({ bankStatementImportProfiles: JSON.stringify(statementProfiles.filter(item => item.id !== profile.id)) })}>{t("Remove")}</Button></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field id={`statement-name-${profile.id}`} label={t("Format name")} value={profile.name || ""} onChange={name => updateStatementProfile(profile.id, { name })} />
                <SelectField id={`statement-bank-${profile.id}`} label={t("Bank account")} value={profile.bankId || ""} onChange={bankId => updateStatementProfile(profile.id, { bankId })} options={draft.banks.filter(bank => bank.id).map(bank => ({ value: text(bank.id), label: `${text(bank.code)} · ${text(bank.name)}` }))} />
                <SelectField id={`statement-format-${profile.id}`} label={t("File format")} value={profile.format || "excel"} onChange={format => updateStatementProfile(profile.id, { format })} options={[{ value: "excel", label: "Excel (.xlsx)" }, { value: "csv", label: "CSV" }, { value: "pdf", label: "PDF" }]} />
                <SelectField id={`statement-date-format-${profile.id}`} label={t("Date format")} value={profile.dateFormat || "DD/MM/YYYY"} onChange={dateFormat => updateStatementProfile(profile.id, { dateFormat })} options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map(value => ({ value, label: value }))} />
                {profile.format !== "pdf" && <>
                  <Field id={`statement-header-${profile.id}`} label={t("Header row")} type="number" value={profile.headerRow || "1"} onChange={headerRow => updateStatementProfile(profile.id, { headerRow })} />
                  {([["dateColumn", "Date column"], ["descriptionColumn", "Description column"], ["debitColumn", "Money out column"], ["creditColumn", "Money in column"], ["referenceColumn", "Reference column"], ["balanceColumn", "Balance column"]] as const).map(([field, label]) => <Field key={field} id={`statement-${field}-${profile.id}`} label={t(label)} value={profile[field] || ""} onChange={value => updateStatementProfile(profile.id, { [field]: value })} />)}
                </>}
              </div>
              {profile.format === "pdf" && <div className="space-y-1"><FieldLabel htmlFor={`statement-pdf-${profile.id}`}>{t("PDF layout notes")}</FieldLabel><textarea id={`statement-pdf-${profile.id}`} className="min-h-24 w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] p-3 text-[13px]" value={profile.pdfNotes || ""} onChange={event => updateStatementProfile(profile.id, { pdfNotes: event.target.value })} placeholder={t("Describe date, transaction, money in/out and balance columns, repeated page headers and debit/credit markers.")} /></div>}
              <p className="text-[12px] text-[var(--md-subtle)]">{t("Configuration only. Statement upload, extraction and reconciliation are not yet available. These profiles do not enable automatic posting.")}</p>
            </div>)}
          </div>
        </FinancePanel>}

        <div
          className={`${dirty ? "sticky bottom-0 z-20" : ""} flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-4 py-3 shadow-[var(--md-shadow-soft)]`}
        >
          <div className="text-[12px]">
            <p
              role="status"
              className={
                dirty
                  ? "font-medium text-[var(--md-ink)]"
                  : "text-[var(--md-subtle)]"
              }
            >
              {t(dirty ? "Unsaved changes" : "No unsaved changes")}
            </p>
            {latestRevision ? (
              <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">
                {t("Current revision")} {latestRevision.FINAdminRevision_Number}
              </p>
            ) : null}
            {!setup.compatibility.current ? (
              <p className="mt-1 text-[var(--md-red)]">
                {t("Update the finance service before saving.")}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {hasEdits ? (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => setPendingChange({ type: "discard" })}
              >
                {t("Discard")}
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={!dirty || saving || !setup.compatibility.current}
              onClick={() => void save()}
            >
              {saving ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {t(saving ? "Saving settings…" : "Save settings")}
            </Button>
          </div>
        </div>
        <Dialog
          open={pendingChange !== null}
          onOpenChange={(open) => {
            if (!open) setPendingChange(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("Discard unsaved changes?")}</DialogTitle>
              <DialogDescription>
                {t(
                  "Your changes have not been saved. Discarding returns these settings to the last loaded revision.",
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingChange(null)}
              >
                {t("Keep editing")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  const action = pendingChange
                  setPendingChange(null)
                  if (action?.type === "refresh") void load(selectedEntityId)
                  else
                    selectEntity(
                      action?.type === "entity" ? action.id : selectedEntityId,
                    )
                }}
              >
                {t("Discard changes")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function OverviewTab({
  setup,
  draft,
  entityName,
  checks,
  latestRevision,
  setOrganisation,
  t,
}: {
  setup: FinanceSetup
  draft: FinanceAdministrationDraft
  entityName: string
  checks: Array<{ label: string; ready: boolean }>
  latestRevision:
    FinanceSetup["administration"]["revisions"][number] | undefined
  setOrganisation: (
    patch: Partial<FinanceAdministrationDraft["organisation"]>,
  ) => void
  t: (value: string) => string
}) {
  const { language } = useLanguage()
  const completeChecks = checks.filter((item) => item.ready).length
  const percent = checks.length ? Math.round(completeChecks * 100 / checks.length) : 0
  return (
    <div className="grid items-stretch gap-3 @min-[900px]/finance:grid-cols-[minmax(0,1fr)_300px]">
      <FinancePanel title={t("Finance profile")}>
        <div className="grid gap-3 px-4 py-3 @min-[420px]/panel:grid-cols-2">
          <Field
            id="finance-entity-name"
            label={t("Legal entity")}
            value={entityName}
            onChange={() => {}}
            disabled
          />
          <SelectField
            id="finance-country"
            label={t("Country")}
            value={draft.organisation.countryCode}
            onChange={(countryCode) => setOrganisation({ countryCode })}
            options={setup.countries.map((item) => ({
              value: item.RN_Code,
              label: `${item.RN_Desc || item.RN_Code} · ${item.RN_Code}`,
            }))}
          />
          <SelectField
            id="finance-base-currency"
            label={t("Base currency")}
            value={draft.organisation.baseCurrencyCode}
            onChange={(baseCurrencyCode) =>
              setOrganisation({ baseCurrencyCode })
            }
            options={setup.currencies.map((item) => ({
              value: item.Currency_Code,
              label: `${item.Currency_Code} · ${item.Currency_Name || item.Currency_Code}`,
            }))}
          />
          <Field
            id="finance-tax-registration"
            label={t("Tax registration number")}
            value={draft.organisation.taxRegistrationNo}
            onChange={(taxRegistrationNo) =>
              setOrganisation({ taxRegistrationNo })
            }
            ltr
          />
          <SelectField
            id="finance-reporting-basis"
            label={t("Reporting basis")}
            value={draft.organisation.reportingBasisCode}
            onChange={(reportingBasisCode) =>
              setOrganisation({ reportingBasisCode })
            }
            options={[
              { value: "accrual", label: t("Accrual") },
              { value: "cash", label: t("Cash") },
            ]}
          />
          <SelectField
            id="finance-accounting-standard"
            label={t("Accounting standard")}
            value={draft.organisation.accountingStandardCode}
            onChange={(accountingStandardCode) =>
              setOrganisation({ accountingStandardCode })
            }
            options={[
              { value: "IFRS", label: "IFRS" },
              { value: "UK_GAAP", label: "UK GAAP" },
              { value: "US_GAAP", label: "US GAAP" },
              { value: "LOCAL_GAAP", label: t("Local GAAP") },
            ]}
          />
          <SelectField
            id="finance-localisation-pack"
            label={t("Compliance pack")}
            value={draft.organisation.localisationPackCode}
            onChange={(localisationPackCode) =>
              setOrganisation({ localisationPackCode })
            }
            options={setup.administration.localisationPacks
              .filter(
                (item) =>
                  item.FINLocPack_CountryCode ===
                    draft.organisation.countryCode ||
                  item.FINLocPack_CountryCode === null,
              )
              .map((item) => ({
                value: item.FINLocPack_Code,
                label: `${item.FINLocPack_Name} · v${item.FINLocPack_Version}`,
              }))}
          />
          <SelectField
            id="finance-fiscal-month"
            label={t("Financial year starts")}
            value={String(draft.organisation.fiscalYearStartMonth)}
            onChange={(value) =>
              setOrganisation({ fiscalYearStartMonth: Number(value) })
            }
            options={Array.from({ length: 12 }, (_, index) => ({
              value: String(index + 1),
              label: new Intl.DateTimeFormat(language, {
                month: "long",
              }).format(new Date(2026, index, 1)),
            }))}
          />
          <Field
            id="finance-time-zone"
            label={t("Accounting time zone")}
            value={draft.organisation.timeZone}
            onChange={(timeZone) => setOrganisation({ timeZone })}
            ltr
          />
        </div>
      </FinancePanel>
      <CustomsReadinessReview
        title="Transaction readiness"
        progressLabel="Finance readiness"
        completeChecks={completeChecks}
        totalChecks={checks.length}
        percent={percent}
        issues={[]}
        emptyTitle="Finance checks complete"
        emptyDescription=""
        renderFix={() => null}
        t={t}
        className="flex h-full flex-col rounded-[var(--md-radius-lg)] p-4"
        reviewContent={<div className="mt-4 divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">
          {checks.map((item) => <div key={item.label} className="flex min-h-7 items-center gap-2 py-1">
            {item.ready ? <CircleCheck aria-hidden="true" className="size-3.5 shrink-0 text-[var(--md-green)]" /> : <AlertCircle aria-hidden="true" className="size-3.5 shrink-0 text-[var(--md-red)]" />}
            <span className="min-w-0 flex-1 text-[12px] text-[var(--md-text)]">{t(item.label)}</span>
            <span className="text-[11px] text-[var(--md-subtle)]">{t(item.ready ? "Ready" : "Required")}</span>
          </div>)}
        </div>}
      >
        <div className="mt-auto pt-3 text-[11px] leading-4 text-[var(--md-subtle)]">
          {latestRevision ? (
            <>
              {t("Last saved revision")}{" "}
              {latestRevision.FINAdminRevision_Number} ·{" "}
              {new Intl.DateTimeFormat(language, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(latestRevision.FINAdminRevision_ApprovedAt))}
            </>
          ) : (
            t("No saved finance revision yet.")
          )}
        </div>
      </CustomsReadinessReview>
    </div>
  )
}

function SystemsTab({
  setup,
  selectedEntityId,
  connections,
  companies,
  form,
  setForm,
  busy,
  prepare,
  approve,
  retry,
  navigate,
  t,
}: {
  setup: FinanceSetup
  selectedEntityId: string
  connections: FinanceSetup["connections"]
  companies: Array<{
    name: string
    company_name?: string
    country?: string
    default_currency?: string
  }>
  form: FinanceConfigurationInput
  setForm: React.Dispatch<React.SetStateAction<FinanceConfigurationInput>>
  busy: string | null
  prepare: () => Promise<void>
  approve: (id: string) => Promise<void>
  retry: (id: string) => Promise<void>
  navigate: (path: string) => void
  t: (value: string) => string
}) {
  const selectedProvider = setup.providers.find(
    (item) => item.code === form.providerCode,
  )
  const runs = setup.runs.filter(
    (item) => item.FINConfigRun_LegalEntityID === selectedEntityId,
  )
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium", timeStyle: "short",
    }).format(new Date(value))
  const accountRecovery = (typeCode: string) =>
    ["sl_invoice", "credit_note", "customer_receipt"].includes(typeCode)
      ? { label: "Create or sync customer", route: "/customers?sync=accounting" }
      : { label: "Create or sync supplier", route: "/suppliers?sync=accounting" }
  return (
    <div className="space-y-[var(--md-page-stack-gap)]">
      <SettingsPanel title={t("Accounting")}>
        <div className="divide-y divide-[var(--md-line)]">
          {setup.providers.map((provider) => {
            const connection = connections.find(
              (item) =>
                item.ACCIC_ProviderCode === provider.code &&
                item.ACCIC_StatusCode === "active",
            )
            const ready = provider.enabled && provider.configured
            return (
              <SettingsIntegrationRow
                key={provider.code}
                logoSrc={accountingProviderLogos[provider.code]}
                title={provider.name}
                status={t(
                  connection
                    ? "Connected"
                    : ready
                      ? "Ready to connect"
                      : "Coming soon",
                )}
                statusTone={
                  connection ? "connected" : ready ? "ready" : "workspace"
                }
                action={
                  connection ? (
                    <CircleCheck
                      className="size-4 text-[var(--md-green)]"
                      aria-hidden="true"
                    />
                  ) : undefined
                }
              />
            )
          })}
        </div>
      </SettingsPanel>
      <SettingsPanel
        title={t("Prepare external mirror")}
        description={t(
          "A finance review checks the external company and base currency before mirroring is activated. No accounts system records are overwritten.",
        )}
      >
        <div className="grid gap-4 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
          <SelectField
            id="finance-provider"
            label={t("Accounts system")}
            value={form.providerCode}
            onChange={(providerCode) =>
              setForm((current) => ({
                ...current,
                providerCode: providerCode as AccountingProviderCode,
                externalCompany: "",
              }))
            }
            options={setup.providers.map((item) => ({
              value: item.code,
              label: `${item.name}${item.enabled ? "" : ` · ${t("planned")}`}`,
            }))}
          />
          <SelectField
            id="finance-chart-template"
            label={t("Chart template")}
            value={form.chartTemplateCode}
            onChange={(chartTemplateCode) =>
              setForm((current) => ({ ...current, chartTemplateCode }))
            }
            options={setup.chartTemplates.map((item) => ({
              value: item.FINChartTemplate_Code,
              label: item.FINChartTemplate_Name,
            }))}
          />
          {form.providerCode === "erpnext" ? (
            <SelectField
              id="finance-provider-company"
              label={t("ERPNext company")}
              value={form.externalCompany}
              onChange={(externalCompany) =>
                setForm((current) => ({ ...current, externalCompany }))
              }
              options={[
                { value: "", label: t("Choose company") },
                ...companies.map((item) => ({
                  value: item.name,
                  label: `${item.company_name || item.name}${item.default_currency ? ` · ${item.default_currency}` : ""}`,
                })),
              ]}
              disabled={!setup.erpNext.configured}
            />
          ) : (
            <Field
              id="finance-provider-company-disabled"
              label={t("Accounting company")}
              value=""
              onChange={() => {}}
              placeholder={t("Connector not enabled yet")}
              disabled
            />
          )}
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={
                busy !== null ||
                !selectedProvider?.enabled ||
                !selectedProvider.configured ||
                !form.externalCompany
              }
              onClick={() => void prepare()}
            >
              {busy === "prepare" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              {t("Prepare review")}
            </Button>
          </div>
        </div>
        {selectedProvider?.unavailableReason ? (
          <div className="px-5 pb-4 text-[12px] leading-5 text-[var(--md-subtle)]">
            {t(selectedProvider.unavailableReason)}
          </div>
        ) : null}
      </SettingsPanel>
      {runs.length ? (
        <SettingsPanel
          title={t("Connection review history")}
          description={t(
            "Every accounts system preflight and approval is retained with its date and time.",
          )}
        >
          <div className="divide-y divide-[var(--md-line)]">
            {runs.map((run) => (
              <div
                key={run.FINConfigRun_ID}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">
                    {run.FINChartTemplate?.FINChartTemplate_Name ||
                      t("Finance configuration")}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--md-subtle)]">
                    {run.FINConfigRun_ProviderCode} ·{" "}
                    <span>{t("External accounting company")}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--md-subtle)]">
                    <span>{t("Requested")}</span> ·{" "}
                    <time dateTime={run.FINConfigRun_RequestedAt}>
                      {dateTime(run.FINConfigRun_RequestedAt)}
                    </time>
                    {run.FINConfigRun_CompletedAt ? (
                      <>
                        {" "}· <span>{t("Completed")}</span> ·{" "}
                        <time dateTime={run.FINConfigRun_CompletedAt}>
                          {dateTime(run.FINConfigRun_CompletedAt)}
                        </time>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill
                    tone={
                      run.FINConfigRun_StatusCode === "completed"
                        ? "teal"
                        : run.approvalBlocker
                          ? "red"
                          : "amber"
                    }
                  >
                    {t(
                      run.approvalBlocker
                        ? "Needs corrected review"
                        : run.FINConfigRun_StatusCode.replaceAll("_", " "),
                    )}
                  </StatusPill>
                  {run.FINConfigRun_StatusCode === "awaiting_approval" &&
                  !run.approvalBlocker ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void approve(run.FINConfigRun_ID)}
                    >
                      {busy === run.FINConfigRun_ID ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <CircleCheck className="size-4" />
                      )}
                      {t("Approve")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </SettingsPanel>
      ) : null}
      {setup.integrationQueue.length ? (
        <SettingsPanel
          title={t("Mirror delivery attention")}
          description={t(
            "Correct the named account or mapping issue, then retry the same controlled delivery.",
          )}
        >
          <div className="divide-y divide-[var(--md-line)]">
            {setup.integrationQueue.map((item) => {
              const recovery = accountRecovery(item.typeCode)
              const mappingIssue = /customer|supplier|mapping/i.test(
                item.FINIntQ_LastError || "",
              )
              return (
                <div
                  key={item.FINIntQ_ID}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div>
                    <p
                      className="text-[13px] font-medium text-[var(--md-ink)]"
                      data-i18n-skip
                    >
                      {item.localNumber}
                    </p>
                    <p className="mt-1 max-w-3xl text-[12px] text-[var(--md-subtle)]">
                      {t(item.FINIntQ_LastError || "Mirror delivery is waiting.")}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--md-subtle)]">
                      {item.FINIntQ_LastAttemptAt ? (
                        <>
                          <span>{t("Last attempted")}</span> ·{" "}
                          <time dateTime={item.FINIntQ_LastAttemptAt}>
                            {dateTime(item.FINIntQ_LastAttemptAt)}
                          </time>
                        </>
                      ) : (
                        <>
                          <span>{t("Queued")}</span> ·{" "}
                          <time dateTime={item.FINIntQ_CreatedAt}>
                            {dateTime(item.FINIntQ_CreatedAt)}
                          </time>
                        </>
                      )}{" "}
                      · <span data-i18n-skip dir="ltr">{item.FINIntQ_AttemptCount}</span>{" "}
                      {t(item.FINIntQ_AttemptCount === 1 ? "attempt" : "attempts")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {mappingIssue ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => navigate(recovery.route)}
                        >
                          <Plus className="size-4" />
                          {t(recovery.label)}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => navigate("/finance/mappings")}
                        >
                          {t("Review mappings")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigate("/finance/systems")}
                      >
                        {t("Review system setup")}
                      </Button>
                    )}
                    {item.retryAvailable ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void retry(item.FINIntQ_ID)}
                      >
                        {busy === item.FINIntQ_ID ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <RefreshCw className="size-4" />
                        )}
                        {t("Retry")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </SettingsPanel>
      ) : null}
    </div>
  )
}

type TabEditProps = {
  setup: FinanceSetup
  draft: FinanceAdministrationDraft
  patchRow: (
    collection: keyof FinanceAdministrationDraft,
    row: DraftRow,
    patch: Record<string, unknown>,
  ) => void
  addRow: (
    collection: keyof FinanceAdministrationDraft,
    value: Record<string, unknown>,
  ) => void
  removeRow: (
    collection: keyof FinanceAdministrationDraft,
    row: DraftRow,
  ) => void
  t: (value: string) => string
}

function CurrenciesTab({
  setup,
  draft,
  patchRow,
  addRow,
  removeRow,
  setOrganisation,
  setControls,
  t,
}: TabEditProps & {
  setOrganisation: (
    patch: Partial<FinanceAdministrationDraft["organisation"]>,
  ) => void
  setControls: (patch: Record<string, string | number | boolean | null>) => void
}) {
  return (
    <div className="grid items-start gap-3 @min-[1000px]/finance:grid-cols-[minmax(0,1fr)_340px]">
      <FinancePanel
        title={t("Operating currencies")}
        description={t("Currencies permitted on quotes and invoices.")}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              addRow("currencies", {
                code: "EUR",
                name: "Euro",
                decimalPlaces: 2,
                roundingMethodCode: "round_half_up",
                toleranceAmount: 0.01,
                permittedForQuote: true,
                permittedForInvoice: true,
                isActive: true,
              })
            }
          >
            <Plus className="size-4" />
            {t("Add currency")}
          </Button>
        }
      >
        <div className="divide-y divide-[var(--md-line)]">
          {(draft.currencies as DraftRow[]).map((row) => (
            <RowShell
              key={rowKey(row)}
              persisted={Boolean(row.id)}
              title={`${text(row.code, t("New currency"))} · ${text(row.name)}`}
              active={row.isActive !== false}
              onRemove={() => removeRow("currencies", row)}
            >
              <div className="grid gap-3 @min-[480px]/panel:grid-cols-[minmax(180px,1.6fr)_minmax(90px,1fr)_minmax(100px,1fr)]">
                <SelectField
                  id={`currency-code-${rowKey(row)}`}
                  label={t("Currency")}
                  value={text(row.code)}
                  onChange={(code) => {
                    patchRow("currencies", row, {
                      code,
                      name:
                        setup.currencies.find(
                          (item) => item.Currency_Code === code,
                        )?.Currency_Name || code,
                    })
                    if (text(row.code) === draft.organisation.baseCurrencyCode)
                      setOrganisation({ baseCurrencyCode: code })
                  }}
                  options={setup.currencies.map((item) => ({
                    value: item.Currency_Code,
                    label: `${item.Currency_Code} · ${item.Currency_Name || item.Currency_Code}`,
                  }))}
                />
                <Field
                  id={`currency-decimals-${rowKey(row)}`}
                  label={t("Decimal places")}
                  value={number(row.decimalPlaces, 2)}
                  type="number"
                  onChange={(value) =>
                    patchRow("currencies", row, {
                      decimalPlaces: Number(value),
                    })
                  }
                  ltr
                />
                <Field
                  id={`currency-tolerance-${rowKey(row)}`}
                  label={t("Rounding tolerance")}
                  value={number(row.toleranceAmount, 0.01)}
                  type="number"
                  onChange={(value) =>
                    patchRow("currencies", row, {
                      toleranceAmount: Number(value),
                    })
                  }
                  ltr
                />
                <div className="flex min-h-8 items-center justify-between gap-3">
                  <span className="text-[12px] text-[var(--md-text)]">
                    {t("Quotes")}
                  </span>
                  <Switch
                    aria-label={`${t("Quotes")} · ${text(row.code)}`}
                    checked={bool(row.permittedForQuote, true)}
                    onCheckedChange={(permittedForQuote) =>
                      patchRow("currencies", row, { permittedForQuote })
                    }
                  />
                </div>
                <div className="flex min-h-8 items-center justify-between gap-3">
                  <span className="text-[12px] text-[var(--md-text)]">
                    {t("Invoices")}
                  </span>
                  <Switch
                    aria-label={`${t("Invoices")} · ${text(row.code)}`}
                    checked={bool(row.permittedForInvoice, true)}
                    onCheckedChange={(permittedForInvoice) =>
                      patchRow("currencies", row, { permittedForInvoice })
                    }
                  />
                </div>
                <div className="flex min-h-8 items-center justify-between gap-3">
                  <span className="text-[12px] text-[var(--md-text)]">
                    {t("Active")}
                  </span>
                  <Switch
                    aria-label={`${t("Active")} · ${text(row.code)}`}
                    checked={row.isActive !== false}
                    onCheckedChange={(isActive) =>
                      patchRow("currencies", row, { isActive })
                    }
                  />
                </div>
              </div>
            </RowShell>
          ))}
        </div>
      </FinancePanel>
      <FinancePanel
        title={t("Foreign exchange rules")}
        description={t(
          "Approved rates are retained with each journal and shared with external accounting.",
        )}
      >
        <FinanceFieldRow
          label={t("Base currency")}
          labelFor="fx-base-currency"
          description={t("Reporting currency for this legal entity.")}
        >
          <Select
            value={draft.organisation.baseCurrencyCode}
            onValueChange={(baseCurrencyCode) =>
              setOrganisation({ baseCurrencyCode })
            }
          >
            <SelectTrigger id="fx-base-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeRows(draft.currencies).map((row) => (
                <SelectItem key={text(row.code)} value={text(row.code)}>
                  {text(row.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FinanceFieldRow>
        <FinanceFieldRow
          label={t("Exchange-rate source")}
          labelFor="fx-rate-source"
          description={t(
            "Use a source available independently of external accounting.",
          )}
        >
          <Select
            value={text(draft.controls.exchangeRateSource, "approved_manual")}
            onValueChange={(exchangeRateSource) =>
              setControls({ exchangeRateSource })
            }
          >
            <SelectTrigger id="fx-rate-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="approved_manual">
                {t("Approved manual rate")}
              </SelectItem>
              <SelectItem value="official_source">
                {t("Official source")}
              </SelectItem>
              <SelectItem value="accounting_provider">
                {t("External accounting mirror")}
              </SelectItem>
            </SelectContent>
          </Select>
        </FinanceFieldRow>
        <FinanceToggleRow
          title={t("Approve rate overrides")}
          description={t(
            "Finance must approve any rate that differs from the configured source.",
          )}
          checked={bool(
            draft.controls.exchangeRateOverrideRequiresApproval,
            true,
          )}
          onCheckedChange={(exchangeRateOverrideRequiresApproval) =>
            setControls({ exchangeRateOverrideRequiresApproval })
          }
        />
        <FinanceToggleRow
          title={t("Include FX in operational profit")}
          description={t(
            "Include realised and unrealised exchange movement in job profitability.",
          )}
          checked={bool(draft.controls.includeFxInOperationalProfit)}
          onCheckedChange={(includeFxInOperationalProfit) =>
            setControls({ includeFxInOperationalProfit })
          }
        />
      </FinancePanel>
    </div>
  )
}

function BanksTab({
  setup,
  draft,
  patchRow,
  addRow,
  removeRow,
  t,
}: TabEditProps) {
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [bankView, setBankView] = useState<"transactions" | "settings">("transactions")
  const [cash, setCash] = useState<FinanceCashTransaction[]>([])
  const [cashLoading, setCashLoading] = useState(false)
  const [cashError, setCashError] = useState("")
  const [cashRefresh, setCashRefresh] = useState(0)
  const selected = (draft.banks as DraftRow[]).find(row => rowKey(row) === selectedBank)
  useEffect(() => {
    if (!selectedBank || bankView !== "transactions") return
    let active = true
    setCashLoading(true); setCashError(""); setCash([])
    void getFinanceCash().then(result => { if (active) setCash(result.cashTransactions) })
      .catch(error => { if (active) setCashError(error instanceof Error ? error.message : "Could not load bank transactions.") })
      .finally(() => { if (active) setCashLoading(false) })
    return () => { active = false }
  }, [selectedBank, bankView, cashRefresh])
  const bankTransactions = selected?.id ? cash.filter(row => row.FINCash_BankAccountID === selected.id).sort((a,b) => b.FINCash_TransactionDate.localeCompare(a.FINCash_TransactionDate)) : []
  const bankMoney = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: text(selected?.currencyCode, "GBP") }).format(value)
  const activeCurrencies = activeRows(draft.currencies)
    .map((row) => text(row.code))
    .filter(Boolean)
  const bankNominals = activeRows(draft.nominalAccounts).filter(
    (row) =>
      text(row.id) &&
      (text(row.accountTypeCode).toLowerCase().includes("bank") ||
        text(row.controlTypeCode).includes("bank")),
  )
  if (selected && bankView === "transactions") return (
    <FinancePanel title={text(selected.name)} description={text(selected.code)} action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSelectedBank(null)}>{t("Back to banks")}</Button><Button variant="outline" onClick={() => setBankView("settings")}>{t("Bank settings")}</Button><Button variant="outline" disabled={cashLoading} onClick={() => setCashRefresh(value => value + 1)}>{t("Refresh")}</Button></div>}>
      <div className="space-y-4 p-4">
        <p className="text-[13px] text-[var(--md-text)]">{t("Recent cashbook transactions")} · {text(selected.currencyCode)}</p>
        {cashError ? <div role="alert"><p>{t(cashError)}</p><Button variant="outline" onClick={() => setCashRefresh(value => value + 1)}>{t("Try again")}</Button></div> : cashLoading ? <DotGridLoader label="Loading bank transactions" /> : <DataTable rows={bankTransactions} getRowKey={row => row.FINCash_ID} ariaLabel={t("Bank transactions")} minimumWidth={760} columns={[
          { id: "date", label: t("Date"), kind: "date", width: 110, cell: row => row.FINCash_TransactionDate },
          { id: "number", label: t("Transaction"), width: 140, cell: row => row.FINCash_Number || "—" },
          { id: "reference", label: t("Reference"), cell: row => row.FINCash_Reference || "—" },
          { id: "party", label: t("Name"), cell: row => row.partyName },
          { id: "in", label: t("Money in"), kind: "number", width: 120, cell: row => row.FINCash_TypeCode === "customer_receipt" ? bankMoney(row.FINCash_Amount) : "—" },
          { id: "out", label: t("Money out"), kind: "number", width: 120, cell: row => row.FINCash_TypeCode === "supplier_payment" ? bankMoney(row.FINCash_Amount) : "—" },
          { id: "status", label: t("Posting status"), cell: row => row.FINCash_NativePostingStatusCode },
        ]} emptyState={<p>{t("No cashbook transactions for this bank account.")}</p>} />}
      </div>
    </FinancePanel>
  )
  return (
    <FinancePanel
      title={selected ? text(selected.name) : t("Bank accounts")}
      description={t(
        "Enter only the last four characters of bank identifiers.",
      )}
      action={
        <div className="flex gap-2">{bankView === "settings" && <Button variant="outline" onClick={() => setBankView("transactions")}>{t(selected ? "Back to transactions" : "Back to banks")}</Button>}<Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setSelectedBank(null); setBankView("settings")
            addRow("banks", {
              code: `BANK-${draft.banks.length + 1}`,
              name: "New bank account",
              currencyCode: draft.organisation.baseCurrencyCode,
              institutionName: "",
              accountHolderName: "",
              accountNumberLast4: "",
              ibanLast4: "",
              sortCodeLast4: "",
              bicLast4: "",
              countryCode: draft.organisation.countryCode,
              nominalAccountId: text(bankNominals[0]?.id),
              isDefault: draft.banks.length === 0,
              allowReceipts: true,
              allowPayments: true,
              isActive: true,
            })
          }}
        >
          <Plus className="size-4" />
          {t("Add bank account")}
        </Button></div>
      }
    >
      {!selected && bankView === "transactions" ? <div className="p-4"><DataTable rows={draft.banks as DraftRow[]} getRowKey={rowKey} ariaLabel={t("Bank accounts")} minimumWidth={760} columns={[
        { id: "code", label: t("Code"), width: 140, cell: row => <Button variant="ghost" onClick={() => { setSelectedBank(rowKey(row)); setBankView(row.id ? "transactions" : "settings") }}>{text(row.code, t("New bank"))}</Button> },
        { id: "name", label: t("Account name"), cell: row => text(row.name) },
        { id: "bank", label: t("Bank name"), cell: row => text(row.institutionName) },
        { id: "currency", label: t("Currency"), width: 100, cell: row => text(row.currencyCode) },
        { id: "ending", label: t("Account ending"), width: 130, cell: row => text(row.accountNumberMasked) },
        { id: "status", label: t("Status"), width: 100, cell: row => t(row.isActive === false ? "Disabled" : "Active") },
      ]} emptyState={<p>{t("Add a bank account to get started.")}</p>} /></div> : <div className="divide-y divide-[var(--md-line)]">
        {draft.banks.length ? (
          (draft.banks as DraftRow[]).filter(row => !selected || rowKey(row) === selectedBank).map((row) => (
            <RowShell
              key={rowKey(row)}
              persisted={Boolean(row.id)}
              title={`${text(row.code, t("New bank"))} · ${text(row.name)}`}
              meta={
                [text(row.accountNumberMasked), text(row.ibanMasked)]
                  .filter(Boolean)
                  .join(" · ") || t("No masked identifier recorded")
              }
              active={row.isActive !== false}
              onRemove={() => removeRow("banks", row)}
            >
              <div className="grid gap-3 @min-[420px]/panel:grid-cols-2 @min-[760px]/panel:grid-cols-4">
                <Field
                  id={`bank-code-${rowKey(row)}`}
                  label={t("Code")}
                  value={text(row.code)}
                  onChange={(code) => patchRow("banks", row, { code })}
                  ltr
                />
                <Field
                  id={`bank-name-${rowKey(row)}`}
                  label={t("Account name")}
                  value={text(row.name)}
                  onChange={(name) => patchRow("banks", row, { name })}
                />
                <Field
                  id={`bank-institution-${rowKey(row)}`}
                  label={t("Bank name")}
                  value={text(row.institutionName)}
                  onChange={(institutionName) =>
                    patchRow("banks", row, { institutionName })
                  }
                />
                <Field
                  id={`bank-holder-${rowKey(row)}`}
                  label={t("Account holder")}
                  value={text(row.accountHolderName)}
                  onChange={(accountHolderName) =>
                    patchRow("banks", row, { accountHolderName })
                  }
                />
                <SelectField
                  id={`bank-currency-${rowKey(row)}`}
                  label={t("Currency")}
                  value={text(
                    row.currencyCode,
                    draft.organisation.baseCurrencyCode,
                  )}
                  onChange={(currencyCode) =>
                    patchRow("banks", row, { currencyCode })
                  }
                  options={activeCurrencies.map((code) => ({
                    value: code,
                    label: code,
                  }))}
                />
                <SelectField
                  id={`bank-country-${rowKey(row)}`}
                  label={t("Country")}
                  value={text(row.countryCode, draft.organisation.countryCode)}
                  onChange={(countryCode) =>
                    patchRow("banks", row, { countryCode })
                  }
                  options={setup.countries.map((item) => ({
                    value: item.RN_Code,
                    label: `${item.RN_Desc || item.RN_Code} · ${item.RN_Code}`,
                  }))}
                />
                <SelectField
                  id={`bank-nominal-${rowKey(row)}`}
                  label={t("Bank GL account")}
                  value={text(row.nominalAccountId)}
                  onChange={(nominalAccountId) =>
                    patchRow("banks", row, { nominalAccountId })
                  }
                  options={[
                    { value: "", label: t("Choose account") },
                    ...bankNominals.map((item) => ({
                      value: text(item.id),
                      label: `${text(item.code)} · ${text(item.name)}`,
                    })),
                  ]}
                />
              </div>
              <fieldset className="mt-3 grid gap-3 @min-[420px]/panel:grid-cols-2 @min-[760px]/panel:grid-cols-4">
                <legend className="mb-2 text-[12px] font-medium text-[var(--md-text)]">
                  {t("Bank identifiers · last four characters only")}
                </legend>
                <Field
                  id={`bank-account-last4-${rowKey(row)}`}
                  label={t("Account number ending")}
                  value={text(row.accountNumberLast4)}
                  onChange={(accountNumberLast4) =>
                    patchRow("banks", row, {
                      accountNumberLast4: accountNumberLast4.slice(-4),
                    })
                  }
                  placeholder={text(row.accountNumberMasked, "Last four only")}
                  ltr
                />
                <Field
                  id={`bank-iban-last4-${rowKey(row)}`}
                  label={t("IBAN ending")}
                  value={text(row.ibanLast4)}
                  onChange={(ibanLast4) =>
                    patchRow("banks", row, { ibanLast4: ibanLast4.slice(-4) })
                  }
                  placeholder={text(row.ibanMasked, "Last four only")}
                  ltr
                />
                <Field
                  id={`bank-sort-last4-${rowKey(row)}`}
                  label={t("Sort code ending")}
                  value={text(row.sortCodeLast4)}
                  onChange={(sortCodeLast4) =>
                    patchRow("banks", row, {
                      sortCodeLast4: sortCodeLast4.slice(-4),
                    })
                  }
                  placeholder={text(row.sortCodeMasked, "Last four only")}
                  ltr
                />
                <Field
                  id={`bank-bic-last4-${rowKey(row)}`}
                  label={t("BIC ending")}
                  value={text(row.bicLast4)}
                  onChange={(bicLast4) =>
                    patchRow("banks", row, { bicLast4: bicLast4.slice(-4) })
                  }
                  placeholder={text(row.bicMasked, "Last four only")}
                  ltr
                />
              </fieldset>
              <div className="col-span-full flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                <label className="flex min-h-8 items-center gap-2 text-[12px] text-[var(--md-text)]">
                  <Switch
                    checked={bool(row.isDefault)}
                    onCheckedChange={(isDefault) =>
                      patchRow("banks", row, { isDefault })
                    }
                  />
                  {t("Default")}
                </label>
                <label className="flex min-h-8 items-center gap-2 text-[12px] text-[var(--md-text)]">
                  <Switch
                    checked={bool(row.allowReceipts, true)}
                    onCheckedChange={(allowReceipts) =>
                      patchRow("banks", row, { allowReceipts })
                    }
                  />
                  {t("Receipts")}
                </label>
                <label className="flex min-h-8 items-center gap-2 text-[12px] text-[var(--md-text)]">
                  <Switch
                    checked={bool(row.allowPayments, true)}
                    onCheckedChange={(allowPayments) =>
                      patchRow("banks", row, { allowPayments })
                    }
                  />
                  {t("Payments")}
                </label>
              </div>
            </RowShell>
          ))
        ) : (
          <div className="px-5 py-10 text-center">
            <Wallet className="mx-auto size-6 text-[var(--md-subtle)]" />
            <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">
              {t("No bank accounts configured")}
            </p>
            <p className="mt-1 text-[12px] text-[var(--md-subtle)]">
              {t(
                "Add at least one bank account before posting receipts or payments.",
              )}
            </p>
          </div>
        )}
      </div>}
    </FinancePanel>
  )
}

function LedgerTab({
  setup,
  draft,
  patchRow,
  addRow,
  removeRow,
  setDraft,
  t,
}: TabEditProps & {
  setDraft: React.Dispatch<
    React.SetStateAction<FinanceAdministrationDraft | null>
  >
}) {
  const [search, setSearch] = useState("")
  const [statementView, setStatementView] = useState("all")
  const [showInactiveAccounts, setShowInactiveAccounts] = useState(false)
  const visibleAccounts = (draft.nominalAccounts as DraftRow[]).filter((row) =>
    (showInactiveAccounts || row.isActive !== false) &&
    (statementView === "all" || (statementView === "bs" ? ["asset", "liability", "equity"].includes(text(row.reportCategoryCode)) : statementView === "pl" ? ["income", "direct_cost", "expense", "finance"].includes(text(row.reportCategoryCode)) : !text(row.reportCategoryCode))) &&
    [row.code, row.name, row.accountTypeCode, row.reportCategoryCode, row.externalMappingHint].some(
      (value) =>
        text(value).toLowerCase().includes(search.trim().toLowerCase()),
    ),
  )
  const loadTemplate = (templateCode: string) =>
    setDraft((current) => {
      if (!current) return current
      const existing = new Set(
        current.nominalAccounts.map((item) => text(item.code)),
      )
      const additions = setup.administration.chartTemplateAccounts
        .filter(
          (item) =>
            item.FINChartTemplate?.FINChartTemplate_Code === templateCode &&
            !existing.has(item.FINChartTemplateAccount_Code),
        )
        .map((item) => ({
          _key: key(),
          code: item.FINChartTemplateAccount_Code,
          name: item.FINChartTemplateAccount_Name,
          accountTypeCode: item.FINChartTemplateAccount_TypeCode,
          reportCategoryCode: item.FINChartTemplateAccount_CategoryCode,
          externalMappingHint: "",
          isControlAccount: item.FINChartTemplateAccount_IsControlAccount,
          controlTypeCode: item.FINChartTemplateAccount_IsControlAccount
            ? item.FINChartTemplateAccount_Name.toLowerCase().replaceAll(
                " ",
                "_",
              )
            : "",
          allowManualPosting: !item.FINChartTemplateAccount_IsControlAccount,
          isActive: true,
        }))
      return {
        ...current,
        nominalAccounts: [...current.nominalAccounts, ...additions],
      }
    })
  return (
    <FinancePanel
      title={t("Chart of accounts")}
      description={t(
        "Accounts system records are never renamed or deleted automatically. Map posting accounts on the Mappings tab. Control accounts do not allow manual posting.",
      )}
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSearch("")
              loadTemplate("generic-v1")
            }}
          >
            {t("Add generic chart")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSearch("")
              loadTemplate(setup.administration.chartTemplateAccounts.some(
                (item) => item.FINChartTemplate?.FINChartTemplate_Code === "freight-accrual-v1",
              ) ? "freight-accrual-v1" : "freight-forwarder-v1")
            }}
          >
            {t("Add freight actual/accrued chart")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => (
              setSearch(""),
              addRow("nominalAccounts", {
                code: "",
                name: "",
                accountTypeCode: "Expense Account",
                externalMappingHint: "",
                isControlAccount: false,
                controlTypeCode: "",
                allowManualPosting: true,
                isActive: true,
              })
            )}
          >
            <Plus className="size-4" />
            {t("Add account")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="w-full max-w-sm">
          <label htmlFor="finance-account-search" className="sr-only">
            {t("Search accounts")}
          </label>
          <Input
            id="finance-account-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search by account code, name or type")}
          />
        </div>
        <Select value={statementView} onValueChange={setStatementView}><SelectTrigger aria-label={t("Financial statement")} className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All accounts")}</SelectItem><SelectItem value="bs">{t("Balance sheet")}</SelectItem><SelectItem value="pl">{t("Profit and loss")}</SelectItem><SelectItem value="unclassified">{t("Category from type")}</SelectItem></SelectContent></Select>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showInactiveAccounts} onChange={(event) => setShowInactiveAccounts(event.target.checked)} />{t("Show inactive accounts")}</label>
        <p
          role="status"
          className="text-[12px] tabular-nums text-[var(--md-subtle)]"
        >
          {visibleAccounts.length} {t("of")} {draft.nominalAccounts.length}{" "}
          {t("accounts")}
        </p>
      </div>
      <div className="divide-y divide-[var(--md-line)]">
        {!visibleAccounts.length ? (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--md-subtle)]">
            {t(
              search
                ? "No accounts match your search."
                : "Add an account or a chart template to get started.",
            )}
            {search ? (
              <Button
                type="button"
                variant="ghost"
                className="ml-2"
                onClick={() => setSearch("")}
              >
                {t("Clear search")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {visibleAccounts.length > 0 && <div className="max-h-[70vh] overflow-auto overscroll-none" tabIndex={0} role="region" aria-label={t("Chart of accounts")}>
          <table className="w-full min-w-[1160px] table-fixed text-[13px]">
            <caption className="sr-only">{t("Chart of accounts")}</caption>
            <colgroup><col className="w-[11%]" /><col className="w-[26%]" /><col className="w-[19%]" /><col className="w-[20%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[8%]" /></colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--md-surface-soft)] text-[var(--md-text)] shadow-[var(--md-stroke-bottom)]">
              <tr>{["Account code", "Account name", "Account type", "Report category", "Control account", "Manual posting", "Actions"].map(label => <th key={label} scope="col" className="px-3 py-2 text-left text-[12px] font-medium">{t(label)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[var(--md-line)]">
              {visibleAccounts.map(row => <tr key={rowKey(row)} className={row.isActive === false ? "bg-[var(--md-surface-soft)]" : ""}>
                <td className="px-3 py-2 [&_label]:sr-only"><Field id={`nominal-code-${rowKey(row)}`} label={t("Account code")} value={text(row.code)} onChange={code => patchRow("nominalAccounts", row, { code })} ltr /></td>
                <td className="px-3 py-2 [&_label]:sr-only"><Field id={`nominal-name-${rowKey(row)}`} label={t("Account name")} value={text(row.name)} onChange={name => patchRow("nominalAccounts", row, { name })} /></td>
                <td className="px-3 py-2 [&_label]:sr-only"><SelectField id={`nominal-type-${rowKey(row)}`} label={t("Account type")} value={text(row.accountTypeCode, "Expense Account")} onChange={accountTypeCode => patchRow("nominalAccounts", row, { accountTypeCode })} options={["Bank", "Receivable", "Payable", "Tax", "Current Asset", "Fixed Asset", "Current Liability", "Equity", "Income Account", "Cost of Goods Sold", "Expense Account"].map(value => ({ value, label: t(value) }))} /></td>
                <td className="px-3 py-2 [&_label]:sr-only"><SelectField id={`nominal-category-${rowKey(row)}`} label={t("Report category")} value={text(row.reportCategoryCode) || "automatic"} onChange={value => patchRow("nominalAccounts", row, { reportCategoryCode: value === "automatic" ? "" : value })} options={[
                  { value: "automatic", label: t("From account type") },
                  { value: "asset", label: t("BS · Assets") }, { value: "liability", label: t("BS · Liabilities") }, { value: "equity", label: t("BS · Equity") },
                  { value: "income", label: t("P&L · Revenue") }, { value: "direct_cost", label: t("P&L · Direct costs") }, { value: "expense", label: t("P&L · Expenses") }, { value: "finance", label: t("P&L · Finance") },
                ]} /></td>
                <td className="px-3 py-2"><Switch aria-label={`${t("Control account")} ${text(row.code)}`} checked={bool(row.isControlAccount)} onCheckedChange={isControlAccount => patchRow("nominalAccounts", row, { isControlAccount, allowManualPosting: isControlAccount ? false : row.allowManualPosting })} /></td>
                <td className="px-3 py-2"><Switch aria-label={`${t("Manual posting")} ${text(row.code)}`} checked={bool(row.allowManualPosting, true)} disabled={bool(row.isControlAccount)} onCheckedChange={allowManualPosting => patchRow("nominalAccounts", row, { allowManualPosting })} /></td>
                <td className="px-3 py-2"><Button type="button" size="sm" variant="ghost" disabled={Boolean(row.id) && row.isActive === false} aria-label={`${t(!row.id ? "Remove" : row.isActive === false ? "Disabled" : "Disable")} ${text(row.code)} ${text(row.name)}`} onClick={() => removeRow("nominalAccounts", row)}>{t(!row.id ? "Remove" : row.isActive === false ? "Disabled" : "Disable")}</Button></td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </div>
    </FinancePanel>
  )
}

function TaxTab({
  setup,
  draft,
  patchRow,
  addRow,
  removeRow,
  setOrganisation,
  setTaxSettings,
  t,
}: TabEditProps & {
  setOrganisation: (
    patch: Partial<FinanceAdministrationDraft["organisation"]>,
  ) => void
  setTaxSettings: (
    patch: Record<string, string | number | boolean | null>,
  ) => void
}) {
  const nominals = activeRows(draft.nominalAccounts).filter((row) =>
    text(row.id),
  )
  const jurisdictions = activeRows(draft.taxJurisdictions)
  return (
    <div className="space-y-[var(--md-page-stack-gap-compact)]">
      <Notice
        tone={
          draft.taxSettings.localAdviceConfirmed === true ? "success" : "danger"
        }
      >
        <div>
          <p className="font-medium">
            {t(
              draft.taxSettings.localAdviceConfirmed === true
                ? "Local tax advice confirmed"
                : "Local tax advice is required",
            )}
          </p>
          <p className="mt-1">
            {t(
              "Treatments have no statutory rates supplied. An authorised finance adviser must enter and approve the entity’s rates and effective dates.",
            )}
          </p>
        </div>
      </Notice>
      <div className="grid items-start gap-3 @min-[1100px]/finance:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <FinancePanel
          title={t("Tax registration & jurisdiction")}
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                addRow("taxJurisdictions", {
                  code: `${draft.organisation.countryCode}-TAX`,
                  name: "Tax jurisdiction",
                  countryCode: draft.organisation.countryCode,
                  authorityName: "",
                  registrationNo: draft.organisation.taxRegistrationNo,
                  effectiveFrom: today(),
                  effectiveTo: "",
                  isActive: true,
                })
              }
            >
              <Plus className="size-4" />
              {t("Add jurisdiction")}
            </Button>
          }
        >
          <div className="grid gap-3 px-4 py-3 @min-[420px]/panel:grid-cols-2">
            <Field
              id="tax-registration-main"
              label={t("Primary tax registration")}
              value={draft.organisation.taxRegistrationNo}
              onChange={(taxRegistrationNo) =>
                setOrganisation({ taxRegistrationNo })
              }
              ltr
            />
            <SelectField
              id="tax-reporting-basis"
              label={t("Reporting basis")}
              value={draft.organisation.reportingBasisCode}
              onChange={(reportingBasisCode) =>
                setOrganisation({ reportingBasisCode })
              }
              options={[
                { value: "accrual", label: t("Accrual") },
                { value: "cash", label: t("Cash") },
              ]}
            />
          </div>
          <div className="divide-y divide-[var(--md-line)]">
            {(draft.taxJurisdictions as DraftRow[]).map((row) => (
              <RowShell
                key={rowKey(row)}
                persisted={Boolean(row.id)}
                title={`${text(row.code)} · ${text(row.name)}`}
                active={row.isActive !== false}
                onRemove={() => removeRow("taxJurisdictions", row)}
              >
                <div className="grid gap-3 @min-[420px]/panel:grid-cols-2 @min-[880px]/panel:grid-cols-5">
                  <Field
                    id={`jur-code-${rowKey(row)}`}
                    label={t("Code")}
                    value={text(row.code)}
                    onChange={(code) =>
                      patchRow("taxJurisdictions", row, { code })
                    }
                    ltr
                  />
                  <Field
                    id={`jur-name-${rowKey(row)}`}
                    label={t("Name")}
                    value={text(row.name)}
                    onChange={(name) =>
                      patchRow("taxJurisdictions", row, { name })
                    }
                  />
                  <Field
                    id={`jur-authority-${rowKey(row)}`}
                    label={t("Tax authority")}
                    value={text(row.authorityName)}
                    onChange={(authorityName) =>
                      patchRow("taxJurisdictions", row, { authorityName })
                    }
                  />
                  <Field
                    id={`jur-registration-${rowKey(row)}`}
                    label={t("Registration number")}
                    value={text(row.registrationNo)}
                    onChange={(registrationNo) =>
                      patchRow("taxJurisdictions", row, { registrationNo })
                    }
                    ltr
                  />
                  <Field
                    id={`jur-effective-${rowKey(row)}`}
                    label={t("Effective from")}
                    value={text(row.effectiveFrom, today())}
                    type="date"
                    onChange={(effectiveFrom) =>
                      patchRow("taxJurisdictions", row, { effectiveFrom })
                    }
                    ltr
                  />
                </div>
              </RowShell>
            ))}
          </div>
        </FinancePanel>
        <FinancePanel title={t("Tax calculation rules")}>
          <FinanceToggleRow
            title={t("Prices include tax")}
            description={t("Treat entered line amounts as tax-inclusive.")}
            checked={bool(draft.taxSettings.priceIncludesTax)}
            onCheckedChange={(priceIncludesTax) =>
              setTaxSettings({ priceIncludesTax })
            }
          />
          <FinanceToggleRow
            title={t("Enable reverse charge")}
            description={t(
              "Allow approved reverse-charge treatments where local rules require them.",
            )}
            checked={bool(draft.taxSettings.reverseChargeEnabled, true)}
            onCheckedChange={(reverseChargeEnabled) =>
              setTaxSettings({ reverseChargeEnabled })
            }
          />
          <FinanceToggleRow
            title={t("Local advice confirmed")}
            description={t(
              "An authorised finance adviser has reviewed the rates, accounts and effective dates.",
            )}
            checked={bool(draft.taxSettings.localAdviceConfirmed)}
            onCheckedChange={(localAdviceConfirmed) =>
              setTaxSettings({ localAdviceConfirmed })
            }
          />
        </FinancePanel>
      </div>
      <FinancePanel
        title={t("Tax treatments")}
        description={t(
          "Operators can select approved treatments only; they cannot enter rates or accounts system templates. For UK services supplied outside the UK, use the separate Box 6 treatment after reviewing the place of supply.",
        )}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              addRow("taxCodes", {
                code: "",
                name: "",
                countryCode: draft.organisation.countryCode,
                ratePercent: 0,
                taxTypeCode: "vat",
                providerMappingHint: "",
                isRecoverable: true,
                isActive: true,
                effectiveFrom: today(),
                effectiveTo: "",
                jurisdictionId: text(jurisdictions[0]?.id),
                treatmentCategoryCode: "domestic_standard",
                transactionTypeCode: "both",
                outputNominalId: "",
                inputNominalId: "",
              })
            }
          >
            <Plus className="size-4" />
            {t("Add treatment")}
          </Button>
        }
      >
        <div className="divide-y divide-[var(--md-line)]">
          {(draft.taxCodes as DraftRow[]).map((row) => (
            <RowShell
              key={rowKey(row)}
              persisted={Boolean(row.id)}
              title={`${text(row.code, t("New treatment"))} · ${text(row.name)}`}
              active={row.isActive !== false}
              onRemove={() => removeRow("taxCodes", row)}
            >
              <div className="grid gap-3 @min-[420px]/panel:grid-cols-2 @min-[760px]/panel:grid-cols-4">
                <Field
                  id={`tax-code-${rowKey(row)}`}
                  label={t("Code")}
                  value={text(row.code)}
                  onChange={(code) => patchRow("taxCodes", row, { code })}
                  ltr
                />
                <Field
                  id={`tax-name-${rowKey(row)}`}
                  label={t("Name")}
                  value={text(row.name)}
                  onChange={(name) => patchRow("taxCodes", row, { name })}
                />
                <Field
                  id={`tax-rate-${rowKey(row)}`}
                  label={t("Rate %")}
                  value={number(row.ratePercent)}
                  type="number"
                  onChange={(ratePercent) =>
                    patchRow("taxCodes", row, {
                      ratePercent: Number(ratePercent),
                    })
                  }
                  ltr
                />
                <SelectField
                  id={`tax-category-${rowKey(row)}`}
                  label={t("Treatment")}
                  value={text(row.treatmentCategoryCode, "domestic_standard")}
                  onChange={(treatmentCategoryCode) =>
                    patchRow("taxCodes", row, treatmentCategoryCode === "outside_uk_service_box6"
                      ? { treatmentCategoryCode, ratePercent: 0, transactionTypeCode: "sales", isRecoverable: false }
                      : { treatmentCategoryCode })
                  }
                  options={[
                    ...universalTaxTreatments.map(([, name, category]) => ({ value: category, label: t(name) })),
                    ...(text(row.countryCode, draft.organisation.countryCode) === "GB"
                      ? [{ value: "outside_uk_service_box6", label: t("Service supplied outside the UK · Box 6") }]
                      : []),
                    ...(!universalTaxTreatments.some(([, , category]) => category === text(row.treatmentCategoryCode))
                      && text(row.treatmentCategoryCode) !== "outside_uk_service_box6"
                      ? [{ value: text(row.treatmentCategoryCode), label: text(row.treatmentCategoryCode) }]
                      : []),
                  ]}
                />
                <SelectField
                  id={`tax-transaction-${rowKey(row)}`}
                  label={t("Applies to")}
                  value={text(row.transactionTypeCode, "both")}
                  onChange={(transactionTypeCode) =>
                    patchRow("taxCodes", row, { transactionTypeCode })
                  }
                  options={[
                    { value: "both", label: t("Sales & purchases") },
                    { value: "sales", label: t("Sales") },
                    { value: "purchase", label: t("Purchases") },
                  ]}
                />
                <SelectField
                  id={`tax-output-${rowKey(row)}`}
                  label={t("Output tax account")}
                  value={text(row.outputNominalId)}
                  onChange={(outputNominalId) =>
                    patchRow("taxCodes", row, { outputNominalId })
                  }
                  options={[
                    { value: "", label: t("Choose account") },
                    ...nominals.map((item) => ({
                      value: text(item.id),
                      label: `${text(item.code)} · ${text(item.name)}`,
                    })),
                  ]}
                />
                <SelectField
                  id={`tax-input-${rowKey(row)}`}
                  label={t("Input tax account")}
                  value={text(row.inputNominalId)}
                  onChange={(inputNominalId) =>
                    patchRow("taxCodes", row, { inputNominalId })
                  }
                  options={[
                    { value: "", label: t("Choose account") },
                    ...nominals.map((item) => ({
                      value: text(item.id),
                      label: `${text(item.code)} · ${text(item.name)}`,
                    })),
                  ]}
                />
                <label className="flex min-h-8 items-center gap-2 self-end text-[12px] text-[var(--md-text)]">
                  <Switch
                    checked={bool(row.isRecoverable, true)}
                    onCheckedChange={(isRecoverable) =>
                      patchRow("taxCodes", row, { isRecoverable })
                    }
                  />
                  {t("Recoverable")}
                </label>
              </div>
            </RowShell>
          ))}
        </div>
      </FinancePanel>
    </div>
  )
}

function DocumentsTab({
  setup,
  draft,
  patchRow,
  addRow,
  removeRow,
  setDefaults,
  t,
}: TabEditProps & {
  setDefaults: (patch: Record<string, string | number | boolean | null>) => void
}) {
  const terms = activeRows(draft.paymentTerms)
  const sequences = activeRows(draft.numberSequences)
  return (
    <div className="space-y-[var(--md-page-stack-gap-compact)]">
      <FinancePanel
        title={t("Document defaults")}
        description={t("Applied when a document is created.")}
      >
        <div className="grid gap-3 px-4 py-3 @min-[420px]/panel:grid-cols-2 @min-[880px]/panel:grid-cols-4">
          <SelectField
            id="default-sales-term"
            label={t("Sales payment terms")}
            value={text(draft.defaults.salesPaymentTermCode, "NET30")}
            onChange={(salesPaymentTermCode) =>
              setDefaults({ salesPaymentTermCode })
            }
            options={terms.map((item) => ({
              value: text(item.code),
              label: `${text(item.code)} · ${text(item.name)}`,
            }))}
          />
          <SelectField
            id="default-purchase-term"
            label={t("Purchase payment terms")}
            value={text(draft.defaults.purchasePaymentTermCode, "NET30")}
            onChange={(purchasePaymentTermCode) =>
              setDefaults({ purchasePaymentTermCode })
            }
            options={terms.map((item) => ({
              value: text(item.code),
              label: `${text(item.code)} · ${text(item.name)}`,
            }))}
          />
          <SelectField
            id="default-sales-sequence"
            label={t("Sales invoice sequence")}
            value={text(
              draft.defaults.salesInvoiceSequenceCode,
              "sales-invoice",
            )}
            onChange={(salesInvoiceSequenceCode) =>
              setDefaults({ salesInvoiceSequenceCode })
            }
            options={sequences
              .filter((item) => item.documentTypeCode === "sl_invoice")
              .map((item) => ({
                value: text(item.code),
                label: text(item.name),
              }))}
          />
          <SelectField
            id="default-purchase-sequence"
            label={t("Purchase invoice sequence")}
            value={text(
              draft.defaults.purchaseInvoiceSequenceCode,
              "purchase-invoice",
            )}
            onChange={(purchaseInvoiceSequenceCode) =>
              setDefaults({ purchaseInvoiceSequenceCode })
            }
            options={sequences
              .filter((item) => item.documentTypeCode === "pl_invoice")
              .map((item) => ({
                value: text(item.code),
                label: text(item.name),
              }))}
          />
        </div>
      </FinancePanel>
      <FinancePanel
        title={t("Payment terms")}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              addRow("paymentTerms", {
                code: "",
                name: "",
                days: 30,
                dueDayOfMonth: "",
                endOfMonth: false,
                isCashAccount: false,
                isActive: true,
              })
            }
          >
            <Plus className="size-4" />
            {t("Add terms")}
          </Button>
        }
      >
        <div className="divide-y divide-[var(--md-line)]">
          {(draft.paymentTerms as DraftRow[]).map((row) => (
            <RowShell
              key={rowKey(row)}
              persisted={Boolean(row.id)}
              title={`${text(row.code, t("New terms"))} · ${text(row.name)}`}
              active={row.isActive !== false}
              onRemove={() => removeRow("paymentTerms", row)}
            >
              <div className="grid gap-3 @min-[420px]/panel:grid-cols-2 @min-[880px]/panel:grid-cols-5">
                <Field
                  id={`term-code-${rowKey(row)}`}
                  label={t("Code")}
                  value={text(row.code)}
                  onChange={(code) => patchRow("paymentTerms", row, { code })}
                  ltr
                />
                <Field
                  id={`term-name-${rowKey(row)}`}
                  label={t("Name")}
                  value={text(row.name)}
                  onChange={(name) => patchRow("paymentTerms", row, { name })}
                />
                <Field
                  id={`term-days-${rowKey(row)}`}
                  label={t("Days")}
                  value={number(row.days, 30)}
                  type="number"
                  onChange={(days) =>
                    patchRow("paymentTerms", row, { days: Number(days) })
                  }
                  ltr
                />
                <label className="flex min-h-8 items-center gap-2 self-end text-[12px] text-[var(--md-text)]">
                  <Switch
                    checked={bool(row.endOfMonth)}
                    onCheckedChange={(endOfMonth) =>
                      patchRow("paymentTerms", row, { endOfMonth })
                    }
                  />
                  {t("End of month")}
                </label>
                <label className="flex min-h-8 items-center gap-2 self-end text-[12px] text-[var(--md-text)]">
                  <Switch
                    checked={bool(row.isCashAccount)}
                    onCheckedChange={(isCashAccount) =>
                      patchRow("paymentTerms", row, { isCashAccount })
                    }
                  />
                  {t("Due immediately")}
                </label>
              </div>
            </RowShell>
          ))}
        </div>
      </FinancePanel>
      <FinancePanel
        title={t("Document numbering")}
        description={t(
          "Assigned automatically to new finance documents.",
        )}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              addRow("numberSequences", {
                code: `finance-sequence:${key()}`,
                name: "New sequence",
                documentTypeCode: "sl_invoice",
                prefix: "",
                suffix: "",
                nextNumber: 1,
                paddingLength: 6,
                resetPeriodCode: "never",
                isActive: true,
              })
            }
          >
            <Plus className="size-4" />
            {t("Add sequence")}
          </Button>
        }
      >
        <div className="divide-y divide-[var(--md-line)]">
          {(draft.numberSequences as DraftRow[]).map((row) => (
            <RowShell
              key={rowKey(row)}
              persisted={Boolean(row.id)}
              title={text(row.name, t("New sequence"))}
              active={row.isActive !== false}
              onRemove={() => removeRow("numberSequences", row)}
            >
              <div className="grid gap-3 @min-[420px]/panel:grid-cols-2 @min-[760px]/panel:grid-cols-4">
                <Field
                  id={`sequence-name-${rowKey(row)}`}
                  label={t("Sequence name")}
                  value={text(row.name)}
                  onChange={(name) =>
                    patchRow("numberSequences", row, { name })
                  }
                />
                <SelectField
                  id={`sequence-type-${rowKey(row)}`}
                  label={t("Document type")}
                  value={text(row.documentTypeCode)}
                  onChange={(documentTypeCode) =>
                    patchRow("numberSequences", row, { documentTypeCode })
                  }
                  options={setup.administration.documentTypes.map((item) => ({
                    value: item.FINDT_Code,
                    label: t(item.FINDT_Name),
                  }))}
                />
                <Field
                  id={`sequence-prefix-${rowKey(row)}`}
                  label={t("Prefix")}
                  value={text(row.prefix)}
                  onChange={(prefix) =>
                    patchRow("numberSequences", row, { prefix })
                  }
                  ltr
                />
                <Field
                  id={`sequence-suffix-${rowKey(row)}`}
                  label={t("Suffix")}
                  value={text(row.suffix)}
                  onChange={(suffix) =>
                    patchRow("numberSequences", row, { suffix })
                  }
                  ltr
                />
                <Field
                  id={`sequence-next-${rowKey(row)}`}
                  label={t("Next number")}
                  value={number(row.nextNumber, 1)}
                  type="number"
                  onChange={(nextNumber) =>
                    patchRow("numberSequences", row, {
                      nextNumber: Number(nextNumber),
                    })
                  }
                  ltr
                />
                <Field
                  id={`sequence-padding-${rowKey(row)}`}
                  label={t("Number digits")}
                  value={number(row.paddingLength, 6)}
                  type="number"
                  onChange={(paddingLength) =>
                    patchRow("numberSequences", row, {
                      paddingLength: Number(paddingLength),
                    })
                  }
                  ltr
                />
                <SelectField
                  id={`sequence-reset-${rowKey(row)}`}
                  label={t("Reset")}
                  value={text(row.resetPeriodCode, "never")}
                  onChange={(resetPeriodCode) =>
                    patchRow("numberSequences", row, { resetPeriodCode })
                  }
                  options={[
                    { value: "never", label: t("Never") },
                    { value: "yearly", label: t("Yearly") },
                    { value: "monthly", label: t("Monthly") },
                  ]}
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-[12px] font-medium text-[var(--md-text)]">
                    {t("Next document")}
                  </p>
                  <div
                    className="flex min-h-9 items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] px-3 text-[13px] font-medium tabular-nums text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                    data-i18n-skip
                  >
                    {documentNumberExample(row)}
                  </div>
                </div>
              </div>
            </RowShell>
          ))}
        </div>
      </FinancePanel>
    </div>
  )
}

function NominalAccountMappingTable({
  setup,
  draft,
  connections,
  patchRow,
  addRow,
  removeRow,
  t,
}: TabEditProps & {
  connections: FinanceSetup["connections"]
}) {
  const [search, setSearch] = useState("")
  const [catalogs, setCatalogs] = useState<Record<string, { accounts: NominalMappingTarget[]; error?: string; loading?: boolean }>>({})
  const catalogConnections = connections.filter((item) => item.ACCIC_ProviderCode === "erpnext" || item.ACCIC_ProviderCode === "sage_50").map((item) => `${item.ACCIC_ProviderCode}:${item.ACCIC_ID}`).join(",")

  useEffect(() => {
    let cancelled = false
    const targets = catalogConnections ? catalogConnections.split(",").map((value) => {
      const [provider, id] = value.split(":")
      return { provider, id }
    }) : []
    setCatalogs(Object.fromEntries(targets.map(({ id }) => [id, { accounts: [], loading: true }])))
    for (const { provider, id } of targets) {
      const request = provider === "sage_50" ? getSage50NominalCatalog(id) : getErpNextAccountCatalog(id)
      request.then((catalog) => {
        if (!cancelled) setCatalogs((current) => ({ ...current, [id]: {
          accounts: catalog.accounts.filter((account) => account.name && account.is_group !== true && account.is_group !== 1),
        } }))
      }).catch((cause) => {
        if (!cancelled) setCatalogs((current) => ({ ...current, [id]: { accounts: [], error: cause instanceof Error ? cause.message : t("Accounts could not be loaded.") } }))
      })
    }
    return () => { cancelled = true }
  }, [catalogConnections, t])

  const nominals = draft.nominalAccounts as DraftRow[]
  const activeNominals = nominals.filter((row) => row.isActive !== false)
  const visible = activeNominals.filter((row) => `${text(row.code)} ${text(row.name)} ${text(row.accountTypeCode)}`.toLowerCase().includes(search.trim().toLowerCase()))
  const mappingFor = (nominal: DraftRow, connectionId: string) => (draft.accountMappings as DraftRow[])
    .find((row) => row.connectionId === connectionId && row.localContextCode === `nominal:${text(nominal.id)}` && row.isActive !== false)
  const activeConnection = connections.find((item) => item.ACCIC_StatusCode === "active")
  const mappedCount = activeConnection ? activeNominals.filter((nominal) => mappingFor(nominal, activeConnection.ACCIC_ID)).length : 0

  const choose = (nominal: DraftRow, connectionId: string, accountId: string) => {
    const existing = mappingFor(nominal, connectionId)
    if (!accountId) {
      if (existing) removeRow("accountMappings", existing)
      return
    }
    const account = catalogs[connectionId]?.accounts.find((item) => item.name === accountId)
    if (!account || !nominal.id) return
    const inactive = (draft.accountMappings as DraftRow[]).find((row) => row.connectionId === connectionId && row.localContextCode === `nominal:${nominal.id}`)
    const patch = { providerAccountId: account.name, providerAccountCode: account.account_number || account.name, providerAccountName: account.account_name || account.name, isActive: true }
    if (existing || inactive) patchRow("accountMappings", (existing || inactive)!, patch)
    else addRow("accountMappings", {
      connectionId,
      directionCode: text(nominal.reportCategoryCode) === "income" ? "sales" : "purchase",
      localContextCode: `nominal:${nominal.id}`,
      ...patch,
      isDefault: false,
    })
  }

  const suggestClearMatches = () => {
    let count = 0
    for (const connection of connections) {
      const catalog = catalogs[connection.ACCIC_ID]
      if (!catalog?.accounts.length) continue
      const candidates = activeNominals.map((nominal) => ({ nominal, account: suggestNominalAccount({
        code: text(nominal.code), name: text(nominal.name), reportCategoryCode: text(nominal.reportCategoryCode),
        accountTypeCode: text(nominal.accountTypeCode), isActive: nominal.isActive !== false,
      }, catalog.accounts, draft.organisation.baseCurrencyCode) }))
      const useCount = new Map<string, number>()
      for (const candidate of candidates) if (candidate.account) useCount.set(candidate.account.name, (useCount.get(candidate.account.name) ?? 0) + 1)
      for (const { nominal, account } of candidates) {
        if (account && useCount.get(account.name) === 1 && !mappingFor(nominal, connection.ACCIC_ID)) {
          choose(nominal, connection.ACCIC_ID, account.name)
          count++
        }
      }
    }
    toast.info(count ? t(`${count} clear nominal matches added. Review and save settings.`) : t("No additional clear matches found. Create separate accounts for unmapped codes in the linked system."))
  }

  return <FinancePanel
    title={t("Nominal code mappings")}
    description={t("Map every Multideck nominal code to each connected accounts system. Save changes with the finance administration action.")}
  >
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <label className="sr-only" htmlFor="nominal-mapping-search">{t("Search nominal codes")}</label>
      <Input id="nominal-mapping-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search code or name")} className="w-full max-w-sm" />
      <div className="flex items-center gap-3">
        <span role="status" className="text-[12px] tabular-nums text-[var(--md-subtle)]">{visible.length} {t("of")} {activeNominals.length} {t("active codes")}{activeConnection ? ` · ${mappedCount} ${t("mapped")}` : ""}</span>
        <Button type="button" variant="outline" size="sm" onClick={suggestClearMatches} disabled={!connections.some((connection) => catalogs[connection.ACCIC_ID]?.accounts.length)}>{t("Suggest clear matches")}</Button>
      </div>
    </div>
    {!connections.length ? <div className="px-4 pb-4 text-[13px] text-[var(--md-subtle)]">{t("Connect an accounts system in Integrations to start mapping.")}</div> : null}
    <div className="max-h-[70vh] overflow-auto overscroll-none" tabIndex={0} role="region" aria-label={t("Nominal code mapping table")}>
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <caption className="sr-only">{t("Nominal code mappings by accounts system")}</caption>
        <thead className="sticky top-0 z-10 bg-[var(--md-surface-soft)] text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-stroke-bottom)]"><tr>
          <th scope="col" className="min-w-28 px-4 py-2">{t("Multideck code")}</th>
          <th scope="col" className="min-w-52 px-4 py-2">{t("Account name")}</th>
          {connections.map((connection) => <th key={connection.ACCIC_ID} scope="col" className="min-w-64 px-4 py-2" data-i18n-skip>{setup.providers.find((provider) => provider.code === connection.ACCIC_ProviderCode)?.name || connection.ACCIC_Name} · {connection.ACCIC_Name}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-[var(--md-line)]">{visible.map((nominal) => <tr key={rowKey(nominal)} className={nominal.isActive === false ? "text-[var(--md-subtle)]" : undefined}>
          <th scope="row" className="px-4 py-2 font-medium" data-i18n-skip dir="ltr">{text(nominal.code)}{nominal.isActive === false ? ` · ${t("Inactive")}` : ""}</th>
          <td className="px-4 py-2" data-i18n-skip>{text(nominal.name)}</td>
          {connections.map((connection) => {
            const mapped = mappingFor(nominal, connection.ACCIC_ID)
            const catalog = catalogs[connection.ACCIC_ID]
            const supported = connection.ACCIC_ProviderCode === "erpnext" || connection.ACCIC_ProviderCode === "sage_50"
            const options = catalog?.accounts.map((account) => ({ value: account.name, label: `${account.account_number || account.name} · ${account.account_name || account.name}${account.root_type ? ` · ${account.root_type}` : ""}${account.account_currency ? ` · ${account.account_currency}` : ""}` })) ?? []
            return <td key={connection.ACCIC_ID} className="px-3 py-2 [&_label]:sr-only">
              <SelectField
                id={`nominal-target-${rowKey(nominal)}-${connection.ACCIC_ID}`}
                label={`${text(nominal.code)} ${text(nominal.name)} · ${connection.ACCIC_Name}`}
                value={text(mapped?.providerAccountId)}
                onChange={(value) => choose(nominal, connection.ACCIC_ID, value)}
                options={[{ value: "", label: t("Unmapped") }, ...options]}
                disabled={!supported || Boolean(catalog?.loading) || Boolean(catalog?.error) || !nominal.id || nominal.isActive === false}
              />
              {!supported ? <p className="mt-1 text-[11px] text-[var(--md-subtle)]">{t("Account list unavailable for this connector")}</p> : catalog?.loading ? <p className="mt-1 text-[11px] text-[var(--md-subtle)]">{t("Loading accounts…")}</p> : catalog?.error ? <p role="alert" className="mt-1 text-[11px] text-[var(--md-red)]">{catalog.error}</p> : null}
            </td>
          })}
        </tr>)}</tbody>
      </table>
      {!visible.length ? <p className="px-4 py-8 text-center text-[13px] text-[var(--md-subtle)]">{t("No nominal codes match your search.")}</p> : null}
    </div>
  </FinancePanel>
}

function MappingsTab({
  setup,
  draft,
  connections,
  connection,
  patchRow,
  addRow,
  removeRow,
  t,
}: TabEditProps & {
  connections: FinanceSetup["connections"]
  connection: FinanceSetup["connections"][number] | undefined
}) {
  return (
    <div className="space-y-[var(--md-page-stack-gap-compact)]">
      <NominalAccountMappingTable
        setup={setup}
        draft={draft}
        connections={connections}
        patchRow={patchRow}
        addRow={addRow}
        removeRow={removeRow}
        t={t}
      />
      {!connection ? <Notice>{t("Connect external accounting in Integrations to configure account, charge and tax mappings.")}</Notice> : null}
      {connection ? <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px]">
        <span className="text-[var(--md-subtle)]">{t("Mapping target")}</span>
        <span className="font-medium text-[var(--md-ink)]" data-i18n-skip>
          {connection.ACCIC_Name}
        </span>
      </div>
      <MappingPanel
        title={t("Control-account mappings")}
        description={t(
          "Receivables, payables, bank and tax controls → accounts system GL accounts.",
        )}
        collection="accountMappings"
        rows={(draft.accountMappings as DraftRow[]).filter((row) => row.connectionId === connection.ACCIC_ID && !text(row.localContextCode).startsWith("nominal:"))}
        add={() =>
          addRow("accountMappings", {
            connectionId: connection.ACCIC_ID,
            directionCode: "sales",
            localContextCode: "receivables_control",
            providerAccountId: "",
            providerAccountCode: "",
            providerAccountName: "",
            isDefault: false,
            isActive: true,
          })
        }
        patchRow={patchRow}
        removeRow={removeRow}
        render={(row) => (
          <div className="grid gap-3 @min-[420px]/panel:grid-cols-2 @min-[880px]/panel:grid-cols-5">
            <SelectField
              id={`map-direction-${rowKey(row)}`}
              label={t("Direction")}
              value={text(row.directionCode, "sales")}
              onChange={(directionCode) =>
                patchRow("accountMappings", row, { directionCode })
              }
              options={[
                { value: "sales", label: t("Sales") },
                { value: "purchase", label: t("Purchases") },
              ]}
            />
            <Field
              id={`map-context-${rowKey(row)}`}
              label={t("Multideck context")}
              value={text(row.localContextCode)}
              onChange={(localContextCode) =>
                patchRow("accountMappings", row, { localContextCode })
              }
              ltr
            />
            <Field
              id={`map-account-code-${rowKey(row)}`}
              label={t("Accounts system account code")}
              value={text(row.providerAccountCode)}
              onChange={(providerAccountCode) =>
                patchRow("accountMappings", row, {
                  providerAccountCode,
                  providerAccountId:
                    text(row.providerAccountId) || providerAccountCode,
                })
              }
              ltr
            />
            <Field
              id={`map-account-name-${rowKey(row)}`}
              label={t("Accounts system account name")}
              value={text(row.providerAccountName)}
              onChange={(providerAccountName) =>
                patchRow("accountMappings", row, { providerAccountName })
              }
            />
            <label className="flex min-h-8 items-center gap-2 self-end text-[12px] text-[var(--md-text)]">
              <Switch
                checked={bool(row.isDefault)}
                onCheckedChange={(isDefault) =>
                  patchRow("accountMappings", row, { isDefault })
                }
              />
              {t("Default")}
            </label>
          </div>
        )}
        t={t}
      />
      <MappingPanel
        title={t("Charge-code mappings")}
        description={t(
          "Freight charge codes → accounts system items and income or cost accounts.",
        )}
        collection="chargeMappings"
        rows={draft.chargeMappings as DraftRow[]}
        add={() =>
          addRow("chargeMappings", {
            connectionId: connection.ACCIC_ID,
            directionCode: "sales",
            localChargeCode: "ADHOC",
            providerItemId: "",
            providerItemCode: "",
            providerItemName: "",
            providerAccountId: "",
            isActive: true,
          })
        }
        patchRow={patchRow}
        removeRow={removeRow}
        render={(row) => (
          <div className="grid gap-3 @min-[420px]/panel:grid-cols-2 @min-[880px]/panel:grid-cols-5">
            <SelectField
              id={`charge-direction-${rowKey(row)}`}
              label={t("Direction")}
              value={text(row.directionCode, "sales")}
              onChange={(directionCode) =>
                patchRow("chargeMappings", row, { directionCode })
              }
              options={[
                { value: "sales", label: t("Sales") },
                { value: "purchase", label: t("Purchases") },
              ]}
            />
            <Field
              id={`charge-local-${rowKey(row)}`}
              label={t("Charge code")}
              value={text(row.localChargeCode)}
              onChange={(localChargeCode) =>
                patchRow("chargeMappings", row, { localChargeCode })
              }
              ltr
            />
            <Field
              id={`charge-item-${rowKey(row)}`}
              label={t("Accounts system item code")}
              value={text(row.providerItemCode)}
              onChange={(providerItemCode) =>
                patchRow("chargeMappings", row, { providerItemCode })
              }
              ltr
            />
            <Field
              id={`charge-item-name-${rowKey(row)}`}
              label={t("Accounts system item name")}
              value={text(row.providerItemName)}
              onChange={(providerItemName) =>
                patchRow("chargeMappings", row, { providerItemName })
              }
            />
            <Field
              id={`charge-account-${rowKey(row)}`}
              label={t("Accounts system account ID")}
              value={text(row.providerAccountId)}
              onChange={(providerAccountId) =>
                patchRow("chargeMappings", row, { providerAccountId })
              }
              ltr
            />
          </div>
        )}
        t={t}
      />
      <MappingPanel
        title={t("Tax mappings")}
        description={t(
          "Approved tax treatments → accounts system tax codes for sales or purchases.",
        )}
        collection="taxMappings"
        rows={draft.taxMappings as DraftRow[]}
        add={() =>
          addRow("taxMappings", {
            connectionId: connection.ACCIC_ID,
            directionCode: "sales",
            localTaxCode: "domestic-standard",
            localTaxDescription: "Domestic standard",
            countryCode: draft.organisation.countryCode,
            providerTaxId: "",
            providerTaxCode: "",
            providerTaxName: "",
            taxRatePercent: "",
            isActive: true,
          })
        }
        patchRow={patchRow}
        removeRow={removeRow}
        render={(row) => (
          <div className="grid gap-3 @min-[420px]/panel:grid-cols-2 @min-[880px]/panel:grid-cols-5">
            <SelectField
              id={`taxmap-direction-${rowKey(row)}`}
              label={t("Direction")}
              value={text(row.directionCode, "sales")}
              onChange={(directionCode) =>
                patchRow("taxMappings", row, { directionCode })
              }
              options={[
                { value: "sales", label: t("Sales") },
                { value: "purchase", label: t("Purchases") },
              ]}
            />
            <SelectField
              id={`taxmap-local-${rowKey(row)}`}
              label={t("Tax treatment")}
              value={text(row.localTaxCode)}
              onChange={(localTaxCode) =>
                patchRow("taxMappings", row, { localTaxCode })
              }
              options={activeRows(draft.taxCodes).map((item) => ({
                value: text(item.code),
                label: `${text(item.code)} · ${text(item.name)}`,
              }))}
            />
            <Field
              id={`taxmap-provider-${rowKey(row)}`}
              label={t("Accounts system tax code")}
              value={text(row.providerTaxCode)}
              onChange={(providerTaxCode) =>
                patchRow("taxMappings", row, { providerTaxCode })
              }
              ltr
            />
            <Field
              id={`taxmap-name-${rowKey(row)}`}
              label={t("Accounts system tax name")}
              value={text(row.providerTaxName)}
              onChange={(providerTaxName) =>
                patchRow("taxMappings", row, { providerTaxName })
              }
            />
            <Field
              id={`taxmap-rate-${rowKey(row)}`}
              label={t("Accounts system rate %")}
              value={text(row.taxRatePercent)}
              type="number"
              onChange={(taxRatePercent) =>
                patchRow("taxMappings", row, { taxRatePercent })
              }
              ltr
            />
          </div>
        )}
        t={t}
      />
      </> : null}
    </div>
  )
}

function MappingPanel({
  title,
  description,
  collection,
  rows,
  add,
  patchRow,
  removeRow,
  render,
  t,
}: {
  title: string
  description: string
  collection: "accountMappings" | "chargeMappings" | "taxMappings"
  rows: DraftRow[]
  add: () => void
  patchRow: TabEditProps["patchRow"]
  removeRow: TabEditProps["removeRow"]
  render: (row: DraftRow) => ReactNode
  t: (value: string) => string
}) {
  return (
    <FinancePanel
      title={title}
      description={description}
      action={
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="size-4" />
          {t("Add mapping")}
        </Button>
      }
    >
      <div className="divide-y divide-[var(--md-line)]">
        {rows.length ? (
          rows.map((row) => (
            <RowShell
              key={rowKey(row)}
              persisted={Boolean(row.id)}
              title={text(
                row.localContextCode || row.localChargeCode || row.localTaxCode,
                t("New mapping"),
              )}
              active={row.isActive !== false}
              onRemove={() => removeRow(collection, row)}
            >
              {render(row)}
            </RowShell>
          ))
        ) : (
          <div className="px-4 py-5 text-center text-[12px] text-[var(--md-subtle)]">
            {t("No mappings configured yet.")}
          </div>
        )}
      </div>
    </FinancePanel>
  )
}

function ComplianceTab({
  setup,
  draft,
  selectedEntityId,
  t,
}: {
  setup: FinanceSetup
  draft: FinanceAdministrationDraft
  selectedEntityId: string
  t: (value: string) => string
}) {
  const entity = setup.legalEntities.find(
    (item) => item.LegalEntity_ID === selectedEntityId,
  )
  const pack =
    setup.administration.localisationPacks.find(
      (item) =>
        item.FINLocPack_Code === draft.organisation.localisationPackCode,
    ) ??
    setup.administration.localisationPacks.find(
      (item) => item.FINLocPack_CountryCode === entity?.LegalEntity_CountryCode,
    )
  const obligations = pack
    ? setup.administration.complianceObligations.filter(
        (item) => item.FINCompliance_PackID === pack.FINLocPack_ID,
      )
    : []
  const registrationFor = (obligationId: string) =>
    setup.administration.complianceRegistrations.find(
      (item) =>
        item.FINComplianceReg_LegalEntityID === selectedEntityId &&
        item.FINComplianceReg_ObligationID === obligationId,
    )

  return (
    <div className="space-y-[var(--md-page-stack-gap-compact)]">
      <FinancePanel
        title={t("Jurisdiction pack")}
        description={t(
          "Accounting standard and authority requirements for this entity.",
        )}
      >
        {pack ? (
          <div className="grid gap-4 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-[11px] text-[var(--md-subtle)]">{t("Pack")}</p>
              <p className="mt-1 text-[13px] font-medium text-[var(--md-ink)]">
                {pack.FINLocPack_Name}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--md-subtle)]">
                {t("Accounting standard")}
              </p>
              <p
                className="mt-1 text-[13px] font-medium text-[var(--md-ink)]"
                data-i18n-skip
                dir="ltr"
              >
                {pack.FINLocPack_AccountingStandardCode || t("Local standard")}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--md-subtle)]">
                {t("Authority")}
              </p>
              <p className="mt-1 text-[13px] font-medium text-[var(--md-ink)]">
                {pack.FINLocPack_AuthorityName || t("Jurisdiction authorities")}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--md-subtle)]">
                {t("Pack status")}
              </p>
              <div className="mt-1">
                <StatusPill
                  tone={
                    pack.FINLocPack_ComplianceStatusCode === "production_ready"
                      ? "teal"
                      : "amber"
                  }
                >
                  {t(pack.FINLocPack_ComplianceStatusCode.replaceAll("_", " "))}
                </StatusPill>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-5 text-center text-[12px] text-[var(--md-subtle)]">
            {t("Choose a supported compliance pack in Overview.")}
          </div>
        )}
      </FinancePanel>
      <FinancePanel
        title={t("Compliance obligations")}
      >
        <div className="divide-y divide-[var(--md-line)]">
          {obligations.length ? (
            obligations.map((obligation) => {
              const registration = registrationFor(obligation.FINCompliance_ID)
              const requirement = asRecord(
                obligation.FINCompliance_RequirementsJSON,
              )
              return (
                <div key={obligation.FINCompliance_ID} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-medium text-[var(--md-ink)]">
                        {t(obligation.FINCompliance_Name)}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--md-subtle)]">
                        {t(obligation.FINCompliance_AuthorityName)} ·{" "}
                        {t(obligation.FINCompliance_FrequencyCode)} ·{" "}
                        {t(
                          obligation.FINCompliance_FilingChannelCode.replaceAll(
                            "_",
                            " ",
                          ),
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill
                        tone={
                          obligation.FINCompliance_ReadinessStatusCode ===
                          "production_ready"
                            ? "teal"
                            : "amber"
                        }
                      >
                        {t(
                          obligation.FINCompliance_ReadinessStatusCode.replaceAll(
                            "_",
                            " ",
                          ),
                        )}
                      </StatusPill>
                      <StatusPill
                        tone={
                          registration?.FINComplianceReg_StatusCode ===
                          "production_verified"
                            ? "teal"
                            : "neutral"
                        }
                      >
                        {t(
                          registration?.FINComplianceReg_StatusCode ||
                            "not registered",
                        )}
                      </StatusPill>
                    </div>
                  </div>
                  {typeof requirement.productionGate === "string" ? (
                    <p className="mt-3 text-[12px] leading-5 text-[var(--md-text)]">
                      <span className="font-medium">
                        {t("Production gate")}:
                      </span>{" "}
                      {t(requirement.productionGate)}
                    </p>
                  ) : null}
                  <a
                    className="mt-3 inline-flex text-[12px] font-medium text-[var(--md-accent)] hover:underline"
                    href={obligation.FINCompliance_SourceURL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Open authority guidance")}
                  </a>
                </div>
              )
            })
          ) : (
            <div className="px-4 py-5 text-center text-[12px] text-[var(--md-subtle)]">
              {t("No obligations are defined for this pack yet.")}
            </div>
          )}
        </div>
      </FinancePanel>
      <Notice>
        <div>
          <p className="font-medium">
            {t("Compliance foundation, not filing certification")}
          </p>
          <p className="mt-1">
            {t(
              "Packs define ledger, tax and reporting requirements. Direct filing remains disabled until authority approval, security testing and production access are complete.",
            )}
          </p>
          <p className="mt-1">
            {t(
              "Payroll is outside this finance scope. Calculations, submissions and employment-tax reporting are not included.",
            )}
          </p>
        </div>
      </Notice>{" "}
    </div>
  )
}

const approvalWorkflows: Array<{ code: FinanceApprovalWorkflow; label: string }> = [
  { code: "document", label: "Invoices and credit notes" },
  { code: "cash", label: "Receipts and payments" },
  { code: "payment_run", label: "Supplier payment runs" },
  { code: "purchase_order", label: "Supplier purchase orders" },
  { code: "supplier_match", label: "Supplier invoice matching" },
  { code: "charge_correction", label: "Charge corrections" },
  { code: "charge_case_resolution", label: "Charge case resolution" },
  { code: "recognition_mandate", label: "Cost recognition mandate" },
  { code: "vat_control", label: "VAT control signoff" },
  { code: "period_close", label: "Accounting period close" },
  { code: "opening_balance", label: "Opening balances" },
  { code: "opening_fx", label: "Opening FX settlement" },
  { code: "bank_match", label: "Bank statement matching" },
]

function ApprovalPolicyPanel({ entityId, baseCurrency, t }: { entityId: string; baseCurrency: string; t: (value: string) => string }) {
  const [policies, setPolicies] = useState<FinanceApprovalPolicy[]>([])
  const [workflow, setWorkflow] = useState<FinanceApprovalWorkflow>("document")
  const [mode, setMode] = useState<FinanceApprovalMode>("always_review")
  const [amount, setAmount] = useState("")
  const [variance, setVariance] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const policy = policies.find((item) => item.workflow === workflow)

  useEffect(() => {
    let current = true
    getFinanceApprovalPolicies(entityId).then(({ policies: next }) => {
      if (current) { setPolicies(next); setError(null); setLoading(false) }
    }).catch((cause) => {
      if (current) { setError(cause instanceof Error ? cause.message : "Approval policies could not be loaded."); setLoading(false) }
    })
    return () => { current = false }
  }, [entityId])
  useEffect(() => {
    setMode(policy?.mode || "always_review")
    setAmount(policy?.maxAutoAmount == null ? "" : String(policy.maxAutoAmount))
    setVariance(policy?.maxVariancePercent == null ? "" : String(policy.maxVariancePercent))
    setReason("")
  }, [workflow, policy?.policyId])

  const save = async () => {
    if (busy || !reason.trim() || (mode !== "always_review" && !(Number(amount) >= 0 && amount.trim()))) return
    setBusy(true)
    setError(null)
    try {
      const saved = await saveFinanceApprovalPolicy(entityId, workflow, {
        mode,
        maxAutoAmount: mode === "always_review" ? null : Number(amount),
        maxVariancePercent: mode === "always_review" || !variance.trim() ? null : Number(variance),
        reason: reason.trim(),
      })
      setPolicies((current) => [...current.filter((item) => item.workflow !== workflow), saved])
      setReason("")
      toast.success(t("Approval policy saved."))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approval policy could not be saved.")
    } finally { setBusy(false) }
  }
  return <FinancePanel title={t("Workflow approval policies")} description={t("Choose when each legal entity workflow needs a person to review it. Every automatic decision is bounded and audited.")}>
    {error ? <Notice tone="danger">{t(error)}</Notice> : null}
    {loading ? <p className="text-sm text-[var(--md-subtle)]" role="status">{t("Loading approval policies…")}</p> : <div className="grid gap-4 @min-[760px]/finance:grid-cols-2">
      <SelectField id="approval-workflow" label={t("Workflow")} value={workflow} onChange={(value) => setWorkflow(value as FinanceApprovalWorkflow)}
        options={approvalWorkflows.map((item) => ({ value: item.code, label: t(item.label) }))} />
      <SelectField id="approval-mode" label={t("Approval mode")} value={mode} onChange={(value) => setMode(value as FinanceApprovalMode)} options={[
        { value: "always_review", label: t("Always review") },
        { value: "exception_review", label: t("Review exceptions") },
        { value: "automatic", label: t("Automatic within limits") },
      ]} />
      {mode !== "always_review" ? <>
        <div className="min-w-0 space-y-1"><FieldLabel htmlFor="approval-amount">{t("Maximum automatic amount")} · {baseCurrency}</FieldLabel>
          <Input id="approval-amount" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} data-i18n-skip dir="ltr" />
          <p className="text-xs text-[var(--md-subtle)]">{t("Amounts above this limit require review.")}</p></div>
        <div className="min-w-0 space-y-1"><FieldLabel htmlFor="approval-variance">{t("Maximum variance") } · % · {t("optional")}</FieldLabel>
          <Input id="approval-variance" type="number" min="0" max="100" step="0.01" value={variance} onChange={(event) => setVariance(event.target.value)} data-i18n-skip dir="ltr" />
          <p className="text-xs text-[var(--md-subtle)]">{t("If this workflow has no verified comparison amount, it will require review.")}</p></div>
      </> : null}
      <div className="min-w-0 space-y-1 @min-[760px]/finance:col-span-2"><FieldLabel htmlFor="approval-reason">{t("Reason for change")}</FieldLabel>
        <Input id="approval-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t("Explain this approval policy change")} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 @min-[760px]/finance:col-span-2">
        <p className="text-xs text-[var(--md-subtle)]">{policy ? `${t("Revision")} ${policy.revision} · ${t("Last reason")}: ${policy.reason}` : t("Default: always review")}</p>
        <Button type="button" disabled={busy || !reason.trim() || (mode !== "always_review" && (!amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0 || (variance.trim() !== "" && (!Number.isFinite(Number(variance)) || Number(variance) < 0 || Number(variance) > 100))))} onClick={() => void save()}>{t(busy ? "Saving…" : "Save approval policy")}</Button>
      </div>
    </div>}
  </FinancePanel>
}

function ControlsTab({
  setup,
  draft,
  selectedEntityId,
  setControls,
  t,
}: {
  setup: FinanceSetup
  draft: FinanceAdministrationDraft
  selectedEntityId: string
  setControls: (patch: Record<string, string | number | boolean | null>) => void
  t: (value: string) => string
}) {
  const { language } = useLanguage()
  const revisions = setup.administration.revisions.filter(
    (item) => item.FINAdminRevision_LegalEntityID === selectedEntityId,
  )
  return (
    <div className="space-y-[var(--md-page-stack-gap-compact)]">
      <div className="grid items-start gap-3 @min-[900px]/finance:grid-cols-2">
        <div className="space-y-3">
          <FinancePanel
            title={t("Ledger & external accounting")}
            description={t(
              "Multideck is the source of truth. External accounting is a reconciled copy.",
            )}
          >
            <FinanceFieldRow
              label={t("Native Multideck ledger")}
              description={t(
                "All approved finance documents and cash transactions post here first.",
              )}
            >
              <StatusPill tone="teal">{t("Enabled")}</StatusPill>
            </FinanceFieldRow>
            <FinanceFieldRow
              label={t("External accounting mirror")}
              labelFor="control-external-mirror"
              description={t(
                "Required: finance is not ready until an active connection exists.",
              )}
            >
              <Select
                value={text(draft.controls.externalMirrorModeCode, "optional")}
                onValueChange={(externalMirrorModeCode) =>
                  setControls({ externalMirrorModeCode })
                }
              >
                <SelectTrigger
                  id="control-external-mirror"
                  className="w-full sm:w-48"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">{t("Disabled")}</SelectItem>
                  <SelectItem value="optional">{t("Optional")}</SelectItem>
                  <SelectItem value="required">{t("Required")}</SelectItem>
                </SelectContent>
              </Select>
            </FinanceFieldRow>
          </FinancePanel>
          <FinancePanel
            title={t("Drafts & automation")}
            description={t(
              "Operations prepare drafts; Finance approves and posts.",
            )}
          >
            <FinanceToggleRow
              title={t("Auto-create sales invoice drafts")}
              description={t(
                "Create draft sales invoices from approved operational billing events.",
              )}
              checked={bool(draft.controls.autoCreateSalesInvoices)}
              onCheckedChange={(autoCreateSalesInvoices) =>
                setControls({ autoCreateSalesInvoices })
              }
            />
            <FinanceToggleRow
              title={t("Auto-create purchase accruals")}
              description={t(
                "Prepare purchase accrual drafts from approved supplier costs.",
              )}
              checked={bool(draft.controls.autoCreatePurchaseAccruals, true)}
              onCheckedChange={(autoCreatePurchaseAccruals) =>
                setControls({ autoCreatePurchaseAccruals })
              }
            />
          </FinancePanel>
        </div>
        <FinancePanel title={t("Posting & approval controls")}>
          <FinanceToggleRow
            title={t("Block locked-period posting")}
            description={t(
              "Prevent direct posting into closed or locked accounting periods.",
            )}
            checked={bool(draft.controls.blockLockedPeriodDirectPosting, true)}
            onCheckedChange={(blockLockedPeriodDirectPosting) =>
              setControls({ blockLockedPeriodDirectPosting })
            }
          />
          <FinanceToggleRow
            title={t("Allow operator tax override")}
            description={t(
              "When disabled, operators can select approved treatments only.",
            )}
            checked={bool(draft.controls.allowOperatorTaxOverride)}
            onCheckedChange={(allowOperatorTaxOverride) =>
              setControls({ allowOperatorTaxOverride })
            }
          />
          <FinanceToggleRow
            title={t("Allow operator GL override")}
            description={t(
              "When disabled, charge-code rules determine the nominal account.",
            )}
            checked={bool(draft.controls.allowOperatorAccountOverride)}
            onCheckedChange={(allowOperatorAccountOverride) =>
              setControls({ allowOperatorAccountOverride })
            }
          />
          <FinanceFieldRow
            label={t("Posting lock date")}
            labelFor="control-lock-date"
            description={t(
              "Transactions dated on or before this date cannot be posted directly.",
            )}
          >
            <Input
              id="control-lock-date"
              type="date"
              value={text(draft.controls.postingLockDate)}
              onChange={(event) =>
                setControls({ postingLockDate: event.target.value })
              }
              data-i18n-skip
              dir="ltr"
            />
          </FinanceFieldRow>
          <FinanceFieldRow
            label={t("Allocation tolerance")}
            labelFor="control-allocation-tolerance"
            description={t("Maximum permitted cash allocation difference.")}
          >
            <Input
              id="control-allocation-tolerance"
              type="number"
              step="0.01"
              min="0"
              value={number(draft.controls.allocationTolerance, 0.01)}
              onChange={(event) =>
                setControls({ allocationTolerance: Number(event.target.value) })
              }
              data-i18n-skip
              dir="ltr"
            />
          </FinanceFieldRow>
        </FinancePanel>
      </div>
      <FinancePanel
        title={t("Settings history")}
        description={t(
          "Earlier revisions remain available after later saves.",
        )}
      >
        <div className="divide-y divide-[var(--md-line)]">
          {revisions.length ? (
            revisions.map((revision) => (
              <div
                key={revision.FINAdminRevision_ID}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">
                    {t("Revision")} {revision.FINAdminRevision_Number}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--md-subtle)]">
                    {revision.FINAdminRevision_Reason || t("Settings saved")}{" "}
                    ·{" "}
                    {new Intl.DateTimeFormat(language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(revision.FINAdminRevision_ApprovedAt))}
                  </p>
                </div>
                <StatusPill
                  tone={
                    revision.FINAdminRevision_StatusCode === "approved"
                      ? "teal"
                      : "neutral"
                  }
                >
                  {t(
                    revision.FINAdminRevision_StatusCode === "approved"
                      ? "Saved"
                      : revision.FINAdminRevision_StatusCode,
                  )}
                </StatusPill>
              </div>
            ))
          ) : (
            <div className="px-4 py-5 text-center text-[12px] text-[var(--md-subtle)]">
              {t("No saved revisions yet.")}
            </div>
          )}
        </div>
      </FinancePanel>
    </div>
  )
}
