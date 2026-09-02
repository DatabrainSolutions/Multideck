import { useCallback, useEffect, useState } from "react"
import { CalendarDays, LoaderCircle, Plug, RefreshCw, X } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SettingsIntegrationRow, SettingsPanel } from "@/components/multideck/settings-components"
import { MeetingColourPicker } from "@/components/multideck/meeting-colour-picker"
import googleMeetLogo from "@/assets/calendar/google-meet.svg"
import microsoftTeamsLogo from "@/assets/calendar/microsoft-teams.svg"
import zoomLogo from "@/assets/calendar/zoom.svg"
import {
  beginCalendarConnection,
  disconnectCalendarConnection,
  getCalendarWorkspace,
  updateCalendarConnectionColour,
  type CalendarConnection,
  type MeetingColour,
} from "@/lib/calendar-api"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"

type ConnectionProvider = CalendarConnection["provider"]

const providers: Array<{ provider: ConnectionProvider; title: string; description: string }> = [
  { provider: "google", title: "Google Calendar + Meet", description: "Use Google availability, calendar invitations and Google Meet links." },
  { provider: "microsoft", title: "Microsoft Calendar + Teams", description: "Use Microsoft 365 availability, calendar invitations and Teams links." },
  { provider: "zoom", title: "Zoom", description: "Create Zoom meeting links alongside your connected calendars." },
]

const providerLogos: Record<ConnectionProvider, string> = { google: googleMeetLogo, microsoft: microsoftTeamsLogo, zoom: zoomLogo }

function statusLabel(connection: CalendarConnection | undefined) {
  if (!connection || connection.status === "disconnected") return "Not connected"
  if (connection.status === "syncing") return "Syncing"
  if (connection.status === "attention") return "Reconnect needed"
  return "Connected"
}

function connectionError(reason: string | null) {
  if (reason === "connection_conflict") return "That calendar provider is already connected. Refresh the page to see its latest status."
  if (reason === "provider_denied") return "The provider connection was cancelled."
  if (reason === "state_expired") return "That connection attempt expired. Try connecting again."
  if (reason === "state_invalid") return "That connection could not be verified. Start again from Settings."
  if (reason === "permission_denied") return "You no longer have permission to manage personal calendar connections."
  if (reason === "connection_cleanup_failed") return "The previous calendar cache could not be cleared safely. Reconnect before using provider-backed booking links."
  if (reason === "credentials_rejected") return "The provider rejected the Calendar app credentials. An administrator needs to refresh the connection setup."
  if (reason === "authorization_rejected") return "The provider could not complete that authorised connection. Start a fresh connection from Settings."
  if (reason === "renewable_token_missing") return "The provider did not grant the offline calendar access required for reliable syncing. Reconnect and approve the requested access."
  if (reason === "identity_unavailable") return "The provider authorised access, but the connected account could not be confirmed. Try again with the account you use for Calendar."
  if (reason === "provider_exchange_failed") return "The provider authorised access, but did not accept the final Calendar connection. Try again or ask an administrator to check the provider setup."
  return "The calendar connection could not be completed."
}

