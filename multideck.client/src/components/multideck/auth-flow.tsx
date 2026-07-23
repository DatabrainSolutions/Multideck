import { useCallback, useState } from "react"
import type { Provider } from "@supabase/supabase-js"
import { ArrowRight, Building2, Clock3, Loader2, Mail, ShieldCheck, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthProviderSelector, type AuthProviderId } from "@/components/multideck/auth-provider-selector"
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { takeAuthReturnPath } from "@/lib/auth-routing"
import { cn } from "@/lib/utils"
import { isSupabaseConfigured, isWorkspaceRouterHost, multideckRootHost, supabase, supabaseConfigurationError } from "@/lib/supabase"
import multideckLogoMark from "@/assets/brand/multideck-logo-mark.svg"

export type AuthFlowStep = "signin" | "verify" | "signed-out"

export type WorkspaceDirectoryEntry = {
  slug: string
  name: string
  description?: string
}

type AuthCopy = {
  title: string
  body: string
  footnote: string
}

const authCopyByStep: Record<AuthFlowStep, AuthCopy> = {
  signin: {
    title: "Freight keeps moving.\nDexter keeps watch.",
    body: "A private operating workspace for the people responsible for every booking, exception, and customer promise.",
    footnote: "Invite-only access for your team",
  },
  verify: {
    title: "One link.\nNo passwords.",
    body: "We sent a six-digit code and a sign-in link to your inbox. Either one gets you in.",
    footnote: "Codes expire after 10 minutes",
  },
  "signed-out": {
    title: "Lights off.\nDexter keeps watch.",
    body: "Exceptions, ETA changes, and new documents are monitored overnight. Anything urgent will be waiting at the top of your morning digest.",
    footnote: "Monitoring 248 bookings while you're away",
  },
}

const authBookings = [
  { id: "MD-22481", route: "Yantian -> Felixstowe", status: "On track", tone: "green" },
  { id: "MD-22479", route: "Ningbo -> Rotterdam", status: "Delayed 2d", tone: "amber" },
  { id: "MD-22466", route: "Frankfurt -> JFK", status: "Arriving today", tone: "teal" },
]

const signedOutStats = [
  ["12", "bookings you touched today"],
  ["3", "exceptions cleared"],
  ["6", "customer updates Dexter sent for you"],
]

function getAuthRedirectUrl() {
  return `${window.location.origin}/auth`
}

const reservedWorkspaceSlugs = new Set(["admin", "api", "auth", "data", "support", "www"])

