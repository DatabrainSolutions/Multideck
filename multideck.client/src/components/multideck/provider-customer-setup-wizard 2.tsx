import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Building2, CircleCheck, Link2, LoaderCircle, ShieldCheck } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import {
  createProviderCustomer,
  getProviderCustomerContext,
  linkErpNextCustomer,
  type FinanceDraftOptions,
  type ProviderCustomerContext,
} from "@/lib/finance-subledger-api"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type ProviderConnection = FinanceDraftOptions["accountingConnections"][number]
type Organisation = FinanceDraftOptions["parties"][number]
type Stage = "match" | "details" | "review"

type ProviderCustomerSetupWizardProps = {
  open: boolean
  connection: ProviderConnection | null
  organisation: Organisation | null
  onClose: () => void
  onReady: (mapping: FinanceDraftOptions["partyMappings"][number]) => void
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="text-[12px] font-medium text-[var(--md-text)]">{children}</label>
}

function AddressSummary({ context }: { context: ProviderCustomerContext }) {
  const { t } = useLanguage()
  const address = context.billingAddress
  return (
    <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("Billing details from CRM")}</p>
      <p className="mt-2 text-[14px] font-medium text-[var(--md-ink)]">{context.organisation.name}</p>
      {address ? (
        <div className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
          {[address.line1, address.line2, address.townCity, address.countyState, address.postZipCode, address.countryName].filter(Boolean).map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
          {address.email ? <p className="mt-1" data-i18n-skip dir="ltr">{address.email}</p> : null}
          {address.phone ? <p data-i18n-skip dir="ltr">{address.phone}</p> : null}
        </div>
      ) : <p className="mt-2 text-[12px] text-[var(--md-red)]">{t("No active billing address is recorded. Add one in CRM before creating the accounting customer if the provider requires it.")}</p>}
    </div>
  )
}

