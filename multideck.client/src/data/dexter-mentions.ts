import {
  BriefcaseBusiness,
  Building2,
  FileText,
  LayoutPanelTop,
  Mail,
  ReceiptText,
  Ship,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react"
import gmailLogo from "@/assets/integrations/gmail.svg"
import outlookLogo from "@/assets/integrations/outlook.svg"
import { bookings, customers } from "@/data/multideck-data"
import { quoteRegisterRecords } from "@/data/quote-register-data"
import { sidebarAreas, sidebarPrimary, sidebarSecondary, type NavItem } from "@/data/navigation-data"
import type { ApiCustomer } from "@/lib/customer-api"
import type { ApiDeal } from "@/lib/deal-api"
import type { ApiLead } from "@/lib/lead-api"
import type { DexterEmailContextSource, MailProvider } from "@/lib/inbox-contract"

export type DexterMentionType = "email" | "booking" | "customer" | "lead" | "deal" | "page" | "quote" | "document"

export type DexterMentionItem = {
  id: string
  type: DexterMentionType
  title: string
  meta: string
  keywords?: string
  route?: string
  icon: LucideIcon
  logo?: string
  disabled?: boolean
  unavailableRoute?: string
}

function uniqueById(items: DexterMentionItem[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

function pageMention(item: NavItem, area?: string): DexterMentionItem | null {
  if (!item.route) return null

  return {
    id: `page:${item.route}`,
    type: "page",
    title: item.label,
    meta: area ? `${area} page` : "Multideck page",
    keywords: `${item.route} ${area ?? ""}`,
    route: item.route,
    icon: item.icon ?? LayoutPanelTop,
  }
}

const pageMentions = uniqueById([
  ...sidebarPrimary.map((item) => pageMention(item)),
  ...sidebarSecondary.map((item) => pageMention(item)),
  ...sidebarAreas.flatMap((area) =>
    area.destinations.flatMap((destination) => [
      pageMention(destination, area.label),
      ...(destination.children ?? []).map((item) => pageMention(item, area.label)),
    ]),
  ),
].filter((item): item is DexterMentionItem => Boolean(item)))

const emailMentionDefinitions: Record<MailProvider, Omit<DexterMentionItem, "meta">> = {
  gmail: {
    id: "email:gmail",
    type: "email",
    title: "Gmail",
    keywords: "email inbox mail google",
    icon: Mail,
    logo: gmailLogo,
    unavailableRoute: "/settings?tab=integrations",
  },
  outlook: {
    id: "email:outlook",
    type: "email",
    title: "Outlook",
    keywords: "email inbox mail microsoft office 365",
    icon: Mail,
    logo: outlookLogo,
    unavailableRoute: "/settings?tab=integrations",
  },
}

function emailSourceMeta(source: DexterEmailContextSource | undefined, failed: boolean) {
  if (failed) return "Email availability could not be checked. Open Settings to try again."
  if (!source) return "Checking email access…"
  if (source.status === "available") return "Connected and available to Dexter"
  if (source.status === "indexing") return "Connected; Dexter can search indexed mail while older email continues indexing"
  if (source.status === "permission_required") return "Ask an administrator for AI email access"
  if (source.status === "reauthorization_required") return "Reconnect this email provider in Settings to use it with Dexter"
  if (source.status === "provider_not_configured") return "This email provider is not configured for this workspace"
  if (source.status === "disabled") return "Dexter email context is disabled for this workspace"
  if (source.status === "not_connected") return "Connect this email provider in Settings to use it with Dexter"
  return "Email context is temporarily unavailable. Open Settings to review the connection."
}

export function emailMentionItems(
  sources: DexterEmailContextSource[] | null = null,
  failed = false,
): DexterMentionItem[] {
  return (["gmail", "outlook"] as const).map((provider) => {
    const source = sources?.find((candidate) => candidate.provider === provider)
    return {
      ...emailMentionDefinitions[provider],
      meta: emailSourceMeta(source, failed),
      disabled: !source?.available,
    }
  })
}

export const defaultDexterMentionItems: DexterMentionItem[] = uniqueById([
  ...emailMentionItems(),
  ...bookings.map((booking) => ({
    id: `booking:${booking.id}`,
    type: "booking" as const,
    title: booking.id,
    meta: `${booking.customer} · ${booking.route} · ${booking.status}`,
    keywords: `${booking.jobRef} ${booking.customerRef} ${booking.customer} ${booking.route}`,
    route: `/bookings/${booking.id.toLowerCase()}`,
    icon: Ship,
  })),
  ...customers.map((customer) => ({
    id: `customer:${customer.id}`,
    type: "customer" as const,
    title: customer.name,
    meta: `${customer.location} · ${customer.status}`,
    keywords: `${customer.industry} ${customer.owner} ${customer.status}`,
    route: `/customers/${customer.id}`,
    icon: Building2,
  })),
  ...quoteRegisterRecords.map((quote) => ({
    id: `quote:${quote.reference}`,
    type: "quote" as const,
    title: quote.reference,
    meta: `${quote.customer} · ${quote.origin} to ${quote.destination} · ${quote.status}`,
    keywords: `${quote.customer} ${quote.transportMode} ${quote.workflowStage}`,
    route: `/quotes/${quote.reference}`,
    icon: ReceiptText,
  })),
  {
    id: "document:co-cn-44128",
    type: "document",
    title: "CO-CN-44128.pdf",
    meta: "Certificate of origin · MD-22455",
    keywords: "certificate origin document",
    icon: FileText,
  },
  {
    id: "document:ci-22455-rev2",
    type: "document",
    title: "CI-22455-rev2.pdf",
    meta: "Commercial invoice · MD-22455",
    keywords: "invoice document",
    icon: FileText,
  },
  ...pageMentions,
])

export function customerMentionItems(items: ApiCustomer[]): DexterMentionItem[] {
  return items.map((customer) => ({
    id: `customer:${customer.id}`,
    type: "customer",
    title: customer.name,
    meta: [customer.location, customer.status, customer.industry].filter(Boolean).join(" · "),
    keywords: customer.types.join(" "),
    route: `/customers/${customer.id}`,
    icon: Building2,
  }))
}

export function leadMentionItems(items: ApiLead[]): DexterMentionItem[] {
  return items.map((lead) => ({
    id: `lead:${lead.id}`,
    type: "lead",
    title: lead.companyName,
    meta: [lead.primaryContactName, lead.statusName, lead.tradeLane].filter(Boolean).join(" · "),
    keywords: [
      lead.primaryContactEmail,
      lead.sourceName,
      lead.ownerName,
      lead.ratingName,
      lead.serviceInterest,
    ].filter(Boolean).join(" "),
    route: `/crm/leads/${lead.id}`,
    icon: UserRoundSearch,
  }))
}

export function dealMentionItems(items: ApiDeal[]): DexterMentionItem[] {
  return items.map((deal) => ({
    id: `deal:${deal.id}`,
    type: "deal",
    title: deal.name,
    meta: [deal.companyName, deal.pipelineStageName, deal.statusName].filter(Boolean).join(" · "),
    keywords: [
      deal.pipelineName,
      deal.opportunityTypeName,
      deal.primaryContactName,
      deal.ownerName,
      deal.tradeLane,
      deal.serviceInterest,
    ].filter(Boolean).join(" "),
    route: `/crm/deals?record=${encodeURIComponent(deal.id)}`,
    icon: BriefcaseBusiness,
  }))
}

export function mergeDexterMentionItems(...groups: DexterMentionItem[][]) {
  return uniqueById(groups.flat())
}
