import { describe, expect, it } from "vitest"

import { canRecoverFromPreloadError } from "../src/lib/deployment-recovery"

describe("deployment preload recovery", () => {
  it("allows the first stale-chunk recovery", () => {
    expect(canRecoverFromPreloadError(null, 120_000)).toBe(true)
  })

  it("prevents a reload loop while a deployment is still settling", () => {
    expect(canRecoverFromPreloadError(90_000, 120_000)).toBe(false)
  })

  it("allows a later deployment to recover independently", () => {
    expect(canRecoverFromPreloadError(10_000, 120_000)).toBe(true)
  })
})