function parseWorkspaceSlug(value: string) {
  const normalizedValue = value.trim().toLowerCase().replace(/^https?:\/\//, "")
  const hostname = normalizedValue.split(/[/?#]/, 1)[0]?.replace(/\.$/, "") ?? ""
  const tenantSuffix = `.${multideckRootHost}`
  const slug = hostname.endsWith(tenantSuffix) ? hostname.slice(0, -tenantSuffix.length) : hostname

  return slug.includes(".") ? "" : slug
}

function isValidWorkspaceSlug(value: string) {
  return /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value) && !reservedWorkspaceSlugs.has(value)
}

function parseWorkspaceDirectory(value: string): WorkspaceDirectoryEntry[] {
  return value
    .split(",")
    .map((entry) => {
      const [rawSlug, ...nameParts] = entry.split(":")
      const slug = parseWorkspaceSlug(rawSlug ?? "")
      const name = nameParts.join(":").trim()

      return isValidWorkspaceSlug(slug) && name ? { slug, name } : null
    })
    .filter((entry): entry is WorkspaceDirectoryEntry => Boolean(entry))
}

const configuredWorkspaces = parseWorkspaceDirectory(import.meta.env.VITE_MULTIDECK_WORKSPACES?.trim() ?? "")

function getWorkspaceAuthUrl(workspaceSlug: string) {
  const protocol = import.meta.env.DEV ? window.location.protocol : "https:"
  const port = import.meta.env.DEV && window.location.port ? `:${window.location.port}` : ""

  return `${protocol}//${workspaceSlug}.${multideckRootHost}${port}/auth`
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function BrandLockup({ inverted = false, centered = false }: { inverted?: boolean; centered?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", centered && "justify-center")}>
      <img
        src={multideckLogoMark}
        alt=""
        className={cn("h-[19px] w-[26px] object-contain", inverted && "brightness-0 invert")}
      />
      <span className={cn("text-[21px] font-medium leading-none tracking-normal", inverted ? "text-white" : "text-[var(--md-ink)]")}>multideck</span>
    </div>
  )
}

function FreightNarrative({
  step = "signin",
  className,
  componentPreview = false,
}: {
  step?: AuthFlowStep
  className?: string
  componentPreview?: boolean
}) {
  const copy = authCopyByStep[step]
  const muted = step === "signed-out"

  return (
    <aside
      className={cn(
        "relative flex min-h-[360px] overflow-hidden bg-[#062420] text-white",
        componentPreview ? "min-h-[900px] lg:min-h-[900px]" : "lg:min-h-screen",
        className,
      )}
    >
      <div className="absolute inset-0 scale-[1.08]" aria-hidden="true">
        <SpectralBloomShader />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,14,12,0.12),rgba(2,14,12,0.34)_58%,rgba(2,14,12,0.78))]" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_22%,rgba(255,255,255,0.12),transparent_36%)]" aria-hidden="true" />

      <div
        className={cn(
          "relative z-10 flex min-h-[360px] w-full flex-col px-[clamp(24px,4vw,64px)] py-[clamp(24px,4vw,56px)]",
          componentPreview ? "min-h-[900px] lg:min-h-[900px]" : "lg:min-h-screen",
        )}
      >
        <BrandLockup inverted />

        <div className="mt-auto max-w-[500px] pb-[var(--md-page-bottom-pad)] pt-20 lg:pt-0">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black/12 px-3 py-1.5 text-[12px] font-medium text-white/78 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-xl">
            <ShieldCheck className="size-3.5" strokeWidth={1.5} />
            Private workspace
          </div>
          <h1 className="whitespace-pre-line text-[24px] font-medium leading-[1.22] tracking-normal">{copy.title}</h1>
          <p className="mt-4 max-w-[470px] text-[14px] leading-6 text-white/64">{copy.body}</p>

          <div className="mt-8 flex max-w-[520px] flex-col gap-2.5">
            {authBookings.map((booking, index) => (
              <div
                key={booking.id}
                className={cn(
                  "grid h-[54px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--md-radius-2xl)] px-4 text-[13px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),0_16px_32px_rgba(0,0,0,0.1)] backdrop-blur-xl transition-[background,color,box-shadow,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:w-[88%]",
                  index === 0 && "bg-black/10",
                  index === 1 && "bg-black/14 sm:ms-5",
                  index === 2 && "bg-white/12 sm:ms-10",
                  muted && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    booking.tone === "green" && "bg-[#7bdcae]",
                    booking.tone === "amber" && "bg-[var(--md-amber)]",
                    booking.tone === "teal" && "bg-[#8ed2cb]",
                  )}
                />
                <div className="flex min-w-0 items-center gap-[var(--md-page-stack-gap)]">
                  <strong className="shrink-0 font-medium text-white" data-i18n-skip>{booking.id}</strong>
                  <span className="hidden truncate text-white/52 sm:block" data-i18n-skip>{booking.route}</span>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[12px] font-medium",
                    booking.tone === "green" && "text-[#80caa3]",
                    booking.tone === "amber" && "text-[var(--md-amber)]",
                    booking.tone === "teal" && "text-white",
                  )}
                >
                  {booking.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {copy.footnote ? (
          <p className={cn("mt-auto flex items-center gap-3 text-[12px] text-white/58", muted && "text-white/55")}>
            <span className="size-2 rounded-full bg-[#79d9a7] shadow-[0_0_0_4px_rgba(121,217,167,0.12)]" />
            {copy.footnote}
          </p>
        ) : null}
      </div>
    </aside>
  )
}

function AuthAlert({ tone, children }: { tone: "error" | "info" | "success"; children?: string | null }) {
  if (!children) return null

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mt-[var(--md-gap-lg)] flex gap-[var(--md-gap-md)] rounded-[var(--md-radius-lg)] px-[var(--md-gap-lg)] py-[var(--md-gap-md)] text-[15px] leading-6 shadow-[var(--md-shadow-line)]",
        tone === "error" && "bg-white/78 text-[var(--md-red)]",
        tone === "info" && "bg-white/64 text-[var(--md-text)]",
        tone === "success" && "bg-white/72 text-[var(--md-accent)]",
      )}
    >
      {tone === "error" ? <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} /> : null}
      <span>{children}</span>
    </div>
  )
}

