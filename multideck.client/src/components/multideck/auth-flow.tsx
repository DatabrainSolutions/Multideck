import { useCallback, useEffect, useState } from "react"
import type { Provider } from "@supabase/supabase-js"
import { ArrowRight, Building2, Clock3, KeyRound, Loader2, Mail, ShieldCheck, TriangleAlert } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthProviderSelector, type AuthProviderId } from "@/components/multideck/auth-provider-selector"
import { VerificationCodeInput } from "@/components/multideck/verification-code-input"
import { takeAuthReturnPath } from "@/lib/auth-routing"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_DESCRIPTION, getPasswordPolicyError } from "@/lib/password-policy"
import { clearVerifiedPasswordRecovery, hasVerifiedPasswordRecovery } from "@/lib/password-recovery"
import { getSupabaseSession, initialPasswordRecoveryLink, isSupabaseConfigured, isWorkspaceRouterHost, multideckRootHost, supabase, supabaseConfigurationError, verifyPasswordRecoveryLink } from "@/lib/supabase"
import authPanelBackdrop from "@/assets/auth/auth-panel-backdrop.jpg"
import multideckLogoMark from "@/assets/brand/multideck-logo-mark.svg"

export type AuthFlowStep = "signin" | "verify" | "forgot-password" | "reset-password" | "accept-invite" | "signed-out"

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

type AuthFieldErrors = {
  email?: string
  password?: string
  credentials?: string
  newPassword?: string
  confirmation?: string
  code?: string
}

type InviteVerification = {
  ticket: string
}

type RecoveryView = "checking" | "confirmation" | "form" | "success" | "partial-success" | "invalid"

function readInviteVerification(): InviteVerification | null {
  if (typeof window === "undefined") return null
  const parameters = new URLSearchParams(window.location.search)
  const ticket = parameters.get("ticket")?.trim() ?? ""
  if (ticket.length < 80 || ticket.length > 2048 || ticket.split(".").length !== 2) return null
  return { ticket }
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
  "forgot-password": {
    title: "Back in control.\nWithout the wait.",
    body: "Request a private recovery link for the administrator-created account connected to your workspace.",
    footnote: "Recovery links expire and can only be used once",
  },
  "reset-password": {
    title: "A fresh key.\nThe same workspace.",
    body: "Choose a strong new password. Your bookings, customer promises, and workspace access stay exactly where they are.",
    footnote: "Security changes are confirmed by email",
  },
  "accept-invite": {
    title: "Your workspace.\nYour secure key.",
    body: "Create the password for your administrator-approved Multideck account. You’ll enter the workspace as soon as it is saved.",
    footnote: "Invite-only access for your team",
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

function focusAuthControl(id: string) {
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus()
  })
}

function getAuthErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String(error.code) : ""
}

function isInvalidCredentialsError(error: unknown) {
  const code = getAuthErrorCode(error)
  const message = error instanceof Error ? error.message.toLowerCase() : ""

  return code === "invalid_credentials" || message.includes("invalid login credentials")
}

function isInvalidRecoveryError(error: unknown) {
  const code = getAuthErrorCode(error).toLowerCase()
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  return code.includes("otp")
    || code.includes("token")
    || message.includes("expired")
    || message.includes("invalid")
    || message.includes("already been used")
}

