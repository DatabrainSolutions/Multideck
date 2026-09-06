import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Download,
  FileText,
  LockKeyhole,
  LoaderCircle,
  Plus,
  Trash2,
} from "@/components/icons/hugeicons";
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu";
import { Surface } from "@/components/multideck/surface";
import { TabsRail } from "@/components/multideck/workflow-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/i18n/language-provider";
import {
  getCustomerDocumentUrl,
  listCustomerDocuments,
  replaceAccountOperations,
  type AccountOperations,
  type ApiCustomerDetail,
  type ApiCustomerDocument,
  type CustomerReference,
} from "@/lib/customer-api";

export type AccountDetailTab =
  | "overview"
  | "contacts"
  | "addresses"
  | "financial"
  | "customs"
  | "documents"
  | "instructions"
  | "privacy"
  | `role:${string}`;

const blankOperations: AccountOperations = {
  roleProfiles: {},
  invoicePreferences: {},
  customs: {},
  privacy: {},
  instructions: [],
  documents: [],
  addressOperations: [],
};
const fieldClass =
  "h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-3 text-[16px] shadow-[var(--md-shadow-line)] sm:text-[13px]";
const roleFields: Record<string, Array<[string, string]>> = {
  customer: [
    ["customerReference", "Customer reference"],
    ["serviceLevel", "Default service level"],
    ["accountManagerNotes", "Customer handling notes"],
  ],
  "key account": [
    ["customerReference", "Customer reference"],
    ["serviceLevel", "Default service level"],
    ["escalationContact", "Escalation contact"],
  ],
  "key customer account": [
    ["customerReference", "Customer reference"],
    ["serviceLevel", "Default service level"],
    ["escalationContact", "Escalation contact"],
  ],
  "potential customer": [
    ["customerReference", "Customer reference"],
    ["serviceInterest", "Service interest"],
    ["qualificationNotes", "Qualification notes"],
  ],
  supplier: [
    ["supplierReference", "Supplier reference"],
    ["purchaseOrderRule", "Purchase order rule"],
    ["serviceScope", "Services supplied"],
  ],
  consignee: [
    ["releaseRequirements", "Release requirements"],
    ["collectionReferenceRule", "Collection reference rule"],
    ["deliveryContactRule", "Delivery contact rule"],
  ],
  shipper: [
    ["shipperReference", "Shipper reference"],
    ["cargoAvailabilityRule", "Cargo availability rule"],
    ["documentationCutoffRule", "Documentation cut-off rule"],
  ],
  "consignor/shipper": [
    ["shipperReference", "Shipper reference"],
    ["cargoAvailabilityRule", "Cargo availability rule"],
    ["documentationCutoffRule", "Documentation cut-off rule"],
  ],
  "customs broker": [
    ["brokerCode", "Broker code"],
    ["defermentAccount", "Deferment account"],
    ["clearanceEmail", "Clearance email"],
  ],
  "shipping line": [
    ["scacCode", "SCAC code"],
    ["carrierAccountNumber", "Carrier account number"],
    ["bookingPortal", "Booking portal"],
    ["documentationEmail", "Documentation email"],
  ],
  "overseas agent": [
    ["agentCode", "Agent code"],
    ["territory", "Territory"],
    ["timeZone", "Time zone"],
    ["settlementArrangement", "Settlement arrangement"],
  ],
};

function roleKey(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

const accountRoleTabOrder: Record<string, number> = {
  customer: 0,
  supplier: 1,
  agent: 2,
  "overseas agent": 2,
  consignor: 3,
  "consignor/shipper": 3,
  shipper: 3,
  consignee: 4,
};
function value(source: Record<string, unknown>, key: string) {
  return typeof source[key] === "string" ? String(source[key]) : "";
}
function stringList(source: Record<string, unknown>, key: string) {
  return Array.isArray(source[key])
    ? (source[key] as unknown[]).filter(
        (item): item is string => typeof item === "string",
      )
    : value(source, key)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}
function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function AccountDetailTabs({
  account,
  activeTab,
  onChange,
}: {
  account: ApiCustomerDetail;
  activeTab: AccountDetailTab;
  onChange: (tab: AccountDetailTab) => void;
}) {
  const { t } = useLanguage();
  const roleTabs = useMemo(
    () =>
      account.types
        .map(roleKey)
        .filter(
          (role, index, roles) =>
            role && role !== "company" && roles.indexOf(role) === index,
        )
        .map((role, index) => ({
          id: `role:${role}`,
          label: t(
            account.types.find((type) => roleKey(type) === role) ?? role,
          ),
          order: accountRoleTabOrder[role] ?? Number.MAX_SAFE_INTEGER,
          index,
        }))
        .sort((left, right) => left.order - right.order || left.index - right.index)
        .map(({ id, label }) => ({ id, label })),
    [account.types, t],
  );
  const financial = account.types.some((type) =>
    [
      "customer",
      "potential customer",
      "key account",
      "key customer account",
      "supplier",
    ].includes(roleKey(type)),
  );
  const tabs = [
    { id: "overview", label: t("Overview") },
    {
      id: "addresses",
      label: t("Addresses"),
      value: String(account.addresses.length),
    },
    {
      id: "contacts",
      label: t("Contacts"),
      value: String(account.contacts.length),
    },
    ...roleTabs,
    ...(financial ? [{ id: "financial", label: t("Financial") }] : []),
    { id: "customs", label: t("Customs") },
    {
      id: "documents",
      label: t("Documents"),
      value: String(account.operations?.documents.length ?? 0),
    },
    {
      id: "instructions",
      label: t("Instructions"),
      value: String(
        account.operations?.instructions.filter((item) => item.isActive)
          .length ?? 0,
      ),
    },
    { id: "privacy", label: t("Privacy") },
  ];
  return (
    <Surface
      padding="none"
      className="overflow-hidden rounded-[var(--md-radius-xl)]"
    >
      <TabsRail
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tab) => onChange(tab as AccountDetailTab)}
        className="px-4 sm:px-5"
      />
    </Surface>
  );
}

export function AccountOperationsPanel({
  account,
  activeTab,
  canManageFinancial,
  canManageBankDetails,
  currencyOptions,
  financeReference,
  onChange,
}: {
  account: ApiCustomerDetail;
  activeTab: Exclude<AccountDetailTab, "overview">;
  canManageFinancial: boolean;
  canManageBankDetails: boolean;
  currencyOptions: Array<{ code: string; name: string }>;
  financeReference: Pick<CustomerReference, "legalEntities" | "paymentTerms" | "taxTreatments">;
  onChange: (account: ApiCustomerDetail) => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<AccountOperations>(
    account.operations ?? blankOperations,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setDraft(account.operations ?? blankOperations);
    setError(null);
    setSaved(false);
  }, [account.id, account.operations]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await replaceAccountOperations(
        account.id,
        draft,
        account.editVersion,
      );
      onChange(updated);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("These account details could not be saved."),
      );
    } finally {
      setSaving(false);
    }
  }

  const body =
    activeTab === "contacts" ? (
      <Contacts account={account} />
    ) : activeTab === "addresses" ? (
      <Addresses account={account} draft={draft} setDraft={setDraft} />
    ) : activeTab === "financial" ? (
      <Financial
        draft={draft}
        setDraft={setDraft}
        canManageFinancial={canManageFinancial}
        canManageBankDetails={canManageBankDetails}
        currencyOptions={currencyOptions}
        financeReference={financeReference}
      />
    ) : activeTab === "customs" ? (
      <Customs draft={draft} setDraft={setDraft} />
    ) : activeTab === "documents" ? (
      <Documents account={account} draft={draft} setDraft={setDraft} />
    ) : activeTab === "instructions" ? (
      <Instructions account={account} draft={draft} setDraft={setDraft} />
    ) : activeTab === "privacy" ? (
      <Privacy draft={draft} setDraft={setDraft} />
    ) : (
      <RoleProfile
        role={activeTab.slice(5)}
        draft={draft}
        setDraft={setDraft}
      />
    );

  return (
    <Surface
      padding="none"
      className="overflow-hidden rounded-[var(--md-radius-xl)]"
      aria-live="polite"
    >
      <div className="px-4 py-4 sm:px-5">{body}</div>
      <footer className="flex flex-wrap items-center justify-end gap-3 bg-[var(--md-surface-soft)] px-4 py-3 shadow-[var(--md-stroke-top)] sm:px-5">
        {account.operations == null ? (
          <p
            role="status"
            className="me-auto text-[11.5px] text-[var(--md-amber)]"
          >
            {t(
              "Apply the account operations migration before saving this workspace.",
            )}
          </p>
        ) : saved ? (
          <p
            role="status"
            className="me-auto text-[11.5px] text-[var(--md-green)]"
          >
            {t("Account details saved")}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="me-auto text-[11.5px] text-[var(--md-red)]"
          >
            {error}
          </p>
        ) : null}
        {activeTab === "contacts" ? null : (
          <Button
            onClick={() => void save()}
            disabled={saving || account.operations == null || (activeTab === "financial" && !canManageFinancial)}
          >
            {saving ? t("Saving…") : t("Save changes")}
          </Button>
        )}
      </footer>
    </Surface>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  const { t } = useLanguage();
  return (
    <div className="mb-4">
      <h2 className="text-[14px] font-medium text-[var(--md-ink)]">
        {t(title)}
      </h2>
      <p className="mt-1 text-[11.5px] leading-4 text-[var(--md-subtle)]">
        {t(detail)}
      </p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <label className="grid min-w-0 gap-1.5 text-[11.5px] font-medium text-[var(--md-text)]">
      <span>{t(label)}</span>
      {children}
    </label>
  );
}

