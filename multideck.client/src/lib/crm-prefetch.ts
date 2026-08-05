import { listCustomers, listContacts } from "@/lib/customer-api"
import { listDeals } from "@/lib/deal-api"
import { listLeads } from "@/lib/lead-api"
import { getPipelineSettings } from "@/lib/pipeline-api"

let prefetch: Promise<unknown> | null = null

/** Starts the four core sales reads together and shares them with route loaders. */
export function prefetchCrmCollections() {
  if (!prefetch) {
    prefetch = Promise.allSettled([
      listCustomers(),
      listContacts(),
      listLeads(),
      listDeals(),
      getPipelineSettings(),
    ]).finally(() => {
      prefetch = null
    })
  }

  return prefetch
}
