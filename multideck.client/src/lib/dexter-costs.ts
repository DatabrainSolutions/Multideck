import type { DexterModelId } from "@/data/dexter-models"

export type DexterModelUsage = {
  model: DexterModelId
  providerModel?: string
  reasoningEffort?: "low" | "medium" | "high" | "xhigh"
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

type DexterModelPrice = {
  providerModel: string
  inputPerMillionUsd: number
  outputPerMillionUsd: number
}

/**
 * Standard, uncached API token rates used only for internal development
 * estimates. They intentionally exclude cache, tool, batch and priority fees.
 */
export const dexterModelPrices: Record<DexterModelId, DexterModelPrice> = {
  fast: { providerModel: "GPT-5.6 Luna", inputPerMillionUsd: 1, outputPerMillionUsd: 6 },
  smart: { providerModel: "GPT-5.6 Luna", inputPerMillionUsd: 1, outputPerMillionUsd: 6 },
  worker: { providerModel: "GPT-5.6 Terra", inputPerMillionUsd: 2.5, outputPerMillionUsd: 15 },
}

const dexterProviderModelPrices: Record<string, DexterModelPrice> = {
  "gpt-5.6-luna": dexterModelPrices.fast,
  "gpt-5.6-terra": dexterModelPrices.worker,
}

export function estimateDexterModelCost({ model, providerModel, inputTokens, outputTokens }: DexterModelUsage) {
  const price = dexterProviderModelPrices[providerModel?.toLowerCase() ?? ""] ?? dexterModelPrices[model]
  const inputUsd = (Math.max(0, inputTokens) / 1_000_000) * price.inputPerMillionUsd
  const outputUsd = (Math.max(0, outputTokens) / 1_000_000) * price.outputPerMillionUsd
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd }
}
