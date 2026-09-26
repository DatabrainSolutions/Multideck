import { useCallback, useEffect, useRef, useState } from "react"
import { CalendarDays, LoaderCircle, RefreshCw, X } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SettingsIntegrationCard } from "@/components/multideck/settings-components"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { useLanguage } from "@/i18n/language-provider"

type ConnectionProvider = CalendarConnection["provider"]

const providers: Array<{ provider: ConnectionProvider; title: string; description: string }> = [
  { provider: "google", title: "Google Calendar + Meet", description: "See real availability, send invitations and add Meet links without leaving Multideck." },
  { provider: "microsoft", title: "Microsoft Calendar + Teams", description: "Check Microsoft 365 availability, send invitations and include Teams links in bookings." },
  { provider: "zoom", title: "Zoom", description: "Create Zoom links for meetings booked against your connected calendars." },
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
  const [detailsProvider, setDetailsProvider] = useState<ConnectionProvider | null>(null)
  const [settingsProvider, setSettingsProvider] = useState<ConnectionProvider | null>(null)
  const [disconnectCandidate, setDisconnectCandidate] = useState<ConnectionProvider | null>(null)
  const dialogTriggerRef = useRef<HTMLElement | null>(null)
  const rememberDialogTrigger = () => { dialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }
  const restoreDialogFocus = (event: Event) => { event.preventDefault(); dialogTriggerRef.current?.focus() }

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
      setSettingsProvider(null)
      setDisconnectCandidate(null)
      toast.success(`${provider === "microsoft" ? "Microsoft Calendar" : provider === "google" ? "Google Calendar" : "Zoom"} disconnected`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The provider could not be disconnected.")
    } finally {
      setBusyProvider(null)
    }
  }

  const detailDefinition = providers.find((item) => item.provider === detailsProvider)
  const detailConnection = connections.find((item) => item.provider === detailsProvider)
  const settingsDefinition = providers.find((item) => item.provider === settingsProvider)
  const settingsConnection = connections.find((item) => item.provider === settingsProvider)

  return (
    <section aria-labelledby="calendar-integrations-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="calendar-integrations-heading" className="text-[16px] font-medium tracking-[-0.01em] text-[var(--md-ink)]">Calendar and meetings</h2>
          <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">Availability, invitations and meeting links.</p>
        </div>
        <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-3 text-[12px] font-medium shadow-[var(--md-shadow-line)]" onClick={() => navigate("/calendar")}>
          <CalendarDays className="size-3.5" aria-hidden="true" /> Open Calendar
        </Button>
      </div>
      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]" role="alert">
          <p className="text-[13px] text-[var(--md-red)]">{error}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="size-3.5" />Try again</Button>
        </div>
      ) : loading ? (
        <div className="flex min-h-44 items-center gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 text-[13px] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]" role="status"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />Checking calendar connections…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map(({ provider, title, description }) => {
            const connection = connections.find((candidate) => candidate.provider === provider)
            const connected = Boolean(connection && connection.status !== "disconnected")
            const active = connection?.status === "connected" || connection?.status === "syncing"
            const needsAttention = connection?.status === "attention"
            return <SettingsIntegrationCard
              key={provider}
              logoSrc={providerLogos[provider]}
              title={title}
              description={description}
              status={statusLabel(connection)}
              statusTone={connection?.status === "connected" ? "connected" : needsAttention ? "review" : connection?.status === "syncing" ? "workspace" : "ready"}
              onDetails={() => { rememberDialogTrigger(); setDetailsProvider(provider) }}
              onSettings={connected ? () => { rememberDialogTrigger(); setSettingsProvider(provider) } : undefined}
              active={active}
              toggleDisabled={!canConnect || busyProvider !== null || savingColour !== null}
              onActiveChange={(nextActive) => {
                if (nextActive) void connect(provider)
                else { rememberDialogTrigger(); setDisconnectCandidate(provider) }
              }}
            />
          })}
        </div>
      )}
      <Dialog open={detailsProvider !== null} onOpenChange={(open) => !open && setDetailsProvider(null)}>
        <DialogContent className="sm:max-w-[480px]" onCloseAutoFocus={restoreDialogFocus}>
          <DialogHeader className="pe-8 text-start"><DialogTitle>{detailDefinition?.title}</DialogTitle><DialogDescription>{detailDefinition?.description}</DialogDescription></DialogHeader>
          <div className="grid gap-3 text-[13px] leading-5">
            <p><span className="text-[var(--md-subtle)]">Status · </span><span className="font-medium text-[var(--md-ink)]">{statusLabel(detailConnection)}</span></p>
            {detailConnection?.email ? <p><span className="text-[var(--md-subtle)]">Connected account · </span><bdi dir="ltr" data-i18n-skip className="break-all text-[var(--md-ink)]">{detailConnection.email}</bdi></p> : null}
            {detailConnection?.error ? <p role="alert" className="text-[var(--md-red)]">{detailConnection.error}</p> : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={settingsProvider !== null} onOpenChange={(open) => !open && !busyProvider && !savingColour && setSettingsProvider(null)}>
        <DialogContent className="sm:max-w-[480px]" onCloseAutoFocus={restoreDialogFocus}>
          <DialogHeader className="pe-8 text-start"><DialogTitle>{settingsDefinition?.title} settings</DialogTitle><DialogDescription>Manage this connection and how it appears in Calendar.</DialogDescription></DialogHeader>
          {settingsProvider && settingsConnection ? <div className="grid gap-5">
            {settingsProvider !== "zoom" ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[13px] font-medium text-[var(--md-ink)]">Calendar {colourLabel}</p><MeetingColourPicker label={`${settingsDefinition?.title} ${colourLabel}`} value={settingsConnection.colour} onChange={(colour) => void changeColour(settingsProvider, colour)} disabled={savingColour !== null || busyProvider !== null || !canConnect} compact /></div> : null}
            <div className="border-t border-[var(--md-hairline)] pt-4">
              <Button type="button" variant="ghost" disabled={busyProvider !== null || savingColour !== null || !canConnect} className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 text-[12px] font-medium text-[var(--md-red)] shadow-[var(--md-shadow-line)]" onClick={() => { if (settingsConnection.status === "attention") void connect(settingsProvider); else { setSettingsProvider(null); setDisconnectCandidate(settingsProvider) } }}>
                {busyProvider === settingsProvider ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : settingsConnection.status === "attention" ? <RefreshCw className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
                {settingsConnection.status === "attention" ? "Reconnect" : "Disconnect"}
              </Button>
            </div>
          </div> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={disconnectCandidate !== null} onOpenChange={(open) => !open && busyProvider === null && setDisconnectCandidate(null)}>
        <DialogContent className="sm:max-w-[440px]" onCloseAutoFocus={restoreDialogFocus}>
          <DialogHeader className="pe-8 text-start">
            <DialogTitle>{disconnectCandidate ? `Disconnect ${providers.find((item) => item.provider === disconnectCandidate)?.title}?` : ""}</DialogTitle>
            <DialogDescription>Multideck will stop using this connection for availability and meeting links. Your calendar and meetings stay with the provider.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busyProvider !== null} onClick={() => setDisconnectCandidate(null)}>Cancel</Button>
            <Button type="button" disabled={!disconnectCandidate || busyProvider !== null} className="bg-[var(--md-red)] text-white" onClick={() => disconnectCandidate && void disconnect(disconnectCandidate)}>{busyProvider ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}Disconnect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
