import { useState } from "react"
import { ArrowRight, Clock3, LockKeyhole, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import multideckLogoMark from "@/assets/brand/multideck-logo-mark.svg"

export type AuthFlowStep = "signin" | "verify" | "signed-out"

type AuthCopy = {
  title: string
  body: string
  footnote: string
}

const authCopyByStep: Record<AuthFlowStep, AuthCopy> = {
  signin: {
    title: "Every shipment,\nin formation.",
    body: "Your whole book of freight - tracked, triaged, and explained - the moment you sign in.",
    footnote: "248 shipments moving right now - 3 waiting on you",
  },
  verify: {
    title: "One link.\nNo passwords.",
    body: "We sent a six-digit code and a sign-in link to your inbox. Either one gets you in.",
    footnote: "Codes expire after 10 minutes",
  },
  "signed-out": {
    title: "Lights off.\nDexter keeps watch.",
    body: "Exceptions, ETA changes, and new documents are monitored overnight. Anything urgent will be waiting at the top of your morning digest.",
    footnote: "Monitoring 248 shipments while you're away",
  },
}

const authShipments = [
  { id: "MD-22481", route: "Yantian -> Felixstowe", status: "On track", tone: "green" },
  { id: "MD-22479", route: "Ningbo -> Rotterdam", status: "Delayed 2d", tone: "amber" },
  { id: "MD-22466", route: "Frankfurt -> JFK", status: "Arriving today", tone: "teal" },
]

const signedOutStats = [
  ["12", "shipments you touched today"],
  ["3", "exceptions cleared"],
  ["6", "customer updates Dexter sent for you"],
]

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
            {authShipments.map((shipment, index) => (
              <div
                key={shipment.id}
                className={cn(
                  "grid h-[84px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-[20px] px-5 text-[16px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_22px_44px_rgba(0,0,0,0.12)] transition-[background,color,box-shadow,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-[92px] sm:w-[86%] sm:gap-5 sm:px-8 sm:text-[18px]",
                  index === 0 && "bg-white/[0.055]",
                  index === 1 && "bg-white/[0.09] sm:ml-[44px]",
                  index === 2 && "bg-[var(--md-accent)] sm:ml-[88px]",
                  muted && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    shipment.tone === "green" && "bg-[#7bdcae]",
                    shipment.tone === "amber" && "bg-[var(--md-amber)]",
                    shipment.tone === "teal" && "bg-[#8ed2cb]",
                  )}
                />
                <div className="flex min-w-0 items-center gap-[var(--md-page-stack-gap)]">
                  <strong className="shrink-0 font-medium text-white">{shipment.id}</strong>
                  <span className="hidden truncate text-white/52 sm:block">{shipment.route}</span>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[14px] font-medium sm:text-[16px]",
                    shipment.tone === "green" && "text-[#80caa3]",
                    shipment.tone === "amber" && "text-[var(--md-amber)]",
                    shipment.tone === "teal" && "text-white",
                  )}
                >
                  {shipment.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className={cn("mt-auto flex items-center gap-4 text-[18px] text-white/50", muted && "text-white/55")}>
          <span className="size-2.5 rounded-full bg-[#79d9a7]" />
          {copy.footnote}
        </p>
      </div>
    </aside>
  )
}

function AuthField({
  label,
  value,
  onChange,
  onSubmit,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <form
      className="mt-[var(--md-page-section-gap)]"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <label className="text-[16px] font-medium text-[var(--md-ink)]" htmlFor="auth-email">
        {label}
      </label>
      <Input
        id="auth-email"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 h-[64px] rounded-[14px] border-0 bg-white px-5 text-[21px] text-[var(--md-ink)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.42),0_0_0_4px_rgba(14,125,116,0.16)] focus-visible:ring-0"
      />
      <Button type="submit" className="mt-[var(--md-page-stack-gap)] h-[64px] w-full rounded-[14px] bg-[var(--md-accent)] text-[18px] font-medium text-white hover:bg-[#0b6f67]">
        Continue
        <ArrowRight data-icon="inline-end" className="ml-2 size-5" strokeWidth={1.4} />
      </Button>
    </form>
  )
}