function BrandLockup({ inverted = false, centered = false }: { inverted?: boolean; centered?: boolean }) {
  return (
    <div data-auth-brand className={cn("flex items-center gap-3", centered && "justify-center")}>
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
  const { t } = useLanguage()
  const copy = authCopyByStep[step]
  const muted = step === "signed-out"

  return (
    <aside
      className={cn(
        "relative flex min-h-[360px] overflow-hidden bg-[var(--md-accent-abyss)] text-white",
        componentPreview ? "min-h-[900px] lg:min-h-[900px]" : "lg:min-h-screen",
        className,
      )}
    >
      <img
        src={authPanelBackdrop}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover object-center"
      />
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
          <h1 className="whitespace-pre-line text-[24px] font-medium leading-[1.22] tracking-normal">{t(copy.title)}</h1>
          <p className="mt-4 max-w-[470px] text-[14px] leading-6 text-white/64">{t(copy.body)}</p>

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
                    booking.tone === "green" && "bg-[var(--md-accent-lift-warm)]",
                    booking.tone === "amber" && "bg-[var(--md-amber)]",
                    booking.tone === "teal" && "bg-[var(--md-accent-lift)]",
                  )}
                />
                <div className="flex min-w-0 items-center gap-[var(--md-page-stack-gap)]">
                  <strong className="shrink-0 font-medium text-white" data-i18n-skip>{booking.id}</strong>
                  <span className="hidden truncate text-white/52 sm:block" data-i18n-skip>{booking.route}</span>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[12px] font-medium",
                    booking.tone === "green" && "text-[var(--md-accent-lift-warm)]",
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
            <span className="size-2 rounded-full bg-[var(--md-accent-lift-warm)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--md-accent-lift-warm)_12%,transparent)]" />
            {t(copy.footnote)}
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

function AuthFieldError({ id, children }: { id: string; children?: string | null }) {
  if (!children) return null

  return (
    <p id={id} className="mt-2 flex items-start gap-1.5 text-[12px] leading-5 text-[var(--md-red)]">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
      <span>{children}</span>
    </p>
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
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  disabled?: boolean
  isSubmitting?: boolean
  submitLabel?: string
  error?: string | null
}) {
  return (
    <form
      noValidate
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
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "auth-email-error" : undefined}
        placeholder="john.doe@multideck.app"
        spellCheck={false}
        type="email"
        className="mt-3 h-[64px] rounded-[14px] border-0 bg-white px-5 text-[21px] text-[var(--md-ink)] shadow-[inset_0_0_0_1px_var(--md-accent-a42),0_0_0_4px_var(--md-accent-a16)] focus-visible:ring-0 disabled:bg-white/72"
      />
      <AuthFieldError id="auth-email-error">{error}</AuthFieldError>
      <Button type="submit" disabled={disabled || isSubmitting} className="mt-[var(--md-page-stack-gap)] h-[64px] w-full rounded-[14px] bg-[var(--md-accent)] text-[18px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]">
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
  onForgotPassword,
  disabled = false,
  isSubmitting = false,
  fieldErrors = {},
}: {
  email: string
  password: string
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  onForgotPassword?: () => void
  disabled?: boolean
  isSubmitting?: boolean
  fieldErrors?: AuthFieldErrors
}) {
  const emailError = fieldErrors.email ?? fieldErrors.credentials
  const passwordError = fieldErrors.password ?? fieldErrors.credentials
  const emailErrorId = fieldErrors.credentials ? "auth-credentials-error" : "auth-password-email-error"
  const passwordErrorId = fieldErrors.credentials ? "auth-credentials-error" : "auth-password-error"

  return (
    <form
      noValidate
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
        required
        aria-invalid={Boolean(emailError)}
        aria-describedby={emailError ? emailErrorId : undefined}
        placeholder="john.doe@multideck.app"
        spellCheck={false}
        type="email"
        className="mt-2 h-12 rounded-[var(--md-radius-xl)] border-0 bg-white px-4 text-[14px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] disabled:bg-white/72"
      />
      {fieldErrors.email ? <AuthFieldError id="auth-password-email-error">{fieldErrors.email}</AuthFieldError> : null}

      <div className="mt-4 flex items-center justify-between gap-4">
        <label className="text-[13px] font-medium text-[var(--md-ink)]" htmlFor="auth-password">
          Password
        </label>
        <button
          type="button"
          disabled={disabled || isSubmitting}
          className="text-[12px] font-medium text-[var(--md-accent)] disabled:opacity-50"
          onClick={onForgotPassword}
        >
          Forgot password?
        </button>
      </div>
      <Input
        id="auth-password"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        autoComplete="current-password"
        data-i18n-skip
        dir="ltr"
        disabled={disabled || isSubmitting}
        required
        aria-invalid={Boolean(passwordError)}
        aria-describedby={passwordError ? passwordErrorId : undefined}
        invalidFeedbackMotion={!fieldErrors.credentials}
        type="password"
        className="mt-2 h-12 rounded-[var(--md-radius-xl)] border-0 bg-white px-4 text-[14px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] disabled:bg-white/72"
      />
      {fieldErrors.password ? <AuthFieldError id="auth-password-error">{fieldErrors.password}</AuthFieldError> : null}
      {fieldErrors.credentials ? <AuthFieldError id="auth-credentials-error">{fieldErrors.credentials}</AuthFieldError> : null}

      <Button type="submit" disabled={disabled || isSubmitting} className="mt-5 h-12 w-full rounded-[var(--md-radius-xl)] bg-[var(--md-accent)] text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]">
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
      focusAuthControl("multideck-workspace")
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
                className="group grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3 text-start shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:bg-[var(--md-surface-tint)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a16)]"
                onClick={() => openWorkspace(entry.slug)}
              >
                <span className="grid size-10 place-items-center rounded-[calc(var(--md-radius-xl)-4px)] bg-[var(--md-accent)] text-[14px] font-medium text-[var(--md-accent-ink)]" aria-hidden="true" data-i18n-skip>
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
        noValidate
        className={hasAvailableWorkspaces ? undefined : "mt-7"}
        onSubmit={(event) => {
          event.preventDefault()
          openWorkspace()
        }}
      >
        <label htmlFor="multideck-workspace" className="text-[12px] font-medium text-[var(--md-text)]">
          Workspace
        </label>
        <div className="relative mt-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)] focus-within:shadow-[inset_0_0_0_1px_var(--md-accent-a48),0_0_0_4px_var(--md-accent-a12)]">
          <Input
            id="multideck-workspace"
            value={workspace}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="dev"
            required
            aria-invalid={Boolean(workspaceError)}
            aria-describedby={workspaceError ? "multideck-workspace-error" : undefined}
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

        <AuthFieldError id="multideck-workspace-error">{workspaceError}</AuthFieldError>

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
  onForgotPassword,
  disabled = false,
  isSubmitting = false,
  busyProvider = null,
  message,
  error,
  fieldErrors = {},
}: {
  email: string
  password?: string
  onEmailChange: (value: string) => void
  onPasswordChange?: (value: string) => void
  onPasswordSignIn?: () => void | Promise<void>
  onProviderSignIn?: (provider: AuthProviderId) => void | Promise<void>
  onForgotPassword?: () => void
  disabled?: boolean
  isSubmitting?: boolean
  busyProvider?: AuthProviderId | null
  message?: string | null
  error?: string | null
  fieldErrors?: AuthFieldErrors
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
        onForgotPassword={onForgotPassword}
        disabled={disabled || Boolean(busyProvider)}
        isSubmitting={isSubmitting}
        fieldErrors={fieldErrors}
      />

      <p className="mt-6 text-[12px] leading-5 text-[var(--md-text)]">
        Need access? Ask your workspace administrator. Multideck accounts are created for your team and cannot be opened from this screen.
      </p>
    </div>
  )
}

