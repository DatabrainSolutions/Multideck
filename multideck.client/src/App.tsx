import { Component, lazy, startTransition, Suspense, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { MotionConfig } from "motion/react"
import { ThemeProvider } from "@/lib/theme-provider"
import type { AdminRoute } from "@/pages/admin-page"
import type { FinanceRoute } from "@/pages/finance-page"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/components/multideck/app-shell"
import { AppShortcuts } from "@/components/multideck/app-shortcuts"
// Both are loaded with the shell rather than lazily: a shortcut that does nothing
// for the first second after a page load is worse than no shortcut, and the summon
// only pays for its shader once it is actually opened.
import { DexterSummon } from "@/components/multideck/dexter-summon"
import { DictationController } from "@/components/multideck/dictation-controller"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { LanguageProvider, useLanguage } from "@/i18n/language-provider"
import { defaultLanguage, isLanguageCode } from "@/i18n/languages"
import { translateText } from "@/i18n/translate"
import { mdMotion } from "@/lib/motion"
import { rememberAuthReturnPath, takeAuthReturnPath } from "@/lib/auth-routing"
import { isTenantAdministrator, summarizeAuthUser, type AuthUserSummary } from "@/lib/auth-user"
import { recordWorkspacePresence } from "@/lib/admin-audit-api"
import { getApiAuthSession } from "@/lib/api"
import {
  createProfilePhotoSignedUrls,
  type UserProfilePhoto,
} from "@/lib/profile-photo"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"
import { ThemeProfileSync, themeStorageKey } from "@/lib/theme-preferences"
import { LanguageProfileSync } from "@/lib/language-preferences"
import { rememberRecentWorkContext } from "@/lib/recent-work-context"
import { invalidateWorkspaceBootstrap } from "@/lib/workspace-bootstrap"
import multideckLogoMark from "@/assets/brand/multideck-logo-mark.svg"

const HomePage = lazy(() => import("@/pages/home-page").then((module) => ({ default: module.HomePage })))
const AgentDexterPage = lazy(() => import("@/pages/agent-dexter-page").then((module) => ({ default: module.AgentDexterPage })))
const AuthFlowPage = lazy(() => import("@/pages/auth-flow-page").then((module) => ({ default: module.AuthFlowPage })))
const ComponentsGalleryPage = lazy(() => import("@/pages/components-gallery-page").then((module) => ({ default: module.ComponentsGalleryPage })))
const CustomerDetailPage = lazy(() => import("@/pages/customer-detail-page").then((module) => ({ default: module.CustomerDetailPage })))
const CustomersPage = lazy(() => import("@/pages/customers-page").then((module) => ({ default: module.CustomersPage })))
const InboxPage = lazy(() => import("@/pages/inbox-page").then((module) => ({ default: module.InboxPage })))
const ToDoPage = lazy(() => import("@/pages/to-do-page").then((module) => ({ default: module.ToDoPage })))
const DocumentsPage = lazy(() => import("@/pages/documents-page").then((module) => ({ default: module.DocumentsPage })))
const CustomsDeclarationsPage = lazy(() => import("@/pages/customs-declarations-page").then((module) => ({ default: module.CustomsDeclarationsPage })))
const ScreeningPage = lazy(() => import("@/pages/screening-page").then((module) => ({ default: module.ScreeningPage })))
const ReportsPage = lazy(() => import("@/pages/reports-page").then((module) => ({ default: module.ReportsPage })))
const NavigationLabPage = lazy(() => import("@/pages/navigation-lab-page").then((module) => ({ default: module.NavigationLabPage })))
const QuoteDetailPage = lazy(() => import("@/pages/quotes-page").then((module) => ({ default: module.QuoteDetailPage })))
const QuotesRegisterPage = lazy(() => import("@/pages/quotes-register-page").then((module) => ({ default: module.QuotesRegisterPage })))
const RatesPage = lazy(() => import("@/pages/rates-page").then((module) => ({ default: module.RatesPage })))
const ReportTemplateBuilderPage = lazy(() => import("@/pages/report-template-builder-page").then((module) => ({ default: module.ReportTemplateBuilderPage })))
const ReportViewerPage = lazy(() => import("@/pages/report-viewer-page").then((module) => ({ default: module.ReportViewerPage })))
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })))
const AdminPage = lazy(() => import("@/pages/admin-page").then((module) => ({ default: module.AdminPage })))
const WarehousePage = lazy(() => import("@/pages/warehouse-page").then((module) => ({ default: module.WarehousePage })))
const BookingDetailPage = lazy(() => import("@/pages/booking-detail-page").then((module) => ({ default: module.BookingDetailPage })))
const BookingOpenPage = lazy(() => import("@/pages/booking-open-page").then((module) => ({ default: module.BookingOpenPage })))
const ProvisionalBookingPage = lazy(() => import("@/pages/provisional-booking-page").then((module) => ({ default: module.ProvisionalBookingPage })))
const BookingsPage = lazy(() => import("@/pages/bookings-page").then((module) => ({ default: module.BookingsPage })))
const RoadControlPage = lazy(() => import("@/pages/road-control-page").then((module) => ({ default: module.RoadControlPage })))
const DomesticRoadBookingPage = lazy(() => import("@/pages/domestic-road-booking-page").then((module) => ({ default: module.DomesticRoadBookingPage })))
const CrmOverviewPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmOverviewPage })))
const CrmPhoneCallsPage = lazy(() => import("@/pages/crm-phone-calls-page").then((module) => ({ default: module.CrmPhoneCallsPage })))
const CrmAccountsPage = lazy(() => import("@/pages/crm-accounts-page").then((module) => ({ default: module.CrmAccountsPage })))
const CrmAccountDetailPage = lazy(() => import("@/pages/crm-account-detail-page").then((module) => ({ default: module.CrmAccountDetailPage })))
const CrmLeadsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmLeadsPage })))
const CrmLeadDetailPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmLeadDetailPage })))
const LeadConversionPage = lazy(() => import("@/pages/lead-conversion-page").then((module) => ({ default: module.LeadConversionPage })))
const CrmContactsPage = lazy(() => import("@/pages/crm-contacts-page").then((module) => ({ default: module.CrmContactsPage })))
const CrmContactDetailPage = lazy(() => import("@/pages/crm-contact-detail-page").then((module) => ({ default: module.CrmContactDetailPage })))
const CrmDealsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmDealsPage })))
const CrmDealDetailPage = lazy(() => import("@/pages/crm-deal-detail-page").then((module) => ({ default: module.CrmDealDetailPage })))
const CrmDrivePage = lazy(() => import("@/pages/crm-drive-page").then((module) => ({ default: module.CrmDrivePage })))
const CrmSettingsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmSettingsPage })))
const ContactCardsPage = lazy(() => import("@/pages/contact-cards-page").then((module) => ({ default: module.ContactCardsPage })))
const ContactCardDetailPage = lazy(() => import("@/pages/contact-cards-page").then((module) => ({ default: module.ContactCardDetailPage })))
const ContactCardPublicPage = lazy(() => import("@/pages/contact-card-public-page").then((module) => ({ default: module.ContactCardPublicPage })))
const QuoteResponsePage = lazy(() => import("@/pages/quote-response-page").then((module) => ({ default: module.QuoteResponsePage })))
const FinancePage = lazy(() => import("@/pages/finance-page").then((module) => ({ default: module.FinancePage })))

