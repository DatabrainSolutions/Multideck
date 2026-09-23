export type DexterActivityProvider = "gmail" | "outlook"

/** Public operation summaries only. Never include tool arguments or model reasoning. */
export type DexterActivity = {
  id: string
  label: string
  status: "running" | "completed" | "failed"
  providers: DexterActivityProvider[]
  /** Safe, product-authored failure explanation. Never a raw provider error. */
  detail?: string
}

export function parseDexterActivities(value: unknown): DexterActivity[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 48).flatMap((item): DexterActivity[] => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id
      || typeof item.label !== "string" || !item.label.trim()
      || !["running", "completed", "failed"].includes(item.status)) return []
    return [{
      id: item.id.slice(0, 200), label: item.label.slice(0, 160), status: item.status,
      providers: Array.isArray(item.providers)
        ? [...new Set<DexterActivityProvider>(item.providers.filter((provider: unknown) => provider === "gmail" || provider === "outlook"))] : [],
      ...(item.status === "failed" && typeof item.detail === "string" && item.detail.trim()
        ? { detail: item.detail.trim().slice(0, 500) } : {}),
    }]
  })
}

export function mergeDexterActivity(activities: DexterActivity[] = [], activity: DexterActivity): DexterActivity[] {
  const index = activities.findIndex(item => item.id === activity.id)
  if (index < 0) return [...activities, activity].slice(-48)
  // Replayed stream events must not restart an already settled operation.
  if (activities[index].status !== "running" && activity.status === "running") return activities
  return activities.map((item, position) => position === index ? activity : item)
}