function ForgotPasswordPanel({
  email,
  onEmailChange,
  onSubmit,
  onBack,
  isSubmitting,
  message,
  error,
  fieldError,
}: {
  email: string
  onEmailChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  onBack: () => void
  isSubmitting: boolean
  message?: string | null
  error?: string | null
  fieldError?: string
}) {
  return (
    <div className="w-full max-w-[520px]">
      <BrandLockup />
      <div className="mt-10 grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
        <KeyRound className="size-5" strokeWidth={1.4} />
      </div>
      <h2 className="mt-5 text-[24px] font-medium leading-tight text-[var(--md-ink)]">Reset your password</h2>
      <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">
        Enter the work email for your existing Multideck account. We’ll send a secure recovery link.
      </p>

      <AuthAlert tone="error">{error}</AuthAlert>
      <AuthAlert tone="info">{message}</AuthAlert>

      <form
        noValidate
        className="mt-7"
        onSubmit={(event) => {
          event.preventDefault()
          void onSubmit()
        }}
      >
        <label className="text-[13px] font-medium text-[var(--md-ink)]" htmlFor="recovery-email">Work email</label>
        <Input
          id="recovery-email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          autoCapitalize="none"
          autoComplete="email"
          data-i18n-skip
          dir="ltr"
          disabled={isSubmitting}
          inputMode="email"
          required
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? "recovery-email-error" : undefined}
          placeholder="john.doe@multideck.app"
          spellCheck={false}
          type="email"
          className="mt-2 h-12 rounded-[var(--md-radius-xl)] border-0 bg-white px-4 text-[14px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
        />
        <AuthFieldError id="recovery-email-error">{fieldError}</AuthFieldError>
        <Button type="submit" disabled={isSubmitting} className="mt-5 h-12 w-full rounded-[var(--md-radius-xl)] bg-[var(--md-accent)] text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]">
          {isSubmitting ? <Loader2 data-icon="inline-start" className="me-2 size-4 animate-spin" strokeWidth={1.5} /> : null}
          {isSubmitting ? "Sending recovery link" : "Send recovery link"}
        </Button>
      </form>
      <button type="button" disabled={isSubmitting} className="mt-6 text-[13px] font-medium text-[var(--md-accent)] disabled:opacity-50" onClick={onBack}>
        Back to sign in
      </button>
    </div>
  )
}

