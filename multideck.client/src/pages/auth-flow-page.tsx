import { AuthFlow } from "@/components/multideck/auth-flow"
import { AccountOnboarding } from "@/components/multideck/account-onboarding"

export function AuthFlowPage({ navigate }: { navigate?: (path: string) => void }) {
  const mode = new URLSearchParams(window.location.search).get("mode")
  if (mode === "invite") return <AccountOnboarding invite navigate={navigate ?? ((path) => window.location.assign(path))} />
  return <AuthFlow navigate={navigate} initialStep={mode === "reset-password" ? "reset-password" : mode === "invite" ? "accept-invite" : "signin"} />
}
