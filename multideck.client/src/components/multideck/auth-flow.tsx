import { useCallback, useState } from "react"
import { ArrowRight, Clock3, Loader2, LockKeyhole, Mail, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { takeAuthReturnPath } from "@/lib/auth-routing"
import { cn } from "@/lib/utils"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"
import multideckLogoMark from "@/assets/brand/multideck-logo-mark.svg"

export type AuthFlowStep = "signin" | "verify" | "signed-out"
type AuthProvider = "google" | "microsoft" | "sso"
type AuthSignInMethod = "magic-link" | "password" | null

type AuthCopy = {
  title: string
  body: string
  footnote: string
}

const authCopyByStep: Record<AuthFlowStep, AuthCopy> = {
  signin: {
    title: "Every booking,\nin formation.",
    body: "Your whole book of freight - tracked, triaged, and explained - the moment you sign in.",
    footnote: "",
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

function getEmailDomain(email: string) {
  const [, domain] = email.trim().toLowerCase().split("@")
  return domain?.includes(".") ? domain : ""
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
        "relative flex min-h-[720px] overflow-hidden bg-[#062420] text-white",
        componentPreview ? "min-h-[900px] lg:min-h-[900px]" : "lg:min-h-screen",
        className,
      )}
    >
      <div className="absolute -right-[140px] top-[-10px] h-[156px] w-[720px] rounded-b-[38px] bg-white/[0.055]" />
      <div className="absolute right-[-220px] top-[185px] h-[146px] w-[650px] rounded-l-[34px] bg-white/[0.06]" />
      <div className="absolute right-[-155px] top-[360px] h-[162px] w-[560px] rounded-l-[34px] bg-white/[0.065]" />

      <div
        className={cn(
          "relative z-10 flex min-h-[720px] w-full flex-col px-[clamp(28px,5vw,86px)] py-[clamp(28px,5vw,82px)]",
          componentPreview ? "min-h-[900px] lg:min-h-[900px]" : "lg:min-h-screen",
        )}
      >
        <BrandLockup inverted />

        <div className="mt-auto max-w-[570px] pb-[var(--md-page-bottom-pad)] pt-20 lg:pt-0">
          <h1 className="whitespace-pre-line text-[clamp(38px,4.2vw,66px)] font-medium leading-[1.08] tracking-normal">{copy.title}</h1>
          <p className="mt-[var(--md-page-section-gap)] max-w-[540px] text-[22px] leading-[1.55] text-white/58">{copy.body}</p>

          <div className="mt-[clamp(48px,6.2vw,86px)] flex max-w-[690px] flex-col gap-4">
            {authBookings.map((booking, index) => (
              <div
                key={booking.id}
                className={cn(
                  "grid h-[84px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-[20px] px-5 text-[16px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_22px_44px_rgba(0,0,0,0.12)] transition-[background,color,box-shadow,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-[92px] sm:w-[86%] sm:gap-5 sm:px-8 sm:text-[18px]",
                  index === 0 && "bg-white/[0.055]",
                  index === 1 && "bg-white/[0.09] sm:ms-[44px]",
                  index === 2 && "bg-[var(--md-accent)] sm:ms-[88px]",
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
                    "shrink-0 text-[14px] font-medium sm:text-[16px]",
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
          <p className={cn("mt-auto flex items-center gap-4 text-[18px] text-white/50", muted && "text-white/55")}>
            <span className="size-2.5 rounded-full bg-[#79d9a7]" />
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
        {!isSubmitting ? <ArrowRight data-icon="inline-end" className="ms-2 size-5 rtl:-scale-x-100" strokeWidth={1.4} /> : null}
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
      className="mt-[var(--md-page-section-gap)]"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      <label className="text-[16px] font-medium text-[var(--md-ink)]" htmlFor="auth-password-email">
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
        className="mt-3 h-[64px] rounded-[14px] border-0 bg-white px-5 text-[21px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-0 disabled:bg-white/72"
      />

      <label className="mt-[var(--md-page-stack-gap)] block text-[16px] font-medium text-[var(--md-ink)]" htmlFor="auth-password">
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
        className="mt-3 h-[64px] rounded-[14px] border-0 bg-white px-5 text-[21px] text-[var(--md-ink)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.42),0_0_0_4px_rgba(14,125,116,0.16)] focus-visible:ring-0 disabled:bg-white/72"
      />

      <Button type="submit" disabled={disabled || isSubmitting} className="mt-[var(--md-page-stack-gap)] h-[64px] w-full rounded-[14px] bg-[var(--md-accent)] text-[18px] font-medium text-white hover:bg-[#0b6f67]">
        {isSubmitting ? <Loader2 data-icon="inline-start" className="me-2 size-5 animate-spin" strokeWidth={1.5} /> : null}
        {isSubmitting ? "Signing in" : "Sign in with password"}
        {!isSubmitting ? <ArrowRight data-icon="inline-end" className="ms-2 size-5 rtl:-scale-x-100" strokeWidth={1.4} /> : null}
      </Button>
    </form>
  )
}

function ProviderButton({
  label,
  icon,
  disabled = false,
  onClick,
}: {
  label: string
  icon: "google" | "microsoft" | "sso"
  disabled?: boolean
  onClick?: () => void | Promise<void>
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      className="h-[60px] rounded-[13px] bg-white px-[var(--md-gap-xl)] text-[18px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/82"
      onClick={() => void onClick?.()}
    >
      {icon === "google" ? <span className="text-[22px] font-medium text-[#4285f4]" data-i18n-skip>G</span> : null}
      {icon === "microsoft" ? (
        <span className="grid size-5 grid-cols-2 gap-0.5" aria-hidden="true">
          <span className="bg-[#f25022]" />
          <span className="bg-[#7fba00]" />
          <span className="bg-[#00a4ef]" />
          <span className="bg-[#ffb900]" />
        </span>
      ) : null}
      {icon === "sso" ? <LockKeyhole data-icon="inline-start" className="size-5" strokeWidth={1.6} /> : null}
      {label}
    </Button>
  )
}

function SignInPanel({
  email,
  password = "",
  signInMethod = null,
  onEmailChange,
  onPasswordChange = () => undefined,
  onContinue,
  onPasswordSignIn = () => undefined,
  onProviderSignIn,
  onSignInMethodChange = () => undefined,
  disabled = false,
  isSubmitting = false,
  message,
  error,
  workspaceName = "Northwind Forwarding",
}: {
  email: string
  password?: string
  signInMethod?: AuthSignInMethod
  onEmailChange: (value: string) => void
  onPasswordChange?: (value: string) => void
  onContinue: () => void | Promise<void>
  onPasswordSignIn?: () => void | Promise<void>
  onProviderSignIn?: (provider: AuthProvider) => void | Promise<void>
  onSignInMethodChange?: (method: Exclude<AuthSignInMethod, null>) => void
  disabled?: boolean
  isSubmitting?: boolean
  message?: string | null
  error?: string | null
  workspaceName?: string
}) {
  return (
    <div className="w-full max-w-[540px]">
      <h2 className="text-[36px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Welcome back</h2>
      <p className="mt-4 text-[18px] leading-7 text-[var(--md-text)]">
        <span>Sign in to your workspace.</span> <span className="font-medium text-[var(--md-ink)]" data-i18n-skip>{workspaceName}</span>
      </p>

      <div className="mt-[var(--md-page-section-gap)] grid grid-cols-2 rounded-[14px] bg-white/52 p-1 shadow-[var(--md-shadow-line)]">
        <button
          type="button"
          aria-pressed={signInMethod === "magic-link"}
          className={cn(
            "h-11 rounded-[10px] text-[15px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity] disabled:opacity-55",
            signInMethod === "magic-link" && "bg-white text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          )}
          disabled={disabled || isSubmitting}
          onClick={() => onSignInMethodChange("magic-link")}
        >
          Email link
        </button>
        <button
          type="button"
          aria-pressed={signInMethod === "password"}
          className={cn(
            "h-11 rounded-[10px] text-[15px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity] disabled:opacity-55",
            signInMethod === "password" && "bg-white text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          )}
          disabled={disabled || isSubmitting}
          onClick={() => onSignInMethodChange("password")}
        >
          Password
        </button>
      </div>

      {signInMethod === "magic-link" ? (
        <AuthField
          label="Work email"
          value={email}
          onChange={onEmailChange}
          onSubmit={onContinue}
          disabled={disabled}
          isSubmitting={isSubmitting}
          submitLabel={isSubmitting ? "Sending email link" : "Send email link"}
        />
      ) : signInMethod === "password" ? (
        <PasswordSignInForm
          email={email}
          password={password}
          onEmailChange={onEmailChange}
          onPasswordChange={onPasswordChange}
          onSubmit={onPasswordSignIn}
          disabled={disabled}
          isSubmitting={isSubmitting}
        />
      ) : (
        <p className="mt-[var(--md-page-section-gap)] text-center text-[16px] leading-6 text-[var(--md-text)]">
          Choose how you want to sign in. Nothing is sent until you confirm.
        </p>
      )}

      <AuthAlert tone="error">{error}</AuthAlert>
      <AuthAlert tone="info">{message}</AuthAlert>

      {signInMethod === "magic-link" ? (
        <p className="mt-[var(--md-gap-xl)] px-[var(--md-page-stack-gap)] text-center text-[16px] leading-6 text-[var(--md-text)]">
          We'll email you a one-time link. No password to remember.
        </p>
      ) : null}

      <div className="my-[var(--md-page-section-gap)] grid grid-cols-[1fr_auto_1fr] items-center gap-[var(--md-page-stack-gap)] text-[15px] text-[var(--md-subtle)]">
        <span className="h-px bg-[rgba(11,20,19,0.08)]" />
        or
        <span className="h-px bg-[rgba(11,20,19,0.08)]" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ProviderButton label="Google" icon="google" disabled={disabled || isSubmitting} onClick={() => onProviderSignIn?.("google")} />
        <ProviderButton label="Microsoft" icon="microsoft" disabled={disabled || isSubmitting} onClick={() => onProviderSignIn?.("microsoft")} />
        <ProviderButton label="SSO" icon="sso" disabled={disabled || isSubmitting} onClick={() => onProviderSignIn?.("sso")} />
      </div>

      <p className="mt-[var(--md-page-section-gap)] text-[17px] leading-7 text-[var(--md-text)]">
        New to Multideck? <button type="button" className="font-medium text-[var(--md-accent)]">Talk to our team</button> - workspaces are set up with you, not by a form.
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
  const [signInMethod, setSignInMethod] = useState<AuthSignInMethod>(null)
  const [code, setCode] = useState(galleryMode ? "742" : "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(!galleryMode && !isSupabaseConfigured ? "Supabase credentials are needed before operators can sign in." : null)
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

  function chooseSignInMethod(method: Exclude<AuthSignInMethod, null>) {
    clearFeedback()
    setSignInMethod(method)
  }

  async function sendMagicLink() {
    clearFeedback()
    const normalizedEmail = email.trim().toLowerCase()

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter your work email to continue.")
      return
    }

    if (!supabase) {
      setError("Supabase credentials are missing. Add them to the client environment first.")
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
      setError("Supabase credentials are missing. Add them to the client environment first.")
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

  async function signInWithProvider(provider: AuthProvider) {
    clearFeedback()

    if (!supabase) {
      setError("Supabase credentials are missing. Add them to the client environment first.")
      return
    }

    setIsSubmitting(true)

    try {
      if (provider === "sso") {
        const domain = getEmailDomain(email)

        if (!domain) {
          setError("Enter your work email first so we can find your SSO domain.")
          setIsSubmitting(false)
          return
        }

        const { error: ssoError } = await supabase.auth.signInWithSSO({
          domain,
          options: { redirectTo: getAuthRedirectUrl() },
        })

        if (ssoError) throw ssoError
        return
      }

      const oauthProvider = provider === "microsoft" ? "azure" : "google"
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: oauthProvider,
        options: { redirectTo: getAuthRedirectUrl() },
      })

      if (oauthError) throw oauthError
    } catch (providerError) {
      console.error(providerError)
      setError("We could not start that sign-in method. Check the provider setup in Supabase.")
      setIsSubmitting(false)
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
      setError("Supabase credentials are missing. Add them to the client environment first.")
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
      setSignInMethod(null)
    }
    if (!galleryMode && !isSupabaseConfigured) setMessage("Supabase credentials are needed before operators can sign in.")
  }

  const authPanel = (
    <>
      {step === "signin" ? (
        <SignInPanel
          email={email}
          password={password}
          signInMethod={signInMethod}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSignInMethodChange={chooseSignInMethod}
          onContinue={sendMagicLink}
          onPasswordSignIn={signInWithPassword}
          onProviderSignIn={signInWithProvider}
          isSubmitting={isSubmitting}
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
      <div className="grid min-h-[720px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] lg:grid-cols-[43.4%_56.6%]">
        <FreightNarrative step={step} className="min-h-[720px]" />
        <main className="grid min-h-[720px] place-items-center px-[clamp(var(--md-gap-xl),6vw,120px)] py-[calc(var(--md-page-section-gap)*2)]">
          {authPanel}
        </main>
      </div>
    )
  }

  return (
    <div className="grid min-h-screen bg-[var(--md-bg)] text-[var(--md-ink)] lg:grid-cols-[43.4%_56.6%]">
      <FreightNarrative step={step} />
      <main className="grid min-h-[720px] place-items-center px-[clamp(var(--md-gap-xl),6vw,120px)] py-[calc(var(--md-page-section-gap)*2)] lg:min-h-screen">
        <div className="min-h-[680px] w-full max-w-[600px]">
          {authPanel}
        </div>
      </main>
    </div>
  )
}

export { AuthField, BrandLockup, CodeInput, FreightNarrative, SignedOutPanel, SignInPanel, VerifyPanel }
