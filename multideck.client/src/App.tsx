import { Component, lazy, startTransition, Suspense, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { MotionConfig } from "motion/react"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/components/multideck/app-shell"
import { AppShortcuts } from "@/components/multideck/app-shortcuts"
// Both are loaded with the shell rather than lazily: a shortcut that does nothing
// for the first second after a page load is worse than no shortcut, and the summon
// only pays for its shader once it is actually opened.
import { DexterSummon } from "@/components/multideck/dexter-summon"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { LanguageProvider, useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { rememberAuthReturnPath, takeAuthReturnPath } from "@/lib/auth-routing"
import { summarizeAuthUser, type AuthUserSummary } from "@/lib/auth-user"
import { getApiAuthSession } from "@/lib/api"
import {
  createProfilePhotoSignedUrls,
  type UserProfilePhoto,
} from "@/lib/profile-photo"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"
import { ThemeProfileSync, themeStorageKey } from "@/lib/theme-preferences"
import { LanguageProfileSync } from "@/lib/language-preferences"
import { rememberRecentWorkContext } from "@/lib/recent-work-context"
import multideckLogoMark from "@/assets/brand/multideck-logo-mark.svg"

const OverviewPage = lazy(() => import("@/pages/overview-page").then((module) => ({ default: module.OverviewPage })))
const AgentDexterPage = lazy(() => import("@/pages/agent-dexter-page").then((module) => ({ default: module.AgentDexterPage })))
const AuthFlowPage = lazy(() => import("@/pages/auth-flow-page").then((module) => ({ default: module.AuthFlowPage })))
const ComponentsGalleryPage = lazy(() => import("@/pages/components-gallery-page").then((module) => ({ default: module.ComponentsGalleryPage })))
const CustomerDetailPage = lazy(() => import("@/pages/customer-detail-page").then((module) => ({ default: module.CustomerDetailPage })))
const CustomersPage = lazy(() => import("@/pages/customers-page").then((module) => ({ default: module.CustomersPage })))
const InboxPage = lazy(() => import("@/pages/inbox-page").then((module) => ({ default: module.InboxPage })))
const DocumentsPage = lazy(() => import("@/pages/documents-page").then((module) => ({ default: module.DocumentsPage })))
const CustomsDeclarationsPage = lazy(() => import("@/pages/customs-declarations-page").then((module) => ({ default: module.CustomsDeclarationsPage })))
const ReportsPage = lazy(() => import("@/pages/reports-page").then((module) => ({ default: module.ReportsPage })))
const PaperTrayPage = lazy(() => import("@/pages/paper-tray-page").then((module) => ({ default: module.PaperTrayPage })))
const NavigationLabPage = lazy(() => import("@/pages/navigation-lab-page").then((module) => ({ default: module.NavigationLabPage })))
const QuoteDetailPage = lazy(() => import("@/pages/quotes-page").then((module) => ({ default: module.QuoteDetailPage })))
const QuotesRegisterPage = lazy(() => import("@/pages/quotes-register-page").then((module) => ({ default: module.QuotesRegisterPage })))
const RatesPage = lazy(() => import("@/pages/rates-page").then((module) => ({ default: module.RatesPage })))
const ReportTemplateBuilderPage = lazy(() => import("@/pages/report-template-builder-page").then((module) => ({ default: module.ReportTemplateBuilderPage })))
const ReportViewerPage = lazy(() => import("@/pages/report-viewer-page").then((module) => ({ default: module.ReportViewerPage })))
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })))
const WarehousePage = lazy(() => import("@/pages/warehouse-page").then((module) => ({ default: module.WarehousePage })))
const BookingDetailPage = lazy(() => import("@/pages/booking-detail-page").then((module) => ({ default: module.BookingDetailPage })))
const BookingWizardPage = lazy(() => import("@/pages/booking-wizard-page").then((module) => ({ default: module.BookingWizardPage })))
const ProvisionalBookingPage = lazy(() => import("@/pages/provisional-booking-page").then((module) => ({ default: module.ProvisionalBookingPage })))
const BookingsPage = lazy(() => import("@/pages/bookings-page").then((module) => ({ default: module.BookingsPage })))
const RoadControlPage = lazy(() => import("@/pages/road-control-page").then((module) => ({ default: module.RoadControlPage })))
const DomesticRoadBookingPage = lazy(() => import("@/pages/domestic-road-booking-page").then((module) => ({ default: module.DomesticRoadBookingPage })))
const CrmOverviewPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmOverviewPage })))
const CrmAccountsPage = lazy(() => import("@/pages/crm-accounts-page").then((module) => ({ default: module.CrmAccountsPage })))
const CrmAccountDetailPage = lazy(() => import("@/pages/crm-account-detail-page").then((module) => ({ default: module.CrmAccountDetailPage })))
const CrmLeadsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmLeadsPage })))
const CrmLeadDetailPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmLeadDetailPage })))
const LeadConversionPage = lazy(() => import("@/pages/lead-conversion-page").then((module) => ({ default: module.LeadConversionPage })))
const CrmActivityPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmActivityPage })))
const CrmContactsPage = lazy(() => import("@/pages/crm-contacts-page").then((module) => ({ default: module.CrmContactsPage })))
const CrmContactDetailPage = lazy(() => import("@/pages/crm-contact-detail-page").then((module) => ({ default: module.CrmContactDetailPage })))
const CrmDealsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmDealsPage })))
const CrmDealDetailPage = lazy(() => import("@/pages/crm-deal-detail-page").then((module) => ({ default: module.CrmDealDetailPage })))
const CrmEmailsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmEmailsPage })))
const CrmEmailStatsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmEmailStatsPage })))
const CrmEmailEditPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmEmailEditPage })))
const CrmListsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmListsPage })))
const CrmListDetailPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmListDetailPage })))
const CrmDrivePage = lazy(() => import("@/pages/crm-drive-page").then((module) => ({ default: module.CrmDrivePage })))
const CrmSettingsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmSettingsPage })))
const CrmFormsPage = lazy(() => import("@/pages/crm-forms-page").then((module) => ({ default: module.CrmFormsPage })))
const ContactCardsPage = lazy(() => import("@/pages/contact-cards-page").then((module) => ({ default: module.ContactCardsPage })))
const ContactCardDetailPage = lazy(() => import("@/pages/contact-cards-page").then((module) => ({ default: module.ContactCardDetailPage })))
const ContactCardPublicPage = lazy(() => import("@/pages/contact-card-public-page").then((module) => ({ default: module.ContactCardPublicPage })))

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
  "/auth",
  "/components",
  "/crm",
  "/crm/accounts",
  "/crm/activity",
  "/crm/contact-cards",
  "/crm/contacts",
  "/crm/deals",
  "/crm/emails",
  "/crm/forms",
  "/crm/leads",
  "/crm/lists",
  "/crm/drive",
  "/crm/settings",
  "/customers",
  "/inbox",
  "/documents",
  "/documents/templates",
  "/customs/standalone/export",
  "/customs/standalone/export/new",
  "/customs/standalone/import",
  "/customs/standalone/import/new",
  "/customs/job-related/export",
  "/customs/job-related/import",
  "/paper-tray",
  "/playground/navigation",
  "/quotes",
  "/quotes/3",
  "/rates",
  "/rates/contracts",
  "/rates/tariffs",
  "/rates/imports",
  "/rates/results",
  "/reports",
  "/reports/templates/monthly-client-review",
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

