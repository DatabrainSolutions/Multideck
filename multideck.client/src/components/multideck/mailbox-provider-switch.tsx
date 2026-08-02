import { AlertTriangle, Inbox, RefreshCw, Users } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import gmailLogo from "@/assets/integrations/gmail.svg"
import outlookLogo from "@/assets/integrations/outlook.svg"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import type { ConnectionStatus, Mailbox, MailProvider } from "@/lib/inbox-api"
import { cn } from "@/lib/utils"

/**
 * Chooses the mail account the workspace is reading.
 *
 * The provider toggle reuses the shared SegmentedControl so it behaves like every
 * other switch in Multideck, and the provider marks come from the local auth
 * assets rather than a remote logo URL. Beneath each provider, personal comes
 * first and shared or group mailboxes are labelled explicitly, because sending
 * from the wrong address is the expensive mistake in an operations inbox.
 */

export const mailProviderLabels: Record<MailProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
}

/**
 * The local Gmail and Outlook marks used across the Inbox, drawn at the sizes an
 * inline mail control needs. Kept local so no remote logo URL is introduced and
 * the mark scales with the control rather than the auth row.
 */
const providerLogos: Record<MailProvider, string> = {
  gmail: gmailLogo,
  outlook: outlookLogo,
}

export function MailProviderMark({ provider, className }: { provider: MailProvider; className?: string }) {
  return (
    <img
      src={providerLogos[provider]}
      alt=""
      aria-hidden="true"
      className={cn("size-4 shrink-0 object-contain", className)}
    />
  )
}

export function mailboxKindLabel(mailbox: Mailbox) {
  return mailbox.kind === "shared" ? "Shared" : mailbox.kind === "group" ? "Group" : ""
}

function StatusNote({ status, error }: { status: ConnectionStatus; error: string | null }) {
  const { t } = useLanguage()

  if (status === "reauthorization_required") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--md-amber)]">
        <AlertTriangle className="size-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        {t("Reconnect needed")}
      </span>
    )
  }

  if (status === "error") {
    return (
      <span title={error ?? undefined} className="flex items-center gap-1 text-[11px] font-medium text-[var(--md-red)]">
        <AlertTriangle className="size-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        {t("Sync problem")}
      </span>
    )
  }

  if (status === "syncing") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--md-blue)]">
        <RefreshCw className="size-3 shrink-0 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
        {t("Syncing")}
      </span>
    )
  }

  return null
}

export function MailboxProviderSwitch({
  providers,
  provider,
  onProviderChange,
  mailboxes,
  selectedMailboxId,
  onMailboxChange,
  onReconnect,
  className,
}: {
  /** Providers with a connection on this workspace, in display order. */
  providers: MailProvider[]
  provider: MailProvider
  onProviderChange: (provider: MailProvider) => void
  /** Mailboxes for the selected provider only. */
  mailboxes: Mailbox[]
  selectedMailboxId: string | null
  onMailboxChange: (mailbox: Mailbox) => void
  onReconnect?: (provider: MailProvider) => void
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const personal = mailboxes.filter((mailbox) => mailbox.kind === "personal")
  const shared = mailboxes.filter((mailbox) => mailbox.kind !== "personal")
  const needsReconnect = mailboxes.some((mailbox) => mailbox.status === "reauthorization_required")

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {providers.length > 1 ? (
        <SegmentedControl
          options={providers}
          value={provider}
          onChange={onProviderChange}
          ariaLabel={t("Mail provider")}
          className="w-full [&>button]:flex-1"
          renderOption={(option) => (
            <>
              <MailProviderMark provider={option} className="size-4" />
              <span className="truncate">{mailProviderLabels[option]}</span>
            </>
          )}
        />
      ) : (
        <div className="flex items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2 shadow-[var(--md-shadow-line)]">
          <MailProviderMark provider={provider} className="size-4" />
          <span className="truncate text-[13px] font-medium text-[var(--md-ink)]">{mailProviderLabels[provider]}</span>
        </div>
      )}

      {needsReconnect && onReconnect ? (
        <div className="rounded-[var(--md-radius-lg)] bg-[rgba(221,138,43,0.1)] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(221,138,43,0.2)]">
          <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("This connection expired")}</p>
          <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--md-text)]">
            {t("New mail stopped arriving. Sign in again to resume syncing.")}
          </p>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 h-8 w-full rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            onClick={() => onReconnect(provider)}
          >
            {t("Reconnect")}
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto md-scrollbar">
        {[
          { key: "personal", label: "Personal", items: personal },
          { key: "shared", label: "Shared mailboxes", items: shared },
        ]
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div key={group.key} className="mb-3 last:mb-0">
              <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--md-subtle)]">
                {t(group.label)}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((mailbox) => {
                  const selected = mailbox.id === selectedMailboxId
                  const kindLabel = mailboxKindLabel(mailbox)

                  return (
                    <div key={mailbox.id} className="group relative isolate">
                      {selected ? (
                        <motion.span
                          aria-hidden="true"
                          layoutId="inbox-mailbox-selection"
                          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
                          className="pointer-events-none absolute inset-0 -z-10 rounded-[var(--md-radius-md)] bg-[var(--md-bg-strong)] shadow-[inset_0_0_0_1px_var(--md-accent-a14)]"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 -z-10 rounded-[var(--md-radius-md)] bg-[var(--md-hover)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                        />
                      )}
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        className="grid w-full min-h-[44px] grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--md-radius-md)] px-2 py-2 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)]"
                        onClick={() => onMailboxChange(mailbox)}
                      >
                        {mailbox.kind === "personal" ? (
                          <Inbox className="size-[15px] text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                        ) : (
                          <Users className="size-[15px] text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                        )}
                        <span className="min-w-0">
                          {/* The name gets the full width of the row. The Shared or
                              Group label sits with the address underneath, where it
                              still reads as part of the mailbox but never squeezes
                              a real display name into an ellipsis. */}
                          <span
                            data-i18n-skip
                            dir="auto"
                            title={mailbox.displayName}
                            className={cn("block truncate text-[13px]", selected ? "font-medium text-[var(--md-ink)]" : "text-[var(--md-text)]")}
                          >
                            {mailbox.displayName}
                          </span>
                          <span className="mt-px flex min-w-0 items-center gap-1.5">
                            {kindLabel ? (
                              <span className="shrink-0 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-1 py-px text-[9.5px] font-medium uppercase tracking-[0.05em] text-[var(--md-subtle)]">
                                {t(kindLabel)}
                              </span>
                            ) : null}
                            <bdi
                              data-i18n-skip
                              dir="ltr"
                              title={mailbox.address}
                              className="min-w-0 truncate text-[11px] text-[var(--md-subtle)]"
                            >
                              {mailbox.address}
                            </bdi>
                          </span>
                          <StatusNote status={mailbox.status} error={mailbox.error} />
                        </span>
                        {mailbox.unreadCount > 0 ? (
                          <span
                            data-i18n-skip
                            dir="ltr"
                            aria-label={`${mailbox.unreadCount} ${t("unread")}`}
                            className="shrink-0 rounded-full bg-[var(--md-accent-a10)] px-1.5 text-[11px] font-medium leading-[18px] tabular-nums text-[var(--md-accent)]"
                          >
                            {mailbox.unreadCount}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
