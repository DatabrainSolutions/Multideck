import { useEffect, useState } from "react"
import {
  customsDeclarationMentionItems,
  customerMentionItems,
  dealMentionItems,
  defaultDexterMentionItems,
  emailMentionItems,
  leadMentionItems,
  mergeDexterMentionItems,
  type DexterMentionItem,
} from "@/data/dexter-mentions"
import { listAccountsPage } from "@/lib/customer-api"
import { listCustomsDeclarationDraftsPage } from "@/lib/customs-drafts-api"
import { listDealsPage, type ApiDeal } from "@/lib/deal-api"
import { listLeadsPage } from "@/lib/lead-api"
import { listDexterEmailContextSources } from "@/lib/inbox-api"

export type DexterMentionSources = {
  mentionItems: DexterMentionItem[]
  recentDeals: ApiDeal[]
}

/**
 * Every record an operator can @ in a prompt, gathered from the registers that
 * own them. One register failing must not empty the picker, so each read is
 * settled independently and the groups that did arrive are merged.
 */
export async function loadDexterMentionSources(): Promise<DexterMentionSources> {
  const [customerResult, leadResult, dealResult, declarationResult, emailResult] = await Promise.allSettled([
    listAccountsPage({ limit: 50, offset: 0 }),
    listLeadsPage({ limit: 50, offset: 0 }),
    listDealsPage({ limit: 50, offset: 0, sort: { id: "created", direction: "desc" } }),
    listCustomsDeclarationDraftsPage("export", "standalone", {
      limit: 50,
      offset: 0,
      sort: { id: "lastSaved", direction: "desc" },
    }),
    listDexterEmailContextSources(),
  ])

  return {
    mentionItems: mergeDexterMentionItems(
      customerResult.status === "fulfilled" ? customerMentionItems(customerResult.value.rows) : [],
      leadResult.status === "fulfilled" ? leadMentionItems(leadResult.value.rows) : [],
      dealResult.status === "fulfilled" ? dealMentionItems(dealResult.value.rows) : [],
      declarationResult.status === "fulfilled" ? customsDeclarationMentionItems(declarationResult.value.rows) : [],
      emailResult.status === "fulfilled"
        ? emailMentionItems(emailResult.value)
        : emailMentionItems(null, true),
      defaultDexterMentionItems.filter((mention) => mention.type !== "email"),
    ),
    recentDeals: dealResult.status === "fulfilled" ? dealResult.value.rows : [],
  }
}

/**
 * The same picker on Home and in the Dexter workspace. Home passes `enabled`
 * so the five register reads only happen once the operator actually touches the
 * composer — the launcher should not pay for them on every page load.
 */
export function useDexterMentionSources(enabled = true): DexterMentionSources {
  const [sources, setSources] = useState<DexterMentionSources>({
    mentionItems: defaultDexterMentionItems,
    recentDeals: [],
  })

  useEffect(() => {
    if (!enabled) return
    let active = true
    void loadDexterMentionSources().then((loaded) => {
      if (active) setSources(loaded)
    })
    return () => {
      active = false
    }
  }, [enabled])

  return sources
}
