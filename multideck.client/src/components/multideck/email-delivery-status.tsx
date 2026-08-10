import {
  Ban,
  Check,
  CheckCheck,
  CircleAlert,
  Eye,
  Reply,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useLanguage } from "@/i18n/language-provider"
import type { InboxDelivery, InboxDeliveryStatus } from "@/lib/inbox-api"
import { cn } from "@/lib/utils"

type DeliveryPresentation = {
  icon: LucideIcon
  label: string
  detail: string
  tone: "neutral" | "positive" | "danger"
}

function presentationFor(
  status: InboxDeliveryStatus,
  t: (value: string) => string,
): DeliveryPresentation {
  switch (status) {
    case "delivered":
      return {
        icon: CheckCheck,
        label: t("Delivered"),
        detail: t("The provider confirmed delivery."),
        tone: "positive",
      }
    case "opened_estimated":
      return {
        icon: Eye,
        label: t("Opened (estimated)"),
        detail: t("At least one recipient's email app requested the tracking image."),
        tone: "positive",
      }
    case "replied":
      return {
        icon: Reply,
        label: t("Replied"),
        detail: t("A reply was received to this message."),
        tone: "positive",
      }
    case "failed":
      return {
        icon: CircleAlert,
        label: t("Failed"),
        detail: t("The provider did not accept this message."),
        tone: "danger",
      }
    case "bounced":
      return {
        icon: Ban,
        label: t("Bounced"),
        detail: t("The provider reported that this message could not be delivered."),
        tone: "danger",
      }
    case "no_open_signal":
      return {
        icon: Check,
        label: t("Sent"),
        detail: t("The provider accepted this message. No open signal has been received."),
        tone: "neutral",
      }
    default:
      return {
        icon: Check,
        label: t("Sent"),
        detail: t("The provider accepted this message for sending."),
        tone: "neutral",
      }
  }
}

const toneClass: Record<DeliveryPresentation["tone"], string> = {
  neutral: "bg-[var(--md-surface-tint)] text-[var(--md-text)]",
  positive: "bg-[var(--md-accent-a10)] text-[var(--md-accent)]",
  danger: "bg-[color-mix(in_srgb,var(--md-red)_10%,transparent)] text-[var(--md-red)]",
}

function formatEventTime(value: string, language: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

/**
 * A compact, evidence-led status for one outbound message.
 *
 * The visible icon and label make the state scannable; the keyboard- and
 * touch-accessible popover explains what Multideck actually knows. Open events
 * stay visibly estimated because image blocking can hide them and privacy
 * proxies can request the pixel before a person reads the email.
 */
export function EmailDeliveryStatus({
  delivery,
  className,
}: {
  delivery: InboxDelivery
  className?: string
}) {
  const { direction, language, t } = useLanguage()
  const presentation = presentationFor(delivery.status, t)
  const Icon = presentation.icon
  const events = [
    { label: t("Sent"), value: delivery.sentAt },
    { label: t("Delivered"), value: delivery.deliveredAt },
    { label: t("Opened"), value: delivery.openedAt },
    { label: t("Replied"), value: delivery.repliedAt },
    { label: t("Failed"), value: delivery.failedAt },
    { label: t("Bounced"), value: delivery.bouncedAt },
  ].filter((event): event is { label: string; value: string } => Boolean(event.value))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={presentation.label}
          aria-live="polite"
          className={cn(
            "inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[10.5px] font-medium outline-none transition-[background-color,color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:brightness-[0.98] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
            toneClass[presentation.tone],
            className,
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          <span>{presentation.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        dir={direction}
        className="w-[min(300px,calc(100vw-24px))] gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-popover)]"
      >
        <PopoverHeader className="gap-1">
          <PopoverTitle className="flex items-center gap-2 text-[13px] font-medium text-[var(--md-ink)]">
            <span className={cn("grid size-7 place-items-center rounded-full", toneClass[presentation.tone])}>
              <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            {presentation.label}
          </PopoverTitle>
          <PopoverDescription className="text-[11.5px] leading-[1.55] text-[var(--md-text)]">
            {presentation.detail}
          </PopoverDescription>
        </PopoverHeader>

        {events.length > 0 ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[11px] leading-4">
            {events.map((event) => (
              <div key={`${event.label}-${event.value}`} className="contents">
                <dt className="text-[var(--md-subtle)]">{event.label}</dt>
                <dd data-i18n-skip dir="auto" className="text-end text-[var(--md-text)] tabular-nums">
                  {formatEventTime(event.value, language)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {delivery.openTrackingEnabled ? (
          <p className="text-[10.5px] leading-[1.5] text-[var(--md-subtle)]">
            {t("Open tracking is approximate. Image blocking can hide opens, while privacy proxies or viewing the sent copy can create a signal without the recipient reading it.")}
          </p>
        ) : (
          <p className="text-[10.5px] leading-[1.5] text-[var(--md-subtle)]">
            {t("Open tracking was off for this message.")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
