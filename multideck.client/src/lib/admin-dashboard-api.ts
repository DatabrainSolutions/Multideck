import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"
import type { CommercialFlow } from "./workspace-usage-model"

type Summary = {
  leads: number
  customers: number
  bookings: number
  repeatCustomers: number
  bookingCustomers: number
  wonQuotes: number
  lostQuotes: number
  pendingQuotes: number
  activeUsers: number
  activeSeconds: number
  idleSeconds: number
}
export type AdminDashboardData = {
  generatedAt: string
  period: { from: string; to: string; timeZone: "UTC" }
  permissions: {
    crm: boolean
    customers: boolean
    quotes: boolean
    bookings: boolean
    documents: boolean
    finance: boolean
  }
  summary: Summary
  previous: Summary
  coverage: {
    usageRetainedFrom?: string
    previousUsageComplete?: boolean
    trackingStartedAt: string | null
    estimatedBookingDates: number
    undatedQuoteOutcomes: number
    unpricedWins: number
  }
  customers: { id: string; name: string; bookings: number; route: string }[]
  modes: { key: string; count: number }[]
  countries: { code: string | null; count: number }[]
  prices: {
    currency: string
    average: number
    median: number
    sample: number
  }[]
  lossReasons: { label: string; count: number }[]
  quoteFunnel: {
    sent: number
    responded: number
    accepted: number
    booked: number
  }
  leadFunnel: {
    created: number
    responded: number
    converted: number
    responseHours: number | null
    overdueFollowUps: number
  }
  workflows: {
    flow: CommercialFlow
    started: number
    completed: number
    cancelled: number
    unfinished: number
    pending: number
    errors: number
  }[]
  workflowSteps: { flow: CommercialFlow; step: string; count: number }[]
  users: {
    id: string
    name: string
    activeSeconds: number
    idleSeconds: number
    days: number
    aiRequests: number
    aiTokens: number
    aiCost: number
    enabled: boolean
  }[]
  modules: {
    key: string
    activeSeconds: number
    idleSeconds: number
    users: number
  }[]
  ai: {
    requests: number
    failed: number
    tokens: number
    cost: number
    purposes: { key: string; count: number }[]
  }
  system: {
    failedDocuments: number
    blockedAccounting: number
    unmappedDestinations: number
  }
  trend: {
    day: string
    leads: number
    customers: number
    bookings: number
    won: number
    lost: number
    activeSeconds: number
    idleSeconds: number
    aiRequests: number
    modes: Record<string, number>
  }[]
}

export async function getAdminDashboard(
  input: { from: string; to: string },
  signal?: AbortSignal,
): Promise<AdminDashboardData> {
  const session = await getSupabaseSession()
  if (!session?.access_token)
    throw Object.assign(new Error("Sign in again to continue."), {
      status: 401,
    })
  const response = await edgeFetch(
    "admin-dashboard",
    `?${new URLSearchParams(input)}`,
    session.access_token,
    { signal },
  )
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw Object.assign(
      new Error(
        data?.detail ?? "Workspace analytics could not be loaded. Try again.",
      ),
      { status: response.status },
    )
  // Fail visibly if an incompatible deployment responds, rather than filling missing metrics with zero.
  return validateAdminDashboard(data, input)
}

export function validateAdminDashboard(
  data: unknown,
  input: { from: string; to: string },
): AdminDashboardData {
  const report = data as AdminDashboardData | null
  const arrays = [
    "trend",
    "customers",
    "modes",
    "countries",
    "prices",
    "lossReasons",
    "workflows",
    "workflowSteps",
    "users",
    "modules",
  ] as const
  const summaries = [
    "leads",
    "customers",
    "bookings",
    "repeatCustomers",
    "bookingCustomers",
    "wonQuotes",
    "lostQuotes",
    "pendingQuotes",
    "activeUsers",
    "activeSeconds",
    "idleSeconds",
  ] as const
  if (
    !report ||
    !report.permissions ||
    !report.coverage ||
    !report.ai ||
    !report.system ||
    !report.quoteFunnel ||
    !report.leadFunnel ||
    !Number.isFinite(Date.parse(report.generatedAt)) ||
    report.period?.from !== input.from ||
    report.period?.to !== input.to ||
    report.period.timeZone !== "UTC" ||
    arrays.some((key) => !Array.isArray(report[key])) ||
    !Array.isArray(report.ai.purposes) ||
    [report.summary, report.previous].some(
      (summary) =>
        !summary ||
        summaries.some(
          (key) => !Number.isFinite(summary[key]) || summary[key] < 0,
        ),
    )
  ) {
    throw new Error(
      "The analytics service returned an incomplete report. Try again.",
    )
  }
  return report
}

/** Complete UTC days make the previous-period comparison meaningful. */
export function adminReportingPeriod(days: number, now = new Date()) {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  )
  const from = new Date(to.getTime() - (days - 1) * 86_400_000)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}
