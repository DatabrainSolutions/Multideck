import { useState } from "react"
import type { PublicBranding } from "@/lib/public-brand-theme"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"

/** Bounded customer-facing identity; failed or removed logos reveal the name. */
export function PublicBrandIdentity({ brand }: { brand?: PublicBranding | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const logo = brand?.logoUrl && brand.logoUrl !== failedUrl ? brand.logoUrl : null
  return <div className="flex min-h-11 w-full min-w-0 max-w-[200px] items-center">
    {logo ? <img key={logo} src={logo} alt={brand?.displayName || "Company logo"} onError={() => setFailedUrl(logo)} className="block h-auto w-auto max-h-11 min-w-0 max-w-full object-contain object-left" />
      : brand ? <span className="break-words text-[17px] font-medium leading-6 text-[var(--brand-ink,var(--md-ink))]">{brand.displayName}</span>
        : <img src={multideckFullLogo} alt="Multideck" className="h-auto max-h-7 w-full max-w-[160px] object-contain object-left" />}
  </div>
}