type AuthStatus = "checking" | "authenticated" | "unauthenticated"
type ProfileMediaUrls = {
  profilePhotoPath: string | null
  profilePhotoUrl: string | null
  coverPhotoPath: string | null
  coverPhotoUrl: string | null
}

const emptyProfileMediaUrls: ProfileMediaUrls = {
  profilePhotoPath: null,
  profilePhotoUrl: null,
  coverPhotoPath: null,
  coverPhotoUrl: null,
}

function preloadImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("The profile image could not be preloaded."))
    image.src = url
  })
}

const validRoutes = new Set([
  "/",
  "/agent-dexter",
  "/admin/users",
  "/admin/usage",
  "/admin/finance",
  "/admin/ai-usage",
  "/admin/broadcast",
  "/admin/billing",
  "/admin/branding",
  "/admin/system-preferences",
  "/admin/activity",
  "/admin/detailed-log",
  "/auth",
  "/components",
  "/crm",
  "/crm/phone-calls",
  "/crm/accounts",
  "/crm/contact-cards",
  "/crm/contacts",
  "/crm/deals",
  "/crm/leads",
  "/crm/drive",
  "/crm/settings",
  "/customers",
  "/inbox",
  "/to-do",
  "/documents",
  "/documents/templates",
  "/customs/standalone/export",
  "/customs/standalone/export/new",
  "/customs/standalone/import",
  "/customs/standalone/import/new",
  "/customs/job-related/export",
  "/customs/job-related/import",
  "/compliance/screening",
  "/playground/navigation",
  "/quotes",
  "/quotes/3",
  "/rates",
  "/rates/contracts",
  "/rates/tariffs",
  "/rates/imports",
  "/rates/results",
  "/reports",
  "/reports/scheduled",
  "/reports/templates/monthly-client-review",
  "/finance/receivables",
  "/finance/receivables/approvals",
  "/finance/receivables/cash",
  "/finance/receivables/credit-control",
  "/finance/payables",
  "/finance/payables/approvals",
  "/finance/payables/cash",
  "/finance/payables/intake",
  "/finance/cash",
  "/finance/cash/reconciliation",
  "/finance/administration",
  "/finance/systems",
  "/finance/currencies",
  "/finance/banks",
  "/finance/ledger",
  "/finance/tax",
  "/finance/documents",
  "/finance/mappings",
  "/finance/compliance",
  "/finance/controls",
  "/finance/reports",
  "/finance/management/accruals-wip",
  "/settings",
  "/warehouse",
  "/warehouse/calendar",
  "/warehouse/facilities",
  "/warehouse/goods-in",
  "/warehouse/goods-out",
  "/warehouse/inventory",
  "/warehouse/items",
  "/warehouse/locations",
  "/warehouse/orders",
  "/warehouse/purchase-orders",
  "/warehouse/users",
  "/bookings",
  "/road-control",
  "/road-control/new",
  "/bookings/new",
  "/bookings/provisional",
])

