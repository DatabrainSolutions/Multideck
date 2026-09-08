import { ReportingWorkspace } from "@/components/multideck/reporting-workspace"

export function ReportsPage({ route, navigate }: { route: string; navigate: (path: string) => void }) {
  return <ReportingWorkspace route={route} navigate={navigate} />
}
