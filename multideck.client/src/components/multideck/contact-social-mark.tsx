import {
  FacebookBrand,
  Globe,
  InstagramBrand,
  LinkedinBrand,
  Mail,
  WhatsappBrand,
} from "@/components/icons/hugeicons"
import type { CardSocialKind } from "@/data/contact-card-data"
import { cn } from "@/lib/utils"

export function ContactSocialMark({ kind, className }: { kind: CardSocialKind; className?: string }) {
  const Icon = {
    linkedin: LinkedinBrand,
    facebook: FacebookBrand,
    instagram: InstagramBrand,
    whatsapp: WhatsappBrand,
    email: Mail,
    website: Globe,
  }[kind]
  return <Icon aria-hidden="true" className={cn("size-4", className)} strokeWidth={1.7} />
}