function AuthField({
  label,
  value,
  onChange,
  onSubmit,
  disabled = false,
  isSubmitting = false,
  submitLabel = "Continue",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  disabled?: boolean
  isSubmitting?: boolean
  submitLabel?: string
}) {
  return (
    <form
      className="mt-[var(--md-page-section-gap)]"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      <label className="text-[16px] font-medium text-[var(--md-ink)]" htmlFor="auth-email">
        {label}
      </label>
      <Input
        id="auth-email"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoCapitalize="none"
        autoComplete="email"
        data-i18n-skip
        dir="ltr"
        disabled={disabled || isSubmitting}
        inputMode="email"
        placeholder="john.doe@multideck.app"
        spellCheck={false}
        type="email"
        className="mt-3 h-[64px] rounded-[14px] border-0 bg-white px-5 text-[21px] text-[var(--md-ink)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.42),0_0_0_4px_rgba(14,125,116,0.16)] focus-visible:ring-0 disabled:bg-white/72"
      />
      <Button type="submit" disabled={disabled || isSubmitting} className="mt-[var(--md-page-stack-gap)] h-[64px] w-full rounded-[14px] bg-[var(--md-accent)] text-[18px] font-medium text-white hover:bg-[#0b6f67]">
        {isSubmitting ? <Loader2 data-icon="inline-start" className="me-2 size-5 animate-spin" strokeWidth={1.5} /> : null}
        {submitLabel}
        {!isSubmitting ? <ArrowRight data-icon="inline-end" className="ms-2 size-5" strokeWidth={1.4} /> : null}
      </Button>
    </form>
  )
}

function PasswordSignInForm({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  disabled = false,
  isSubmitting = false,
}: {
  email: string
  password: string
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  disabled?: boolean
  isSubmitting?: boolean
}) {
  return (
    <form
      className="mt-5"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      <label className="text-[13px] font-medium text-[var(--md-ink)]" htmlFor="auth-password-email">
        Work email
      </label>
      <Input
        id="auth-password-email"
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        autoCapitalize="none"
        autoComplete="email"
        data-i18n-skip
        dir="ltr"
        disabled={disabled || isSubmitting}
        inputMode="email"
        placeholder="john.doe@multideck.app"
        spellCheck={false}
        type="email"
        className="mt-2 h-12 rounded-[var(--md-radius-xl)] border-0 bg-white px-4 text-[14px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] disabled:bg-white/72"
      />

      <label className="mt-4 block text-[13px] font-medium text-[var(--md-ink)]" htmlFor="auth-password">
        Password
      </label>
      <Input
        id="auth-password"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        autoComplete="current-password"
        data-i18n-skip
        dir="ltr"
        disabled={disabled || isSubmitting}
        type="password"
        className="mt-2 h-12 rounded-[var(--md-radius-xl)] border-0 bg-white px-4 text-[14px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] disabled:bg-white/72"
      />

      <Button type="submit" disabled={disabled || isSubmitting} className="mt-5 h-12 w-full rounded-[var(--md-radius-xl)] bg-[var(--md-accent)] text-[13px] font-medium text-white hover:bg-[#0b6f67]">
        {isSubmitting ? <Loader2 data-icon="inline-start" className="me-2 size-4 animate-spin" strokeWidth={1.5} /> : null}
        {isSubmitting ? "Signing in" : "Sign in with password"}
        {!isSubmitting ? <ArrowRight data-icon="inline-end" className="ms-2 size-4" strokeWidth={1.4} /> : null}
      </Button>
    </form>
  )
}