function ResetPasswordPanel({
  password,
  confirmation,
  onPasswordChange,
  onConfirmationChange,
  onSubmit,
  isSubmitting,
  message,
  error,
  fieldErrors = {},
  inviteMode = false,
}: {
  password: string
  confirmation: string
  onPasswordChange: (value: string) => void
  onConfirmationChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  isSubmitting: boolean
  message?: string | null
  error?: string | null
  fieldErrors?: AuthFieldErrors
  inviteMode?: boolean
}) {
  const { t } = useLanguage()
  return (
    <div className="w-full max-w-[520px]">
      <BrandLockup />
      <div className="mt-10 grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
        <ShieldCheck className="size-5" strokeWidth={1.4} />
      </div>
      <h2 className="mt-5 text-[24px] font-medium leading-tight text-[var(--md-ink)]">{t(inviteMode ? "Set your password" : "Choose a new password")}</h2>
      <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">
        {t(inviteMode
          ? `${PASSWORD_POLICY_DESCRIPTION} You’ll be signed in to your Multideck workspace when it is ready.`
          : PASSWORD_POLICY_DESCRIPTION)}
      </p>

      <AuthAlert tone="error">{error ? t(error) : null}</AuthAlert>
      <AuthAlert tone="info">{message ? t(message) : null}</AuthAlert>

      <form
        noValidate
        className="mt-7"
        onSubmit={(event) => {
          event.preventDefault()
          void onSubmit()
        }}
      >
        <label className="text-[13px] font-medium text-[var(--md-ink)]" htmlFor="new-password">New password</label>
        <Input
          id="new-password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          autoComplete="new-password"
          data-i18n-skip
          dir="ltr"
          disabled={isSubmitting}
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          aria-invalid={Boolean(fieldErrors.newPassword)}
          aria-describedby={fieldErrors.newPassword ? "new-password-hint new-password-error" : "new-password-hint"}
          type="password"
          className="mt-2 h-12 rounded-[var(--md-radius-xl)] border-0 bg-white px-4 text-[14px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
        />
        <p id="new-password-hint" className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{t(PASSWORD_POLICY_DESCRIPTION)}</p>
        <AuthFieldError id="new-password-error">{fieldErrors.newPassword}</AuthFieldError>
        <label className="mt-4 block text-[13px] font-medium text-[var(--md-ink)]" htmlFor="confirm-password">Confirm new password</label>
        <Input
          id="confirm-password"
          value={confirmation}
          onChange={(event) => onConfirmationChange(event.target.value)}
          autoComplete="new-password"
          data-i18n-skip
          dir="ltr"
          disabled={isSubmitting}
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          aria-invalid={Boolean(fieldErrors.confirmation)}
          aria-describedby={fieldErrors.confirmation ? "confirm-password-error" : undefined}
          type="password"
          className="mt-2 h-12 rounded-[var(--md-radius-xl)] border-0 bg-white px-4 text-[14px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
        />
        <AuthFieldError id="confirm-password-error">{fieldErrors.confirmation}</AuthFieldError>
        <Button type="submit" disabled={isSubmitting} className="mt-5 h-12 w-full rounded-[var(--md-radius-xl)] bg-[var(--md-accent)] text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]">
          {isSubmitting ? <Loader2 data-icon="inline-start" className="me-2 size-4 animate-spin" strokeWidth={1.5} /> : null}
          {t(isSubmitting ? (inviteMode ? "Creating your password" : "Updating password") : (inviteMode ? "Create my password" : "Update password"))}
        </Button>
      </form>
    </div>
  )
}

function PasswordRecoveryCheckingPanel() {
  return (
    <div className="w-full max-w-[520px]" role="status" aria-live="polite">
      <BrandLockup />
      <div className="mt-10 grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
        <Loader2 className="size-5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-[24px] font-medium leading-tight text-[var(--md-ink)]">Checking your recovery link</h2>
      <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">We’re checking whether this browser has already confirmed the secure link.</p>
    </div>
  )
}