function isBookingDetailRoute(path: string) {
  return /^\/bookings\/[^/]+$/.test(path) && path !== "/bookings/new" && path !== "/bookings/provisional"
}

function isQuoteDetailRoute(path: string) {
  return /^\/quotes\/[^/]+$/.test(path)
}

function isFinanceDocumentDetailRoute(path: string) {
  return /^\/finance\/(receivables|payables)\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path)
}

/** A warehouse order has its own address, so the router has to recognise it. */
function isWarehouseOrderDetailRoute(path: string) {
  return /^\/warehouse\/orders\/[^/]+$/.test(path)
}

function isWarehousePurchaseOrderDetailRoute(path: string) {
  return path === "/warehouse/purchase-orders/new" || /^\/warehouse\/purchase-orders\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path)
}

/** So does a warehouse item. */
function isWarehouseItemDetailRoute(path: string) {
  return /^\/warehouse\/items\/[^/]+$/.test(path)
}

function isRoadJobDetailRoute(path: string) {
  return /^\/road-control\/[^/]+$/.test(path) && path !== "/road-control/new"
}

function isCustomsDeclarationEditRoute(path: string) {
  return /^\/customs\/(standalone|job-related)\/(export|import)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path)
}

/** Old CRM links still land on their current product destination. */
function getLegacyCrmRoute(path: string) {
  if (path === "/crm/marketing") return "/crm/drive"
  if (path === "/crm/suppliers") return "/crm/accounts"
  const supplierDetail = path.match(/^\/crm\/suppliers\/([^/]+)$/)
  if (supplierDetail) return `/crm/accounts/${supplierDetail[1]}`
  return null
}

const unavailableCrmRoutePrefixes = [
  "/crm/activity",
  "/crm/emails",
  "/crm/forms",
  "/crm/lists",
] as const

/** Prototype-only CRM areas stay unreachable until their real data journeys are release-ready. */
function getUnavailableCrmRoute(path: string) {
  return unavailableCrmRoutePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ? "/crm"
    : null
}

function getLegacyBookingRoute(path: string) {
  if (path === "/shipments") return "/bookings"
  const detailMatch = path.match(/^\/shipments\/([^/]+)$/)
  return detailMatch ? `/bookings/${detailMatch[1]}` : null
}

function isCrmLeadDetailRoute(path: string) {
  return /^\/crm\/leads\/[^/]+$/.test(path)
}

function isCrmPhoneCallDetailRoute(path: string) {
  return /^\/crm\/phone-calls\/[^/]+$/.test(path)
}

function isCrmAccountDetailRoute(path: string) {
  return /^\/crm\/accounts\/[^/]+$/.test(path)
}

/** A deal has its own address, so the router has to recognise it. */
function isCrmDealDetailRoute(path: string) {
  return /^\/crm\/deals\/[^/]+$/.test(path)
}

function isCrmContactDetailRoute(path: string) {
  return /^\/crm\/contacts\/[^/]+$/.test(path)
}

function isContactCardDetailRoute(path: string) {
  return /^\/crm\/contact-cards\/[^/]+$/.test(path)
}

/** The public exchange page is reachable without a session, by design. */
function isContactCardPublicRoute(path: string) {
  return /^\/card\/[^/]+$/.test(path)
}

/** Customer quote decisions use the same tenant App host without requiring a session. */
function isQuoteResponseRoute(path: string) {
  return /^\/quotes\/respond\/[^/]+$/.test(path)
}

