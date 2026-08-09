import { assertEquals } from "jsr:@std/assert@1/equals"
import { isClearlyOffTopicPrompt } from "../functions/agent-dexter/scope-guard.ts"

Deno.test("hard scope guard catches the reported recipe and sports examples", () => {
  assertEquals(isClearlyOffTopicPrompt("Can you give me a recipe for a cupcake?"), true)
  assertEquals(isClearlyOffTopicPrompt("When's the next rugby game?"), true)
  assertEquals(isClearlyOffTopicPrompt("Recommend a film for tonight"), true)
  assertEquals(isClearlyOffTopicPrompt("Can you give me relationship advice?"), true)
})

Deno.test("hard scope guard preserves freight context and ordinary useful requests", () => {
  assertEquals(isClearlyOffTopicPrompt("Arrange freight for a shipment of rugby equipment"), false)
  assertEquals(isClearlyOffTopicPrompt("Extract the recipe ingredients for this food cargo customs entry"), false)
  assertEquals(isClearlyOffTopicPrompt("When is the next carrier sailing for booking MD-1042?"), false)
  assertEquals(isClearlyOffTopicPrompt("Translate this customer update into French"), false)
  assertEquals(isClearlyOffTopicPrompt("Hello Dexter"), false)
})
