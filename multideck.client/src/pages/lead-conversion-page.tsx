import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CircleDollarSign,
  LoaderCircle,
  Route,
  Sparkles,
} from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { MultideckDatePicker, MultideckDateTimePicker } from "@/components/multideck/date-picker"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { useLanguage } from "@/i18n/language-provider"
import {
  convertLeadToDeal,
  getDealConversionOptions,
  type ApiDeal,
  type ApiDealConversionOptions,
  type ConvertLeadToDealInput,
} from "@/lib/deal-api"
import { getLead, type ApiLeadDetail } from "@/lib/lead-api"
import { cn } from "@/lib/utils"

type WizardData = {
  name: string
  opportunityTypeCode: string
  primaryContactId: string
  expectedCloseDate: string
  expectedValueAmount: string
  expectedMarginAmount: string
  currencyCode: string
  probabilityPct: string
  modeCode: string
  directionCode: string
  originName: string
  destinationName: string
  tradeLane: string
  serviceInterest: string
  customerNeed: string
  valueProposition: string
  nextActionDueAt: string
  conversionNotes: string
}

const steps = [
  { title: "Deal basics", description: "Name, type and contact", icon: Building2 },
  { title: "Commercials", description: "Value, margin and close date", icon: CircleDollarSign },
  { title: "Freight & next action", description: "Scope and immediate follow-up", icon: Route },
  { title: "Review", description: "Confirm before creating", icon: Check },
] as const

const inputClass = "h-10 rounded-[var(--md-radius-lg)] bg-white/70 px-3 shadow-[var(--md-shadow-line)]"
const selectClass = "h-10 w-full rounded-[var(--md-radius-lg)] bg-white/70 px-3 shadow-[var(--md-shadow-line)]"

function toDateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function toDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function initialData(lead: ApiLeadDetail, options: ApiDealConversionOptions): WizardData {
  const closeDate = new Date()
  closeDate.setDate(closeDate.getDate() + 30)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  const leadFollowUp = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null
  const nextAction = leadFollowUp && leadFollowUp > new Date() ? leadFollowUp : tomorrow
  const probability = lead.conversionProbability === null
    ? 50
    : lead.conversionProbability <= 1
      ? lead.conversionProbability * 100
      : lead.conversionProbability

  return {
    name: `${lead.companyName} — ${lead.serviceInterest || "new opportunity"}`,
    opportunityTypeCode: options.opportunityTypes[0]?.code ?? "",
    primaryContactId: lead.contacts.find((contact) => contact.isPrimary)?.id ?? "",
    expectedCloseDate: toDateInput(closeDate),
    expectedValueAmount: lead.valueAmount?.toString() ?? "",
    expectedMarginAmount: "",
    currencyCode: lead.valueCurrencyCode ?? "GBP",
    probabilityPct: Math.round(probability).toString(),
    modeCode: "",
    directionCode: "",
    originName: "",
    destinationName: "",
    tradeLane: lead.tradeLane ?? "",
    serviceInterest: lead.serviceInterest ?? "",
    customerNeed: lead.valueContext ?? "",
    valueProposition: "",
    nextActionDueAt: toDateTimeInput(nextAction),
    conversionNotes: "",
  }
}

function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn("grid min-w-0 gap-1.5", className)}>
      <span className="text-[12px] font-medium text-[var(--md-text)]">
        {label}{required ? <span className="ms-1 text-[var(--md-red)]" aria-hidden="true">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[10.5px] leading-4 text-[var(--md-subtle)]">{hint}</span> : null}
    </label>
  )
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function missingForStep(step: number, data: WizardData) {
  if (step === 0) {
    return [
      !data.name.trim() && "Deal name",
      !data.opportunityTypeCode && "Deal type",
    ].filter(Boolean) as string[]
  }
  if (step === 1) {
    return [
      !data.expectedCloseDate && "Expected close date",
      !data.probabilityPct && "Probability",
      (data.expectedValueAmount || data.expectedMarginAmount) && !data.currencyCode && "Currency",
    ].filter(Boolean) as string[]
  }
  if (step === 2) {
    return [
      !data.customerNeed.trim() && "Customer need",
      !data.nextActionDueAt && "Next action",
    ].filter(Boolean) as string[]
  }
  return []
}