function isCrmLeadConversionRoute(path: string) {
  return /^\/crm\/leads\/[^/]+\/convert$/.test(path)
}

function isCustomerDetailRoute(path: string) {
  return /^\/customers\/[^/]+$/.test(path)
}

function getRoute() {
  if (window.location.pathname === "/app" || window.location.pathname === "/app/") return "/"
  // Home lives at the workspace root. `/home` is the address people type, so it
  // resolves to the same screen rather than a second identity for it.
  if (window.location.pathname === "/home" || window.location.pathname === "/home/") return "/"
  if (window.location.pathname === "/finance/setup") return "/admin/finance"
  const legacyBookingRoute = getLegacyBookingRoute(window.location.pathname)
  if (legacyBookingRoute) return legacyBookingRoute
  const legacyCrmRoute = getLegacyCrmRoute(window.location.pathname)
  if (legacyCrmRoute) return legacyCrmRoute
  const unavailableCrmRoute = getUnavailableCrmRoute(window.location.pathname)
  if (unavailableCrmRoute) return unavailableCrmRoute
  if (window.location.pathname.startsWith("/reports/rpt-")) return window.location.pathname
  if (isBookingDetailRoute(window.location.pathname)) return window.location.pathname
  if (isRoadJobDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCustomsDeclarationEditRoute(window.location.pathname)) return window.location.pathname
  if (isQuoteDetailRoute(window.location.pathname)) return window.location.pathname
  if (isFinanceDocumentDetailRoute(window.location.pathname)) return window.location.pathname
  if (isWarehouseOrderDetailRoute(window.location.pathname)) return window.location.pathname
  if (isWarehousePurchaseOrderDetailRoute(window.location.pathname)) return window.location.pathname
  if (isWarehouseItemDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCustomerDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmAccountDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmPhoneCallDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmContactDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmDealDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmLeadConversionRoute(window.location.pathname)) return window.location.pathname
  if (isCrmLeadDetailRoute(window.location.pathname)) return window.location.pathname
  if (isContactCardDetailRoute(window.location.pathname)) return window.location.pathname
  if (isContactCardPublicRoute(window.location.pathname)) return window.location.pathname
  if (isQuoteResponseRoute(window.location.pathname)) return window.location.pathname
  return validRoutes.has(window.location.pathname) ? window.location.pathname : "/"
}

function canCustomerOpenRoute(user: AuthUserSummary, path: string) {
  if (["/warehouse/inventory", "/warehouse/orders", "/warehouse/items"].includes(path)) return true
  // A customer who can see a register can open one of its records.
  if (isWarehouseOrderDetailRoute(path) || isWarehouseItemDetailRoute(path)) return true
  return path === "/warehouse/users" && user.permissions.includes("Warehouse.Users.ManageOwn")
}

function RouteFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={fullScreen
        ? "grid min-h-screen place-items-center bg-[var(--md-bg)] text-[var(--md-ink)]"
        : "grid min-h-[calc(100dvh-104px)] place-items-center bg-[var(--md-bg)] text-[var(--md-ink)]"}
    >
      <DotGridLoader label="Loading…" />
    </div>
  )
}

function WorkspaceFailureFallback({ error }: { error?: Error | null }) {
  // Keep the last-resort recovery view independent from React context. During
  // provider teardown (for example after an HMR failure), asking the fallback
  // to read LanguageContext can make the error boundary fail a second time.
  const documentLanguage = typeof document === "undefined" ? null : document.documentElement.lang
  const storedLanguage = typeof window === "undefined" ? null : window.localStorage.getItem("multideck.language")
  const language = isLanguageCode(documentLanguage)
    ? documentLanguage
    : isLanguageCode(storedLanguage)
      ? storedLanguage
      : defaultLanguage
  const t = (text: string) => translateText(text, language)

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--md-bg)] px-[var(--md-page-pad)] text-[var(--md-ink)]">
      <section className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-[clamp(24px,5vw,48px)] shadow-[var(--md-shadow-soft)]" role="alert">
        <div className="flex items-center gap-3" data-i18n-skip dir="ltr">
          <img src={multideckLogoMark} alt="" className="size-6" />
          <span className="text-[21px] font-medium leading-none">multideck</span>
        </div>
        <h1 className="mt-8 text-[24px] font-medium leading-tight">{t("Something went wrong")}</h1>
        <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">
          {t("This workspace view could not be displayed. Reload the page to continue.")}
        </p>
        {import.meta.env.DEV && error ? <p className="mt-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-3 text-start text-[12px] leading-5 text-[var(--md-red)]" dir="ltr">{error.message}</p> : null}
        <button
          type="button"
          className="mt-6 h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] transition-colors hover:bg-[var(--md-accent-hover)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)]"
          onClick={() => window.location.reload()}
        >
          {t("Reload page")}
        </button>
      </section>
    </main>
  )
}

