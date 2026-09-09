import { useTheme } from "@/lib/theme-provider"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { Loader2Icon } from "@/components/icons/hugeicons"
import toastErrorIcon from "@/assets/toasts/toast-error.png"
import toastGeneralIcon from "@/assets/toasts/toast-general.png"
import toastSuccessIcon from "@/assets/toasts/toast-success.png"
import { useLanguage } from "@/i18n/language-provider"

const toastLifetimeMs = 5_000

function ToastStatusIcon({ src, kind }: { src: string; kind: "success" | "general" | "warning" | "error" }) {
  return <img aria-hidden="true" alt="" className="md-toast-status-art" data-toast-icon-kind={kind} src={src} />
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const { direction, t } = useLanguage()

  const icons = {
    success: <ToastStatusIcon src={toastSuccessIcon} kind="success" />,
    info: <ToastStatusIcon src={toastGeneralIcon} kind="general" />,
    warning: <ToastStatusIcon src={toastErrorIcon} kind="warning" />,
    error: <ToastStatusIcon src={toastErrorIcon} kind="error" />,
    loading: <Loader2Icon className="size-5 animate-spin" strokeWidth={1.5} />,
    close: <span className="md-toast-dismiss-label">{t("Dismiss")}</span>,
    normal: <ToastStatusIcon src={toastGeneralIcon} kind="general" />,
    default: <ToastStatusIcon src={toastGeneralIcon} kind="general" />,
  } as ToasterProps["icons"] & Record<"normal" | "default", React.ReactNode>

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      dir={direction}
      duration={toastLifetimeMs}
      visibleToasts={4}
      gap={12}
      closeButton
      containerAriaLabel={t("Notifications")}
      className="toaster group md-toaster"
      icons={icons}
      style={
        {
          "--normal-bg": "color-mix(in srgb, var(--md-surface) 94%, transparent)",
          "--normal-text": "var(--md-ink)",
          "--normal-border": "transparent",
          "--border-radius": "var(--md-radius-2xl)",
          "--width": "min(520px, calc(100vw - 32px))",
          "--md-toast-duration": `${toastLifetimeMs}ms`,
        } as React.CSSProperties
      }
      toastOptions={{
        closeButtonAriaLabel: t("Dismiss notification"),
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
