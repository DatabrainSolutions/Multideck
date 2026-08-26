import type { ReactNode } from "react"

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationSource,
  InlineCitationText,
} from "@/components/ai-elements/inline-citation"
import { useLanguage } from "@/i18n/language-provider"

export function isDexterCitationUrl(value: string | undefined): value is string {
  if (!value) return false
  if (value.startsWith("/") && !value.startsWith("//")) return true
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function citationLabel(href: string) {
  if (!href.startsWith("/")) {
    try {
      return new URL(href).hostname.replace(/^www\./, "")
    } catch {
      return "Source"
    }
  }
  if (href.startsWith("/crm/leads/")) return "Lead"
  if (href.startsWith("/crm/accounts/")) return "Account"
  if (href.startsWith("/crm/deals")) return "Deal"
  if (href.startsWith("/bookings/")) return "Booking"
  if (href.startsWith("/quotes")) return "Quote"
  if (href.startsWith("/warehouse/inventory")) return "Inventory"
  if (href.startsWith("/warehouse/orders")) return "Warehouse order"
  if (href.startsWith("/warehouse")) return "Warehouse"
  if (href.startsWith("/inbox")) return "Email"
  return "Multideck"
}

export function DexterInlineCitation({
  children,
  href,
  title,
}: {
  children: ReactNode
  href: string
  title?: string
}) {
  const { t } = useLanguage()
  const external = !href.startsWith("/")
  const sourceTitle = title?.trim() || t("Multideck record")
  const label = external ? citationLabel(href) : t(citationLabel(href))

  return (
    <InlineCitation>
      <InlineCitationText>{children}</InlineCitationText>
      <InlineCitationCard>
        <InlineCitationCardTrigger
          sources={[href]}
          href={href}
          label={label}
          external={external}
          aria-label={`${t("Open source")}: ${sourceTitle}`}
        />
        <InlineCitationCardBody>
          <InlineCitationCarousel>
            <InlineCitationCarouselHeader>
              <InlineCitationCarouselPrev aria-label={t("Previous source")} />
              <InlineCitationCarouselNext aria-label={t("Next source")} />
              <InlineCitationCarouselIndex />
            </InlineCitationCarouselHeader>
            <InlineCitationCarouselContent>
              <InlineCitationCarouselItem>
                <InlineCitationSource
                  title={sourceTitle}
                  url={href}
                  external={external}
                  description={external ? t("Open the source used for this answer.") : t("Open this record in Multideck.")}
                />
              </InlineCitationCarouselItem>
            </InlineCitationCarouselContent>
          </InlineCitationCarousel>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  )
}
