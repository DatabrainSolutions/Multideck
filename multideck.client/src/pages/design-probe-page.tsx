// TEMPORARY local verification harness. Delete before finishing.
import { useMemo, useState } from "react"
import { CardDesignPanel, CardQrPanel } from "@/components/multideck/contact-card-design"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { defaultAutomation, defaultBranding, defaultSocialLinks, emptyCardAnalytics, type CardBranding, type ContactCard } from "@/data/contact-card-data"

export function DesignProbePage() {
  const [surface, setSurface] = useState<"design" | "qr">("design")
  const [branding, setBranding] = useState<CardBranding>(() => defaultBranding("#1f6f68"))

  const card = useMemo<ContactCard>(() => ({
    id: "probe-card",
    ownerUserId: "probe-owner",
    tenantName: "Multideck",
    showTenantName: true,
    slug: "maya-stone",
    label: "Maya Stone",
    context: "Trade shows",
    status: "published",
    person: {
      fullName: "Maya Stone",
      role: "Head of Freight",
      company: "Marlow Apparel",
      email: "maya@marlow.example",
      phone: "+44 7700 900000",
      website: "marlow.example",
      profileImageDataUrl: null,
      socialLinks: defaultSocialLinks("maya@marlow.example", "marlow.example"),
    },
    branding,
    leadSource: "Trade show",
    publicHeading: "Let's stay in touch",
    publicSubheading: "Share your details and Maya will follow up.",
    submitLabel: "Continue",
    thanksHeading: "You're connected",
    thanksBody: "Thanks — Maya will be in touch soon.",
    phoneField: "optional",
    showPhone: true,
    showWebsite: true,
    consentEnabled: true,
    consentCopy: "Send me occasional updates from Multideck.",
    privacyUrl: "https://multideck.solutions/privacy",
    automation: defaultAutomation("Maya Stone"),
    analytics: emptyCardAnalytics(),
    createdAt: "2026-01-01T00:00:00.000Z",
    scans: [],
    exchanges: [],
  }), [branding])

  // Stands in for the store so the probe reacts like the real page.
  ;(window as unknown as { probeSetBranding?: (u: Partial<CardBranding>) => void }).probeSetBranding = (update) =>
    setBranding((current) => ({ ...current, ...update }))

  return (
    <div className="md-page md-page-stack">
      <SegmentedControl options={["design", "qr"] as const} value={surface} onChange={setSurface} ariaLabel="Probe surface" />
      {surface === "design" ? <CardDesignPanel card={card} /> : <CardQrPanel card={card} />}
    </div>
  )
}