function ProviderButton({ label, icon, onClick }: { label: string; icon: "google" | "microsoft" | "sso"; onClick?: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-[60px] rounded-[13px] bg-white px-[var(--md-gap-xl)] text-[18px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/82"
      onClick={onClick}
    >
      {icon === "google" ? <span className="text-[22px] font-medium text-[#4285f4]">G</span> : null}
      {icon === "microsoft" ? (
        <span className="grid size-5 grid-cols-2 gap-0.5">
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
  onEmailChange,
  onContinue,
}: {
  email: string
  onEmailChange: (value: string) => void
  onContinue: () => void
}) {
  return (
    <div className="w-full max-w-[540px]">
      <h2 className="text-[36px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Welcome back</h2>
      <p className="mt-4 text-[18px] leading-7 text-[var(--md-text)]">
        Sign in to <span className="font-medium text-[var(--md-ink)]">Northwind Forwarding</span>'s workspace.
      </p>

      <AuthField label="Work email" value={email} onChange={onEmailChange} onSubmit={onContinue} />

      <p className="mt-[var(--md-gap-xl)] px-[var(--md-page-stack-gap)] text-center text-[16px] leading-6 text-[var(--md-text)]">We'll email you a one-time link. No password to remember.</p>

      <div className="my-[var(--md-page-section-gap)] grid grid-cols-[1fr_auto_1fr] items-center gap-[var(--md-page-stack-gap)] text-[15px] text-[var(--md-subtle)]">
        <span className="h-px bg-[rgba(11,20,19,0.08)]" />
        or
        <span className="h-px bg-[rgba(11,20,19,0.08)]" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ProviderButton label="Google" icon="google" onClick={onContinue} />
        <ProviderButton label="Microsoft" icon="microsoft" onClick={onContinue} />
        <ProviderButton label="SSO" icon="sso" onClick={onContinue} />
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
}: {
  code: string
  onCodeChange: (value: string) => void
  onComplete: () => void
}) {
  const digits = code.padEnd(6, " ").slice(0, 6).split("")

  function updateDigit(index: number, value: string) {
    const nextDigits = digits.map((digit) => (digit === " " ? "" : digit))
    nextDigits[index] = value.replace(/\D/g, "").slice(-1)
    const nextCode = nextDigits.join("").slice(0, 6)
    onCodeChange(nextCode)
    if (nextCode.length === 6) window.setTimeout(onComplete, 240)
  }

  return (
    <div className="mt-[var(--md-page-section-gap)] flex gap-[var(--md-gap-lg)]">
      {digits.map((digit, index) => (
        <Input
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          aria-label={`Code digit ${index + 1}`}
          value={digit === " " ? "" : digit}
          inputMode="numeric"
          maxLength={1}
          onChange={(event) => updateDigit(index, event.target.value)}
          className={cn(
            "size-[74px] rounded-[14px] border-0 bg-white p-0 text-center text-[34px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-0",
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
}: {
  email: string
  code: string
  onCodeChange: (value: string) => void
  onBack: () => void
  onComplete: () => void
}) {
  return (
    <div className="w-full max-w-[600px]">
      <div className="grid size-[64px] place-items-center rounded-[16px] bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]">
        <Mail className="size-7" strokeWidth={1.4} />
      </div>

      <h2 className="mt-[var(--md-page-section-gap)] text-[36px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Check your inbox</h2>
      <p className="mt-4 text-[18px] leading-7 text-[var(--md-text)]">
        We sent a code to <span className="font-medium text-[var(--md-ink)]">{email}</span>
      </p>

      <CodeInput code={code} onCodeChange={onCodeChange} onComplete={onComplete} />

      <div className="mt-[var(--md-page-section-gap)] flex flex-wrap items-center gap-[var(--md-gap-md)] text-[17px] text-[var(--md-text)]">
        <span>Didn't get it?</span>
        <button type="button" className="font-medium text-[var(--md-accent)]" onClick={() => onCodeChange("742")}>Resend</button>
        <span className="text-[var(--md-subtle)]">·</span>
        <button type="button" className="font-medium text-[var(--md-accent)]" onClick={onBack}>Use a different email</button>
      </div>

      <div className="mt-[calc(var(--md-page-section-gap)+var(--md-gap-lg))] flex gap-[var(--md-gap-lg)] rounded-[14px] bg-white/52 px-[var(--md-gap-xl)] py-[var(--md-page-stack-gap)] text-[16px] leading-7 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
        <Clock3 className="mt-1 size-5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} />
        <p>Your session stays signed in on this device for 30 days. Admins can shorten this in workspace settings.</p>
      </div>
    </div>
  )
}

function SignedOutPanel({ onSignBackIn, onSwitchAccount }: { onSignBackIn: () => void; onSwitchAccount: () => void }) {
  return (
    <div className="w-full max-w-[560px]">
      <BrandLockup />
      <h2 className="mt-[calc(var(--md-page-section-gap)*2)] text-[34px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">You're signed out</h2>
      <p className="mt-[var(--md-page-stack-gap)] text-[18px] text-[var(--md-text)]">Nice work today, Emma.</p>

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
}: {
  initialStep?: AuthFlowStep
  galleryMode?: boolean
}) {
  const [step, setStep] = useState<AuthFlowStep>(initialStep)
  const [email, setEmail] = useState("emma@northwind-fwd.com")
  const [code, setCode] = useState("742")

  function goToSignIn(resetEmail = false) {
    setStep("signin")
    setCode("742")
    if (resetEmail) setEmail("")
  }

  return (
    <div
      className={cn(
        "grid min-h-screen bg-[var(--md-bg)] text-[var(--md-ink)] lg:grid-cols-[43.4%_56.6%]",
        galleryMode && "min-h-[720px] overflow-hidden rounded-[var(--md-radius-xl)] shadow-[var(--md-shadow-line)]",
      )}
    >
      <FreightNarrative step={step} className={galleryMode ? "min-h-[720px]" : undefined} />
      <main className="grid min-h-[720px] place-items-center px-[clamp(var(--md-gap-xl),6vw,120px)] py-[calc(var(--md-page-section-gap)*2)] lg:min-h-screen">
        {step === "signin" ? <SignInPanel email={email} onEmailChange={setEmail} onContinue={() => setStep("verify")} /> : null}
        {step === "verify" ? (
          <VerifyPanel
            email={email || "emma@northwind-fwd.com"}
            code={code}
            onCodeChange={setCode}
            onBack={() => goToSignIn(false)}
            onComplete={() => setStep("signed-out")}
          />
        ) : null}
        {step === "signed-out" ? <SignedOutPanel onSignBackIn={() => goToSignIn(false)} onSwitchAccount={() => goToSignIn(true)} /> : null}
      </main>
    </div>
  )
}

export { AuthField, BrandLockup, CodeInput, FreightNarrative, SignedOutPanel, SignInPanel, VerifyPanel }