class WorkspaceErrorBoundary extends Component<{
  children: ReactNode
  resetKey: string
}, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Multideck could not render the current workspace view.", error, info.componentStack)
  }

  componentDidUpdate(previousProps: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    return this.state.error ? <WorkspaceFailureFallback error={this.state.error} /> : this.props.children
  }
}

export default function App() {
  const [route, setRoute] = useState(getRoute)
  const [authStatus, setAuthStatus] = useState<AuthStatus>(isSupabaseConfigured ? "checking" : "unauthenticated")
  const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null)
  const [profileMediaUrls, setProfileMediaUrls] = useState<ProfileMediaUrls>(emptyProfileMediaUrls)
  const hasResolvedAuthenticatedSessionRef = useRef(false)
  const isLocalNavigationLab = import.meta.env.DEV
    && (route === "/playground/navigation" || route === "/settings")
  const authMode = route === "/auth" ? new URLSearchParams(window.location.search).get("mode") : null
  const isPasswordSetupRoute = route === "/auth" && (authMode === "reset-password" || authMode === "invite")
  // Shortcuts and the Dexter summon belong to the signed-in workspace. The
  // sign-in screen and the public contact card must stay inert.
  const isWorkspaceRoute = !isContactCardPublicRoute(route)
    && !isQuoteResponseRoute(route)
    && route !== "/auth"
    && (authStatus === "authenticated" || isLocalNavigationLab)

  const handleProfilePhotoChange = useCallback((profilePhoto: UserProfilePhoto | null, profilePhotoUrl: string | null) => {
    setCurrentUser((user) => user ? { ...user, profilePhoto, profilePhotoUrl } : user)
    setProfileMediaUrls((current) => ({
      ...current,
      profilePhotoPath: profilePhoto?.path ?? null,
      profilePhotoUrl,
    }))
  }, [])
  const handleCoverPhotoChange = useCallback((coverPhoto: UserProfilePhoto | null) => {
    setCurrentUser((user) => user ? { ...user, coverPhoto } : user)
  }, [])

  useEffect(() => {
    const profilePhoto = currentUser?.profilePhoto ?? null
    const coverPhoto = currentUser?.coverPhoto ?? null
    const photos = [profilePhoto, coverPhoto].filter((photo): photo is UserProfilePhoto => Boolean(photo))

    if (photos.length === 0) {
      setProfileMediaUrls(emptyProfileMediaUrls)
      return
    }

    const mediaAlreadyLoaded = profileMediaUrls.profilePhotoPath === (profilePhoto?.path ?? null)
      && profileMediaUrls.coverPhotoPath === (coverPhoto?.path ?? null)
      && (!profilePhoto || Boolean(profileMediaUrls.profilePhotoUrl))
      && (!coverPhoto || Boolean(profileMediaUrls.coverPhotoUrl))
    if (mediaAlreadyLoaded) return

    let cancelled = false
    createProfilePhotoSignedUrls(photos)
      .then(async (signedUrls) => {
        const profilePhotoUrl = profilePhoto ? signedUrls.get(profilePhoto.path) ?? null : null
        const coverPhotoUrl = coverPhoto ? signedUrls.get(coverPhoto.path) ?? null : null
        await Promise.all([profilePhotoUrl, coverPhotoUrl].filter((url): url is string => Boolean(url)).map(preloadImage))
        if (cancelled) return

        setProfileMediaUrls({
          profilePhotoPath: profilePhoto?.path ?? null,
          profilePhotoUrl,
          coverPhotoPath: coverPhoto?.path ?? null,
          coverPhotoUrl,
        })
        if (profilePhoto) {
          setCurrentUser((user) => {
            if (!user || user.profilePhoto?.path !== profilePhoto.path || user.profilePhotoUrl === profilePhotoUrl) return user
            return { ...user, profilePhotoUrl }
          })
        }
      })
      .catch((error) => {
        console.error("Profile images could not be preloaded.", error)
        if (!cancelled) setProfileMediaUrls(emptyProfileMediaUrls)
      })

    return () => {
      cancelled = true
    }
  }, [
    currentUser?.coverPhoto,
    currentUser?.profilePhoto,
    profileMediaUrls.coverPhotoPath,
    profileMediaUrls.coverPhotoUrl,
    profileMediaUrls.profilePhotoPath,
    profileMediaUrls.profilePhotoUrl,
  ])

  useEffect(() => {
    const onPopState = () => {
      startTransition(() => setRoute(getRoute()))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setCurrentUser(null)
      setAuthStatus("unauthenticated")
      return
    }

    let cancelled = false

    let sessionRequest = 0
    let activeAccessToken: string | null = null
    const applySession = (session: Session | null) => {
      if (cancelled) return

      if (!session?.user) {
        activeAccessToken = null
        invalidateWorkspaceBootstrap()
        hasResolvedAuthenticatedSessionRef.current = false
        setCurrentUser(null)
        setProfileMediaUrls(emptyProfileMediaUrls)
        setAuthStatus("unauthenticated")
        return
      }

      if (activeAccessToken === session.access_token) return
      activeAccessToken = session.access_token
      const requestId = ++sessionRequest

      if (!hasResolvedAuthenticatedSessionRef.current) setAuthStatus("checking")
      getApiAuthSession(session.access_token)
        .catch((error) => {
          console.error("The application profile could not be loaded.", error)
          return null
        })
        .then((apiSession) => {
          if (cancelled || requestId !== sessionRequest) return
          const apiProfile = apiSession?.profile ?? null
          const bootstrapMedia = apiSession?.workspace?.profileMedia ?? null
          const nextUser = summarizeAuthUser(session.user, apiProfile)
          if (bootstrapMedia && bootstrapMedia.profilePhotoPath === apiProfile?.profilePhoto?.path) {
            nextUser.profilePhotoUrl = bootstrapMedia.profilePhotoUrl
          }

          setProfileMediaUrls(bootstrapMedia ?? emptyProfileMediaUrls)

          hasResolvedAuthenticatedSessionRef.current = true
          setCurrentUser(nextUser)
          setAuthStatus("authenticated")
        })
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error(error)
        void clearStaleSession()
        applySession(null)
        return
      }

      applySession(data.session)
    }).catch((error) => {
      console.error(error)
      void clearStaleSession()
      applySession(null)
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // When token refresh fails (stale session), clear storage and redirect to sign-in
      if ((event as string) === "TOKEN_REFRESH_FAILED") {
        console.warn("Token refresh failed — clearing stale session.")
        void clearStaleSession()
        applySession(null)
        return
      }

      applySession(session)
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  /** Clear stale Supabase session from storage when tokens can no longer be refreshed. */
  function clearStaleSession() {
    try {
      const storageKey = `sb-${import.meta.env.VITE_SUPABASE_URL?.match(/https?:\/\/([^.]+)/)?.[1] ?? ""}-auth-token`
      localStorage.removeItem(storageKey)
      sessionStorage.removeItem(storageKey)
    } catch {
      // Storage may not be available
    }
  }

  useEffect(() => {
    if (authStatus === "checking") return

    if (isContactCardPublicRoute(route) || isQuoteResponseRoute(route)) return

    if (authStatus === "unauthenticated" && route !== "/auth" && !isLocalNavigationLab) {
      rememberAuthReturnPath()
      window.location.replace("/auth")
      return
    }

    if (authStatus === "authenticated" && route === "/auth" && !isPasswordSetupRoute) {
      window.history.replaceState({}, "", takeAuthReturnPath())
      startTransition(() => setRoute(getRoute()))
    }
  }, [authStatus, isPasswordSetupRoute, route])

  useEffect(() => {
    if (authStatus !== "authenticated" || currentUser?.actorType !== "customer") return
    if (isContactCardPublicRoute(route) || isQuoteResponseRoute(route) || canCustomerOpenRoute(currentUser, route)) return
    window.history.replaceState({}, "", currentUser.landingPath)
    startTransition(() => setRoute(getRoute()))
  }, [authStatus, currentUser, route])

  useEffect(() => {
    if (authStatus !== "authenticated" || !route.startsWith("/admin") || isTenantAdministrator(currentUser)) return
    window.history.replaceState({}, "", "/app")
    startTransition(() => setRoute("/"))
  }, [authStatus, currentUser, route])

  useEffect(() => {
    if (authStatus !== "authenticated" || currentUser?.actorType !== "internal") return
    const updatePresence = () => {
      if (document.visibilityState === "visible") void recordWorkspacePresence(route).catch(() => undefined)
    }
    updatePresence()
    const intervalId = window.setInterval(updatePresence, 60_000)
    document.addEventListener("visibilitychange", updatePresence)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", updatePresence)
    }
  }, [authStatus, currentUser?.actorType, route])

  // Old and prototype-only CRM bookmarks are rewritten in place, so the address
  // bar only shows routes that operators can genuinely use.
  useEffect(() => {
    if (window.location.pathname === "/finance/setup" || getLegacyCrmRoute(window.location.pathname) || getUnavailableCrmRoute(window.location.pathname)) {
      window.history.replaceState(window.history.state, "", route)
    }
  }, [route])

  function navigate(path: string) {
    path = getUnavailableCrmRoute(path) ?? path
    if (currentUser?.actorType === "customer" && !canCustomerOpenRoute(currentUser, path)) {
      path = currentUser.landingPath
    }
    if (path.startsWith("/admin") && !isTenantAdministrator(currentUser)) path = "/"
    if (path === route) return
    rememberRecentWorkContext(route)
    window.history.pushState({}, "", path === "/" ? "/app" : path)
    startTransition(() => setRoute(getRoute()))
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
      enableSystem={false}
      storageKey={themeStorageKey}
    >
      <ThemeProfileSync />
      <LanguageProvider>
        <WorkspaceErrorBoundary resetKey={`${route}:${authStatus}`}>
          <LanguageProfileSync />
          <TooltipProvider>
            <MotionConfig reducedMotion="user" transition={mdMotion.fast}>
            {isQuoteResponseRoute(route) ? (
              <Suspense fallback={<RouteFallback fullScreen />}>
                <QuoteResponsePage token={route.split("/").at(-1) ?? ""} />
              </Suspense>
            ) : isContactCardPublicRoute(route) ? (
              <Suspense fallback={<RouteFallback fullScreen />}>
                <ContactCardPublicPage slug={route.split("/").at(-1) ?? ""} />
              </Suspense>
            ) : (!isLocalNavigationLab && ((authStatus === "checking" && route !== "/auth") || (authStatus === "authenticated" && route === "/auth" && !isPasswordSetupRoute))) ? (
              <RouteFallback fullScreen />
            ) : !isLocalNavigationLab && (authStatus === "unauthenticated" || route === "/auth") ? (
              <Suspense fallback={<RouteFallback fullScreen />}>
                <AuthFlowPage navigate={navigate} />
              </Suspense>
            ) : route.startsWith("/reports/rpt-") ? (
              <Suspense fallback={<RouteFallback fullScreen />}>
                <ReportViewerPage navigate={navigate} reportId={route.split("/").at(-1) ?? "rpt-marlow-may-review"} />
              </Suspense>
            ) : route === "/reports/templates/monthly-client-review" ? (
              <Suspense fallback={<RouteFallback fullScreen />}>
                <ReportTemplateBuilderPage navigate={navigate} />
              </Suspense>
            ) : (
              <AppShell route={route} navigate={navigate} currentUser={currentUser}>
                <Suspense fallback={<RouteFallback />}>
                  {route === "/components" ? <ComponentsGalleryPage /> : null}
                  {route === "/agent-dexter" ? (
                    <AgentDexterPage
                      currentUser={currentUser}
                      profilePhotoUrl={profileMediaUrls.profilePhotoUrl}
                      navigate={navigate}
                    />
                  ) : null}
                  {route === "/crm" ? <CrmOverviewPage /> : null}
                  {route === "/crm/phone-calls" ? <CrmPhoneCallsPage navigate={navigate} currentUser={currentUser} /> : null}
                  {isCrmPhoneCallDetailRoute(route) ? <CrmPhoneCallsPage callId={route.split("/").at(-1) ?? ""} navigate={navigate} currentUser={currentUser} /> : null}
                  {route === "/crm/accounts" ? <CrmAccountsPage key={route} navigate={navigate} currentUser={currentUser} /> : null}
                  {isCrmAccountDetailRoute(route) ? <CrmAccountDetailPage accountId={route.split("/").at(-1) ?? ""} navigate={navigate} /> : null}
                  {route === "/crm/leads" ? <CrmLeadsPage navigate={navigate} currentUser={currentUser} /> : null}
                  {isCrmLeadConversionRoute(route) ? <LeadConversionPage navigate={navigate} leadId={route.split("/").at(-2) ?? ""} /> : null}
                  {isCrmLeadDetailRoute(route) ? <CrmLeadDetailPage navigate={navigate} leadId={route.split("/").at(-1) ?? ""} currentUser={currentUser} /> : null}
                  {route === "/crm/contact-cards" ? <ContactCardsPage navigate={navigate} currentUser={currentUser} /> : null}
                  {isContactCardDetailRoute(route) ? <ContactCardDetailPage key={route} navigate={navigate} cardId={route.split("/").at(-1) ?? ""} currentUser={currentUser} /> : null}
                  {route === "/crm/contacts" ? <CrmContactsPage navigate={navigate} /> : null}
                  {isCrmContactDetailRoute(route) ? <CrmContactDetailPage contactId={route.split("/").at(-1) ?? ""} navigate={navigate} /> : null}
                  {route === "/crm/deals" ? <CrmDealsPage currentUser={currentUser} navigate={navigate} /> : null}
                  {isCrmDealDetailRoute(route) ? <CrmDealDetailPage key={route} dealId={route.split("/").at(-1) ?? ""} navigate={navigate} /> : null}
                  {route === "/crm/drive" ? <CrmDrivePage currentUser={currentUser} /> : null}
                  {route === "/crm/settings" ? <CrmSettingsPage currentUser={currentUser} /> : null}
                  {route === "/customers" ? <CustomersPage navigate={navigate} /> : null}
                  {isCustomerDetailRoute(route) ? <CustomerDetailPage customerId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/inbox" ? <InboxPage navigate={navigate} /> : null}
                  {route === "/to-do" ? <ToDoPage operatorName={currentUser?.name} /> : null}
                  {route === "/documents" || route === "/documents/templates" ? <DocumentsPage navigate={navigate} /> : null}
                  {route.startsWith("/customs/") ? <CustomsDeclarationsPage route={route} navigate={navigate} currentUser={currentUser} /> : null}
                  {route === "/compliance/screening" ? <ScreeningPage /> : null}
                  {route === "/playground/navigation" ? <NavigationLabPage /> : null}
                  {route === "/quotes" ? <QuotesRegisterPage navigate={navigate} currentUser={currentUser} /> : null}
                  {route === "/quotes/new" ? <QuoteDetailPage key={route} variant="cargowise" quoteId="NEW" navigate={navigate} currentUser={currentUser} /> : null}
                  {route !== "/quotes/new" && isQuoteDetailRoute(route) ? <QuoteDetailPage key={route} variant="cargowise" quoteId={route.split("/").at(-1)} navigate={navigate} currentUser={currentUser} /> : null}
                  {route.startsWith("/rates") ? <RatesPage route={route as "/rates" | "/rates/contracts" | "/rates/tariffs" | "/rates/imports" | "/rates/results"} navigate={navigate} /> : null}
                  {route.startsWith("/finance/") ? <FinancePage route={route as FinanceRoute} navigate={navigate} currentUser={currentUser} /> : null}
                  {route === "/reports" || route === "/reports/scheduled"
                    ? <ReportsPage route={route} />
                    : null}
                  {route === "/settings" ? (
                    <SettingsPage
                      navigate={navigate}
                      currentUser={currentUser}
                      profileMediaUrls={profileMediaUrls}
                      onProfilePhotoChange={handleProfilePhotoChange}
                      onCoverPhotoChange={handleCoverPhotoChange}
                    />
                  ) : null}
                  {route === "/admin/finance" ? <FinancePage route="/finance/setup" navigate={navigate} currentUser={currentUser} /> : null}
                  {route.startsWith("/admin") && route !== "/admin/finance" ? <AdminPage route={route as AdminRoute} currentUser={currentUser} /> : null}
                  {route.startsWith("/warehouse") ? <WarehousePage route={route} currentUser={currentUser} navigate={navigate} /> : null}
                  {route === "/bookings" ? <BookingsPage navigate={navigate} currentUser={currentUser} /> : null}
                  {isBookingDetailRoute(route) ? <BookingDetailPage navigate={navigate} bookingId={route.split("/").at(-1) ?? "md-22455"} /> : null}
                  {route === "/road-control" ? <RoadControlPage navigate={navigate} currentUser={currentUser} /> : null}
                  {route === "/road-control/new" ? <DomesticRoadBookingPage navigate={navigate} /> : null}
                  {isRoadJobDetailRoute(route) ? <DomesticRoadBookingPage key={route} navigate={navigate} roadJobId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/bookings/new" ? <BookingOpenPage navigate={navigate} /> : null}
                  {route === "/bookings/provisional" ? <ProvisionalBookingPage navigate={navigate} /> : null}
                  {route === "/" ? <HomePage navigate={navigate} currentUser={currentUser} /> : null}
                </Suspense>
              </AppShell>
            )}
            {isWorkspaceRoute ? (
              <>
                <AppShortcuts navigate={navigate} />
                <DexterSummon navigate={navigate} />
                <DictationController />
              </>
            ) : null}
            </MotionConfig>
            <Toaster />
          </TooltipProvider>
        </WorkspaceErrorBoundary>
      </LanguageProvider>
    </ThemeProvider>
  )
}