function ControlField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="grid min-w-0 gap-1.5 text-[11.5px] font-medium text-[var(--md-text)]">
      <span>{t(label)}</span>
      {children}
    </div>
  );
}

function Contacts({ account }: { account: ApiCustomerDetail }) {
  const { t } = useLanguage();
  return (
    <>
      <SectionTitle
        title="Linked contacts"
        detail="People are linked to this account through their current organisation relationship."
      />
      {account.contacts.length ? (
        <div className="overflow-x-auto rounded-[var(--md-radius-lg)] shadow-[var(--md-shadow-line)]">
          <table className="w-full min-w-[640px] text-start text-[12px]">
            <thead className="bg-[var(--md-surface-soft)] text-[10.5px] text-[var(--md-subtle)]">
              <tr>
                <th className="px-3 py-2 text-start font-medium">
                  {t("Name")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("Relationship")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("Email")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("Phone")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("Privacy")}
                </th>
              </tr>
            </thead>
            <tbody>
              {account.contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-t border-[var(--md-line)]"
                >
                  <td
                    className="px-3 py-2.5 font-medium text-[var(--md-ink)]"
                    dir="auto"
                  >
                    {contact.name}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--md-text)]">
                    {contact.jobTitle || contact.role || t("Contact")}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--md-text)]" dir="ltr">
                    {contact.email || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--md-text)]" dir="ltr">
                    {contact.phone || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--md-text)]">
                    {contact.consentMarketing
                      ? t("Marketing allowed")
                      : t("Operational only")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-6 text-center text-[12px] text-[var(--md-subtle)]">
          {t("No contacts are linked to this account yet.")}
        </p>
      )}
    </>
  );
}

function Addresses({ account, draft, setDraft }: Props) {
  const { t } = useLanguage();
  return (
    <>
      <SectionTitle
        title="Operational addresses"
        detail="Collection and delivery rules can flow into booking instructions."
      />
      <div className="grid gap-3">
        {account.addresses.map((address) => {
          const details = draft.addressOperations.find(
            (item) => item.addressId === address.id,
          ) ?? {
            addressId: address.id,
            appointmentRequired: false,
            advanceBookingHours: 0,
            bookingInstructions: null,
            collectionInstructions: null,
            deliveryInstructions: null,
          };
          const update = (change: Partial<typeof details>) =>
            setDraft({
              ...draft,
              addressOperations: [
                ...draft.addressOperations.filter(
                  (item) => item.addressId !== address.id,
                ),
                { ...details, ...change },
              ],
            });
          return (
            <fieldset
              key={address.id}
              className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]"
            >
              <legend className="px-1 text-[12.5px] font-medium text-[var(--md-ink)]">
                {address.name ||
                  address.line1 ||
                  address.townCity ||
                  t("Address")}
              </legend>
              <p className="mb-3 text-[11px] text-[var(--md-subtle)]">
                {address.capabilities.map((item) => t(item.name)).join(" · ") ||
                  t("No address type assigned")}
              </p>
              <p className="mb-3 text-[11px] text-[var(--md-text)]" dir="ltr">
                {address.weeklyHours.length
                  ? address.weeklyHours
                      .map(
                        (hours) =>
                          `${t(
                            [
                              "Sunday",
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                              "Saturday",
                            ][hours.dayOfWeek] ?? "Day",
                          )} ${hours.opensAt.slice(0, 5)}–${hours.closesAt.slice(0, 5)}`,
                      )
                      .join(" · ")
                  : t("No regular opening hours recorded")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2 text-[11.5px] text-[var(--md-text)]">
                  <Switch
                    checked={details.appointmentRequired}
                    onCheckedChange={(appointmentRequired) =>
                      update({ appointmentRequired })
                    }
                  />
                  {t("Appointment required")}
                </label>
                <Field label="Advance booking hours">
                  <Input
                    type="number"
                    min={0}
                    max={8760}
                    value={details.advanceBookingHours}
                    onChange={(event) =>
                      update({
                        advanceBookingHours: Number(event.target.value) || 0,
                      })
                    }
                    className={fieldClass}
                    dir="ltr"
                  />
                </Field>
                <Field label="Collection instructions">
                  <Input
                    value={details.collectionInstructions ?? ""}
                    onChange={(event) =>
                      update({
                        collectionInstructions: event.target.value || null,
                      })
                    }
                    className={fieldClass}
                  />
                </Field>
                <Field label="Delivery instructions">
                  <Input
                    value={details.deliveryInstructions ?? ""}
                    onChange={(event) =>
                      update({
                        deliveryInstructions: event.target.value || null,
                      })
                    }
                    className={fieldClass}
                  />
                </Field>
              </div>
              <Field label="Booking-in instructions">
                <Textarea
                  value={details.bookingInstructions ?? ""}
                  onChange={(event) =>
                    update({ bookingInstructions: event.target.value || null })
                  }
                  className="mt-3 min-h-20 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]"
                />
              </Field>
            </fieldset>
          );
        })}
        {account.addresses.length === 0 ? (
          <p className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-6 text-center text-[12px] text-[var(--md-subtle)]">
            {t("No addresses are linked to this account yet.")}
          </p>
        ) : null}
      </div>
    </>
  );
}

type Props = {
  draft: AccountOperations;
  setDraft: (value: AccountOperations) => void;
  account: ApiCustomerDetail;
};

type FinancialTab = "receivables" | "payables" | "bank-details";
type FinanceReference = Pick<CustomerReference, "legalEntities" | "paymentTerms" | "taxTreatments">;

type AccountBankDetails = {
  id: string;
  accountName: string;
  accountHolder: string;
  bankName: string;
  countryCode: string;
  currencyCode: string;
  accountNumberMasked: string;
  ibanMasked: string;
  routingCodeMasked: string;
  bic: string;
  remittanceEmail: string;
  notes: string;
  isDefault: boolean;
  useForPayments: boolean;
  useForRefunds: boolean;
  useForDirectDebit: boolean;
  verificationStatusCode: string;
  verificationReference: string;
  verifiedAt: string;
  effectiveFrom: string;
  effectiveTo: string;
};

const currencyCodePattern = /^[A-Z]{3}$/;

function normaliseCurrencies(currencies: string[]) {
  return Array.from(
    new Set(
      currencies
        .map((currency) => currency.trim().toUpperCase())
        .filter((currency) => currencyCodePattern.test(currency)),
    ),
  );
}

