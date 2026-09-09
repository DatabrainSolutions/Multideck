import { listAccountsPage, listContactsPage } from "@/lib/customer-api"
import { listDealsPage } from "@/lib/deal-api"
import { listLeadsPage } from "@/lib/lead-api"
import { getPipelineSettings } from "@/lib/pipeline-api"

let prefetch: Promise<unknown> | null = null

/** Starts the four core sales reads together and shares them with route loaders. */
export function prefetchCrmCollections() {
  if (!prefetch) {
    prefetch = Promise.allSettled([
      listAccountsPage({ limit: 50, offset: 0 }),
      listContactsPage({ limit: 50, offset: 0 }),
      listLeadsPage({ limit: 50, offset: 0 }),
      listDealsPage({ limit: 50, offset: 0 }),
      getPipelineSettings(),
    ]).finally(() => {
      prefetch = null
    })
  }

  return prefetch
}
