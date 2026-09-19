import assert from "node:assert/strict";
import { createTariffClient } from "./customs-tariff-reference.mts";

const request = { code: "7323930010", origin: "CN", date: "2026-09-15", dataset: "uk" as const };
const fixture = () => Deno.readTextFile(new URL("../../tests/fixtures/customs-ironing-board-cn-20260915.json", import.meta.url));

Deno.test("unconfigured tariff uses official public source without credentials and retains exact provenance", async () => {
  const raw = await fixture(), calls: { url: string; options?: RequestInit }[] = [];
  const client = createTariffClient({ clientId: "", clientSecret: "" }, ((url, options) => {
    calls.push({ url: String(url), options });
    return Promise.resolve(new Response(raw));
  }) as typeof fetch);
  const result = await client(request);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).hostname, "www.trade-tariff.service.gov.uk");
  assert.equal(new URL(calls[0].url).searchParams.get("filter[geographical_area_id]"), "CN");
  assert.equal(result.sourceUrl, calls[0].url);
  assert.equal(new Headers(calls[0].options?.headers).has("Authorization"), false);
  assert.equal(calls[0].options?.redirect, "error");
  assert.equal(result.measures.filter(m => m.typeCode === "552").length, 7);
  assert.deepEqual(result.raw, JSON.parse(raw));
});

Deno.test("configured authentication failure never silently falls back to public tariff", async () => {
  const urls: string[] = [];
  const client = createTariffClient({ clientId: "test-id", clientSecret: "test-secret" }, (url => {
    urls.push(String(url)); return Promise.resolve(new Response("", { status: 401 }));
  }) as typeof fetch);
  await assert.rejects(client(request), /authentication failed/);
  assert.deepEqual(urls, ["https://auth.id.trade-tariff.service.gov.uk/oauth2/token"]);
  const partial = createTariffClient({ clientId: "test-id", clientSecret: "" }, (() => { throw new Error("Must not fetch"); }) as typeof fetch);
  await assert.rejects(partial(request), /server-side API credentials/);
});

Deno.test("public lookup failures and mismatched commodity graphs do not yield a result", async () => {
  const client = createTariffClient({ clientId: "", clientSecret: "" }, (() => Promise.resolve(new Response("", { status: 503 }))) as typeof fetch);
  await assert.rejects(client(request), /503/);
  const raw = await fixture();
  const mismatch = createTariffClient({ clientId: "", clientSecret: "" }, (() => Promise.resolve(new Response(raw))) as typeof fetch);
  await assert.rejects(mismatch({ ...request, code: "0000000000" }), /different or non-declarable/);
});
