import { AuthFlow } from "@/components/multideck/auth-flow"

export function AuthFlowPage({ navigate }: { navigate?: (path: string) => void }) {
  return <AuthFlow navigate={navigate} />
}