function StepProgress({
  activeStep,
  onSelect,
}: {
  activeStep: number
  onSelect: (step: number) => void
}) {
  const { t } = useLanguage()

  return (
    <nav aria-label={t("Deal conversion progress")} className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
      {steps.map((step, index) => {
        const Icon = step.icon
        const completed = index < activeStep
        return (
          <button
            key={step.title}
            type="button"
            className={cn(
              "min-w-0 rounded-[var(--md-radius-lg)] px-3 py-2.5 text-start shadow-[var(--md-shadow-line)] transition-[background,color,transform] duration-200",
              index === activeStep ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)]" : "bg-white/55 text-[var(--md-text)] hover:bg-white/80",
            )}
            onClick={() => onSelect(index)}
          >
            <span className="flex items-center gap-2">
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", index === activeStep ? "bg-white/16" : "bg-[var(--md-surface-tint)]")}>
                {completed ? <Check className="size-3.5" strokeWidth={1.6} /> : <Icon className="size-3.5" strokeWidth={1.3} />}
              </span>
              <span className="truncate text-[11.5px] font-medium">{t(step.title)}</span>
            </span>
            <span className={cn("mt-1 block truncate ps-8 text-[9.5px]", index === activeStep ? "text-white/72" : "text-[var(--md-subtle)]")}>
              {t(step.description)}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

export function LeadConversionPage({
  navigate,
  leadId,
}: {
  navigate: (path: string) => void
  leadId: string
}) {
  const { language, t } = useLanguage()
  const [lead, setLead] = useState<ApiLeadDetail | null>(null)
  const [options, setOptions] = useState<ApiDealConversionOptions | null>(null)
  const [data, setData] = useState<WizardData | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [createdDeal, setCreatedDeal] = useState<ApiDeal | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([getLead(leadId), getDealConversionOptions()])
      .then(([nextLead, nextOptions]) => {
        if (!active) return
        setLead(nextLead)
        setOptions(nextOptions)
        setData(initialData(nextLead, nextOptions))
        setLoadState("ready")
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : t("The conversion wizard could not be loaded."))
        setLoadState("error")
      })
    return () => {
      active = false
    }
  }, [leadId, t])

  const missing = useMemo(() => data ? missingForStep(activeStep, data) : [], [activeStep, data])

  function update<K extends keyof WizardData>(field: K, value: WizardData[K]) {
    setData((current) => current ? { ...current, [field]: value } : current)
    setError(null)
  }

  function goNext() {
    if (!data) return
    const nextMissing = missingForStep(activeStep, data)
    if (nextMissing.length) {
      setError(t("Complete the required fields before continuing."))
      return
    }
    setError(null)
    setActiveStep((step) => Math.min(step + 1, steps.length - 1))
  }

  async function createDeal() {
    if (!data || !lead) return
    const allMissing = [0, 1, 2].flatMap((step) => missingForStep(step, data))
    if (allMissing.length) {
      setError(t("Complete the required fields before creating the deal."))
      setActiveStep([0, 1, 2].find((step) => missingForStep(step, data).length > 0) ?? 0)
      return
    }

    const payload: ConvertLeadToDealInput = {
      name: data.name.trim(),
      opportunityTypeCode: data.opportunityTypeCode,
      primaryContactId: data.primaryContactId || null,
      expectedCloseDate: data.expectedCloseDate,
      expectedValueAmount: parseOptionalNumber(data.expectedValueAmount),
      expectedMarginAmount: parseOptionalNumber(data.expectedMarginAmount),
      currencyCode: data.currencyCode || null,
      probabilityPct: Number(data.probabilityPct),
      modeCode: data.modeCode || null,
      directionCode: data.directionCode || null,
      originName: data.originName.trim() || null,
      destinationName: data.destinationName.trim() || null,
      tradeLane: data.tradeLane.trim() || null,
      serviceInterest: data.serviceInterest.trim() || null,
      customerNeed: data.customerNeed.trim(),
      valueProposition: data.valueProposition.trim() || null,
      nextActionDueAt: new Date(data.nextActionDueAt).toISOString(),
      conversionNotes: data.conversionNotes.trim() || null,
    }

    setSaving(true)
    setError(null)
    try {
      const result = await convertLeadToDeal(lead.id, payload)
      setCreatedDeal(result)
      toast.success(result.wasAlreadyConverted ? t("Deal already exists") : t("Deal created"), {
        description: result.name,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("This lead could not be converted."))
    } finally {
      setSaving(false)
    }
  }

  if (loadState === "loading") {
    return (
      <div className="md-page">
        <Surface padding="lg" className="grid min-h-[360px] place-items-center rounded-[var(--md-radius-xl)]" role="status">
          <div className="text-center">
            <LoaderCircle className="mx-auto size-6 animate-spin text-[var(--md-accent)]" strokeWidth={1.4} />
            <p className="mt-3 text-[13px] text-[var(--md-text)]">{t("Preparing deal conversion…")}</p>
          </div>
        </Surface>
      </div>
    )
  }

  if (loadState === "error" || !lead || !options || !data) {
    return (
      <div className="md-page md-page-stack">
        <Button variant="ghost" className="w-fit" onClick={() => navigate(`/crm/leads/${leadId}`)}>
          <ArrowLeft data-icon="inline-start" />{t("Back to lead")}
        </Button>
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]" role="alert">
          <h1 className="text-[18px] font-medium text-[var(--md-ink)]">{t("The conversion wizard could not be loaded.")}</h1>
          <p className="mt-2 text-[13px] text-[var(--md-text)]">{error}</p>
        </Surface>
      </div>
    )
  }

  if (createdDeal) {
    return (
      <div className="md-page">
        <Surface padding="lg" className="mx-auto max-w-[760px] overflow-hidden rounded-[var(--md-radius-xl)] text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
            <CheckCircle2 className="size-6" strokeWidth={1.4} />
          </span>
          <h1 className="mt-4 text-[24px] font-medium text-[var(--md-ink)]">
            {createdDeal.wasAlreadyConverted ? t("This lead is already a deal") : t("Deal created")}
          </h1>
          <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-6 text-[var(--md-text)]">
            {t("The lead, contact, commercial context and next action are now linked to the deal record.")}
          </p>
          <div className="mx-auto mt-6 grid max-w-[540px] gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-4 text-start shadow-[var(--md-shadow-line)] sm:grid-cols-2">
            <div>
              <p className="text-[10.5px] text-[var(--md-subtle)]">{t("Deal")}</p>
              <p className="mt-1 text-[13px] font-medium text-[var(--md-ink)]">{createdDeal.name}</p>
            </div>
            <div>
              <p className="text-[10.5px] text-[var(--md-subtle)]">{t("Stage")}</p>
              <p className="mt-1 text-[13px] font-medium text-[var(--md-ink)]">{createdDeal.stageName}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="ghost" className="h-10 rounded-[var(--md-radius-lg)] bg-white/55 px-4 shadow-[var(--md-shadow-line)]" onClick={() => navigate(`/crm/leads/${lead.id}`)}>
              {t("Return to lead")}
            </Button>
            <Button className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[var(--md-accent-ink)]" onClick={() => navigate("/crm/deals")}>
              {t("View in Deals")}<ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </Surface>
      </div>
    )
  }

  const primaryContact = lead.contacts.find((contact) => contact.id === data.primaryContactId)
  const value = parseOptionalNumber(data.expectedValueAmount)
  const currencyFormatter = value === null
    ? null
    : new Intl.NumberFormat(language, { style: "currency", currency: data.currencyCode || "GBP", maximumFractionDigits: 0 })

  return (
    <div className="md-page">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" className="size-9 rounded-[var(--md-radius-lg)] bg-white/45 p-0 shadow-[var(--md-shadow-line)]" aria-label={t("Back to lead")} onClick={() => navigate(`/crm/leads/${lead.id}`)}>
          <ArrowLeft className="size-4" strokeWidth={1.3} />
        </Button>
        <div className="min-w-0">
          <p className="text-[11px] text-[var(--md-subtle)]">{t("Convert lead to deal")}</p>
          <h1 className="truncate text-[24px] font-medium text-[var(--md-ink)]">{lead.companyName}</h1>
        </div>
      </div>

      <div className="grid items-start gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_350px]">
        <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="p-4 sm:p-5">
            <StepProgress
              activeStep={activeStep}
              onSelect={(nextStep) => {
                if (nextStep > activeStep && missingForStep(activeStep, data).length) {
                  setError(t("Complete the required fields before continuing."))
                  return
                }
                setError(null)
                setActiveStep(nextStep)
              }}
            />
          </div>

          <div className="min-h-[390px] px-4 pb-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] sm:px-5 sm:pb-5">
            <div className="py-5">
              <h2 className="text-[18px] font-medium text-[var(--md-ink)]">{t(steps[activeStep].title)}</h2>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">{t(steps[activeStep].description)}</p>
            </div>

            {activeStep === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Deal name")} required className="sm:col-span-2">
                  <Input value={data.name} onChange={(event) => update("name", event.target.value)} className={inputClass} autoFocus />
                </Field>
                <Field label={t("Deal type")} required>
                  <Select value={data.opportunityTypeCode} onValueChange={(value) => update("opportunityTypeCode", value)}>
                    <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {options.opportunityTypes.map((type) => <SelectItem key={type.code} value={type.code}>{type.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("Primary contact")} hint={t("Optional when the buying contact is not known yet.")}>
                  <Select value={data.primaryContactId || "__none"} onValueChange={(value) => update("primaryContactId", value === "__none" ? "" : value)}>
                    <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{t("No primary contact")}</SelectItem>
                      {lead.contacts.map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.name || contact.email || t("Unnamed contact")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ) : null}

            {activeStep === 1 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Expected close date")} required>
                  <MultideckDatePicker value={data.expectedCloseDate || null} onChange={(date) => update("expectedCloseDate", date ?? "")} placeholder="Select date" title="Expected close date" description="Pick the date this deal is expected to close." minDate={toDateInput(new Date())} triggerClassName={inputClass} />
                </Field>
                <Field label={t("Win probability")} required hint={t("Used to calculate weighted pipeline value.")}>
                  <div className="relative">
                    <Input type="number" min="0" max="100" step="1" value={data.probabilityPct} onChange={(event) => update("probabilityPct", event.target.value)} className={cn(inputClass, "pe-9")} dir="ltr" />
                    <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[12px] text-[var(--md-subtle)]">%</span>
                  </div>
                </Field>
                <Field label={t("Expected value")}>
                  <Input type="number" min="0" step="0.01" value={data.expectedValueAmount} onChange={(event) => update("expectedValueAmount", event.target.value)} className={inputClass} dir="ltr" />
                </Field>
                <Field label={t("Currency")}>
                  <Select value={data.currencyCode} onValueChange={(value) => update("currencyCode", value)}>
                    <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["GBP", "EUR", "USD", "AED", "DKK"].map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("Expected margin")} hint={t("Optional until pricing is available.")}>
                  <Input type="number" min="0" step="0.01" value={data.expectedMarginAmount} onChange={(event) => update("expectedMarginAmount", event.target.value)} className={inputClass} dir="ltr" />
                </Field>
              </div>
            ) : null}

            {activeStep === 2 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Transport mode")}>
                  <Select value={data.modeCode || "__none"} onValueChange={(value) => update("modeCode", value === "__none" ? "" : value)}>
                    <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{t("Not decided")}</SelectItem>
                      {["air", "ocean", "road", "rail", "multimodal"].map((mode) => <SelectItem key={mode} value={mode}>{t(mode[0].toUpperCase() + mode.slice(1))}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("Direction")}>
                  <Select value={data.directionCode || "__none"} onValueChange={(value) => update("directionCode", value === "__none" ? "" : value)}>
                    <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{t("Not decided")}</SelectItem>
                      <SelectItem value="import">{t("Import")}</SelectItem>
                      <SelectItem value="export">{t("Export")}</SelectItem>
                      <SelectItem value="cross_trade">{t("Cross trade")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("Origin")}>
                  <Input value={data.originName} onChange={(event) => update("originName", event.target.value)} placeholder={t("City, port or airport")} className={inputClass} />
                </Field>
                <Field label={t("Destination")}>
                  <Input value={data.destinationName} onChange={(event) => update("destinationName", event.target.value)} placeholder={t("City, port or airport")} className={inputClass} />
                </Field>
                <Field label={t("Trade lane")}>
                  <Input value={data.tradeLane} onChange={(event) => update("tradeLane", event.target.value)} className={inputClass} />
                </Field>
                <Field label={t("Service interest")}>
                  <Input value={data.serviceInterest} onChange={(event) => update("serviceInterest", event.target.value)} className={inputClass} />
                </Field>
                <Field label={t("Customer need")} required className="sm:col-span-2" hint={t("What outcome is the customer buying?")}>
                  <Textarea value={data.customerNeed} onChange={(event) => update("customerNeed", event.target.value)} className="min-h-[76px] rounded-[var(--md-radius-lg)] bg-white/70 shadow-[var(--md-shadow-line)]" />
                </Field>
                <Field label={t("Value proposition")} className="sm:col-span-2">
                  <Textarea value={data.valueProposition} onChange={(event) => update("valueProposition", event.target.value)} className="min-h-[70px] rounded-[var(--md-radius-lg)] bg-white/70 shadow-[var(--md-shadow-line)]" />
                </Field>
                <Field label={t("Next action")} required className="sm:col-span-2" hint={t("The first concrete action after the deal is created.")}>
                  <MultideckDateTimePicker value={data.nextActionDueAt} onChange={(nextActionDueAt) => update("nextActionDueAt", nextActionDueAt)} placeholder="Select date" title="Next action" description="Pick when the next action is due." triggerClassName={inputClass} timeClassName={inputClass} />
                </Field>
              </div>
            ) : null}

            {activeStep === 3 ? (
              <div className="grid gap-3">
                {[
                  [t("Deal"), data.name],
                  [t("Company"), lead.companyName],
                  [t("Primary contact"), primaryContact?.name || primaryContact?.email || t("Not recorded")],
                  [t("Expected close"), new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${data.expectedCloseDate}T12:00:00`))],
                  [t("Expected value"), currencyFormatter && value !== null ? currencyFormatter.format(value) : t("Not recorded")],
                  [t("Probability"), `${data.probabilityPct}%`],
                  [t("Freight scope"), [data.modeCode, data.tradeLane, data.serviceInterest].filter(Boolean).join(" · ") || t("Not recorded")],
                  [t("Customer need"), data.customerNeed],
                  [t("Next action"), new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.nextActionDueAt))],
                ].map(([label, summary]) => (
                  <div key={label} className="grid gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5 shadow-[var(--md-shadow-line)] sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
                    <p className="text-[10.5px] font-medium text-[var(--md-subtle)]">{label}</p>
                    <p className="text-[12.5px] leading-5 text-[var(--md-ink)]">{summary}</p>
                  </div>
                ))}
                <Field label={t("Conversion notes")} hint={t("Optional internal context recorded on the conversion audit.")}>
                  <Textarea value={data.conversionNotes} onChange={(event) => update("conversionNotes", event.target.value)} className="min-h-[72px] rounded-[var(--md-radius-lg)] bg-white/70 shadow-[var(--md-shadow-line)]" />
                </Field>
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-[var(--md-radius-lg)] bg-[rgba(196,72,63,0.08)] px-3 py-2.5 text-[12px] text-[var(--md-red)]" role="alert">
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-[var(--md-radius-lg)] bg-white/55 px-4 shadow-[var(--md-shadow-line)]"
                disabled={activeStep === 0 || saving}
                onClick={() => {
                  setError(null)
                  setActiveStep((step) => Math.max(0, step - 1))
                }}
              >
                <ArrowLeft data-icon="inline-start" />{t("Back")}
              </Button>
              <div className="text-end">
                {missing.length ? <p className="mb-1 text-[10px] text-[var(--md-subtle)]">{t("Required")}: {missing.map(t).join(", ")}</p> : null}
                {activeStep < steps.length - 1 ? (
                  <Button type="button" className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[var(--md-accent-ink)]" onClick={goNext}>
                    {t("Continue")}<ArrowRight data-icon="inline-end" />
                  </Button>
                ) : (
                  <Button type="button" className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[var(--md-accent-ink)]" disabled={saving} onClick={() => void createDeal()}>
                    {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" strokeWidth={1.3} />}
                    {saving ? t("Creating deal…") : t("Create deal")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Surface>

        <aside className="sticky top-[76px] min-w-0">
          <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
            <div className="flex items-center gap-3">
              <CustomerAvatar initials={lead.initials} size="md" />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{lead.companyName}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--md-subtle)]">{lead.sourceName}</p>
              </div>
              <StatusPill tone={lead.isConverted ? "teal" : "green"}>{lead.statusName}</StatusPill>
            </div>
            <div className="mt-4 grid gap-2">
              {[
                [t("Owner"), lead.ownerName || t("Unassigned")],
                [t("Lead score"), lead.qualificationScore === null ? t("Not scored") : `${lead.qualificationScore}/100`],
                [t("Lead value"), lead.valueAmount === null ? t("Not recorded") : new Intl.NumberFormat(language, { style: "currency", currency: lead.valueCurrencyCode || "GBP", maximumFractionDigits: 0 }).format(lead.valueAmount)],
                [t("Service interest"), lead.serviceInterest || t("Not recorded")],
                [t("Trade lane"), lead.tradeLane || t("Not recorded")],
              ].map(([label, summary]) => (
                <div key={label} className="grid grid-cols-[105px_minmax(0,1fr)] gap-3 py-1.5 shadow-[inset_0_-1px_0_rgba(11,20,19,0.055)] last:shadow-none">
                  <p className="text-[10.5px] text-[var(--md-subtle)]">{label}</p>
                  <p className="break-words text-end text-[11.5px] font-medium text-[var(--md-ink)]">{summary}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10.5px] leading-5 text-[var(--md-subtle)]">
              {t("Known lead data is prefilled. The wizard only asks for the commercial information needed to manage this as a deal.")}
            </p>
          </Surface>
        </aside>
      </div>
    </div>
  )
}