export function CalendarConnectionSettings({ navigate }: { navigate: (path: string) => void }) {
  const { language } = useLanguage()
  const colourLabel = language === "en-US" ? "color" : "colour"
  const [connections, setConnections] = useState<CalendarConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyProvider, setBusyProvider] = useState<ConnectionProvider | null>(null)
  const [savingColour, setSavingColour] = useState<"google" | "microsoft" | null>(null)
  const [canConnect, setCanConnect] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const now = new Date()
      const workspace = await getCalendarWorkspace(now.toISOString(), new Date(now.getTime() + 86_400_000).toISOString())
      setConnections(workspace.connections)
      setCanConnect(workspace.permissions.includes("Calendar.Connect"))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Calendar connections could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get("calendar_connection")
    if (!result) return
    const provider = url.searchParams.get("provider")
    const reason = url.searchParams.get("reason")
    for (const key of ["calendar_connection", "provider", "reason"]) url.searchParams.delete(key)
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    if (result === "syncing" || result === "connected") {
      toast.success(`${provider === "microsoft" ? "Microsoft Calendar" : provider === "google" ? "Google Calendar" : "Zoom"} authorised`, { description: "Multideck is verifying the connection and preparing the first sync." })
      void load()
    } else {
      toast.error(connectionError(reason))
    }
  }, [load])

  async function connect(provider: ConnectionProvider) {
    if (busyProvider) return
    setBusyProvider(provider)
    try {
      await beginCalendarConnection(provider)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The provider connection could not be started.")
      setBusyProvider(null)
    }
  }

  async function changeColour(provider: "google" | "microsoft", colour: MeetingColour) {
    if (savingColour) return
    const previous = connections
    setConnections((current) => current.map((connection) => connection.provider === provider ? { ...connection, colour } : connection))
    setSavingColour(provider)
    try {
      const saved = await updateCalendarConnectionColour(provider, colour)
      setConnections((current) => current.map((connection) => connection.provider === provider ? saved : connection))
      toast.success(`${provider === "google" ? "Google" : "Microsoft"} Calendar ${colourLabel} updated`)
    } catch (reason) {
      setConnections(previous)
      toast.error(reason instanceof Error ? reason.message : `The calendar ${colourLabel} could not be saved.`)
    } finally {
      setSavingColour(null)
    }
  }

  async function disconnect(provider: ConnectionProvider) {
    if (busyProvider) return
    setBusyProvider(provider)
    try {
      await disconnectCalendarConnection(provider)
      await load()
      toast.success(`${provider === "microsoft" ? "Microsoft Calendar" : provider === "google" ? "Google Calendar" : "Zoom"} disconnected`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The provider could not be disconnected.")
    } finally {
      setBusyProvider(null)
    }
  }

  return (
    <SettingsPanel
      title="Calendar and meetings"
      action={(
        <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-white/48 px-3 text-[12px] font-medium shadow-[var(--md-shadow-line)]" onClick={() => navigate("/calendar")}>
          <CalendarDays className="size-3.5" />
          Open Calendar
        </Button>
      )}
    >
      <div className="border-b border-[var(--md-line)] px-5 py-4">
        <p className="max-w-[72ch] text-[12px] leading-5 text-[var(--md-text)]">Connect Google Calendar and Microsoft Calendar together. Multideck combines busy times from both, while the meeting type you choose controls whether an invitation uses Meet or Teams.</p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">Phone, in-person and no-video meetings continue to work without any provider connection.{!canConnect && !loading ? " Ask an administrator if you need permission to manage personal connections." : ""}</p>
      </div>
      {error ? (
        <div className="flex items-center justify-between gap-3 px-5 py-4" role="alert">
          <p className="text-[12px] text-[var(--md-red)]">{error}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="size-3.5" />Try again</Button>
        </div>
      ) : loading ? (
        <div className="flex min-h-20 items-center gap-2 px-5 py-4 text-[12px] text-[var(--md-subtle)]" role="status"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />Checking calendar connections…</div>
      ) : providers.map(({ provider, title, description }) => {
        const connection = connections.find((candidate) => candidate.provider === provider)
        const connected = Boolean(connection && connection.status !== "disconnected")
        const needsAttention = connection?.status === "attention"
        const status = statusLabel(connection)
        const detail = connection?.error || (connection?.email ? `${description} Connected as ${connection.email}.` : description)
        const actionLabel = connected && !needsAttention ? "Disconnect" : needsAttention ? "Reconnect" : "Connect"
        const busyLabel = connected && !needsAttention ? "Disconnecting" : needsAttention ? "Reconnecting" : "Connecting"
        return (
          <SettingsIntegrationRow
            key={provider}
            logoSrc={providerLogos[provider]}
            title={title}
            description={detail}
            status={status}
            statusTone={connection?.status === "connected" ? "connected" : needsAttention ? "review" : connection?.status === "syncing" ? "workspace" : "ready"}
            action={(
              <div className="flex flex-wrap items-center justify-end gap-3">
                {connected && provider !== "zoom" ? (
                  <MeetingColourPicker
                    label={`${title} ${colourLabel}`}
                    value={connection?.colour ?? (provider === "google" ? "blue" : "violet")}
                    onChange={(colour) => void changeColour(provider, colour)}
                    disabled={savingColour !== null || busyProvider !== null || !canConnect}
                    compact
                  />
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`${actionLabel} ${title}`}
                  disabled={busyProvider !== null || savingColour !== null || !canConnect}
                  className={cn(
                    "h-8 w-fit rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,opacity,scale] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a18)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:active:scale-100",
                    connected && !needsAttention
                      ? "bg-white/48 text-[var(--md-red)] hover:bg-[rgba(194,63,63,0.08)] hover:text-[var(--md-red)]"
                      : needsAttention
                        ? "bg-[rgba(221,138,43,0.1)] text-[var(--md-amber)] hover:bg-[rgba(221,138,43,0.16)] hover:text-[var(--md-amber)]"
                        : "bg-[var(--md-accent)] text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-deep)] hover:text-[var(--md-accent-ink)]",
                  )}
                  onClick={() => void (connected && !needsAttention ? disconnect(provider) : connect(provider))}
                >
                  {busyProvider === provider ? (
                    <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : connected && !needsAttention ? (
                    <X className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                  ) : needsAttention ? (
                    <RefreshCw className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                  ) : (
                    <Plug className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                  )}
                  {busyProvider === provider ? busyLabel : actionLabel}
                </Button>
              </div>
            )}
          />
        )
      })}
    </SettingsPanel>
  )
}