function PasswordRecoveryConfirmationPanel({ onContinue, onBack, isSubmitting, error }: {
  onContinue: () => void | Promise<void>
  onBack: () => void
  isSubmitting: boolean
  error?: string | null
}) {
  return (
    <div className="w-full max-w-[520px]">
      <BrandLockup />
      <div className="mt-10 grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
        <ShieldCheck className="size-5" strokeWidth={1.4} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-[24px] font-medium leading-tight text-[var(--md-ink)]">Continue securely</h2>
      <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">
        Confirm that you opened this link intentionally. Your one-time recovery link is not used until you continue.
      </p>
      <AuthAlert tone="error">{error}</AuthAlert>
      <Button
        type="button"
        autoFocus
        disabled={isSubmitting}
        className="mt-7 h-12 w-full rounded-[var(--md-radius-xl)] bg-[var(--md-accent)] text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]"
        onClick={() => void onContinue()}
      >
        {isSubmitting ? <Loader2 data-icon="inline-start" className="me-2 size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} /> : <ShieldCheck data-icon="inline-start" className="me-2 size-4" strokeWidth={1.5} />}
        {isSubmitting ? "Confirming recovery link" : error ? "Try again securely" : "Continue securely"}
      </Button>
      <button type="button" disabled={isSubmitting} className="mt-6 text-[13px] font-medium text-[var(--md-accent)] disabled:opacity-50" onClick={onBack}>
        Back to sign in
      </button>
    </div>
  )
}

function PasswordRecoveryUnavailablePanel({ onRequestNew, onBack }: { onRequestNew: () => void; onBack: () => void }) {
  return (
    <div className="w-full max-w-[520px]">
      <BrandLockup />
      <div className="mt-10 grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-red-a08)] text-[var(--md-red)]">
        <TriangleAlert className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-[24px] font-medium leading-tight text-[var(--md-ink)]">Recovery link unavailable</h2>
      <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">
        This recovery link is invalid, expired, or has already been used. Request a new link to continue safely.
      </p>
      <Button type="button" autoFocus className="mt-7 h-12 w-full rounded-[var(--md-radius-xl)] bg-[var(--md-accent)] text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]" onClick={onRequestNew}>
        Request a new link
      </Button>
      <button type="button" className="mt-6 text-[13px] font-medium text-[var(--md-accent)]" onClick={onBack}>Back to sign in</button>
    </div>
  )
}

function PasswordRecoverySuccessPanel({ partial, onContinue }: { partial: boolean; onContinue: () => void }) {
  return (
    <div className="w-full max-w-[520px]" role="status" aria-live="polite">
      <BrandLockup />
      <div className="mt-10 grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
        {partial ? <TriangleAlert className="size-5" strokeWidth={1.5} aria-hidden="true" /> : <ShieldCheck className="size-5" strokeWidth={1.4} aria-hidden="true" />}
      </div>
      <h2 className="mt-5 text-[24px] font-medium leading-tight text-[var(--md-ink)]">Password changed</h2>
      <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">
        {partial
          ? "Your new password is ready, but Multideck could not confirm that every other session was signed out. Do not reset it again. Review your sessions in Login & security."
          : "Your new password is ready. Other active sessions have been signed out and this browser remains securely signed in."}
      </p>
      <Button type="button" autoFocus className="mt-7 h-12 w-full rounded-[var(--md-radius-xl)] bg-[var(--md-accent)] text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]" onClick={onContinue}>
        Continue to Login &amp; security
      </Button>
    </div>
  )
}

function InviteLinkUnavailablePanel() {
  const { t } = useLanguage()
  return (
    <div className="w-full max-w-[520px]">
      <BrandLockup />
      <div className="mt-10 grid size-11 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
        <ShieldCheck className="size-5" strokeWidth={1.4} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-[24px] font-medium leading-tight text-[var(--md-ink)]">{t("Invitation link unavailable")}</h2>
      <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">
        {t("Ask your workspace administrator to resend the invitation. New links stay valid for seven days and are not used up by email security checks.")}
      </p>
    </div>
  )
}

function CodeInput({
  code,
  onCodeChange,
  onComplete,
  disabled = false,
  error,
}: {
  code: string
  onCodeChange: (value: string) => void
  onComplete: (code: string) => void | Promise<void>
  disabled?: boolean
  error?: string
}) {
  return (
    <div className="mt-[var(--md-page-section-gap)]">
      <VerificationCodeInput
        value={code}
        onChange={onCodeChange}
        onComplete={onComplete}
        disabled={disabled}
        invalid={Boolean(error)}
        size="lg"
        firstBoxId="auth-code-1"
        describedBy={error ? "auth-code-error" : undefined}
        className="gap-[var(--md-gap-lg)]"
        boxClassName="bg-white hover:bg-white focus:bg-white focus-visible:bg-white disabled:bg-white/72"
      />
      <AuthFieldError id="auth-code-error">{error}</AuthFieldError>
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
  fieldError,
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
  fieldError?: string
}) {
  return (
    <div className="w-full max-w-[600px]">
      <div className="grid size-[64px] place-items-center rounded-[16px] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
        <Mail className="size-7" strokeWidth={1.4} />
      </div>

      <h2 className="mt-[var(--md-page-section-gap)] text-[36px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Check your inbox</h2>
      <p className="mt-4 text-[18px] leading-7 text-[var(--md-text)]">
        We sent a code to <span className="font-medium text-[var(--md-ink)]" dir="ltr" data-i18n-skip>{email}</span>
      </p>

      <CodeInput code={code} onCodeChange={onCodeChange} onComplete={onComplete} disabled={disabled || isSubmitting} error={fieldError} />

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

      <Button type="button" className="mt-[var(--md-page-section-gap)] h-[64px] w-full rounded-[14px] bg-[var(--md-accent)] text-[18px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]" onClick={onSignBackIn}>
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
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const [code, setCode] = useState(galleryMode ? "742" : "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [busyProvider, setBusyProvider] = useState<AuthProviderId | null>(null)
  const [message, setMessage] = useState<string | null>(!galleryMode && !isSupabaseConfigured ? supabaseConfigurationError : null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({})
  const [inviteVerification] = useState<InviteVerification | null>(() => galleryMode ? null : readInviteVerification())
  const [recoveryView, setRecoveryView] = useState<RecoveryView>(() => galleryMode ? "form" : "checking")
  const inviteLinkAvailable = galleryMode || initialStep !== "accept-invite" || Boolean(inviteVerification)

  useEffect(() => {
    if (galleryMode || initialStep !== "reset-password") return
    let cancelled = false

    if (initialPasswordRecoveryLink.kind === "invalid") {
      clearVerifiedPasswordRecovery()
      setRecoveryView("invalid")
      return
    }
    if (initialPasswordRecoveryLink.kind !== "missing") {
      setRecoveryView("confirmation")
      return
    }

    void getSupabaseSession()
      .then((session) => {
        if (!cancelled) setRecoveryView(hasVerifiedPasswordRecovery(session) ? "form" : "invalid")
      })
      .catch((sessionError) => {
        console.error(sessionError)
        clearVerifiedPasswordRecovery()
        if (!cancelled) setRecoveryView("invalid")
      })

    return () => {
      cancelled = true
    }
  }, [galleryMode, initialStep])

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
    setFieldErrors({})
  }

  function clearFieldFeedback(...fields: (keyof AuthFieldErrors)[]) {
    setFieldErrors((current) => {
      if (!fields.some((field) => current[field])) return current

      const next = { ...current }
      fields.forEach((field) => delete next[field])
      return next
    })
    setError(null)
  }

  function showFieldError(field: keyof AuthFieldErrors, detail: string, controlId: string) {
    setError(null)
    setMessage(null)
    setFieldErrors({ [field]: detail })
    focusAuthControl(controlId)
  }

  async function continuePasswordRecovery() {
    clearFeedback()
    setIsSubmitting(true)
    try {
      await verifyPasswordRecoveryLink(initialPasswordRecoveryLink)
      setRecoveryView("form")
      setMessage("Recovery link confirmed. Choose your new password.")
      focusAuthControl("new-password")
    } catch (verificationError) {
      if (isInvalidRecoveryError(verificationError)) {
        clearVerifiedPasswordRecovery()
        setRecoveryView("invalid")
      } else {
        console.error(verificationError)
        setError("We couldn’t confirm the recovery link. Check your connection and try again.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  function requestNewRecoveryLink() {
    clearVerifiedPasswordRecovery()
    clearFeedback()
    setStep("forgot-password")
    focusAuthControl("recovery-email")
  }

  function continueToSecurity() {
    const destination = "/settings?tab=security"
    if (navigate) navigate(destination)
    else window.location.assign(destination)
  }

  async function sendMagicLink() {
    clearFeedback()
    const normalizedEmail = email.trim().toLowerCase()

    if (!isValidEmail(normalizedEmail)) {
      setStep("signin")
      showFieldError("email", "Enter a valid work email.", "auth-password-email")
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
      setError("Unable to send the sign-in email. Check the address or workspace access.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function signInWithPassword() {
    clearFeedback()
    const normalizedEmail = email.trim().toLowerCase()

    if (!isValidEmail(normalizedEmail)) {
      showFieldError("email", "Enter a valid work email.", "auth-password-email")
      return
    }

    if (!password.trim()) {
      showFieldError("password", "Enter your password to continue.", "auth-password")
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
      if (isInvalidCredentialsError(passwordError)) {
        showFieldError(
          "credentials",
          "Email or password is incorrect. Check both and try again.",
          "auth-password-email",
        )
      } else {
        setError("Unable to sign you in right now. Check your connection and try again.")
      }
      setIsSubmitting(false)
    }
  }

  async function sendPasswordRecovery() {
    clearFeedback()
    const normalizedEmail = email.trim().toLowerCase()

    if (!isValidEmail(normalizedEmail)) {
      showFieldError("email", "Enter a valid work email.", "recovery-email")
      return
    }
    if (!supabase) {
      setError(supabaseConfigurationError ?? "Supabase is not configured for this workspace.")
      return
    }

    setIsSubmitting(true)
    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth?mode=reset-password`,
      })
      if (recoveryError) throw recoveryError

      setEmail(normalizedEmail)
      setMessage("If this address belongs to an approved Multideck account, a recovery link is on its way.")
      toast.success("Check your inbox", { description: "The recovery link expires and can only be used once." })
    } catch (recoveryError) {
      console.error(recoveryError)
      setError("Unable to send a recovery email. Check the address and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function updatePassword() {
    clearFeedback()

    const passwordPolicyError = getPasswordPolicyError(password)
    if (passwordPolicyError) {
      showFieldError("newPassword", passwordPolicyError, "new-password")
      return
    }
    if (password !== passwordConfirmation) {
      showFieldError("confirmation", "The two passwords do not match.", "confirm-password")
      return
    }
    if (!supabase) {
      setError(supabaseConfigurationError ?? "Supabase is not configured for this workspace.")
      return
    }

    setIsSubmitting(true)
    try {
      if (step === "accept-invite") {
        if (!inviteVerification) throw new Error("The invitation link does not contain a valid ticket.")

        const { data: acceptedInvitation, error: acceptError } = await supabase.functions.invoke<{ email?: string }>("accept-invitation", {
          body: { ticket: inviteVerification.ticket, password },
        })
        if (acceptError || !acceptedInvitation?.email) throw acceptError ?? new Error("The invitation could not be completed.")

        const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
          email: acceptedInvitation.email,
          password,
        })
        if (signInError || !signedIn.session) {
          console.error(signInError)
          setError("Your password was created, but Multideck could not sign you in automatically. Return to sign in and use your new password.")
          setIsSubmitting(false)
          return
        }

        const parameters = new URLSearchParams(window.location.search)
        parameters.delete("ticket")
        const query = parameters.toString()
        window.history.replaceState({}, document.title, `${window.location.pathname}${query ? `?${query}` : ""}`)
        toast.success("Password created", { description: "Welcome to your Multideck workspace." })
        goToApp()
        return
      }

      const passwordSession = await getSupabaseSession()
      if (!hasVerifiedPasswordRecovery(passwordSession)) {
        clearVerifiedPasswordRecovery()
        setRecoveryView("invalid")
        setIsSubmitting(false)
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      clearVerifiedPasswordRecovery()
      const { error: revokeError } = await supabase.auth.signOut({ scope: "others" })
      setPassword("")
      setPasswordConfirmation("")
      if (revokeError) {
        console.error(revokeError)
        setRecoveryView("partial-success")
        toast.warning("Password changed", { description: "Review your other sessions in Login & security." })
      } else {
        setRecoveryView("success")
        toast.success("Password changed", { description: "Other active sessions have been signed out." })
      }
      setIsSubmitting(false)
    } catch (updateError) {
      console.error(updateError)
      setError(step === "accept-invite"
        ? "This invitation link is invalid, expired, or already completed. Ask your workspace administrator to resend it."
        : "Unable to update your password. Your recovery session is still available, so you can try again.")
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
      const providerCode = getAuthErrorCode(providerError)
      setError(
        providerCode === "passkey_disabled"
          ? "Passkey sign-in is not enabled for this workspace yet."
          : providerCode === "webauthn_credential_not_found"
            ? "No Multideck passkey was found on this device. Connect one from Login & security after signing in."
            : "Unable to start that sign-in method. Check that it is connected to your account.",
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
      showFieldError("email", "Enter a valid work email.", "auth-password-email")
      return
    }

    if (normalizedCode.length !== 6) {
      showFieldError("code", "Enter the six-digit code from your email.", "auth-code-1")
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
      showFieldError("code", "That code was not accepted. Request a new code or try again.", "auth-code-1")
      setIsSubmitting(false)
    }
  }

  function goToSignIn(resetEmail = false) {
    if (step === "reset-password") clearVerifiedPasswordRecovery()
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
          onEmailChange={(value) => {
            setEmail(value)
            clearFieldFeedback("email", "credentials")
          }}
          onPasswordChange={(value) => {
            setPassword(value)
            clearFieldFeedback("password", "credentials")
          }}
          onPasswordSignIn={signInWithPassword}
          onForgotPassword={() => {
            clearFeedback()
            setStep("forgot-password")
          }}
          onProviderSignIn={signInWithProvider}
          isSubmitting={isSubmitting}
          busyProvider={busyProvider}
          message={message}
          error={error}
          fieldErrors={fieldErrors}
        />
      ) : null}
      {step === "verify" ? (
        <VerifyPanel
          email={email || "john.doe@multideck.app"}
          code={code}
          onCodeChange={(value) => {
            setCode(value)
            clearFieldFeedback("code")
          }}
          onBack={() => goToSignIn(false)}
          onComplete={verifyCode}
          onResend={sendMagicLink}
          isSubmitting={isSubmitting}
          message={message}
          error={error}
          fieldError={fieldErrors.code}
        />
      ) : null}
      {step === "forgot-password" ? (
        <ForgotPasswordPanel
          email={email}
          onEmailChange={(value) => {
            setEmail(value)
            clearFieldFeedback("email")
          }}
          onSubmit={sendPasswordRecovery}
          onBack={() => goToSignIn(false)}
          isSubmitting={isSubmitting}
          message={message}
          error={error}
          fieldError={fieldErrors.email}
        />
      ) : null}
      {step === "accept-invite" && !inviteLinkAvailable ? <InviteLinkUnavailablePanel /> : null}
      {step === "reset-password" && recoveryView === "checking" ? <PasswordRecoveryCheckingPanel /> : null}
      {step === "reset-password" && recoveryView === "confirmation" ? (
        <PasswordRecoveryConfirmationPanel
          onContinue={continuePasswordRecovery}
          onBack={() => goToSignIn(false)}
          isSubmitting={isSubmitting}
          error={error}
        />
      ) : null}
      {step === "reset-password" && recoveryView === "invalid" ? (
        <PasswordRecoveryUnavailablePanel onRequestNew={requestNewRecoveryLink} onBack={() => goToSignIn(false)} />
      ) : null}
      {step === "reset-password" && (recoveryView === "success" || recoveryView === "partial-success") ? (
        <PasswordRecoverySuccessPanel partial={recoveryView === "partial-success"} onContinue={continueToSecurity} />
      ) : null}
      {((step === "reset-password" && recoveryView === "form") || step === "accept-invite") && inviteLinkAvailable ? (
        <ResetPasswordPanel
          password={password}
          confirmation={passwordConfirmation}
          onPasswordChange={(value) => {
            setPassword(value)
            clearFieldFeedback("newPassword")
          }}
          onConfirmationChange={(value) => {
            setPasswordConfirmation(value)
            clearFieldFeedback("confirmation")
          }}
          onSubmit={updatePassword}
          isSubmitting={isSubmitting}
          message={message}
          error={error}
          fieldErrors={fieldErrors}
          inviteMode={step === "accept-invite"}
        />
      ) : null}
      {step === "signed-out" ? <SignedOutPanel onSignBackIn={() => goToSignIn(false)} onSwitchAccount={() => goToSignIn(true)} /> : null}
    </>
  )

  if (galleryMode) {
    return (
      <div className="md-auth-light grid min-h-[720px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] lg:grid-cols-[44%_56%]">
        <FreightNarrative step={step} className="min-h-[720px]" />
        <main className="grid min-h-[720px] place-items-center px-[clamp(var(--md-gap-xl),5vw,88px)] py-[calc(var(--md-page-section-gap)*2)]">
          {authPanel}
        </main>
      </div>
    )
  }

  return (
    <div className="md-auth-light min-h-screen bg-[var(--md-bg)] text-[var(--md-ink)]">
      <div className="grid min-h-screen lg:grid-cols-[44%_56%]">
        <FreightNarrative step={step} className="order-2 lg:order-1" />
        <main className="order-1 grid min-h-[720px] place-items-center px-[clamp(var(--md-gap-xl),5vw,88px)] py-[calc(var(--md-page-section-gap)*2)] lg:order-2 lg:min-h-screen">
          <div className="w-full max-w-[520px]">
            {authPanel}
          </div>
        </main>
      </div>
    </div>
  )
}

export { AuthField, BrandLockup, CodeInput, FreightNarrative, SignedOutPanel, SignInPanel, VerifyPanel }