function objectValue(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function accountBankDetails(data: Record<string, unknown>) {
  const records = Array.isArray(data.bankAccounts)
    ? data.bankAccounts
    : [];
  if (records.length) {
    return records.map((record, index): AccountBankDetails => {
      const source = objectValue(record);
      const currencyCode = value(source, "currencyCode").toUpperCase();
      return {
        id: value(source, "id") || `bank-account-${index + 1}`,
        accountName: value(source, "accountName"),
        accountHolder: value(source, "accountHolder"),
        bankName: value(source, "bankName"),
        countryCode: value(source, "countryCode").toUpperCase(),
        currencyCode,
        accountNumberMasked: value(source, "accountNumberMasked"),
        ibanMasked: value(source, "ibanMasked"),
        routingCodeMasked: value(source, "routingCodeMasked"),
        bic: value(source, "bic").toUpperCase(),
        remittanceEmail: value(source, "remittanceEmail"),
        notes: value(source, "notes"),
        isDefault: source.isDefault === true && Boolean(currencyCode),
        useForPayments: source.useForPayments !== false,
        useForRefunds: source.useForRefunds === true,
        useForDirectDebit: source.useForDirectDebit === true,
        verificationStatusCode: value(source, "verificationStatusCode") || "pending",
        verificationReference: value(source, "verificationReference"),
        verifiedAt: value(source, "verifiedAt"),
        effectiveFrom: value(source, "effectiveFrom"),
        effectiveTo: value(source, "effectiveTo"),
      };
    });
  }

  const legacyKeys = [
    "bankAccountHolder",
    "bankName",
    "bankCountryCode",
    "bankCurrency",
    "bankAccountNumberMasked",
    "bankIbanMasked",
    "bankRoutingCodeMasked",
    "bankBic",
    "remittanceEmail",
    "bankDetailsNotes",
  ];
  if (!legacyKeys.some((key) => value(data, key).trim())) return [];
  const currencyCode = (
    value(data, "bankCurrency") || value(data, "primaryCurrency")
  ).toUpperCase();
  return [
    {
      id: "legacy-bank-account",
      accountName: value(data, "bankName") || "Bank account",
      accountHolder: value(data, "bankAccountHolder"),
      bankName: value(data, "bankName"),
      countryCode: value(data, "bankCountryCode").toUpperCase(),
      currencyCode,
      accountNumberMasked: value(data, "bankAccountNumberMasked"),
      ibanMasked: value(data, "bankIbanMasked"),
      routingCodeMasked: value(data, "bankRoutingCodeMasked"),
      bic: value(data, "bankBic").toUpperCase(),
      remittanceEmail: value(data, "remittanceEmail"),
      notes: value(data, "bankDetailsNotes"),
      isDefault: Boolean(currencyCode),
      useForPayments: true,
      useForRefunds: false,
      useForDirectDebit: false,
      verificationStatusCode: "pending",
      verificationReference: "",
      verifiedAt: "",
      effectiveFrom: "",
      effectiveTo: "",
    },
  ];
}

function Financial({
  draft,
  setDraft,
  canManageFinancial,
  canManageBankDetails,
  currencyOptions,
  financeReference,
}: Omit<Props, "account"> & {
  canManageFinancial: boolean;
  canManageBankDetails: boolean;
  currencyOptions: Array<{ code: string; name: string }>;
  financeReference: FinanceReference;
}) {
  const { t } = useLanguage();
  const [activeFinancialTab, setActiveFinancialTab] =
    useState<FinancialTab>("receivables");
  const data = draft.invoicePreferences;
  const banks = accountBankDetails(data);
  const operatingCurrencies = normaliseCurrencies([
    ...stringList(data, "operatingCurrencies"),
    value(data, "primaryCurrency"),
    ...stringList(data, "supportedCurrencies"),
    ...stringList(data, "supportedPurchaseCurrencies"),
    ...banks.map((bank) => bank.currencyCode),
  ]);
  const currencyMap = new Map(
    currencyOptions.map((currency) => [currency.code.toUpperCase(), currency.name]),
  );
  for (const currency of operatingCurrencies) {
    if (!currencyMap.has(currency)) currencyMap.set(currency, currency);
  }
  const availableCurrencies = Array.from(currencyMap, ([code, name]) => ({
    code,
    name,
  })).sort((left, right) => left.code.localeCompare(right.code));
  const operatingCurrencyOptions = availableCurrencies.map((currency) => ({
    value: currency.code,
    label:
      currency.name === currency.code
        ? currency.code
        : `${currency.code} · ${currency.name}`,
  }));
  const selectedCurrencyOptions = operatingCurrencies.map((currency) => ({
    value: currency,
    label:
      currencyMap.get(currency) && currencyMap.get(currency) !== currency
        ? `${currency} · ${currencyMap.get(currency)}`
        : currency,
  }));
  const defaultLegalEntityId = financeReference.legalEntities[0]?.id ?? "";
  const salesLegalEntityId = value(data, "defaultSalesLegalEntityId") || defaultLegalEntityId;
  const purchaseLegalEntityId = value(data, "defaultPurchaseLegalEntityId") || defaultLegalEntityId;
  const salesPaymentTerms = financeReference.paymentTerms.filter(
    (term) => term.legalEntityId == null || term.legalEntityId === salesLegalEntityId,
  );
  const purchasePaymentTerms = financeReference.paymentTerms.filter(
    (term) => term.legalEntityId == null || term.legalEntityId === purchaseLegalEntityId,
  );
  const salesTaxTreatments = financeReference.taxTreatments.filter(
    (tax) =>
      (tax.legalEntityId == null || tax.legalEntityId === salesLegalEntityId) &&
      ["sales", "both"].includes(tax.transactionTypeCode),
  );
  const purchaseTaxTreatments = financeReference.taxTreatments.filter(
    (tax) =>
      (tax.legalEntityId == null || tax.legalEntityId === purchaseLegalEntityId) &&
      ["purchase", "both"].includes(tax.transactionTypeCode),
  );

  const updateMany = (changes: Record<string, unknown>) =>
    setDraft({
      ...draft,
      invoicePreferences: { ...data, ...changes },
    });
  const update = (key: string, next: unknown) =>
    updateMany({ [key]: next });

  const changeOperatingCurrencies = (next: string[]) => {
    const requiredByBank = banks.map((bank) => bank.currencyCode);
    const currencies = normaliseCurrencies([...next, ...requiredByBank]);
    const currentPrimary = value(data, "primaryCurrency").toUpperCase();
    updateMany({
      operatingCurrencies: currencies,
      primaryCurrency: currencies.includes(currentPrimary)
        ? currentPrimary
        : currencies[0] ?? "",
      supportedCurrencies: stringList(data, "supportedCurrencies").filter(
        (currency) => currencies.includes(currency.toUpperCase()),
      ),
      supportedPurchaseCurrencies: stringList(
        data,
        "supportedPurchaseCurrencies",
      ).filter((currency) => currencies.includes(currency.toUpperCase())),
    });
  };

  const updateBank = (
    bankId: string,
    changes: Partial<AccountBankDetails>,
  ) => {
    const current = banks.find((bank) => bank.id === bankId);
    if (!current) return;
    const changed = {
      ...current,
      ...changes,
      countryCode: (changes.countryCode ?? current.countryCode).toUpperCase(),
      currencyCode: (changes.currencyCode ?? current.currencyCode).toUpperCase(),
      bic: (changes.bic ?? current.bic).toUpperCase(),
    };
    if (!changed.currencyCode) changed.isDefault = false;
    const nextBanks = banks.map((bank) => {
      if (bank.id === bankId) return changed;
      if (changed.isDefault && bank.currencyCode === changed.currencyCode) {
        return { ...bank, isDefault: false };
      }
      return bank;
    });
    updateMany({
      bankAccounts: nextBanks,
      operatingCurrencies: normaliseCurrencies([
        ...operatingCurrencies,
        changed.currencyCode,
      ]),
    });
  };

  const addBank = () => {
    const currencyCode =
      value(data, "primaryCurrency").toUpperCase() ||
      operatingCurrencies[0] ||
      "";
    update("bankAccounts", [
      ...banks,
      {
        id: newId(),
        accountName: "",
        accountHolder: "",
        bankName: "",
        countryCode: "",
        currencyCode,
        accountNumberMasked: "",
        ibanMasked: "",
        routingCodeMasked: "",
        bic: "",
        remittanceEmail: "",
        notes: "",
        isDefault:
          Boolean(currencyCode) &&
          !banks.some(
            (bank) => bank.currencyCode === currencyCode && bank.isDefault,
          ),
        useForPayments: true,
        useForRefunds: false,
        useForDirectDebit: false,
        verificationStatusCode: "pending",
        verificationReference: "",
        verifiedAt: "",
        effectiveFrom: "",
        effectiveTo: "",
      } satisfies AccountBankDetails,
    ]);
  };

  const tabs = [
    { id: "receivables", label: t("Accounts Receivable") },
    { id: "payables", label: t("Accounts Payable") },
    { id: "bank-details", label: t("Bank Details") },
  ];
  const readOnly = activeFinancialTab === "bank-details" ? !canManageBankDetails : !canManageFinancial;
  const restrictionMessage = activeFinancialTab === "bank-details"
    ? "Bank details are read-only. A finance manager or administrator can change them."
    : "Financial terms and accounting settings are read-only. A finance manager or administrator can change them.";

  return (
    <>
      <SectionTitle
        title="Financial details"
        detail="Maintain company currencies, customer terms, supplier terms and approved payment details separately for this account."
      />
      {readOnly ? (
        <div id="account-financial-read-only" role="status" className="mb-4 flex items-start gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-2.5 text-[11.5px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[var(--md-subtle)]" aria-hidden="true" />
          <span>{t(restrictionMessage)}</span>
        </div>
      ) : null}
      <fieldset disabled={!canManageFinancial} aria-describedby={!canManageFinancial ? "account-financial-read-only" : undefined} className="contents disabled:opacity-75">
        <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(260px,420px)] sm:items-end">
        <div>
          <p className="text-[12px] font-medium text-[var(--md-ink)]">
            {t("Operating currencies")}
          </p>
          <p className="mt-1 text-[11.5px] leading-5 text-[var(--md-subtle)]">
            {t(
              "Choose every currency this company can invoice, purchase or receive through a bank account.",
            )}
          </p>
        </div>
        <MultiSelectMenu
          value={operatingCurrencies}
          options={operatingCurrencyOptions}
          onValueChange={changeOperatingCurrencies}
          placeholder="Choose operating currencies"
          label="Operating currencies"
          disabled={!operatingCurrencyOptions.length}
          className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-3 text-[13px]"
        />
        </div>
      </fieldset>
      <TabsRail
        tabs={tabs}
        activeTab={activeFinancialTab}
        onChange={(tab) => setActiveFinancialTab(tab as FinancialTab)}
        className="mb-4"
      />
      <fieldset disabled={readOnly} aria-describedby={readOnly ? "account-financial-read-only" : undefined} className="contents disabled:opacity-75">
        <div
          role="tabpanel"
          aria-label={tabs.find((tab) => tab.id === activeFinancialTab)?.label}
        >
        {activeFinancialTab === "receivables" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ControlField label="Customer accounting status">
                <Select
                  value={value(data, "customerAccountingStatusCode") || "active"}
                  onValueChange={(customerAccountingStatusCode) => update("customerAccountingStatusCode", customerAccountingStatusCode)}
                >
                  <SelectTrigger aria-label={t("Customer accounting status")} className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("Active")}</SelectItem>
                    <SelectItem value="on_hold">{t("On credit hold")}</SelectItem>
                    <SelectItem value="blocked">{t("Blocked")}</SelectItem>
                  </SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Sales legal entity">
                <Select
                  value={salesLegalEntityId || "__none__"}
                  onValueChange={(defaultSalesLegalEntityId) => update("defaultSalesLegalEntityId", defaultSalesLegalEntityId === "__none__" ? "" : defaultSalesLegalEntityId)}
                  disabled={!financeReference.legalEntities.length}
                >
                  <SelectTrigger aria-label={t("Sales legal entity")} className={fieldClass}><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("Choose legal entity")}</SelectItem>
                    {financeReference.legalEntities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Sales payment terms">
                <Select
                  value={value(data, "salesPaymentTermCode") || "__none__"}
                  onValueChange={(salesPaymentTermCode) => {
                    const term = salesPaymentTerms.find((item) => item.code === salesPaymentTermCode);
                    updateMany({ salesPaymentTermCode: salesPaymentTermCode === "__none__" ? "" : salesPaymentTermCode, receivableTermDays: term ? String(term.days) : value(data, "receivableTermDays"), receivableEndOfMonth: term?.endOfMonth ?? data.receivableEndOfMonth });
                  }}
                  disabled={!salesPaymentTerms.length}
                >
                  <SelectTrigger aria-label={t("Sales payment terms")} className={fieldClass}><SelectValue placeholder={t("Choose payment terms")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("Choose payment terms")}</SelectItem>
                    {salesPaymentTerms.map((term) => <SelectItem key={term.id} value={term.code}>{term.code} · {term.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Default sales tax treatment">
                <Select
                  value={value(data, "salesTaxTreatmentCode") || "__none__"}
                  onValueChange={(salesTaxTreatmentCode) => update("salesTaxTreatmentCode", salesTaxTreatmentCode === "__none__" ? "" : salesTaxTreatmentCode)}
                  disabled={!salesTaxTreatments.length}
                >
                  <SelectTrigger aria-label={t("Default sales tax treatment")} className={fieldClass}><SelectValue placeholder={t("Choose tax treatment")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("Choose tax treatment")}</SelectItem>
                    {salesTaxTreatments.map((tax) => <SelectItem key={tax.id} value={tax.code}>{tax.code} · {tax.name} · {tax.ratePercent}%</SelectItem>)}
                  </SelectContent>
                </Select>
              </ControlField>
              <Field label="Customer tax registration">
                <Input value={value(data, "customerTaxRegistrationNo")} onChange={(e) => update("customerTaxRegistrationNo", e.target.value)} className={fieldClass} dir="ltr" />
              </Field>
              <ControlField label="Preferred receipt method">
                <Select value={value(data, "preferredReceiptMethodCode") || "bank_transfer"} onValueChange={(preferredReceiptMethodCode) => update("preferredReceiptMethodCode", preferredReceiptMethodCode)}>
                  <SelectTrigger aria-label={t("Preferred receipt method")} className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">{t("Bank transfer")}</SelectItem><SelectItem value="direct_debit">{t("Direct debit")}</SelectItem><SelectItem value="card">{t("Card")}</SelectItem><SelectItem value="cheque">{t("Cheque")}</SelectItem><SelectItem value="cash">{t("Cash")}</SelectItem><SelectItem value="offset">{t("Account offset")}</SelectItem>
                  </SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Invoice grouping">
                <Select value={value(data, "salesInvoiceGroupingCode") || "per_job"} onValueChange={(salesInvoiceGroupingCode) => update("salesInvoiceGroupingCode", salesInvoiceGroupingCode)}>
                  <SelectTrigger aria-label={t("Invoice grouping")} className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_job">{t("One invoice per job")}</SelectItem><SelectItem value="daily">{t("Daily consolidation")}</SelectItem><SelectItem value="weekly">{t("Weekly consolidation")}</SelectItem><SelectItem value="monthly">{t("Monthly consolidation")}</SelectItem>
                  </SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Statement frequency">
                <Select value={value(data, "statementFrequencyCode") || "monthly"} onValueChange={(statementFrequencyCode) => update("statementFrequencyCode", statementFrequencyCode)}>
                  <SelectTrigger aria-label={t("Statement frequency")} className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="never">{t("Never")}</SelectItem><SelectItem value="weekly">{t("Weekly")}</SelectItem><SelectItem value="monthly">{t("Monthly")}</SelectItem></SelectContent>
                </Select>
              </ControlField>
              <Field label="Credit limit">
                <Input
                  type="number"
                  min={0}
                  value={value(data, "creditLimit")}
                  onChange={(e) => update("creditLimit", e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
              <ControlField label="Primary currency">
                <Select
                  value={value(data, "primaryCurrency")}
                  onValueChange={(primaryCurrency) =>
                    update("primaryCurrency", primaryCurrency)
                  }
                  disabled={!operatingCurrencies.length}
                >
                  <SelectTrigger
                    aria-label={t("Primary currency")}
                    className={fieldClass}
                  >
                    <SelectValue
                      placeholder={t("Choose operating currencies first")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {operatingCurrencies.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        <span data-i18n-skip dir="ltr">
                          {currency}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ControlField>
              <Field label="Receivable term days">
                <Input
                  type="number"
                  min={0}
                  max={730}
                  value={value(data, "receivableTermDays")}
                  onChange={(e) =>
                    update("receivableTermDays", e.target.value)
                  }
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
              <Field label="Receivable due day">
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={value(data, "receivableDueDay")}
                  onChange={(e) => update("receivableDueDay", e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                  placeholder="Optional"
                />
              </Field>
              <label className="flex min-h-9 items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]">
                <Switch
                  checked={data.receivableEndOfMonth === true}
                  onCheckedChange={(next) =>
                    update("receivableEndOfMonth", next)
                  }
                />
                {t("Receivable end of month")}
              </label>
              <Field label="Invoice email">
                <Input
                  type="email"
                  value={value(data, "invoiceEmail")}
                  onChange={(e) => update("invoiceEmail", e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
              <Field label="Statement email">
                <Input type="email" value={value(data, "statementEmail")} onChange={(e) => update("statementEmail", e.target.value)} className={fieldClass} dir="ltr" />
              </Field>
              <Field label="Invoice language">
                <Input value={value(data, "invoiceLanguageCode") || "en"} onChange={(e) => update("invoiceLanguageCode", e.target.value.toLowerCase())} className={fieldClass} dir="ltr" placeholder="en" />
              </Field>
              <Field label="Invoice delivery">
                <Input
                  value={value(data, "invoiceDeliveryMethod")}
                  onChange={(e) =>
                    update("invoiceDeliveryMethod", e.target.value)
                  }
                  className={fieldClass}
                  placeholder={t("Email, EDI or portal")}
                />
              </Field>
              <ControlField label="Supported invoice currencies">
                <MultiSelectMenu
                  value={normaliseCurrencies(
                    stringList(data, "supportedCurrencies"),
                  )}
                  options={selectedCurrencyOptions}
                  onValueChange={(supportedCurrencies) =>
                    update("supportedCurrencies", supportedCurrencies)
                  }
                  placeholder="Choose invoice currencies"
                  label="Supported invoice currencies"
                  disabled={!operatingCurrencies.length}
                  className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-3 text-[13px]"
                />
              </ControlField>
              <Field label="Accounts receivable code">
                <Input
                  value={value(data, "receivableAccountCode")}
                  onChange={(e) =>
                    update("receivableAccountCode", e.target.value)
                  }
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)] sm:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]"><Switch checked={data.creditHold === true} onCheckedChange={(creditHold) => update("creditHold", creditHold)} />{t("Credit hold")}</label>
              <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]"><Switch checked={data.requiresCustomerPurchaseOrder === true} onCheckedChange={(requiresCustomerPurchaseOrder) => update("requiresCustomerPurchaseOrder", requiresCustomerPurchaseOrder)} />{t("Customer PO required")}</label>
              <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]"><Switch checked={data.requiresJobReferenceOnInvoice !== false} onCheckedChange={(requiresJobReferenceOnInvoice) => update("requiresJobReferenceOnInvoice", requiresJobReferenceOnInvoice)} />{t("Job reference required")}</label>
              <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]"><Switch checked={data.sendStatements !== false} onCheckedChange={(sendStatements) => update("sendStatements", sendStatements)} />{t("Send statements")}</label>
            </div>
            <Field label="Invoice instructions">
              <Textarea
                value={value(data, "invoiceInstructions")}
                onChange={(e) =>
                  update("invoiceInstructions", e.target.value)
                }
                className="mt-3 min-h-24 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]"
              />
            </Field>
          </>
        ) : activeFinancialTab === "payables" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ControlField label="Supplier accounting status">
                <Select value={value(data, "supplierAccountingStatusCode") || "active"} onValueChange={(supplierAccountingStatusCode) => update("supplierAccountingStatusCode", supplierAccountingStatusCode)}>
                  <SelectTrigger aria-label={t("Supplier accounting status")} className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">{t("Active")}</SelectItem><SelectItem value="on_hold">{t("Payment hold")}</SelectItem><SelectItem value="blocked">{t("Blocked")}</SelectItem></SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Purchase legal entity">
                <Select value={purchaseLegalEntityId || "__none__"} onValueChange={(defaultPurchaseLegalEntityId) => update("defaultPurchaseLegalEntityId", defaultPurchaseLegalEntityId === "__none__" ? "" : defaultPurchaseLegalEntityId)} disabled={!financeReference.legalEntities.length}>
                  <SelectTrigger aria-label={t("Purchase legal entity")} className={fieldClass}><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">{t("Choose legal entity")}</SelectItem>{financeReference.legalEntities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>)}</SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Purchase payment terms">
                <Select
                  value={value(data, "purchasePaymentTermCode") || "__none__"}
                  onValueChange={(purchasePaymentTermCode) => {
                    const term = purchasePaymentTerms.find((item) => item.code === purchasePaymentTermCode);
                    updateMany({ purchasePaymentTermCode: purchasePaymentTermCode === "__none__" ? "" : purchasePaymentTermCode, payableTermDays: term ? String(term.days) : value(data, "payableTermDays"), payableEndOfMonth: term?.endOfMonth ?? data.payableEndOfMonth });
                  }}
                  disabled={!purchasePaymentTerms.length}
                >
                  <SelectTrigger aria-label={t("Purchase payment terms")} className={fieldClass}><SelectValue placeholder={t("Choose payment terms")} /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">{t("Choose payment terms")}</SelectItem>{purchasePaymentTerms.map((term) => <SelectItem key={term.id} value={term.code}>{term.code} · {term.name}</SelectItem>)}</SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Default purchase tax treatment">
                <Select value={value(data, "purchaseTaxTreatmentCode") || "__none__"} onValueChange={(purchaseTaxTreatmentCode) => update("purchaseTaxTreatmentCode", purchaseTaxTreatmentCode === "__none__" ? "" : purchaseTaxTreatmentCode)} disabled={!purchaseTaxTreatments.length}>
                  <SelectTrigger aria-label={t("Default purchase tax treatment")} className={fieldClass}><SelectValue placeholder={t("Choose tax treatment")} /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">{t("Choose tax treatment")}</SelectItem>{purchaseTaxTreatments.map((tax) => <SelectItem key={tax.id} value={tax.code}>{tax.code} · {tax.name} · {tax.ratePercent}%</SelectItem>)}</SelectContent>
                </Select>
              </ControlField>
              <Field label="Supplier tax registration"><Input value={value(data, "supplierTaxRegistrationNo")} onChange={(e) => update("supplierTaxRegistrationNo", e.target.value)} className={fieldClass} dir="ltr" /></Field>
              <ControlField label="Preferred payment method">
                <Select value={value(data, "preferredPaymentMethodCode") || "bank_transfer"} onValueChange={(preferredPaymentMethodCode) => update("preferredPaymentMethodCode", preferredPaymentMethodCode)}>
                  <SelectTrigger aria-label={t("Preferred payment method")} className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="bank_transfer">{t("Bank transfer")}</SelectItem><SelectItem value="direct_debit">{t("Direct debit")}</SelectItem><SelectItem value="card">{t("Card")}</SelectItem><SelectItem value="cheque">{t("Cheque")}</SelectItem><SelectItem value="cash">{t("Cash")}</SelectItem><SelectItem value="offset">{t("Account offset")}</SelectItem></SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Payment run group">
                <Select value={value(data, "paymentRunGroupCode") || "weekly"} onValueChange={(paymentRunGroupCode) => update("paymentRunGroupCode", paymentRunGroupCode)}>
                  <SelectTrigger aria-label={t("Payment run group")} className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="manual">{t("Manual")}</SelectItem><SelectItem value="daily">{t("Daily")}</SelectItem><SelectItem value="weekly">{t("Weekly")}</SelectItem><SelectItem value="monthly">{t("Monthly")}</SelectItem></SelectContent>
                </Select>
              </ControlField>
              <ControlField label="Invoice matching">
                <Select value={value(data, "purchaseInvoiceMatchingCode") || "two_way"} onValueChange={(purchaseInvoiceMatchingCode) => update("purchaseInvoiceMatchingCode", purchaseInvoiceMatchingCode)}>
                  <SelectTrigger aria-label={t("Invoice matching")} className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">{t("No matching")}</SelectItem><SelectItem value="two_way">{t("Invoice to purchase order")}</SelectItem><SelectItem value="three_way">{t("Invoice, purchase order and receipt")}</SelectItem></SelectContent>
                </Select>
              </ControlField>
              <Field label="Payable term days">
                <Input
                  type="number"
                  min={0}
                  max={730}
                  value={value(data, "payableTermDays")}
                  onChange={(e) => update("payableTermDays", e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
              <Field label="Payable due day">
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={value(data, "payableDueDay")}
                  onChange={(e) => update("payableDueDay", e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                  placeholder="Optional"
                />
              </Field>
              <label className="flex min-h-9 items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]">
                <Switch
                  checked={data.payableEndOfMonth === true}
                  onCheckedChange={(next) =>
                    update("payableEndOfMonth", next)
                  }
                />
                {t("Payable end of month")}
              </label>
              <Field label="Accounts payable code">
                <Input
                  value={value(data, "payableAccountCode")}
                  onChange={(e) =>
                    update("payableAccountCode", e.target.value)
                  }
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
              <Field label="Purchase invoice email">
                <Input
                  type="email"
                  value={value(data, "purchaseInvoiceEmail")}
                  onChange={(e) =>
                    update("purchaseInvoiceEmail", e.target.value)
                  }
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
              <Field label="Purchase invoice delivery">
                <Input
                  value={value(data, "purchaseInvoiceDeliveryMethod")}
                  onChange={(e) =>
                    update("purchaseInvoiceDeliveryMethod", e.target.value)
                  }
                  className={fieldClass}
                  placeholder={t("Email, EDI or portal")}
                />
              </Field>
              <Field label="Remittance advice email"><Input type="email" value={value(data, "remittanceAdviceEmail")} onChange={(e) => update("remittanceAdviceEmail", e.target.value)} className={fieldClass} dir="ltr" /></Field>
              <Field label="Matching tolerance %"><Input type="number" min={0} max={100} step="0.01" value={value(data, "purchaseMatchTolerancePercent")} onChange={(e) => update("purchaseMatchTolerancePercent", e.target.value)} className={fieldClass} dir="ltr" /></Field>
              <ControlField label="Supported purchase currencies">
                <MultiSelectMenu
                  value={normaliseCurrencies(
                    stringList(data, "supportedPurchaseCurrencies"),
                  )}
                  options={selectedCurrencyOptions}
                  onValueChange={(supportedPurchaseCurrencies) =>
                    update(
                      "supportedPurchaseCurrencies",
                      supportedPurchaseCurrencies,
                    )
                  }
                  placeholder="Choose purchase currencies"
                  label="Supported purchase currencies"
                  disabled={!operatingCurrencies.length}
                  className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-3 text-[13px]"
                />
              </ControlField>
            </div>
            <div className="mt-4 grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)] sm:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]"><Switch checked={data.supplierPaymentHold === true} onCheckedChange={(supplierPaymentHold) => update("supplierPaymentHold", supplierPaymentHold)} />{t("Supplier payment hold")}</label>
              <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]"><Switch checked={data.purchaseOrderRequired === true} onCheckedChange={(purchaseOrderRequired) => update("purchaseOrderRequired", purchaseOrderRequired)} />{t("Purchase order required")}</label>
              <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]"><Switch checked={data.selfBillingAllowed === true} onCheckedChange={(selfBillingAllowed) => update("selfBillingAllowed", selfBillingAllowed)} />{t("Self-billing approved")}</label>
              <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]"><Switch checked={data.separateRemittanceAdvice !== false} onCheckedChange={(separateRemittanceAdvice) => update("separateRemittanceAdvice", separateRemittanceAdvice)} />{t("Send remittance advice")}</label>
            </div>
            <Field label="Purchase invoice instructions">
              <Textarea
                value={value(data, "purchaseInvoiceInstructions")}
                onChange={(e) =>
                  update("purchaseInvoiceInstructions", e.target.value)
                }
                className="mt-3 min-h-24 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]"
              />
            </Field>
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-3xl text-[11.5px] leading-5 text-[var(--md-subtle)]">
                {t(
                  "Add every bank account used by this company and assign its currency. Complete account, IBAN and routing references are masked automatically when saved.",
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!operatingCurrencies.length || banks.length >= 25}
                onClick={addBank}
              >
                <Plus data-icon="inline-start" className="size-3.5" />
                {t("Add bank account")}
              </Button>
            </div>
            {!banks.length ? (
              <div className="grid min-h-32 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-6 py-8 text-center shadow-[var(--md-shadow-line)]">
                <div>
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">
                    {t("No bank accounts added")}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-5 text-[var(--md-subtle)]">
                    {operatingCurrencies.length
                      ? t("Add the first bank account for this company.")
                      : t("Choose an operating currency before adding a bank account.")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[var(--md-line)]">
                {banks.map((bank, index) => (
                  <section
                    key={bank.id}
                    className="py-5 first:pt-0 last:pb-0"
                    aria-label={`${t("Bank account")} ${index + 1}`}
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">
                          {bank.accountName ||
                            bank.bankName ||
                            `${t("Bank account")} ${index + 1}`}
                        </p>
                        <p className="mt-0.5 text-[10.5px] text-[var(--md-subtle)]">
                          <span data-i18n-skip dir="ltr">
                            {bank.currencyCode || "—"}
                          </span>
                          {bank.isDefault ? ` · ${t("Default")}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-[11px] font-medium text-[var(--md-text)]">
                          <Switch
                            checked={bank.isDefault}
                            disabled={!bank.currencyCode}
                            onCheckedChange={(isDefault) =>
                              updateBank(bank.id, { isDefault })
                            }
                          />
                          {t("Default for currency")}
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-red)]"
                          aria-label={`${t("Remove bank account")}: ${bank.accountName || bank.bankName || index + 1}`}
                          onClick={() =>
                            update(
                              "bankAccounts",
                              banks.filter((item) => item.id !== bank.id),
                            )
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Account name">
                        <Input
                          value={bank.accountName}
                          onChange={(event) =>
                            updateBank(bank.id, {
                              accountName: event.target.value,
                            })
                          }
                          className={fieldClass}
                          placeholder={t("GBP current account")}
                        />
                      </Field>
                      <Field label="Account holder">
                        <Input
                          value={bank.accountHolder}
                          onChange={(event) =>
                            updateBank(bank.id, {
                              accountHolder: event.target.value,
                            })
                          }
                          className={fieldClass}
                        />
                      </Field>
                      <Field label="Bank name">
                        <Input
                          value={bank.bankName}
                          onChange={(event) =>
                            updateBank(bank.id, {
                              bankName: event.target.value,
                            })
                          }
                          className={fieldClass}
                        />
                      </Field>
                      <ControlField label="Bank currency">
                        <Select
                          value={bank.currencyCode}
                          onValueChange={(currencyCode) =>
                            updateBank(bank.id, { currencyCode })
                          }
                        >
                          <SelectTrigger
                            aria-label={`${t("Bank currency")} ${index + 1}`}
                            className={fieldClass}
                          >
                            <SelectValue placeholder={t("Choose currency")} />
                          </SelectTrigger>
                          <SelectContent>
                            {operatingCurrencies.map((currency) => (
                              <SelectItem key={currency} value={currency}>
                                <span data-i18n-skip dir="ltr">
                                  {currency}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </ControlField>
                      <Field label="Bank country code">
                        <Input
                          maxLength={2}
                          value={bank.countryCode}
                          onChange={(event) =>
                            updateBank(bank.id, {
                              countryCode: event.target.value,
                            })
                          }
                          className={fieldClass}
                          dir="ltr"
                          placeholder="GB"
                        />
                      </Field>
                      <Field label="Account number">
                        <Input
                          value={bank.accountNumberMasked}
                          onChange={(event) =>
                            updateBank(bank.id, {
                              accountNumberMasked: event.target.value,
                            })
                          }
                          className={fieldClass}
                          dir="ltr"
                          placeholder="•••• 1234"
                        />
                      </Field>
                      <Field label="IBAN">
                        <Input
                          value={bank.ibanMasked}
                          onChange={(event) =>
                            updateBank(bank.id, {
                              ibanMasked: event.target.value,
                            })
                          }
                          className={fieldClass}
                          dir="ltr"
                          placeholder="•••• 1234"
                        />
                      </Field>
                      <Field label="Sort or routing code">
                        <Input
                          value={bank.routingCodeMasked}
                          onChange={(event) =>
                            updateBank(bank.id, {
                              routingCodeMasked: event.target.value,
                            })
                          }
                          className={fieldClass}
                          dir="ltr"
                          placeholder="•••• 1234"
                        />
                      </Field>
                      <Field label="BIC or SWIFT">
                        <Input
                          value={bank.bic}
                          onChange={(event) =>
                            updateBank(bank.id, { bic: event.target.value })
                          }
                          className={fieldClass}
                          dir="ltr"
                        />
                      </Field>
                      <Field label="Remittance email">
                        <Input
                          type="email"
                          value={bank.remittanceEmail}
                          onChange={(event) =>
                            updateBank(bank.id, {
                              remittanceEmail: event.target.value,
                            })
                          }
                          className={fieldClass}
                          dir="ltr"
                        />
                      </Field>
                      <ControlField label="Verification status">
                        <Select value={bank.verificationStatusCode || "pending"} onValueChange={(verificationStatusCode) => updateBank(bank.id, { verificationStatusCode })}>
                          <SelectTrigger aria-label={`${t("Verification status")} ${index + 1}`} className={fieldClass}><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="pending">{t("Pending verification")}</SelectItem><SelectItem value="verified">{t("Verified")}</SelectItem><SelectItem value="rejected">{t("Rejected")}</SelectItem></SelectContent>
                        </Select>
                      </ControlField>
                      <Field label="Verification reference"><Input value={bank.verificationReference} onChange={(event) => updateBank(bank.id, { verificationReference: event.target.value })} className={fieldClass} dir="ltr" /></Field>
                      <Field label="Verified date"><Input type="date" value={bank.verifiedAt} onChange={(event) => updateBank(bank.id, { verifiedAt: event.target.value })} className={fieldClass} dir="ltr" /></Field>
                      <Field label="Effective from"><Input type="date" value={bank.effectiveFrom} onChange={(event) => updateBank(bank.id, { effectiveFrom: event.target.value })} className={fieldClass} dir="ltr" /></Field>
                      <Field label="Effective to"><Input type="date" value={bank.effectiveTo} onChange={(event) => updateBank(bank.id, { effectiveTo: event.target.value })} className={fieldClass} dir="ltr" /></Field>
                    </div>
                    <div className="mt-3 grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)] sm:grid-cols-3">
                      <label className="flex items-center gap-2 text-[11px] font-medium text-[var(--md-text)]"><Switch checked={bank.useForPayments} onCheckedChange={(useForPayments) => updateBank(bank.id, { useForPayments })} />{t("Supplier payments")}</label>
                      <label className="flex items-center gap-2 text-[11px] font-medium text-[var(--md-text)]"><Switch checked={bank.useForRefunds} onCheckedChange={(useForRefunds) => updateBank(bank.id, { useForRefunds })} />{t("Customer refunds")}</label>
                      <label className="flex items-center gap-2 text-[11px] font-medium text-[var(--md-text)]"><Switch checked={bank.useForDirectDebit} onCheckedChange={(useForDirectDebit) => updateBank(bank.id, { useForDirectDebit })} />{t("Direct debit")}</label>
                    </div>
                    <Field label="Bank details notes">
                      <Textarea
                        value={bank.notes}
                        onChange={(event) =>
                          updateBank(bank.id, { notes: event.target.value })
                        }
                        className="mt-3 min-h-20 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]"
                      />
                    </Field>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
        </div>
      </fieldset>
    </>
  );
}

function Customs({ draft, setDraft }: Omit<Props, "account">) {
  const data = draft.customs;
  const update = (key: string, next: unknown) =>
    setDraft({ ...draft, customs: { ...data, [key]: next } });
  return (
    <>
      <SectionTitle
        title="Customs identifiers"
        detail="These references are kept with the account for customs party selection and document preparation."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="VAT number">
          <Input
            value={value(data, "vatNumber")}
            onChange={(e) => update("vatNumber", e.target.value.toUpperCase())}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
        <Field label="EORI number">
          <Input
            value={value(data, "eoriNumber")}
            onChange={(e) => update("eoriNumber", e.target.value.toUpperCase())}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
        <Field label="Deferment account">
          <Input
            value={value(data, "defermentAccount")}
            onChange={(e) =>
              update("defermentAccount", e.target.value.toUpperCase())
            }
            className={fieldClass}
            dir="ltr"
          />
        </Field>
        <Field label="Customs broker reference">
          <Input
            value={value(data, "brokerReference")}
            onChange={(e) => update("brokerReference", e.target.value)}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
        <Field label="Other reference type">
          <Input
            value={value(data, "otherReferenceType")}
            onChange={(e) => update("otherReferenceType", e.target.value)}
            className={fieldClass}
          />
        </Field>
        <Field label="Other reference number">
          <Input
            value={value(data, "otherReferenceNumber")}
            onChange={(e) => update("otherReferenceNumber", e.target.value)}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
      </div>
    </>
  );
}

function Documents({ account, draft, setDraft }: Props) {
  const { t } = useLanguage();
  const [linkedDocuments, setLinkedDocuments] = useState<ApiCustomerDocument[]>(
    [],
  );
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingDocuments(true);
    setDocumentsError(null);
    void listCustomerDocuments(account.id, { limit: 50 })
      .then((listing) => {
        if (!cancelled) setLinkedDocuments(listing.documents);
      })
      .catch((cause) => {
        if (!cancelled) {
          setDocumentsError(
            cause instanceof Error
              ? cause.message
              : t("Account files could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDocuments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account.id, t]);

  async function openDocument(document: ApiCustomerDocument) {
    const pendingWindow = window.open("about:blank", "_blank");
    if (pendingWindow) pendingWindow.opener = null;
    setOpeningId(document.id);
    setDocumentsError(null);
    try {
      const access = await getCustomerDocumentUrl(account.id, document.id);
      if (pendingWindow) pendingWindow.location.replace(access.url);
      else window.location.assign(access.url);
    } catch (cause) {
      pendingWindow?.close();
      setDocumentsError(
        cause instanceof Error
          ? cause.message
          : t("This account file could not be opened."),
      );
    } finally {
      setOpeningId(null);
    }
  }

  const add = () =>
    setDraft({
      ...draft,
      documents: [
        ...draft.documents,
        {
          id: newId(),
          type: "direct_representation_authority",
          title: "",
          notes: null,
          representationType: "direct",
          sourceDocumentId: null,
          externalReference: null,
          validFrom: null,
          validTo: null,
          status: "active",
        },
      ],
    });
  return (
    <>
      <SectionTitle
        title="Account documents"
        detail="Record customs authorities and supporting documents with their notes and validity."
      />
      <div className="mb-5 overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div>
            <p className="text-[12px] font-medium text-[var(--md-ink)]">
              {t("Linked account files")}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">
              {t(
                "Files received through the existing account-document workflow.",
              )}
            </p>
          </div>
          <span className="text-[11px] tabular-nums text-[var(--md-subtle)]">
            {linkedDocuments.length}
          </span>
        </div>
        {loadingDocuments ? (
          <div className="grid min-h-16 place-items-center shadow-[var(--md-stroke-top)]">
            <LoaderCircle
              className="size-4 animate-spin text-[var(--md-accent)]"
              aria-label={t("Loading account files")}
            />
          </div>
        ) : documentsError ? (
          <p
            role="alert"
            className="px-3 py-3 text-[12px] text-[var(--md-red)] shadow-[var(--md-stroke-top)]"
          >
            {documentsError}
          </p>
        ) : linkedDocuments.length ? (
          <div className="shadow-[var(--md-stroke-top)]">
            {linkedDocuments.map((document) => (
              <div
                key={document.id}
                className="flex items-center gap-3 px-3 py-2.5 not-first:shadow-[var(--md-stroke-top)]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                  <FileText className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-[var(--md-ink)]">
                    {document.fileName}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-[var(--md-subtle)]">
                    {document.status === "pending_review"
                      ? t("Pending review")
                      : t("Available")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8"
                  disabled={openingId === document.id}
                  onClick={() => void openDocument(document)}
                >
                  {openingId === document.id ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  {t("Open")}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-3 text-[12px] text-[var(--md-subtle)] shadow-[var(--md-stroke-top)]">
            {t("No files are linked to this account yet.")}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        {draft.documents.map((doc, index) => (
          <div
            key={doc.id}
            className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)] sm:grid-cols-[1fr_1.2fr_1.3fr_1.2fr_32px]"
          >
            <Field label="Document type">
              <select
                value={doc.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    documents: draft.documents.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            type: e.target.value,
                            representationType: e.target.value.startsWith(
                              "indirect",
                            )
                              ? "indirect"
                              : e.target.value.startsWith("direct")
                                ? "direct"
                                : null,
                          }
                        : item,
                    ),
                  })
                }
                className={fieldClass}
              >
                <option value="direct_representation_authority">
                  {t("Direct representation authority")}
                </option>
                <option value="indirect_representation_authority">
                  {t("Indirect representation authority")}
                </option>
                <option value="proof_of_incorporation">
                  {t("Proof of incorporation")}
                </option>
                <option value="supporting_document">
                  {t("Supporting document")}
                </option>
              </select>
            </Field>
            <Field label="Title">
              <Input
                value={doc.title}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    documents: draft.documents.map((item, i) =>
                      i === index ? { ...item, title: e.target.value } : item,
                    ),
                  })
                }
                className={fieldClass}
              />
            </Field>
            <Field label="Supporting notes">
              <Input
                value={doc.notes ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    documents: draft.documents.map((item, i) =>
                      i === index
                        ? { ...item, notes: e.target.value || null }
                        : item,
                    ),
                  })
                }
                className={fieldClass}
              />
            </Field>
            <Field label="Linked file">
              <select
                value={doc.sourceDocumentId ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    documents: draft.documents.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            sourceDocumentId: e.target.value || null,
                          }
                        : item,
                    ),
                  })
                }
                className={fieldClass}
              >
                <option value="">{t("No linked file")}</option>
                {linkedDocuments.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.fileName}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="ghost"
              size="icon"
              className="mt-5 size-8 text-[var(--md-red)]"
              aria-label={t("Remove document record")}
              onClick={() =>
                setDraft({
                  ...draft,
                  documents: draft.documents.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
            <div className="grid gap-2 sm:col-span-5 sm:grid-cols-3">
              <Field label="External reference">
                <Input
                  value={doc.externalReference ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      documents: draft.documents.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              externalReference: e.target.value || null,
                            }
                          : item,
                      ),
                    })
                  }
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
              <Field label="Valid from">
                <Input
                  type="date"
                  value={doc.validFrom ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      documents: draft.documents.map((item, i) =>
                        i === index
                          ? { ...item, validFrom: e.target.value || null }
                          : item,
                      ),
                    })
                  }
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
              <Field label="Valid to">
                <Input
                  type="date"
                  value={doc.validTo ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      documents: draft.documents.map((item, i) =>
                        i === index
                          ? { ...item, validTo: e.target.value || null }
                          : item,
                      ),
                    })
                  }
                  className={fieldClass}
                  dir="ltr"
                />
              </Field>
            </div>
          </div>
        ))}
        {draft.documents.length === 0 ? (
          <p className="py-5 text-center text-[12px] text-[var(--md-subtle)]">
            {t("No account documents are recorded yet.")}
          </p>
        ) : null}
      </div>
      <Button variant="ghost" className="mt-3 h-8" onClick={add}>
        <Plus className="size-3.5" />
        {t("Add document record")}
      </Button>
    </>
  );
}

function Instructions({ account, draft, setDraft }: Props) {
  const { t } = useLanguage();
  const add = () =>
    setDraft({
      ...draft,
      instructions: [
        ...draft.instructions,
        {
          id: newId(),
          kind: "booking",
          title: "",
          body: "",
          destinationCountryCode: null,
          destinationUnlocode: null,
          addressId: null,
          contactId: null,
          priority: 100,
          effectiveFrom: new Date().toISOString().slice(0, 10),
          effectiveTo: null,
          isActive: true,
        },
      ],
    });
  return (
    <>
      <SectionTitle
        title="Recurring operational instructions"
        detail="Matching instructions can be resolved by booking type, destination, address and named contact."
      />
      <div className="grid gap-2">
        {draft.instructions.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)] sm:grid-cols-2 xl:grid-cols-[140px_1fr_90px_110px_1fr_1fr_32px]"
          >
            <Field label="Applies to">
              <select
                className={fieldClass}
                value={item.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    instructions: draft.instructions.map((row, i) =>
                      i === index ? { ...row, kind: e.target.value } : row,
                    ),
                  })
                }
              >
                {[
                  "booking",
                  "collection",
                  "delivery",
                  "customs",
                  "shipping_line",
                  "invoicing",
                  "general",
                ].map((kind) => (
                  <option key={kind} value={kind}>
                    {t(kind.replace("_", " "))}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <Input
                className={fieldClass}
                value={item.title}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    instructions: draft.instructions.map((row, i) =>
                      i === index ? { ...row, title: e.target.value } : row,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Destination country">
              <Input
                className={fieldClass}
                maxLength={2}
                dir="ltr"
                value={item.destinationCountryCode ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    instructions: draft.instructions.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            destinationCountryCode:
                              e.target.value.toUpperCase() || null,
                          }
                        : row,
                    ),
                  })
                }
                placeholder="GB"
              />
            </Field>
            <Field label="Destination UN/LOCODE">
              <Input
                className={fieldClass}
                maxLength={5}
                dir="ltr"
                value={item.destinationUnlocode ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    instructions: draft.instructions.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            destinationUnlocode:
                              e.target.value.toUpperCase() || null,
                          }
                        : row,
                    ),
                  })
                }
                placeholder="GBFXT"
              />
            </Field>
            <Field label="Contact">
              <select
                className={fieldClass}
                value={item.contactId ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    instructions: draft.instructions.map((row, i) =>
                      i === index
                        ? { ...row, contactId: e.target.value || null }
                        : row,
                    ),
                  })
                }
              >
                <option value="">{t("Any contact")}</option>
                {account.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Address">
              <select
                className={fieldClass}
                value={item.addressId ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    instructions: draft.instructions.map((row, i) =>
                      i === index
                        ? { ...row, addressId: e.target.value || null }
                        : row,
                    ),
                  })
                }
              >
                <option value="">{t("Any address")}</option>
                {account.addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {[address.name, address.townCity, address.countryCode]
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="ghost"
              size="icon"
              className="mt-5 size-8 text-[var(--md-red)]"
              aria-label={t("Remove instruction")}
              onClick={() =>
                setDraft({
                  ...draft,
                  instructions: draft.instructions.filter(
                    (_, i) => i !== index,
                  ),
                })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
            <div className="sm:col-span-2 xl:col-span-7">
              <Field label="Instruction">
                <Textarea
                  className="min-h-20 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]"
                  value={item.body}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      instructions: draft.instructions.map((row, i) =>
                        i === index ? { ...row, body: e.target.value } : row,
                      ),
                    })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2 xl:col-span-7 xl:grid-cols-[150px_150px_110px_1fr]">
              <Field label="Effective from">
                <Input
                  type="date"
                  className={fieldClass}
                  dir="ltr"
                  value={item.effectiveFrom}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      instructions: draft.instructions.map((row, i) =>
                        i === index
                          ? { ...row, effectiveFrom: e.target.value }
                          : row,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Effective to">
                <Input
                  type="date"
                  className={fieldClass}
                  dir="ltr"
                  value={item.effectiveTo ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      instructions: draft.instructions.map((row, i) =>
                        i === index
                          ? { ...row, effectiveTo: e.target.value || null }
                          : row,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Priority">
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  className={fieldClass}
                  dir="ltr"
                  value={item.priority}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      instructions: draft.instructions.map((row, i) =>
                        i === index
                          ? { ...row, priority: Number(e.target.value) || 0 }
                          : row,
                      ),
                    })
                  }
                />
              </Field>
              <label className="flex min-h-9 items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)] xl:mt-5">
                <Switch
                  checked={item.isActive}
                  onCheckedChange={(isActive) =>
                    setDraft({
                      ...draft,
                      instructions: draft.instructions.map((row, i) =>
                        i === index ? { ...row, isActive } : row,
                      ),
                    })
                  }
                />
                {t("Active instruction")}
              </label>
            </div>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-3 h-8" onClick={add}>
        <Plus className="size-3.5" />
        {t("Add instruction")}
      </Button>
    </>
  );
}

function Privacy({ draft, setDraft }: Omit<Props, "account">) {
  const data = draft.privacy;
  const update = (key: string, next: unknown) =>
    setDraft({ ...draft, privacy: { ...data, [key]: next } });
  return (
    <>
      <SectionTitle
        title="Privacy and retention"
        detail="Account defaults do not override an individual contact's consent or legal rights."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Lawful basis">
          <Input
            value={value(data, "lawfulBasis")}
            onChange={(e) => update("lawfulBasis", e.target.value)}
            className={fieldClass}
            placeholder="Contract or legitimate interests"
          />
        </Field>
        <Field label="Retention review date">
          <Input
            type="date"
            value={value(data, "retentionReviewDate")}
            onChange={(e) => update("retentionReviewDate", e.target.value)}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
        <Field label="Privacy contact email">
          <Input
            type="email"
            value={value(data, "privacyContactEmail")}
            onChange={(e) => update("privacyContactEmail", e.target.value)}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
        <Field label="Data processing agreement reference">
          <Input
            value={value(data, "dpaReference")}
            onChange={(e) => update("dpaReference", e.target.value)}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
      </div>
      <Field label="Privacy notes">
        <Textarea
          value={value(data, "notes")}
          onChange={(e) => update("notes", e.target.value)}
          className="mt-3 min-h-24 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]"
        />
      </Field>
    </>
  );
}

function RoleProfile({
  role,
  draft,
  setDraft,
}: Omit<Props, "account"> & { role: string }) {
  const { t } = useLanguage();
  const data = draft.roleProfiles[role] ?? {};
  const fields = roleFields[role] ?? [
    ["operationalReference", "Operational reference"],
    ["serviceScope", "Service scope"],
    ["handlingNotes", "Handling notes"],
  ];
  const update = (key: string, next: string) =>
    setDraft({
      ...draft,
      roleProfiles: { ...draft.roleProfiles, [role]: { ...data, [key]: next } },
    });
  return (
    <>
      <SectionTitle
        title={`${role.replace(/\b\w/g, (c) => c.toUpperCase())} details`}
        detail="This tab appears because the role is applied to the account."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([key, label]) => (
          <Field key={key} label={label}>
            <Input
              value={value(data, key)}
              onChange={(e) => update(key, e.target.value)}
              className={fieldClass}
              dir={/code|number|email|portal/i.test(key) ? "ltr" : "auto"}
              maxLength={key === "scacCode" ? 4 : undefined}
            />
          </Field>
        ))}
      </div>
      {role === "consignee" ? (
        <p className="mt-4 text-[11.5px] text-[var(--md-subtle)]">
          {t(
            "Collection addresses are managed in Addresses and are available to booking workflows by address type.",
          )}
        </p>
      ) : null}
    </>
  );
}
