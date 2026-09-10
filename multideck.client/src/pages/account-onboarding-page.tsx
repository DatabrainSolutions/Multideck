import { AccountOnboarding } from "@/components/multideck/account-onboarding"

export function AccountOnboardingPage({ navigate }: { navigate: (path: string) => void }) {
  return <AccountOnboarding navigate={navigate} />
}
