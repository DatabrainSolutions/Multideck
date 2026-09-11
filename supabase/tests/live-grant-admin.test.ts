import { handler } from "../functions/live-grant-admin/index.ts";
Deno.test("Email access resolves trusted identities, retains partial saves, and revokes without Live", async () => {
  const original = fetch,
    actorId = crypto.randomUUID(),
    orgId = crypto.randomUUID(),
    connectionId = crypto.randomUUID(),
    subjectId = crypto.randomUUID();
  Deno.env.set("SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fixture");
  Deno.env.set(
    "LIVE_GATEWAY_KEYS",
    JSON.stringify({
      "key-a": "synthetic-long-integration-secret-for-testing",
    }),
  );
  Deno.env.set(
    "LIVE_PORTAL_CONNECTION",
    JSON.stringify({
      id: connectionId,
      keyId: "key-a",
      projectRef: "zyxwvutsrqponmlkjihg",
    }),
  );
  let fail = true, calls = 0, saved: Record<string, unknown> | null = null;
  globalThis.fetch = async (url, options) => {
    const name = String(url).split("/").at(-1),
      body = options?.body ? JSON.parse(String(options.body)) : null;
    if (name === "user") return Response.json({ id: actorId });
    if (name === "warehouse_edge_internal_actor_context") {
      return Response.json({
        userId: actorId,
        companyId: orgId,
        facilityIds: ["facility-a"],
        permissions: ["Users.Manage", "Warehouse.Write"],
      });
    }
    if (String(url).includes("training_configuration")) {
      return Response.json([]);
    }
    if (name === "live_gateway_admin_grants") {
      if (body.p_input) {
        assert(body.p_input.enabled === false);
        return Response.json({ ...saved, enabled: false });
      }
      return Response.json(saved ? [saved] : []);
    }
    if (name === "live-company-access") {
      calls++;
      if (body.action === "lookup") {
        return Response.json({
          email: "customer@example.test",
          subjectId,
          profiles: [{ id: 1, name: "Customer" }],
        });
      }
      assert(body.subjectId === subjectId);
      return Response.json({}, { status: fail ? 503 : 200 });
    }
    if (name === "live_gateway_admin_email_access") {
      assert(
        body.p_input.subjectId === subjectId &&
          body.p_input.connectionId === connectionId &&
          body.p_live_customer_id === 1,
      );
      saved = {
        id: body.p_input.id,
        enabled: true,
        version: 1,
        subject_id: subjectId,
        connection_id: connectionId,
        live_customer_id: 1,
        live_sync_status: "pending",
      };
      return Response.json(saved);
    }
    if (name === "live_gateway_access_synced") return Response.json(null);
    throw new Error("Unexpected fetch");
  };
  const request = (input: Record<string, unknown>) =>
    new Request(
      `https://abcdefghijklmnopqrst.supabase.co/functions/v1/live-grant-admin/${orgId}`,
      {
        method: "POST",
        headers: { authorization: "Bearer fixture" },
        body: JSON.stringify(input),
      },
    );
  try {
    const input = {
      action: "save",
      id: "grant-a",
      email: "customer@example.test",
      enabled: true,
      subjectId: "untrusted",
      connectionId: "untrusted",
    };
    let response = await handler(request(input));
    assert(response.status === 200);
    assert((await response.json()).live_sync_status === "pending");
    fail = false;
    response = await handler(request(input));
    assert((await response.json()).live_sync_status === "ready");
    const count = calls;
    Deno.env.delete("LIVE_PORTAL_CONNECTION");
    response = await handler(request({ ...input, enabled: false }));
    assert(response.status === 200 && calls === count);
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("LIVE_PORTAL_CONNECTION");
  }
});
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
