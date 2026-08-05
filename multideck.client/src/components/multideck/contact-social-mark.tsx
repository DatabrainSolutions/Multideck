import { Globe, Mail, MessageCircle, Phone } from "lucide-react"
import facebookLogo from "@/assets/auth/facebook.svg"
import linkedinLogo from "@/assets/auth/linkedin.svg"
import type { CardSocialKind } from "@/data/contact-card-data"
import { cn } from "@/lib/utils"

export function ContactSocialMark({ kind, className }: { kind: CardSocialKind; className?: string }) {
  if (kind === "linkedin" || kind === "facebook") {
    return (
      <img
        src={kind === "linkedin" ? linkedinLogo : facebookLogo}
        alt=""
        aria-hidden="true"
        className={cn("size-4 rounded-[3px] object-contain", className)}
      />
    )
  }

  if (kind === "instagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={cn("size-4", className)}>
        <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.55" cy="6.65" r="1.15" fill="currentColor" />
      </svg>
    )
  }

  if (kind === "whatsapp") {
    return (
      <span aria-hidden="true" className={cn("relative block size-4", className)}>
        <MessageCircle className="absolute inset-0 size-full" strokeWidth={1.75} />
        <Phone className="absolute left-[4px] top-[4px] size-2" strokeWidth={2} />
      </span>
    )
  }

  const Icon = kind === "email" ? Mail : Globe
  return <Icon aria-hidden="true" className={cn("size-4", className)} strokeWidth={1.7} />
}