/** A warehouse order has its own address, so the router has to recognise it. */
function isWarehouseOrderDetailRoute(path: string) {
  return /^\/warehouse\/orders\/[^/]+$/.test(path)
}

/** So does a warehouse item. */
function isWarehouseItemDetailRoute(path: string) {
  return /^\/warehouse\/items\/[^/]+$/.test(path)
}

function isRoadJobDetailRoute(path: string) {
  return /^\/road-control\/[^/]+$/.test(path) && path !== "/road-control/new"
}

function isCustomsDeclarationEditRoute(path: string) {
  return /^\/customs\/standalone\/(export|import)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path)
}

/** The Marketing drive became Drive; old links still have to land somewhere real. */
function getLegacyCrmRoute(path: string) {
  return path === "/crm/marketing" ? "/crm/drive" : null
}

function getLegacyBookingRoute(path: string) {
  if (path === "/shipments") return "/bookings"
  const detailMatch = path.match(/^\/shipments\/([^/]+)$/)
  return detailMatch ? `/bookings/${detailMatch[1]}` : null
}

function isCrmLeadDetailRoute(path: string) {
  return /^\/crm\/leads\/[^/]+$/.test(path)
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

function isCrmLeadConversionRoute(path: string) {
  return /^\/crm\/leads\/[^/]+\/convert$/.test(path)
}

function isCustomerDetailRoute(path: string) {
  return /^\/customers\/[^/]+$/.test(path)
}

function isCrmListDetailRoute(path: string) {
  return /^\/crm\/lists\/[^/]+$/.test(path)
}

function isCrmEmailStatsRoute(path: string) {
  return /^\/crm\/emails\/[^/]+\/stats$/.test(path)
}

function isCrmEmailEditRoute(path: string) {
  return /^\/crm\/emails\/[^/]+\/edit$/.test(path)
}

function getRoute() {
  if (window.location.pathname === "/app" || window.location.pathname === "/app/") return "/"
  const legacyBookingRoute = getLegacyBookingRoute(window.location.pathname)
  if (legacyBookingRoute) return legacyBookingRoute
  const legacyCrmRoute = getLegacyCrmRoute(window.location.pathname)
  if (legacyCrmRoute) return legacyCrmRoute
  if (window.location.pathname.startsWith("/reports/rpt-")) return window.location.pathname
  if (isBookingDetailRoute(window.location.pathname)) return window.location.pathname
  if (isRoadJobDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCustomsDeclarationEditRoute(window.location.pathname)) return window.location.pathname
  if (isQuoteDetailRoute(window.location.pathname)) return window.location.pathname
  if (isWarehouseOrderDetailRoute(window.location.pathname)) return window.location.pathname
  if (isWarehouseItemDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCustomerDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmAccountDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmContactDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmDealDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmLeadConversionRoute(window.location.pathname)) return window.location.pathname
  if (isCrmLeadDetailRoute(window.location.pathname)) return window.location.pathname
  if (isContactCardDetailRoute(window.location.pathname)) return window.location.pathname
  if (isContactCardPublicRoute(window.location.pathname)) return window.location.pathname
  if (isCrmListDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmEmailStatsRoute(window.location.pathname)) return window.location.pathname
  if (isCrmEmailEditRoute(window.location.pathname)) return window.location.pathname
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
  const { t } = useLanguage()

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
  const isWorkspaceRoute = !isContactCardPublicRoute(route) && route !== "/auth" && (authStatus === "authenticated" || isLocalNavigationLab)

  useEffect(() => {
    if (authStatus !== "authenticated" || currentUser?.actorType === "customer") return

    const crmTimeoutId = window.setTimeout(() => {
      void import("@/lib/crm-prefetch")
        .then(({ prefetchCrmCollections }) => prefetchCrmCollections())
        .catch(() => undefined)
    }, 250)

    const warehouseTimeoutId = window.setTimeout(() => {
      void import("@/lib/warehouse-prefetch")
        .then(({ prefetchWarehouseCollections }) => prefetchWarehouseCollections())
        .catch(() => undefined)
    }, 500)

    return () => {
      window.clearTimeout(crmTimeoutId)
      window.clearTimeout(warehouseTimeoutId)
    }
  }, [authStatus, currentUser?.actorType])
  const handleProfilePhotoChange = useCallback((profilePhoto: UserProfilePhoto | null, profilePhotoUrl: string | null) => {
    setCurrentUser((user) => user ? { ...user, profilePhoto, profilePhotoUrl } : user)
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
  }, [currentUser?.coverPhoto, currentUser?.profilePhoto])

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
        hasResolvedAuthenticatedSessionRef.current = false
        setCurrentUser(null)
        setAuthStatus("unauthenticated")
        return
      }

      if (activeAccessToken === session.access_token) return
      activeAccessToken = session.access_token
      const requestId = ++sessionRequest

      if (!hasResolvedAuthenticatedSessionRef.current) setAuthStatus("checking")
      getApiAuthSession(session.access_token)
        .then((apiSession) => apiSession.profile)
        .catch((error) => {
          console.error("The application profile could not be loaded.", error)
          return null
        })
        .then((apiProfile) => {
          if (cancelled || requestId !== sessionRequest) return
          const nextUser = summarizeAuthUser(session.user, apiProfile)

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

    if (isContactCardPublicRoute(route)) return

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
    if (isContactCardPublicRoute(route) || canCustomerOpenRoute(currentUser, route)) return
    window.history.replaceState({}, "", currentUser.landingPath)
    startTransition(() => setRoute(getRoute()))
  }, [authStatus, currentUser, route])

  // A bookmark on the old path is rewritten in place, so the address bar stops
  // showing a name the product no longer uses.
  useEffect(() => {
    if (getLegacyCrmRoute(window.location.pathname)) {
      window.history.replaceState(window.history.state, "", route)
    }
  }, [route])

  function navigate(path: string) {
    if (currentUser?.actorType === "customer" && !canCustomerOpenRoute(currentUser, path)) {
      path = currentUser.landingPath
    }
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
            {isContactCardPublicRoute(route) ? (
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
                  {route === "/crm/accounts" ? <CrmAccountsPage navigate={navigate} /> : null}
                  {isCrmAccountDetailRoute(route) ? <CrmAccountDetailPage accountId={route.split("/").at(-1) ?? ""} navigate={navigate} /> : null}
                  {route === "/crm/leads" ? <CrmLeadsPage navigate={navigate} /> : null}
                  {isCrmLeadConversionRoute(route) ? <LeadConversionPage navigate={navigate} leadId={route.split("/").at(-2) ?? ""} /> : null}
                  {isCrmLeadDetailRoute(route) ? <CrmLeadDetailPage navigate={navigate} leadId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/crm/contact-cards" ? <ContactCardsPage navigate={navigate} /> : null}
                  {isContactCardDetailRoute(route) ? <ContactCardDetailPage key={route} navigate={navigate} cardId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/crm/activity" ? <CrmActivityPage navigate={navigate} /> : null}
                  {route === "/crm/contacts" ? <CrmContactsPage navigate={navigate} /> : null}
                  {isCrmContactDetailRoute(route) ? <CrmContactDetailPage contactId={route.split("/").at(-1) ?? ""} navigate={navigate} /> : null}
                  {route === "/crm/deals" ? <CrmDealsPage currentUser={currentUser} navigate={navigate} /> : null}
                  {isCrmDealDetailRoute(route) ? <CrmDealDetailPage key={route} dealId={route.split("/").at(-1) ?? ""} navigate={navigate} /> : null}
                  {route === "/crm/emails" ? <CrmEmailsPage navigate={navigate} /> : null}
                  {route === "/crm/forms" ? <CrmFormsPage /> : null}
                  {isCrmEmailStatsRoute(route) ? <CrmEmailStatsPage navigate={navigate} campaignId={route.split("/").at(-2) ?? ""} /> : null}
                  {isCrmEmailEditRoute(route) ? <CrmEmailEditPage navigate={navigate} campaignId={route.split("/").at(-2) ?? ""} /> : null}
                  {route === "/crm/lists" ? <CrmListsPage navigate={navigate} /> : null}
                  {isCrmListDetailRoute(route) ? <CrmListDetailPage navigate={navigate} listId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/crm/drive" ? <CrmDrivePage /> : null}
                  {route === "/crm/settings" ? <CrmSettingsPage currentUser={currentUser} /> : null}
                  {route === "/customers" ? <CustomersPage navigate={navigate} /> : null}
                  {isCustomerDetailRoute(route) ? <CustomerDetailPage customerId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/inbox" ? <InboxPage navigate={navigate} /> : null}
                  {route === "/documents" || route === "/documents/templates" ? <DocumentsPage navigate={navigate} /> : null}
                  {route.startsWith("/customs/") ? <CustomsDeclarationsPage route={route} navigate={navigate} /> : null}
                  {route === "/paper-tray" ? <PaperTrayPage /> : null}
                  {route === "/playground/navigation" ? <NavigationLabPage /> : null}
                  {route === "/quotes" ? <QuotesRegisterPage navigate={navigate} /> : null}
                  {isQuoteDetailRoute(route) ? <QuoteDetailPage key={route} variant="cargowise" quoteId={route.split("/").at(-1)} /> : null}
                  {route.startsWith("/rates") ? <RatesPage route={route as "/rates" | "/rates/contracts" | "/rates/tariffs" | "/rates/imports" | "/rates/results"} navigate={navigate} /> : null}
                  {route === "/reports" ? <ReportsPage navigate={navigate} /> : null}
                  {route === "/settings" ? (
                    <SettingsPage
                      navigate={navigate}
                      currentUser={currentUser}
                      profileMediaUrls={profileMediaUrls}
                      onProfilePhotoChange={handleProfilePhotoChange}
                      onCoverPhotoChange={handleCoverPhotoChange}
                    />
                  ) : null}
                  {route.startsWith("/warehouse") ? <WarehousePage route={route} currentUser={currentUser} navigate={navigate} /> : null}
                  {route === "/bookings" ? <BookingsPage navigate={navigate} /> : null}
                  {isBookingDetailRoute(route) ? <BookingDetailPage navigate={navigate} bookingId={route.split("/").at(-1) ?? "md-22455"} /> : null}
                  {route === "/road-control" ? <RoadControlPage navigate={navigate} /> : null}
                  {route === "/road-control/new" ? <DomesticRoadBookingPage navigate={navigate} /> : null}
                  {isRoadJobDetailRoute(route) ? <DomesticRoadBookingPage key={route} navigate={navigate} roadJobId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/bookings/new" ? <BookingWizardPage navigate={navigate} /> : null}
                  {route === "/bookings/provisional" ? <ProvisionalBookingPage navigate={navigate} /> : null}
                  {route === "/" ? <OverviewPage navigate={navigate} /> : null}
                </Suspense>
              </AppShell>
            )}
            {isWorkspaceRoute ? (
              <>
                <AppShortcuts navigate={navigate} />
                <DexterSummon navigate={navigate} />
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
