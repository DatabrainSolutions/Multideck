import { handler } from "../functions/live-grant-admin/index.ts";
const assert = (v: unknown) => {
  if (!v) throw new Error("Assertion failed");
};
Deno.test("Grant administration requires App identity, warehouse and user permissions, and denies Training writes", async () => {
  const original = fetch;
  Deno.env.set("SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
  Deno.env.set(
    "LIVE_GATEWAY_KEYS",
    JSON.stringify({
      "key-a": "synthetic-long-integration-secret-for-testing",
    }),
  );
  let permissions = ["Users.Manage", "Users.Read", "Warehouse.Write"],
    training = false,
    mutations = 0;
  const actorId = "00000000-0000-4000-8000-000000000101",
    orgId = "00000000-0000-4000-8000-000000000201";
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: actorId });
    }
    if (String(url).endsWith("/warehouse_edge_internal_actor_context")) {
      return Response.json({
        companyId: "company",
        userId: actorId,
        accessStatus: "active",
        facilityIds: ["facility-a"],
        permissions,
      });
    }
    if (String(url).includes("/training_configuration")) {
      return Response.json(training ? [{ singleton: true }] : []);
    }
    assert(String(url).endsWith("/live_gateway_admin_grants"));
    const body = JSON.parse(String(options?.body));
    assert(body.p_actor_id === actorId);
    assert(body.p_facility_ids.length === 1);
    assert(body.p_organisation_id === orgId);
    mutations++;
    return Response.json({ id: "grant-a" });
  };
  const request = () =>
    new Request(
      `https://abcdefghijklmnopqrst.supabase.co/functions/v1/live-grant-admin/${orgId}`,
      {
        method: "POST",
        headers: { authorization: "Bearer verified-app-user" },
        body: JSON.stringify({ keyId: "key-a", enabled: true }),
      },
    );
  try {
    assert((await handler(request())).status === 200);
    assert(mutations === 1);
    permissions = ["Warehouse.Write"];
    assert((await handler(request())).status === 403);
    assert(mutations === 1);
    permissions = ["Users.Manage", "Warehouse.Write"];
    training = true;
    assert((await handler(request())).status === 403);
    assert(mutations === 1);
    assert(
      (await handler(
        new Request(`https://app.example/live-grant-admin/${orgId}`),
      )).status === 401,
    );
  } finally {
    globalThis.fetch = original;
  }
});
