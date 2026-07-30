import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      className="toaster group md-toaster"
      icons={{
        success: (
          <CircleCheckIcon className="size-4.5" strokeWidth={1.5} />
        ),
        info: (
          <InfoIcon className="size-4.5" strokeWidth={1.5} />
        ),
        warning: (
          <TriangleAlertIcon className="size-4.5" strokeWidth={1.5} />
        ),
        error: (
          <OctagonXIcon className="size-4.5" strokeWidth={1.5} />
        ),
        loading: (
          <Loader2Icon className="size-4.5 animate-spin" strokeWidth={1.5} />
        ),
      }}
      style={
        {
          "--normal-bg": "color-mix(in srgb, var(--md-surface) 92%, transparent)",
          "--normal-text": "var(--md-ink)",
          "--normal-border": "transparent",
          "--border-radius": "var(--md-radius-xl)",
          "--width": "min(520px, calc(100vw - 32px))",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast md-toast",
          icon: "md-toast-icon",
          title: "md-toast-title",
          description: "md-toast-description",
          actionButton: "md-toast-action",
          cancelButton: "md-toast-cancel",
          closeButton: "md-toast-close",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
