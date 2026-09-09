import { assertEquals, assertMatch, assertThrows } from "jsr:@std/assert@1"
import {
  assertCompetitorQuote,
  parseDeclineReason,
  isQuoteResponseOriginAllowed,
  parseDecision,
  parseMessage,
  parseQuoteResponseOrigin,
  parseToken,
  safeFileName,
  sha256Hex,
} from "./core.ts"

Deno.test("customer response CORS accepts App tenant slugs and local port 3000 only", () => {
  assertEquals(parseQuoteResponseOrigin("https://dev.multideck.app"), "https://dev.multideck.app")
  assertEquals(parseQuoteResponseOrigin("https://jenkar.multideck.app"), "https://jenkar.multideck.app")
  assertEquals(parseQuoteResponseOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000")
  assertEquals(isQuoteResponseOriginAllowed("http://localhost:3000"), true)
  assertEquals(isQuoteResponseOriginAllowed("https://multideck.app"), false)
  assertEquals(isQuoteResponseOriginAllowed("https://another.multideck.live"), false)
  assertEquals(isQuoteResponseOriginAllowed(null), false)
  assertThrows(() => parseQuoteResponseOrigin("https://portal.example.test"))
})

Deno.test("quote responses accept only explicit single-use decisions", () => {
  assertEquals(parseDecision("accepted"), "accepted")
  assertEquals(parseDecision("challenged"), "challenged")
  assertThrows(() => parseDecision("viewed"))
  assertEquals(parseToken("a".repeat(43)), "a".repeat(43))
  assertThrows(() => parseToken("too-short"))
})

Deno.test("declines require a locked reason while change requests require context", () => {
  assertEquals(parseMessage("", "accepted"), null)
  assertEquals(parseMessage("", "declined"), null)
  assertEquals(parseMessage("Please review transit time", "challenged"), "Please review transit time")
  assertThrows(() => parseMessage("", "challenged"))
  assertEquals(parseDeclineReason("cost_too_high", "declined"), "cost_too_high")
  assertThrows(() => parseDeclineReason("", "declined"))
  assertThrows(() => parseDeclineReason("cost_too_high", "accepted"))
})

Deno.test("optional competitor quotes are bounded and safely named", () => {
  assertEquals(safeFileName("../ competitor\\quote.pdf"), "..- competitor-quote.pdf")
  assertCompetitorQuote(new File(["pdf"], "quote.pdf", { type: "application/pdf" }))
  assertThrows(() => assertCompetitorQuote(new File(["text"], "quote.txt", { type: "text/plain" })))
})

Deno.test("public tokens are hashed before database access", async () => {
  const hash = await sha256Hex("secure-token")
  assertMatch(hash, /^[0-9a-f]{64}$/)
  assertEquals(hash, await sha256Hex("secure-token"))
})
