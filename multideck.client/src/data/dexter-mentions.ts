import {
  Building2,
  FileText,
  LayoutPanelTop,
  ReceiptText,
  Ship,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react"
import { bookings, customers } from "@/data/multideck-data"
import { quoteRegisterRecords } from "@/data/quote-register-data"
import { sidebarAreas, sidebarPrimary, sidebarSecondary, type NavItem } from "@/data/navigation-data"
import type { ApiCustomer } from "@/lib/customer-api"
import type { ApiLead } from "@/lib/lead-api"

export type DexterMentionType = "booking" | "customer" | "lead" | "page" | "quote" | "document"

export type DexterMentionItem = {
  id: string
  type: DexterMentionType
  title: string
  meta: string
  keywords?: string
  route?: string
  icon: LucideIcon
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

export const defaultDexterMentionItems: DexterMentionItem[] = uniqueById([
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

export function mergeDexterMentionItems(...groups: DexterMentionItem[][]) {
  return uniqueById(groups.flat())
}
