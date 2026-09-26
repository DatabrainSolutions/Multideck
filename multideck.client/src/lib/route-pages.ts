import { lazy, type ComponentType } from "react"
import { createPageLoader } from "@/lib/page-loader"

function lazyPage<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  const preload = createPageLoader(loader)
  return Object.assign(lazy(preload), { preload })
}

export const HomePage = lazyPage(() => import("@/pages/home-page").then((module) => ({ default: module.HomePage })))
export const AgentDexterPage = lazyPage(() => import("@/pages/agent-dexter-page").then((module) => ({ default: module.AgentDexterPage })))
export const AuthFlowPage = lazyPage(() => import("@/pages/auth-flow-page").then((module) => ({ default: module.AuthFlowPage })))
export const AccountOnboardingPage = lazyPage(() => import("@/pages/account-onboarding-page").then((module) => ({ default: module.AccountOnboardingPage })))
export const ComponentsGalleryPage = lazyPage(() => import("@/pages/components-gallery-page").then((module) => ({ default: module.ComponentsGalleryPage })))
export const CustomerDetailPage = lazyPage(() => import("@/pages/customer-detail-page").then((module) => ({ default: module.CustomerDetailPage })))
export const SignatureTeamPage = lazyPage(() => import("@/pages/signature-team-page").then(module => ({ default: module.SignatureTeamPage })))
export const EmailSignaturesPage = lazyPage(() => import("@/pages/email-signatures-page").then(module => ({ default: module.EmailSignaturesPage })))
export const InboxPage = lazyPage(() => import("@/pages/inbox-page").then((module) => ({ default: module.InboxPage })))
export const EventsPage = lazyPage(() => import("@/pages/events-page").then((module) => ({ default: module.EventsPage })))
export const ToDoPage = lazyPage(() => import("@/pages/to-do-page").then((module) => ({ default: module.ToDoPage })))
export const CalendarPage = lazyPage(() => import("@/pages/calendar-page").then((module) => ({ default: module.CalendarPage })))
export const MeetingsPage = lazyPage(() => import("@/pages/meetings-page").then((module) => ({ default: module.MeetingsPage })))
export const PublicBookingPage = lazyPage(() => import("@/pages/public-booking-page").then((module) => ({ default: module.PublicBookingPage })))
export const MeetingManagePage = lazyPage(() => import("@/pages/meeting-manage-page").then((module) => ({ default: module.MeetingManagePage })))
export const DocumentsPage = lazyPage(() => import("@/pages/documents-page").then((module) => ({ default: module.DocumentsPage })))
export const CustomsDeclarationsPage = lazyPage(() => import("@/pages/customs-declarations-page").then((module) => ({ default: module.CustomsDeclarationsPage })))
export const ScreeningPage = lazyPage(() => import("@/pages/screening-page").then((module) => ({ default: module.ScreeningPage })))
export const ReportsPage = lazyPage(() => import("@/pages/reports-page").then((module) => ({ default: module.ReportsPage })))
export const NavigationLabPage = lazyPage(() => import("@/pages/navigation-lab-page").then((module) => ({ default: module.NavigationLabPage })))
export const QuoteDetailPage = lazyPage(() => import("@/pages/quotes-page").then((module) => ({ default: module.QuoteDetailPage })))
export const QuotesRegisterPage = lazyPage(() => import("@/pages/quotes-register-page").then((module) => ({ default: module.QuotesRegisterPage })))
export const RatesPage = lazyPage(() => import("@/pages/rates-page").then((module) => ({ default: module.RatesPage })))
export const SettingsPage = lazyPage(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })))
export const AdminPage = lazyPage(() => import("@/pages/admin-page").then((module) => ({ default: module.AdminPage })))
export const WarehousePage = lazyPage(() => import("@/pages/warehouse-page").then((module) => ({ default: module.WarehousePage })))
export const BookingDetailPage = lazyPage(() => import("@/pages/booking-detail-page").then((module) => ({ default: module.BookingDetailPage })))
export const BookingOpenPage = lazyPage(() => import("@/pages/booking-open-page").then((module) => ({ default: module.BookingOpenPage })))
export const BookingsPage = lazyPage(() => import("@/pages/bookings-page").then((module) => ({ default: module.BookingsPage })))
export const RoadControlPage = lazyPage(() => import("@/pages/road-control-page").then((module) => ({ default: module.RoadControlPage })))
export const DomesticRoadBookingPage = lazyPage(() => import("@/pages/domestic-road-booking-page").then((module) => ({ default: module.DomesticRoadBookingPage })))
export const CrmOverviewPage = lazyPage(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmOverviewPage })))
export const CrmPhoneCallsPage = lazyPage(() => import("@/pages/crm-phone-calls-page").then((module) => ({ default: module.CrmPhoneCallsPage })))
export const CrmAccountsPage = lazyPage(() => import("@/pages/crm-accounts-page").then((module) => ({ default: module.CrmAccountsPage })))
export const CrmAccountDetailPage = lazyPage(() => import("@/pages/crm-account-detail-page").then((module) => ({ default: module.CrmAccountDetailPage })))
export const CrmLeadsPage = lazyPage(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmLeadsPage })))
export const CrmLeadDetailPage = lazyPage(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmLeadDetailPage })))
export const LeadConversionPage = lazyPage(() => import("@/pages/lead-conversion-page").then((module) => ({ default: module.LeadConversionPage })))
export const CrmContactsPage = lazyPage(() => import("@/pages/crm-contacts-page").then((module) => ({ default: module.CrmContactsPage })))
export const CrmContactDetailPage = lazyPage(() => import("@/pages/crm-contact-detail-page").then((module) => ({ default: module.CrmContactDetailPage })))
export const CrmDealsPage = lazyPage(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmDealsPage })))
export const CrmDealDetailPage = lazyPage(() => import("@/pages/crm-deal-detail-page").then((module) => ({ default: module.CrmDealDetailPage })))
export const CrmDrivePage = lazyPage(() => import("@/pages/crm-drive-page").then((module) => ({ default: module.CrmDrivePage })))
export const CrmSettingsPage = lazyPage(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmSettingsPage })))
export const ContactCardsPage = lazyPage(() => import("@/pages/contact-cards-page").then((module) => ({ default: module.ContactCardsPage })))
export const ContactCardDetailPage = lazyPage(() => import("@/pages/contact-cards-page").then((module) => ({ default: module.ContactCardDetailPage })))
export const ContactCardPublicPage = lazyPage(() => import("@/pages/contact-card-public-page").then((module) => ({ default: module.ContactCardPublicPage })))
export const QuoteResponsePage = lazyPage(() => import("@/pages/quote-response-page").then((module) => ({ default: module.QuoteResponsePage })))
export const MileagePage = lazyPage(() => import("@/pages/mileage-page").then((module) => ({ default: module.MileagePage })))
export const FinancePage = lazyPage(() => import("@/pages/finance-page").then((module) => ({ default: module.FinancePage })))

