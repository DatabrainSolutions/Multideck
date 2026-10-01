// Reviewed Draft-only sources. Changed Word bytes require a fresh privacy,
// layout and mapping review; a matching display name is not approval.
export const transportDraftSourceHashes: Record<string, string> = {
  MAWB: "01c023ed81c54b982cb02f439e3549a0844a731abbe01bcdb1fb0e1b1538cc32",
  MNG_AWB: "bc11f94686b5c8ee17678d4f6388ca95dd3b5a2588adb3c7d412f98bfacbda2f",
  JE2648771_FBL_MULTIMODAL_CTRS_A4260714093859: "7e4ca3982f46813c4965596d74aa8dd0cc3c6077a7cd1b472f81b5d2b7e09319",
  FIATA_BOL_REFERENCE: "262d720e5ebfa367febcfd515f6381e53093c03239d838f1a042302c31689309",
}

export function reviewedTransportSource(code: string, hash: unknown): boolean {
  return Object.hasOwn(transportDraftSourceHashes, code) && hash === transportDraftSourceHashes[code]
}
