import { useCallback, useEffect, useState } from "react"
import { ArrowUpRight, Check, LoaderCircle, RefreshCw } from "@/components/icons/hugeicons"
import { beginCalendarConnection, getCalendarConnections, type CalendarConnection } from "@/lib/calendar-api"
import { authorizeInboxProvider, listInboxConnections, listInboxProviders, type InboxConnection, type InboxProviderAvailability, type MailProvider } from "@/lib/inbox-api"
import { useLanguage } from "@/i18n/language-provider"
import gmailLogo from "@/assets/integrations/gmail.svg"
import outlookLogo from "@/assets/integrations/outlook.png"
import googleMeetLogo from "@/assets/calendar/google-meet.svg"
import teamsLogo from "@/assets/calendar/microsoft-teams.svg"
import zoomLogo from "@/assets/calendar/zoom.svg"

const providers = [
  { id: "gmail", type: "mail", label: "Gmail", detail: "Your email, ready in Inbox and Dexter.", logo: gmailLogo },
  { id: "outlook", type: "mail", label: "Outlook", detail: "Bring your Microsoft 365 email with you.", logo: outlookLogo },
  { id: "google", type: "calendar", label: "Google Calendar + Meet", detail: "Your availability, events and Google Meet links.", logo: googleMeetLogo },
  { id: "microsoft", type: "calendar", label: "Microsoft Calendar + Teams", detail: "Your calendar and Teams meeting links.", logo: teamsLogo },
  { id: "zoom", type: "calendar", label: "Zoom", detail: "Create a Zoom link when you book a meeting.", logo: zoomLogo },
] as const

export function AccountOnboardingConnections({ preview }: { preview: boolean }) {
  const { t } = useLanguage()
  const [mail, setMail] = useState<InboxConnection[]>([])
  const [calendar, setCalendar] = useState<CalendarConnection[]>([])
  const [available, setAvailable] = useState<InboxProviderAvailability[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedMail, setLoadedMail] = useState(false)
  const [loadedCalendar, setLoadedCalendar] = useState(false)
  const [returned] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get("status") === "error" || params.get("calendar_connection") === "error"
      ? "The connection wasn’t completed. You can try again or connect it later in Settings."
      : params.has("email_connection") || params.has("calendar_connection") ? "You’re back. We’re checking your connection below." : null
  })
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const results = await Promise.allSettled([Promise.all([listInboxConnections(), listInboxProviders()]), getCalendarConnections()])
    if (results[0].status === "fulfilled") { setMail(results[0].value[0]); setAvailable(results[0].value[1]); setLoadedMail(true) }
    else setError("Email connections could not be checked. Try again, or connect them later in Settings.")
    if (results[1].status === "fulfilled") { setCalendar(results[1].value); setLoadedCalendar(true) }
    else setError((current) => current ? "Your connections could not be checked. Try again, or connect them later in Settings." : "Calendar connections could not be checked. Try again, or connect them later in Settings.")
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function connect(provider: typeof providers[number]) {
    setBusy(provider.id); setError(null)
    const returnPath = `/onboarding${preview ? "?preview=1&step=connections" : ""}`
    try {
      if (provider.type === "mail") window.location.assign(await authorizeInboxProvider(provider.id as MailProvider, "personal", returnPath))
      else await beginCalendarConnection(provider.id as CalendarConnection["provider"], returnPath)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The connection could not be started.")
      setBusy(null)
    }
  }

  return <div className="md-onboarding-connections">
    {loading ? <p className="md-onboarding-connection-return flex items-center gap-2" role="status"><LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />{t("Checking your connections…")}</p> : null}
    {returned ? <p role="status" className="md-onboarding-connection-return">{t(returned)}</p> : null}
    {providers.map((provider) => {
      const connection = provider.type === "mail" ? mail.find((item) => item.provider === provider.id) : calendar.find((item) => item.provider === provider.id)
      const connected = connection?.status === "connected"
      const syncing = connection?.status === "syncing"
      const needsAttention = connection && ["attention", "error", "reauthorization_required"].includes(connection.status)
      const configured = provider.type !== "mail" || available.some((item) => item.provider === provider.id && item.configured)
      const checked = provider.type === "mail" ? loadedMail : loadedCalendar
      const detail = connection && "address" in connection ? connection.address : connection && "email" in connection ? connection.email : null
      return <div className="md-onboarding-connection" key={provider.id}>
        <span className="md-onboarding-provider-logo"><img src={provider.logo} alt="" /></span>
        <div><h2>{provider.label}</h2><p>{detail || t(provider.detail)}</p>{!loading && checked && !configured ? <small>{t("Your administrator needs to enable this connection.")}</small> : null}</div>
        {connected ? <span className="md-onboarding-connected"><Check className="size-3.5" />{t("Connected")}</span> : syncing ? <span className="md-onboarding-connected"><RefreshCw className="size-3.5" />{t("Syncing")}</span> : <button type="button" disabled={loading || Boolean(busy) || !checked || !configured} onClick={() => void connect(provider)}>{busy === provider.id ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{t(needsAttention ? "Reconnect" : "Connect")}{busy !== provider.id ? <ArrowUpRight className="size-3.5" /> : null}</button>}
      </div>
    })}
    {error ? <div role="alert" className="md-onboarding-error">{t(error)}<button type="button" onClick={() => void load()} disabled={loading}>{t("Try again")}</button></div> : null}
    <p className="md-onboarding-muted">{t(preview ? "Connecting opens the real provider consent screen. Your existing connections stay available." : "Connect the tools you use. You’ll review access with each provider, and can add the others later.")}</p>
  </div>
}