const destinations = {
  "/": HomePage, "/agent-dexter": AgentDexterPage, "/inbox": InboxPage,
  "/to-do": ToDoPage, "/calendar": CalendarPage, "/calendar/meetings": MeetingsPage,
  "/calendar/booking-links": MeetingsPage, "/events": EventsPage,
  "/quotes": QuotesRegisterPage, "/quotes/new": QuoteDetailPage,
  "/bookings": BookingsPage, "/bookings/new": BookingOpenPage, "/bookings/provisional": BookingsPage,
  "/road-control": RoadControlPage, "/road-control/new": BookingOpenPage,
  "/crm": CrmOverviewPage, "/crm/accounts": CrmAccountsPage,
  "/customers": CrmAccountsPage, "/suppliers": CrmAccountsPage,
  "/crm/contacts": CrmContactsPage, "/crm/leads": CrmLeadsPage, "/crm/deals": CrmDealsPage,
  "/crm/phone-calls": CrmPhoneCallsPage, "/crm/drive": CrmDrivePage,
  "/crm/settings": CrmSettingsPage, "/crm/contact-cards": ContactCardsPage,
  "/settings": SettingsPage, "/components": ComponentsGalleryPage,
  "/inbox/signatures": EmailSignaturesPage, "/admin/email-signatures": EmailSignaturesPage,
  "/admin/email-signatures/team": SignatureTeamPage, "/compliance/screening": ScreeningPage,
}
const families = [
  ["/quotes/", QuoteDetailPage], ["/bookings/", BookingDetailPage],
  ["/road-control/", DomesticRoadBookingPage], ["/events/", EventsPage],
  ["/crm/accounts/", CrmAccountDetailPage], ["/crm/contacts/", CrmContactDetailPage],
  ["/crm/leads/", CrmLeadDetailPage], ["/crm/deals/", CrmDealDetailPage],
  ["/crm/contact-cards/", ContactCardDetailPage], ["/crm/phone-calls/", CrmPhoneCallsPage],
  ["/customers/", CustomerDetailPage], ["/crm/trips", MileagePage], ["/finance/mileage", MileagePage],
  ["/documents", DocumentsPage], ["/customs/", CustomsDeclarationsPage],
  ["/warehouse", WarehousePage], ["/rates", RatesPage], ["/reports", ReportsPage],
  ["/finance/", FinancePage], ["/admin", AdminPage],
] as const

/** Intent warms only the chosen destination's module, never its private data. */
export function preloadRoute(path: string) {
  const pathname = path.split(/[?#]/, 1)[0]
  const page = destinations[pathname as keyof typeof destinations] ?? families.find(([prefix]) => pathname.startsWith(prefix))?.[1]
  if (page) void page.preload().catch(() => { /* Navigation owns recoverable error feedback. */ })
}
