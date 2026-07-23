import { AuthFlow } from "@/components/multideck/auth-flow"

export function AuthFlowPage({ navigate }: { navigate?: (path: string) => void }) {
  const mode = new URLSearchParams(window.location.search).get("mode")
  return <AuthFlow navigate={navigate} initialStep={mode === "reset-password" ? "reset-password" : "signin"} />
}