export function WorkspaceRouterPanel({
  initialWorkspace = "",
  onContinue,
  workspaces = configuredWorkspaces,
}: {
  initialWorkspace?: string
  onContinue?: (workspace: string) => void
  workspaces?: WorkspaceDirectoryEntry[]
}) {
  const [workspace, setWorkspace] = useState(() => parseWorkspaceSlug(initialWorkspace))
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const availableWorkspaces = workspaces.filter((entry) => isValidWorkspaceSlug(entry.slug) && entry.name.trim())
  const hasAvailableWorkspaces = availableWorkspaces.length > 0

  function openWorkspace(workspaceValue = workspace) {
    const workspaceSlug = parseWorkspaceSlug(workspaceValue)

    if (!isValidWorkspaceSlug(workspaceSlug)) {
      setWorkspaceError("Enter the workspace name supplied by your Multideck administrator.")
      return
    }

    setWorkspaceError(null)

    if (onContinue) {
      onContinue(workspaceSlug)
      return
    }

    window.location.assign(getWorkspaceAuthUrl(workspaceSlug))
  }

  return (
    <div className="w-full max-w-[520px]">
      <BrandLockup />
      <div className="mt-10 grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]" aria-hidden="true">
        <Building2 className="size-5" strokeWidth={1.4} />
      </div>
      <h2 className="mt-5 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">
        {hasAvailableWorkspaces ? "Choose a company" : "Open your workspace"}
      </h2>
      <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">
        {hasAvailableWorkspaces
          ? "Select the company workspace you need. Sign-in happens securely inside that company's Multideck account."
          : "Each company has its own private Multideck workspace and secure sign-in."}
      </p>

      {hasAvailableWorkspaces ? (
        <>
          <div className="mt-7 space-y-2">
            {availableWorkspaces.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                className="group grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3 text-start shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:bg-[var(--md-surface-tint)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.16)]"
                onClick={() => openWorkspace(entry.slug)}
              >
                <span className="grid size-10 place-items-center rounded-[calc(var(--md-radius-xl)-4px)] bg-[var(--md-accent)] text-[14px] font-medium text-white" aria-hidden="true" data-i18n-skip>
                  {entry.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-[14px] font-medium text-[var(--md-ink)]" data-i18n-skip>{entry.name}</strong>
                  <span className="mt-0.5 block text-[12px] text-[var(--md-text)]">
                    {entry.description ?? "Private company workspace"}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-[12px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">
                  {entry.slug}.{multideckRootHost}
                  <ArrowRight className="size-4 text-[var(--md-text)] transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180" strokeWidth={1.4} />
                </span>
              </button>
            ))}
          </div>

          <div className="my-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[12px] text-[var(--md-subtle)]">
            <span className="h-px bg-[rgba(11,20,19,0.08)]" />
            or use a workspace name
            <span className="h-px bg-[rgba(11,20,19,0.08)]" />
          </div>
        </>
      ) : null}

      <form
        className={hasAvailableWorkspaces ? undefined : "mt-7"}
        onSubmit={(event) => {
          event.preventDefault()
          openWorkspace()
        }}
      >
        <label htmlFor="multideck-workspace" className="text-[12px] font-medium text-[var(--md-text)]">
          Workspace
        </label>
        <div className="relative mt-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)] focus-within:shadow-[inset_0_0_0_1px_rgba(14,125,116,0.48),0_0_0_4px_rgba(14,125,116,0.12)]">
          <Input
            id="multideck-workspace"
            value={workspace}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="dev"
            data-i18n-skip
            dir="ltr"
            className="h-12 rounded-[calc(var(--md-radius-xl)-4px)] border-0 bg-transparent pe-[152px] ps-3 text-[14px] font-medium text-[var(--md-ink)] shadow-none focus-visible:ring-0"
            onChange={(event) => {
              setWorkspace(event.target.value)
              setWorkspaceError(null)
            }}
          />
          <span className="pointer-events-none absolute inset-y-1 end-3 flex items-center text-[13px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">
            .{multideckRootHost}
          </span>
        </div>

        <AuthAlert tone="error">{workspaceError}</AuthAlert>

        <Button
          type="submit"
          className="mt-5 h-12 w-full rounded-[var(--md-radius-xl)] bg-[var(--md-ink)] px-5 text-[14px] font-medium text-white shadow-[var(--md-shadow-soft)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:bg-[var(--md-strong)]"
        >
          Open workspace
          <ArrowRight className="ms-2 size-4 rtl:rotate-180" strokeWidth={1.4} />
        </Button>
      </form>

      <p className="mt-6 text-[12px] leading-5 text-[var(--md-text)]">
        Your workspace name is included in the access details sent by your administrator.
      </p>
    </div>
  )
}

