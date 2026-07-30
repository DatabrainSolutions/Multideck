import { useState } from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider, useLanguage } from "./i18n/language-provider"
import { CrmLeadDetailPanel } from "./components/multideck/crm-components"
import { CopyFeedbackTransition, CopyStatusIcon } from "./components/multideck/copyable-field"
import type { ApiLeadDetail } from "./lib/lead-api"
import "./styles.css"

/**
 * Harness for the lead detail copy interactions. The real /crm/leads route needs a tenant Supabase
 * session, so this renders the same panel against fixture data to check copy feedback in isolation.
 */
const lead: ApiLeadDetail = {
  id: "lead-1",
  companyName: "Northstar Logistics",
  initials: "NL",
  primaryContactName: "Amelia Hart",
  primaryContactEmail: "amelia.hart@northstar-logistics.example",
  countryCode: "GB",
  sourceCode: "referral",
  sourceName: "Inbound referral",
  ownerId: "user-1",
  ownerName: "Harry Phillips",
  ownerInitials: "HP",
  statusCode: "qualifying",
  statusName: "Qualifying",
  isOpen: true,
  isConverted: false,
  isDisqualified: false,
  ratingCode: "warm",
  ratingName: "Warm",
  qualificationScore: 72,
  qualificationCriteriaMet: 3,
  conversionProbability: 0.45,
  lastActivityAt: "2026-07-21T09:30:00Z",
  lastActivitySubject: "Rate review call",
  nextFollowUpAt: "2026-08-04T09:00:00Z",
  createdAt: "2026-05-02T11:15:00Z",
  valueAmount: 48000,
  valueCurrencyCode: "GBP",
  valueContext: "Annual contract value",
  tradeLane: "Felixstowe to Shanghai",
  serviceInterest: "Ocean freight",
  openOpportunityCount: 4,
  company: {
    organisationId: "org-1",
    email: "operations@northstar-logistics.example",
    website: "https://www.northstar-logistics.example",
    phone: "+44 161 555 0148",
    address: "Unit 14, Northgate Logistics Park, Trafford Way, Manchester M17 8QP, United Kingdom",
  },
  contacts: [
    {
      id: "contact-1",
      name: "Amelia Hart",
      initials: "AH",
      roleCode: "operations",
      email: "amelia.hart@northstar-logistics.example",
      phone: "+44 161 555 0149",
      isPrimary: true,
      lastContactAt: "2026-07-21T09:30:00Z",
    },
    {
      id: "contact-2",
      name: "Bo Li",
      initials: "BL",
      roleCode: "finance",
      email: "bo.li@northstar-logistics.example",
      phone: "+44 161 555 0150",
      isPrimary: false,
      lastContactAt: "2026-06-30T14:05:00Z",
    },
  ],
  activities: [
    {
      id: "activity-1",
      typeCode: "call",
      subject: "Rate review call",
      summary: "Walked through the Felixstowe to Shanghai lane and agreed to send revised port charges before the end of the week.",
      activityAt: "2026-07-21T09:30:00Z",
    },
    {
      id: "activity-2",
      typeCode: "email",
      subject: "Q3 volumes",
      summary: null,
      activityAt: "2026-07-08T16:12:00Z",
    },
  ],
}

/**
 * The Quotes header reference pill, mirrored here so its blur slot cannot regress unnoticed. Also
 * rendered with `pop` so the two feedback effects can be compared side by side.
 */
function QuoteReferencePill({
  effect,
  value = "QT-2026-0481",
  name = effect,
}: {
  effect: "slot" | "pop"
  value?: string
  name?: string
}) {
  const { direction, t } = useLanguage()
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      data-lab={`quote-reference-${name}`}
      className="group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] px-2 text-[14px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"
      onClick={() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      }}
    >
      <CopyFeedbackTransition
        value={value}
        copiedValue={t("Copied")}
        active={copied}
        effect={effect}
        inline
        ariaHidden
        className="h-[1em] leading-none"
        originalDirection="ltr"
        copiedDirection={direction}
      />
      <CopyStatusIcon copied={copied} iconClassName="size-3.5" className="shrink-0" />
    </button>
  )
}

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <div className="bg-[var(--md-analytics-bg)] p-6">
      <div className="mb-4 flex items-center gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-4 py-3 shadow-[var(--md-shadow-line)]">
        <span className="text-[14px] font-medium text-[var(--md-ink)]">Quote</span>
        <QuoteReferencePill effect="slot" />
        <QuoteReferencePill effect="pop" />
        {/* A value narrower than "Copied", which is the case that used to clip the copied word. */}
        <QuoteReferencePill effect="pop" value="3/4" name="pop-narrow" />
      </div>
      <CrmLeadDetailPanel lead={lead} onBack={() => {}} />
    </div>
  </LanguageProvider>,
)
