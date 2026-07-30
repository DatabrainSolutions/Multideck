import { useCallback, useEffect, useState } from "react"
import type { Provider } from "@supabase/supabase-js"
import { Check, KeyRound, Loader2, MailCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import appleLogo from "@/assets/auth/apple.svg"
import facebookLogo from "@/assets/auth/facebook.svg"
import googleLogo from "@/assets/auth/google.svg"
import linkedinLogo from "@/assets/auth/linkedin.svg"
import microsoftLogo from "@/assets/auth/microsoft.svg"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

export type AuthProviderId = "google" | "passkey" | "linkedin_oidc" | "facebook" | "azure"
export type OAuthAuthProviderId = Exclude<AuthProviderId, "passkey">

export type AuthProviderDefinition = {
  id: AuthProviderId
  label: string
  shortDescription: string
  settingsDescription: string
  logo?: string
}

export const authProviderDefinitions: AuthProviderDefinition[] = [
  {
    id: "google",
    label: "Google",
    shortDescription: "Continue with your connected Google account",
    settingsDescription: "Use a connected Google account for future Multideck sign-ins.",
    logo: googleLogo,
  },
  {
    id: "passkey",
    label: "Passkey",
    shortDescription: "Use Face ID, Touch ID, or a security key",
    settingsDescription: "Use biometrics, your device PIN, or a hardware security key.",
    logo: appleLogo,
  },
  {
    id: "linkedin_oidc",
    label: "LinkedIn",
    shortDescription: "Continue with your connected LinkedIn account",
    settingsDescription: "Use a connected LinkedIn identity for future Multideck sign-ins.",
    logo: linkedinLogo,
  },
  {
    id: "facebook",
    label: "Facebook",
    shortDescription: "Continue with your connected Facebook account",
    settingsDescription: "Use a connected Facebook identity for future Multideck sign-ins.",
    logo: facebookLogo,
  },
  {
    id: "azure",
    label: "Microsoft",
    shortDescription: "Continue with your connected Microsoft account",
    settingsDescription: "Use your Microsoft or Entra ID account for future sign-ins.",
    logo: microsoftLogo,
  },
]

export function getAuthProviderDefinition(id: AuthProviderId) {
  return authProviderDefinitions.find((provider) => provider.id === id) ?? authProviderDefinitions[0]
}

export function AuthProviderMark({ provider, className, bare = false }: { provider: AuthProviderId; className?: string; bare?: boolean }) {
  const definition = getAuthProviderDefinition(provider)

  if (definition.logo) {
    return (
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center",
          !bare && "rounded-[var(--md-radius-lg)] bg-white shadow-[var(--md-shadow-line)]",
          className,
        )}
        aria-hidden="true"
      >
        <img src={definition.logo} alt="" className="size-[18px] object-contain" />
      </span>
    )
  }

  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center text-[var(--md-ink)]",
        !bare && "rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]",
        className,
      )}
      aria-hidden="true"
    >
      <KeyRound className="size-[18px]" strokeWidth={1.45} />
    </span>
  )
}

export function AuthProviderSelector({
  disabled = false,
  busyProvider = null,
  onSelect,
  className,
}: {
  disabled?: boolean
  busyProvider?: AuthProviderId | null
  onSelect?: (provider: AuthProviderId) => void | Promise<void>
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-5 gap-2.5", className)} role="group" aria-label="Sign-in providers">
      {authProviderDefinitions.map((provider) => {
        const isBusy = busyProvider === provider.id

        return (
          <button
            key={provider.id}
            type="button"
            disabled={disabled || Boolean(busyProvider)}
            aria-label={`Continue with ${provider.label}`}
            title={provider.label}
            className={cn(
              "group grid h-14 min-w-0 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "hover:-translate-y-px hover:bg-white hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55",
            )}
            onClick={() => void onSelect?.(provider.id)}
          >
            {isBusy ? (
              <Loader2 className="size-[18px] animate-spin text-[var(--md-accent)]" strokeWidth={1.4} />
            ) : (
              <AuthProviderMark provider={provider.id} bare className="size-9 transition-transform duration-200 group-hover:scale-[1.04]" />
            )}
          </button>
        )
      })}
    </div>
  )
}

type PasskeySummary = {
  id: string
  friendly_name?: string
}

function getIdentityRedirectUrl() {
  return `${window.location.origin}/settings?tab=security`
}

