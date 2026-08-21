import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Download,
  FileText,
  LoaderCircle,
  Plus,
  Trash2,
} from "@/components/icons/hugeicons";
import { Surface } from "@/components/multideck/surface";
import { TabsRail } from "@/components/multideck/workflow-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
function value(source: Record<string, unknown>, key: string) {
  return typeof source[key] === "string" ? String(source[key]) : "";
}
function listValue(source: Record<string, unknown>, key: string) {
  return Array.isArray(source[key])
    ? (source[key] as unknown[])
        .filter((item): item is string => typeof item === "string")
        .join(", ")
    : value(source, key);
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
        .map((role) => ({
          id: `role:${role}`,
          label: t(
            account.types.find((type) => roleKey(type) === role) ?? role,
          ),
        })),
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
      id: "contacts",
      label: t("Contacts"),
      value: String(account.contacts.length),
    },
    {
      id: "addresses",
      label: t("Addresses"),
      value: String(account.addresses.length),
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
  onChange,
}: {
  account: ApiCustomerDetail;
  activeTab: Exclude<AccountDetailTab, "overview">;
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
      <Financial draft={draft} setDraft={setDraft} />
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
            disabled={saving || account.operations == null}
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
function Financial({ draft, setDraft }: Omit<Props, "account">) {
  const { t } = useLanguage();
  const data = draft.invoicePreferences;
  const update = (key: string, next: unknown) =>
    setDraft({ ...draft, invoicePreferences: { ...data, [key]: next } });
  return (
    <>
      <SectionTitle
        title="Financial and invoicing"
        detail="Receivable and payable terms are separate; structured term rules support due-date calculation and currencies remain independent of nominal-ledger mappings."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <Field label="Primary currency">
          <Input
            maxLength={3}
            value={value(data, "primaryCurrency")}
            onChange={(e) =>
              update("primaryCurrency", e.target.value.toUpperCase())
            }
            className={fieldClass}
            dir="ltr"
            placeholder="GBP"
          />
        </Field>
        <Field label="Receivable term days">
          <Input
            type="number"
            min={0}
            max={730}
            value={value(data, "receivableTermDays")}
            onChange={(e) => update("receivableTermDays", e.target.value)}
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
            onCheckedChange={(next) => update("receivableEndOfMonth", next)}
          />
          {t("Receivable end of month")}
        </label>
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
            onCheckedChange={(next) => update("payableEndOfMonth", next)}
          />
          {t("Payable end of month")}
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
        <Field label="Invoice delivery">
          <Input
            value={value(data, "invoiceDeliveryMethod")}
            onChange={(e) => update("invoiceDeliveryMethod", e.target.value)}
            className={fieldClass}
            placeholder="Email, EDI or portal"
          />
        </Field>
        <Field label="Supported invoice currencies">
          <Input
            value={listValue(data, "supportedCurrencies")}
            onChange={(e) =>
              update(
                "supportedCurrencies",
                e.target.value
                  .split(",")
                  .map((item) => item.trim().toUpperCase())
                  .filter(Boolean),
              )
            }
            className={fieldClass}
            dir="ltr"
            placeholder="GBP, EUR, USD"
          />
        </Field>
        <Field label="Accounts receivable code">
          <Input
            value={value(data, "receivableAccountCode")}
            onChange={(e) => update("receivableAccountCode", e.target.value)}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
        <Field label="Accounts payable code">
          <Input
            value={value(data, "payableAccountCode")}
            onChange={(e) => update("payableAccountCode", e.target.value)}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
      </div>
      <Field label="Invoice instructions">
        <Textarea
          value={value(data, "invoiceInstructions")}
          onChange={(e) => update("invoiceInstructions", e.target.value)}
          className="mt-3 min-h-24 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-[13px] shadow-[var(--md-shadow-line)]"
        />
      </Field>
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