function SignInPanel({
  email,
  password = "",
  onEmailChange,
  onPasswordChange = () => undefined,
  onPasswordSignIn = () => undefined,
  onProviderSignIn,
  disabled = false,
  isSubmitting = false,
  busyProvider = null,
  message,
  error,
}: {
  email: string
  password?: string
  onEmailChange: (value: string) => void
  onPasswordChange?: (value: string) => void
  onPasswordSignIn?: () => void | Promise<void>
  onProviderSignIn?: (provider: AuthProviderId) => void | Promise<void>
  disabled?: boolean
  isSubmitting?: boolean
  busyProvider?: AuthProviderId | null
  message?: string | null
  error?: string | null
}) {
  return (
    <div className="w-full max-w-[520px]">
      <BrandLockup />
      <h2 className="mt-10 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Sign in to Multideck</h2>
      <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">
        Use a sign-in method already connected to your account.
      </p>

      <AuthProviderSelector
        className="mt-7"
        disabled={disabled || isSubmitting}
        busyProvider={busyProvider}
        onSelect={onProviderSignIn}
      />

      <AuthAlert tone="error">{error}</AuthAlert>
      <AuthAlert tone="info">{message}</AuthAlert>

      <div className="my-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[12px] text-[var(--md-subtle)]">
        <span className="h-px bg-[rgba(11,20,19,0.08)]" />
        or use email and password
        <span className="h-px bg-[rgba(11,20,19,0.08)]" />
      </div>

      <PasswordSignInForm
        email={email}
        password={password}
        onEmailChange={onEmailChange}
        onPasswordChange={onPasswordChange}
        onSubmit={onPasswordSignIn}
        disabled={disabled || Boolean(busyProvider)}
        isSubmitting={isSubmitting}
      />

      <p className="mt-6 text-[12px] leading-5 text-[var(--md-text)]">
        Need access? Ask your workspace administrator. Multideck accounts are created for your team and cannot be opened from this screen.
      </p>
    </div>
  )
}

function CodeInput({
  code,
  onCodeChange,
  onComplete,
  disabled = false,
}: {
  code: string
  onCodeChange: (value: string) => void
  onComplete: (code: string) => void | Promise<void>
  disabled?: boolean
}) {
  const digits = code.padEnd(6, " ").slice(0, 6).split("")

  function completeIfReady(nextCode: string) {
    if (nextCode.length === 6) window.setTimeout(() => void onComplete(nextCode), 240)
  }

  function updateDigit(index: number, value: string) {
    const nextDigits = digits.map((digit) => (digit === " " ? "" : digit))
    nextDigits[index] = value.replace(/\D/g, "").slice(-1)
    const nextCode = nextDigits.join("").slice(0, 6)
    onCodeChange(nextCode)
    completeIfReady(nextCode)
  }

  function pasteCode(value: string) {
    const nextCode = value.replace(/\D/g, "").slice(0, 6)
    if (!nextCode) return

    onCodeChange(nextCode)
    completeIfReady(nextCode)
  }

  return (
    <div className="mt-[var(--md-page-section-gap)] flex gap-[var(--md-gap-lg)]" dir="ltr">
      {digits.map((digit, index) => (
        <Input
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          aria-label={`Code digit ${index + 1}`}
          value={digit === " " ? "" : digit}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          onChange={(event) => updateDigit(index, event.target.value)}
          onPaste={(event) => {
            event.preventDefault()
            pasteCode(event.clipboardData.getData("text"))
          }}
          className={cn(
            "size-[74px] rounded-[14px] border-0 bg-white p-0 text-center text-[34px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-0 disabled:bg-white/72",
            index === Math.min(code.length, 5) && "shadow-[inset_0_0_0_1px_rgba(14,125,116,0.48),0_0_0_4px_rgba(14,125,116,0.14)]",
          )}
        />
      ))}
    </div>
  )
}

