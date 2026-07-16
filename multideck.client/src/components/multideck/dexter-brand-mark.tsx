import multideckLogoMark from "@/assets/brand/multideck-logo-mark.svg"
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { cn } from "@/lib/utils"

export function DexterBrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative grid size-7 place-items-center", className)}
    >
      <span
        className="md-dexter-brand-mark__shader"
        style={{ WebkitMaskImage: `url(${multideckLogoMark})`, maskImage: `url(${multideckLogoMark})` }}
      >
        <SpectralBloomShader tone="brand" />
      </span>
    </span>
  )
}