export function ProviderCustomerSetupWizard({ open, connection, organisation, onClose, onReady }: ProviderCustomerSetupWizardProps) {
  const { t } = useLanguage()
  const [context, setContext] = useState<ProviderCustomerContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>("match")
  const [existingCustomerId, setExistingCustomerId] = useState("")
  const [customerType, setCustomerType] = useState<"Company" | "Individual">("Company")
  const [customerGroup, setCustomerGroup] = useState("")
  const [territory, setTerritory] = useState("")
  const [currencyCode, setCurrencyCode] = useState("")
  const [paymentTerms, setPaymentTerms] = useState("")
  const [accountReference, setAccountReference] = useState("")
  const [vatNumber, setVatNumber] = useState("")
  const [creditLimit, setCreditLimit] = useState("")
  const [paymentDueDays, setPaymentDueDays] = useState("")

  useEffect(() => {
    if (!open || !connection || !organisation) return
    let active = true
    setLoading(true)
    setError(null)
    setContext(null)
    void getProviderCustomerContext(connection.ACCIC_ID, organisation.Org_id)
      .then((next) => {
        if (!active) return
        setContext(next)
        const exactMatch = next.erpNext?.customers.find((customer) => (customer.customer_name || customer.name).trim().toLowerCase() === next.organisation.name.trim().toLowerCase())
        setExistingCustomerId(exactMatch?.name ?? "")
        setCustomerType("Company")
        setCustomerGroup(next.erpNext?.customerGroups[0] ?? "")
        setTerritory(next.erpNext?.territories[0] ?? "")
        setCurrencyCode(next.organisation.currencyCode ?? "")
        setPaymentTerms("")
        setAccountReference(next.sage50?.suggestedAccountReference ?? "")
        setVatNumber("")
        setCreditLimit("")
        setPaymentDueDays("")
        setStage(next.provider.code === "erpnext" ? "match" : "details")
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t("The accounting customer wizard could not be loaded.")) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [connection, open, organisation, t])

  const isErpNext = context?.provider.code === "erpnext"
  const selectedExisting = useMemo(() => context?.erpNext?.customers.find((customer) => customer.name === existingCustomerId) ?? null, [context, existingCustomerId])
  const canContinueDetails = isErpNext ? Boolean(customerGroup && territory && currencyCode) : Boolean(accountReference && currencyCode && context?.sage50?.ready)

  const linkExisting = async () => {
    if (!context || !existingCustomerId) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await linkErpNextCustomer(context.provider.connectionId, context.organisation.id, existingCustomerId)
      toast.success(t("ERPNext customer linked"))
      onReady(result.mapping)
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("The ERPNext customer could not be linked.")) } finally { setSubmitting(false) }
  }

  const createCustomer = async () => {
    if (!context) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await createProviderCustomer({
        connectionId: context.provider.connectionId,
        orgId: context.organisation.id,
        customerType,
        customerGroup: isErpNext ? customerGroup : undefined,
        territory: isErpNext ? territory : undefined,
        currencyCode,
        paymentTerms: paymentTerms || null,
        accountReference: isErpNext ? null : accountReference,
        vatNumber: isErpNext ? null : vatNumber || null,
        creditLimit: isErpNext || !creditLimit ? null : Number(creditLimit),
        paymentDueDays: isErpNext || !paymentDueDays ? null : Number(paymentDueDays),
      })
      toast.success(t(`${context.provider.name} customer created`))
      if (result.warning) toast.warning(t(result.warning))
      onReady(result.mapping)
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("The accounting customer could not be created.")) } finally { setSubmitting(false) }
  }

  const steps = isErpNext ? ["Match", "Provider details", "Review"] : ["Provider details", "Review"]
  const currentStep = isErpNext ? stage === "match" ? 0 : stage === "details" ? 1 : 2 : stage === "details" ? 0 : 1

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !submitting) onClose() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{t(`Set up customer in ${context?.provider.name ?? (connection?.ACCIC_ProviderCode === "sage_50" ? "Sage 50 Desktop" : "ERPNext")}`)}</DialogTitle>
          <DialogDescription>{t("Review the Multideck customer, choose the accounting-specific defaults, then create or link one exact provider record.")}</DialogDescription>
        </DialogHeader>

        {loading ? <div className="grid min-h-72 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : error && !context ? <div role="alert" className="my-5 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] p-4 text-[13px] leading-5 text-[var(--md-red)]">{t(error)}</div> : context ? (
          <div className="space-y-5 py-5">
            <ol className="flex items-center gap-2" aria-label={t("Customer setup progress")}>
              {steps.map((step, index) => <li key={step} className="flex min-w-0 flex-1 items-center gap-2"><span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-medium", index <= currentStep ? "bg-[var(--md-accent)] text-white" : "bg-[var(--md-surface-soft)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]")} data-i18n-skip dir="ltr">{index < currentStep ? <CircleCheck className="size-3.5" /> : index + 1}</span><span className={cn("truncate text-[11px]", index === currentStep ? "font-medium text-[var(--md-ink)]" : "text-[var(--md-subtle)]")}>{t(step)}</span>{index < steps.length - 1 ? <span className="ms-auto h-px flex-1 bg-[var(--md-line)]" /> : null}</li>)}
            </ol>

            {stage === "match" && context.erpNext ? (
              <div className="space-y-4">
                <AddressSummary context={context} />
                <div className="space-y-2">
                  <Label htmlFor="provider-existing-customer">{t("Existing ERPNext customer")}</Label>
                  <Select value={existingCustomerId} onValueChange={setExistingCustomerId}><SelectTrigger id="provider-existing-customer"><SelectValue placeholder={t("Choose an existing customer")} /></SelectTrigger><SelectContent>{context.erpNext.customers.map((customer) => <SelectItem key={customer.name} value={customer.name}>{customer.customer_name || customer.name}{customer.name !== customer.customer_name ? ` · ${customer.name}` : ""}</SelectItem>)}</SelectContent></Select>
                  <p className="text-[12px] leading-5 text-[var(--md-subtle)]">{t("Link only when this is the same legal customer. Otherwise create a new ERPNext customer.")}</p>
                </div>
                {selectedExisting ? <div className="flex items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-3 text-[12px]"><div><p className="font-medium text-[var(--md-ink)]">{selectedExisting.customer_name || selectedExisting.name}</p><p className="mt-0.5 text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{selectedExisting.name}</p></div><Button type="button" variant="outline" onClick={() => void linkExisting()} disabled={submitting}><Link2 className="size-4" />{t("Link customer")}</Button></div> : null}
                <div className="flex items-center gap-3"><span className="h-px flex-1 bg-[var(--md-line)]" /><span className="text-[11px] uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("or")}</span><span className="h-px flex-1 bg-[var(--md-line)]" /></div>
                <Button type="button" className="w-full" onClick={() => setStage("details")}><Building2 className="size-4" />{t("Create new ERPNext customer")}</Button>
              </div>
            ) : null}

            {stage === "details" ? (
              <div className="space-y-5">
                <AddressSummary context={context} />
                {isErpNext && context.erpNext ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="provider-customer-type">{t("Customer type")}</Label><Select value={customerType} onValueChange={(value: "Company" | "Individual") => setCustomerType(value)}><SelectTrigger id="provider-customer-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Company">{t("Company")}</SelectItem><SelectItem value="Individual">{t("Individual")}</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2"><Label htmlFor="provider-customer-group">{t("Customer group")}</Label><Select value={customerGroup} onValueChange={setCustomerGroup}><SelectTrigger id="provider-customer-group"><SelectValue placeholder={t("Choose customer group")} /></SelectTrigger><SelectContent>{context.erpNext.customerGroups.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label htmlFor="provider-territory">{t("Territory")}</Label><Select value={territory} onValueChange={setTerritory}><SelectTrigger id="provider-territory"><SelectValue placeholder={t("Choose territory")} /></SelectTrigger><SelectContent>{context.erpNext.territories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label htmlFor="provider-currency">{t("Billing currency")}</Label><Input id="provider-currency" maxLength={3} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} data-i18n-skip dir="ltr" /></div>
                    <div className="space-y-2 sm:col-span-2"><Label htmlFor="provider-payment-terms">{t("Payment terms")}</Label><Select value={paymentTerms || "none"} onValueChange={(value) => setPaymentTerms(value === "none" ? "" : value)}><SelectTrigger id="provider-payment-terms"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("Use ERPNext default")}</SelectItem>{context.erpNext.paymentTerms.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                ) : context.sage50 ? (
                  <div className="space-y-4">
                    {!context.sage50.ready ? <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] p-4 text-[13px] leading-5 text-[var(--md-red)]"><p className="font-medium">{t("HyperExt is not ready")}</p><p className="mt-1">{t(context.sage50.error || "Check the Sage 50 desktop company, SDO, ODBC and tenant connector configuration.")}</p></div> : <div className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-accent),transparent_91%)] p-4 text-[12px] text-[var(--md-text)]"><p className="font-medium text-[var(--md-ink)]">{t("HyperExt connected")}</p><p className="mt-1"><span data-i18n-skip dir="ltr">{context.sage50.status?.companyName}</span> · Sage <span data-i18n-skip dir="ltr">{context.sage50.status?.sageVersion}</span> · API <span data-i18n-skip dir="ltr">{context.sage50.status?.apiVersion}</span></p></div>}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label htmlFor="sage-account-reference">{t("Sage account reference")}</Label><Input id="sage-account-reference" maxLength={8} value={accountReference} onChange={(event) => setAccountReference(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} data-i18n-skip dir="ltr" /><p className="text-[11px] text-[var(--md-subtle)]">{t("Up to eight letters or numbers. This becomes the permanent Sage customer key.")}</p></div>
                      <div className="space-y-2"><Label htmlFor="sage-currency">{t("Currency")}</Label><Input id="sage-currency" maxLength={3} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} data-i18n-skip dir="ltr" /></div>
                      <div className="space-y-2"><Label htmlFor="sage-vat-number">{t("VAT number")}</Label><Input id="sage-vat-number" value={vatNumber} onChange={(event) => setVatNumber(event.target.value)} data-i18n-skip dir="ltr" /></div>
                      <div className="space-y-2"><Label htmlFor="sage-payment-days">{t("Payment due days")}</Label><Input id="sage-payment-days" type="number" min="0" step="1" value={paymentDueDays} onChange={(event) => setPaymentDueDays(event.target.value)} data-i18n-skip dir="ltr" /></div>
                      <div className="space-y-2"><Label htmlFor="sage-credit-limit">{t("Credit limit")}</Label><Input id="sage-credit-limit" type="number" min="0" step="0.01" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} data-i18n-skip dir="ltr" /></div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {stage === "review" ? (
              <div className="space-y-4">
                <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 text-[12px] shadow-[var(--md-shadow-line)] sm:grid-cols-2">
                  <div><p className="text-[var(--md-subtle)]">{t("Multideck customer")}</p><p className="mt-1 font-medium text-[var(--md-ink)]">{context.organisation.name}</p></div>
                  <div><p className="text-[var(--md-subtle)]">{t("Accounting system")}</p><p className="mt-1 font-medium text-[var(--md-ink)]">{context.provider.name}</p></div>
                  {isErpNext ? <><div><p className="text-[var(--md-subtle)]">{t("Customer group")}</p><p className="mt-1 font-medium text-[var(--md-ink)]">{customerGroup}</p></div><div><p className="text-[var(--md-subtle)]">{t("Territory")}</p><p className="mt-1 font-medium text-[var(--md-ink)]">{territory}</p></div></> : <><div><p className="text-[var(--md-subtle)]">{t("Sage account reference")}</p><p className="mt-1 font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{accountReference}</p></div><div><p className="text-[var(--md-subtle)]">{t("HyperExt company")}</p><p className="mt-1 font-medium text-[var(--md-ink)]">{context.sage50?.status?.companyName}</p></div></>}
                  <div><p className="text-[var(--md-subtle)]">{t("Currency")}</p><p className="mt-1 font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{currencyCode}</p></div>
                </div>
                <div className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-accent),transparent_91%)] p-4 text-[13px] leading-5 text-[var(--md-text)]"><p className="font-medium text-[var(--md-ink)]">{t("External change")}</p><p className="mt-1">{t(`Create one customer in ${context.provider.name} and bind it to this Multideck organisation. The invoice remains a separate draft.`)}</p></div>
              </div>
            ) : null}

            {error ? <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] p-4 text-[13px] leading-5 text-[var(--md-red)]">{t(error)}</div> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={stage === "details" && isErpNext ? () => setStage("match") : stage === "review" ? () => setStage("details") : onClose} disabled={submitting}>
            {stage !== "match" && (isErpNext || stage === "review") ? <ArrowLeft className="size-4 rtl:rotate-180" /> : null}{t(stage === "match" || (!isErpNext && stage === "details") ? "Cancel" : "Back")}
          </Button>
          {context && stage === "details" ? <Button type="button" onClick={() => setStage("review")} disabled={!canContinueDetails || submitting}>{t("Review customer")}</Button> : null}
          {context && stage === "review" ? <Button type="button" onClick={() => void createCustomer()} disabled={!canContinueDetails || submitting}>{submitting ? <LoaderCircle className="animate-spin" /> : <ShieldCheck className="size-4" />}{t(`Create in ${context.provider.name}`)}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