function SignInMethodRow({
  provider,
  connected,
  detail,
  busy = false,
  onConnect,
}: {
  provider: AuthProviderId | "password"
  connected: boolean
  detail: string
  busy?: boolean
  onConnect?: () => void | Promise<void>
}) {
  const definition = provider === "password" ? null : getAuthProviderDefinition(provider)
  const label = definition?.label ?? "Email and password"

  return (
    <div className="grid gap-3 px-4 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.07)] last:shadow-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        {provider === "password" ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-text)] shadow-[var(--md-shadow-line)]" aria-hidden="true">
            <MailCheck className="size-[18px]" strokeWidth={1.45} />
          </span>
        ) : (
          <AuthProviderMark provider={provider} />
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{detail}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", connected ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)]")}>
          {connected ? <Check className="size-3.5" strokeWidth={1.6} /> : null}
          {connected ? "Connected" : "Not connected"}
        </span>
        {!connected && onConnect ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            className="h-8 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]"
            onClick={() => void onConnect()}
          >
            {busy ? <Loader2 className="me-1.5 size-3.5 animate-spin" strokeWidth={1.4} /> : null}
            Connect
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function AuthIdentityManager({ preview = false, embedded = false }: { preview?: boolean; embedded?: boolean }) {
  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(
    () => new Set(preview ? ["email", "google"] : []),
  )
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>(preview ? [{ id: "preview", friendly_name: "This device" }] : [])
  const [isLoading, setIsLoading] = useState(!preview)
  const [busyProvider, setBusyProvider] = useState<AuthProviderId | null>(null)

  const refreshMethods = useCallback(async () => {
    if (preview || !supabase) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      const [{ data: identitiesData, error: identitiesError }, { data: passkeyData, error: passkeyError }] = await Promise.all([
        supabase.auth.getUserIdentities(),
        supabase.auth.passkey.list(),
      ])

      if (identitiesError) throw identitiesError
      if (passkeyError && passkeyError.code !== "passkey_disabled") throw passkeyError

      setConnectedProviders(new Set(identitiesData?.identities.map((identity) => identity.provider) ?? []))
      setPasskeys((passkeyData ?? []) as PasskeySummary[])
    } catch (error) {
      console.error(error)
      toast.error("Could not load sign-in methods")
    } finally {
      setIsLoading(false)
    }
  }, [preview])

  useEffect(() => {
    void refreshMethods()
  }, [refreshMethods])

  async function connectProvider(provider: OAuthAuthProviderId) {
    if (preview) {
      setConnectedProviders((current) => new Set(current).add(provider))
      return
    }

    if (!supabase) {
      toast.error("Supabase is not configured")
      return
    }

    setBusyProvider(provider)

    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: provider as Provider,
        options: {
          redirectTo: getIdentityRedirectUrl(),
          ...(provider === "azure" ? { scopes: "email" } : {}),
        },
      })

      if (error) throw error
    } catch (error) {
      console.error(error)
      toast.error("Could not connect this sign-in method", {
        description: "Check that the provider and manual identity linking are enabled in Supabase.",
      })
      setBusyProvider(null)
    }
  }

  async function registerPasskey() {
    if (preview) {
      setPasskeys([{ id: "preview", friendly_name: "This device" }])
      return
    }

    if (!supabase) {
      toast.error("Supabase is not configured")
      return
    }

    if (!("PublicKeyCredential" in window)) {
      toast.error("Passkeys are not supported in this browser")
      return
    }

    setBusyProvider("passkey")

    try {
      const { error } = await supabase.auth.registerPasskey()
      if (error) throw error
      await refreshMethods()
      toast.success("Passkey connected")
    } catch (error) {
      console.error(error)
      toast.error("Could not connect a passkey", {
        description: "Check that passkeys are enabled for the current Multideck domain.",
      })
    } finally {
      setBusyProvider(null)
    }
  }

  return (
    <div
      className={cn(
        !embedded && "overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]",
        isLoading && "opacity-70",
      )}
    >
      <SignInMethodRow
        provider="password"
        connected={connectedProviders.has("email") || preview}
        detail="Your workspace email and password are created by a Multideck administrator."
      />
      {authProviderDefinitions.map((provider) => {
        const providerId = provider.id
        const connected = providerId === "passkey" ? passkeys.length > 0 : connectedProviders.has(providerId)

        return (
          <SignInMethodRow
            key={provider.id}
            provider={providerId}
            connected={connected}
            detail={
              providerId === "passkey" && connected
                ? `${passkeys.length} passkey${passkeys.length === 1 ? "" : "s"} ready for sign-in.`
                : provider.settingsDescription
            }
            busy={busyProvider === providerId}
            onConnect={providerId === "passkey" ? registerPasskey : () => connectProvider(providerId as OAuthAuthProviderId)}
          />
        )
      })}
    </div>
  )
}