function VerifyPanel({
  email,
  code,
  onCodeChange,
  onBack,
  onComplete,
  onResend,
  disabled = false,
  isSubmitting = false,
  message,
  error,
}: {
  email: string
  code: string
  onCodeChange: (value: string) => void
  onBack: () => void
  onComplete: (code: string) => void | Promise<void>
  onResend?: () => void | Promise<void>
  disabled?: boolean
  isSubmitting?: boolean
  message?: string | null
  error?: string | null
}) {
  return (
    <div className="w-full max-w-[600px]">
      <div className="grid size-[64px] place-items-center rounded-[16px] bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]">
        <Mail className="size-7" strokeWidth={1.4} />
      </div>

      <h2 className="mt-[var(--md-page-section-gap)] text-[36px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Check your inbox</h2>
      <p className="mt-4 text-[18px] leading-7 text-[var(--md-text)]">
        We sent a code to <span className="font-medium text-[var(--md-ink)]" dir="ltr" data-i18n-skip>{email}</span>
      </p>

      <CodeInput code={code} onCodeChange={onCodeChange} onComplete={onComplete} disabled={disabled || isSubmitting} />

      <AuthAlert tone="error">{error}</AuthAlert>
      <AuthAlert tone="info">{message}</AuthAlert>

      <div className="mt-[var(--md-page-section-gap)] flex flex-wrap items-center gap-[var(--md-gap-md)] text-[17px] text-[var(--md-text)]">
        <span>Didn't get it?</span>
        <button type="button" disabled={disabled || isSubmitting} className="font-medium text-[var(--md-accent)] disabled:opacity-50" onClick={() => void onResend?.()}>Resend</button>
        <span className="text-[var(--md-subtle)]">·</span>
        <button type="button" disabled={isSubmitting} className="font-medium text-[var(--md-accent)] disabled:opacity-50" onClick={onBack}>Use a different email</button>
      </div>

      <div className="mt-[calc(var(--md-page-section-gap)+var(--md-gap-lg))] flex gap-[var(--md-gap-lg)] rounded-[14px] bg-white/52 px-[var(--md-gap-xl)] py-[var(--md-page-stack-gap)] text-[16px] leading-7 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
        <Clock3 className="mt-1 size-5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} />
        <p>Your session stays signed in on this device for 30 days. Admins can shorten this in workspace settings.</p>
      </div>
    </div>
  )
}

function SignedOutPanel({ onSignBackIn, onSwitchAccount, operatorName = "Emma" }: { onSignBackIn: () => void; onSwitchAccount: () => void; operatorName?: string }) {
  return (
    <div className="w-full max-w-[560px]">
      <BrandLockup />
      <h2 className="mt-[calc(var(--md-page-section-gap)*2)] text-[34px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">You're signed out</h2>
      <p className="mt-[var(--md-page-stack-gap)] text-[18px] text-[var(--md-text)]">Nice work today, {operatorName}.</p>

      <div className="mt-11 overflow-hidden rounded-[16px] bg-white/88 shadow-[var(--md-shadow-line)]">
        {signedOutStats.map(([value, label]) => (
          <div key={label} className="grid grid-cols-[64px_1fr] items-center gap-[var(--md-gap-lg)] px-[var(--md-gap-xl)] py-[var(--md-page-stack-gap)] shadow-[inset_0_-1px_0_rgba(11,20,19,0.08)] last:shadow-none">
            <strong className="text-[30px] font-medium leading-none text-[var(--md-ink)]">{value}</strong>
            <span className="text-[18px] text-[var(--md-text)]">{label}</span>
          </div>
        ))}
      </div>

      <Button type="button" className="mt-[var(--md-page-section-gap)] h-[64px] w-full rounded-[14px] bg-[var(--md-accent)] text-[18px] font-medium text-white hover:bg-[#0b6f67]" onClick={onSignBackIn}>
        Sign back in
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="mt-4 h-[60px] w-full rounded-[14px] bg-transparent text-[17px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/34"
        onClick={onSwitchAccount}
      >
        Switch account
      </Button>
    </div>
  )
}

export function AuthFlow({
  initialStep = "signin",
  galleryMode = false,
  navigate,
}: {
  initialStep?: AuthFlowStep
  galleryMode?: boolean
  navigate?: (path: string) => void
}) {
  const [step, setStep] = useState<AuthFlowStep>(initialStep)
  const [email, setEmail] = useState(galleryMode ? "john.doe@multideck.app" : "")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState(galleryMode ? "742" : "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [busyProvider, setBusyProvider] = useState<AuthProviderId | null>(null)
  const [message, setMessage] = useState<string | null>(!galleryMode && !isSupabaseConfigured ? supabaseConfigurationError : null)
  const [error, setError] = useState<string | null>(null)

  const goToApp = useCallback(() => {
    const destination = takeAuthReturnPath()

    if (navigate) {
      navigate(destination)
      return
    }

    window.location.assign(destination)
  }, [navigate])

  const completeSignedInSession = useCallback(() => {
    toast.success("Signed in", {
      description: "Your Multideck session is ready.",
    })
    goToApp()
  }, [goToApp])

  function clearFeedback() {
    setError(null)
    setMessage(null)
  }

  async function sendMagicLink() {
    clearFeedback()
    const normalizedEmail = email.trim().toLowerCase()

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter your work email to continue.")
      return
    }

    if (!supabase) {
      setError(supabaseConfigurationError ?? "Supabase is not configured for this workspace.")
      return
    }

    setIsSubmitting(true)

    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
          shouldCreateUser: false,
        },
      })

      if (signInError) throw signInError

      setEmail(normalizedEmail)
      setCode("")
      setStep("verify")
      setMessage("We sent a one-time code and magic link to your inbox.")
      toast.success("Check your inbox", { description: "Use the link or six-digit code to continue." })
    } catch (signInError) {
      console.error(signInError)
      setError("We could not send the sign-in email. Check the address or workspace access.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function signInWithPassword() {
    clearFeedback()
    const normalizedEmail = email.trim().toLowerCase()

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter your work email to continue.")
      return
    }

    if (!password.trim()) {
      setError("Enter your password to continue.")
      return
    }

    if (!supabase) {
      setError(supabaseConfigurationError ?? "Supabase is not configured for this workspace.")
      return
    }

    setIsSubmitting(true)

    try {
      const { data, error: passwordError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (passwordError) throw passwordError
      if (!data.session) throw new Error("Supabase did not return a session.")

      setEmail(normalizedEmail)
      completeSignedInSession()
    } catch (passwordError) {
      console.error(passwordError)
      setError("We could not sign you in with that email and password.")
      setMessage("Password is enabled for users who already have a Supabase password.")
      setIsSubmitting(false)
    }
  }

  async function signInWithProvider(provider: AuthProviderId) {
    clearFeedback()

    if (!supabase) {
      setError(supabaseConfigurationError ?? "Supabase is not configured for this workspace.")
      return
    }

    setBusyProvider(provider)

    try {
      if (provider === "passkey") {
        if (!("PublicKeyCredential" in window)) {
          throw new Error("Passkeys are not supported in this browser.")
        }

        const { data, error: passkeyError } = await supabase.auth.signInWithPasskey()
        if (passkeyError) throw passkeyError
        if (!data.session) throw new Error("Supabase did not return a session.")

        completeSignedInSession()
        return
      }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: provider as Provider,
        options: {
          redirectTo: getAuthRedirectUrl(),
          ...(provider === "azure" ? { scopes: "email" } : {}),
        },
      })

      if (oauthError) throw oauthError
    } catch (providerError) {
      console.error(providerError)
      const providerCode = typeof providerError === "object" && providerError && "code" in providerError ? String(providerError.code) : ""
      setError(
        providerCode === "passkey_disabled"
          ? "Passkey sign-in is not enabled for this workspace yet."
          : providerCode === "webauthn_credential_not_found"
            ? "No Multideck passkey was found on this device. Connect one from Login & security after signing in."
            : "We could not start that sign-in method. Check that it is connected to your account.",
      )
    } finally {
      setBusyProvider(null)
    }
  }

  async function verifyCode(nextCode = code) {
    clearFeedback()
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedCode = nextCode.replace(/\D/g, "").slice(0, 6)

    if (!isValidEmail(normalizedEmail)) {
      setStep("signin")
      setError("Enter your work email to continue.")
      return
    }

    if (normalizedCode.length !== 6) {
      setError("Enter the six-digit code from your email.")
      return
    }

    if (!supabase) {
      setError(supabaseConfigurationError ?? "Supabase is not configured for this workspace.")
      return
    }

    setIsSubmitting(true)

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedCode,
        type: "email",
      })

      if (verifyError) throw verifyError
      if (!data.session) throw new Error("Supabase did not return a session.")

      completeSignedInSession()
    } catch (verifyError) {
      console.error(verifyError)
      setError("That code was not accepted. Request a new code or try again.")
      setIsSubmitting(false)
    }
  }

  function goToSignIn(resetEmail = false) {
    clearFeedback()
    setStep("signin")
    setCode("")
    if (resetEmail) {
      setEmail("")
      setPassword("")
    }
    if (!galleryMode && !isSupabaseConfigured) setMessage(supabaseConfigurationError)
  }

  const showWorkspaceRouter = !galleryMode && isWorkspaceRouterHost

  const authPanel = showWorkspaceRouter ? (
    <WorkspaceRouterPanel />
  ) : (
    <>
      {step === "signin" ? (
        <SignInPanel
          email={email}
          password={password}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onPasswordSignIn={signInWithPassword}
          onProviderSignIn={signInWithProvider}
          isSubmitting={isSubmitting}
          busyProvider={busyProvider}
          message={message}
          error={error}
        />
      ) : null}
      {step === "verify" ? (
        <VerifyPanel
          email={email || "john.doe@multideck.app"}
          code={code}
          onCodeChange={setCode}
          onBack={() => goToSignIn(false)}
          onComplete={verifyCode}
          onResend={sendMagicLink}
          isSubmitting={isSubmitting}
          message={message}
          error={error}
        />
      ) : null}
      {step === "signed-out" ? <SignedOutPanel onSignBackIn={() => goToSignIn(false)} onSwitchAccount={() => goToSignIn(true)} /> : null}
    </>
  )

  if (galleryMode) {
    return (
      <div className="grid min-h-[720px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] lg:grid-cols-[44%_56%]">
        <FreightNarrative step={step} className="min-h-[720px]" />
        <main className="grid min-h-[720px] place-items-center px-[clamp(var(--md-gap-xl),5vw,88px)] py-[calc(var(--md-page-section-gap)*2)]">
          {authPanel}
        </main>
      </div>
    )
  }

  return (
    <div className="grid min-h-screen bg-[var(--md-bg)] text-[var(--md-ink)] lg:grid-cols-[44%_56%]">
      <FreightNarrative step={step} className="order-2 lg:order-1" />
      <main className="order-1 grid min-h-[720px] place-items-center px-[clamp(var(--md-gap-xl),5vw,88px)] py-[calc(var(--md-page-section-gap)*2)] lg:order-2 lg:min-h-screen">
        <div className="w-full max-w-[520px]">
          {authPanel}
        </div>
      </main>
    </div>
  )
}

export { AuthField, BrandLockup, CodeInput, FreightNarrative, SignedOutPanel, SignInPanel, VerifyPanel }
