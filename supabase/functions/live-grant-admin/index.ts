const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export async function handler(request: Request): Promise<Response> {
  const headers = {
    "Access-Control-Allow-Origin": request.headers.get("origin") ?? "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "private, no-store",
  };
  const reply = (status: number, detail: unknown) =>
    Response.json(typeof detail === "string" ? { detail } : detail, {
      status,
      headers,
    });
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (!["GET", "POST"].includes(request.method)) {
    return reply(405, "Grant action unavailable.");
  }
  const org = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!uuid.test(org)) return reply(400, "Choose a customer.");
  try {
    const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, ""),
      service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) {
      return reply(503, "Grant administration is not configured.");
    }
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      return reply(401, "Sign in to manage customer grants.");
    }
    const auth = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: service, Authorization: authorization },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!auth.ok) return reply(401, "Sign in to manage customer grants.");
    const user = await auth.json();
    if (!uuid.test(user.id ?? "")) return reply(401, "Sign in again.");
    const call = (path: string, body?: unknown) =>
      fetch(`${url}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          apikey: service,
          Authorization: `Bearer ${service}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    const contextResponse = await call(
      "/rest/v1/rpc/warehouse_edge_internal_actor_context",
      { p_auth_user_id: user.id },
    );
    if (!contextResponse.ok) {
      return reply(503, "App permission data is unavailable.");
    }
    const actor = await contextResponse.json();
    const write = request.method === "POST";
    if (
      !actor?.companyId || !actor.userId ||
      (actor.accessStatus && actor.accessStatus !== "active") ||
      !Array.isArray(actor.facilityIds) || !Array.isArray(actor.permissions) ||
      !actor.permissions.includes(write ? "Users.Manage" : "Users.Read") ||
      !(write
        ? actor.permissions.includes("Warehouse.Write")
        : actor.permissions.includes("Warehouse.Read") ||
          actor.permissions.includes("Warehouse.Write"))
    ) {
      return reply(
        403,
        "Your App permissions do not allow customer grant administration.",
      );
    }
    let input = null;
    if (write) {
      const training = await call(
        "/rest/v1/training_configuration?select=singleton&singleton=eq.true",
      );
      if (!training.ok) {
        return reply(503, "The workspace environment could not be verified.");
      }
      const trainingRows = await training.json();
      if (!Array.isArray(trainingRows)) {
        return reply(503, "The workspace environment could not be verified.");
      }
      if (trainingRows.length) {
        return reply(403, "Manage customer grants in Main.");
      }
      const reader = request.body?.getReader();
      if (!reader) return reply(400, "Grant details required.");
      let length = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 16384) {
            await reader.cancel();
            return reply(413, "Grant request too large.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        input = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        return reply(400, "Invalid grant request.");
      }
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return reply(400, "Invalid grant request.");
      }
      const keys = JSON.parse(Deno.env.get("LIVE_GATEWAY_KEYS") ?? "{}");
      if (
        input.enabled !== false &&
        (!Object.hasOwn(keys, input.keyId) ||
          typeof keys[input.keyId] !== "string" ||
          keys[input.keyId].length < 32)
      ) {
        return reply(
          400,
          "Configure this dedicated Live key on App before enabling the grant.",
        );
      }
    }
    const response = await call("/rest/v1/rpc/live_gateway_admin_grants", {
      p_actor_id: actor.userId,
      p_organisation_id: org,
      p_facility_ids: actor.facilityIds,
      p_input: input,
    });
    const result = await response.json();
    if (!response.ok) {
      return reply(
        result.code === "42501"
          ? 403
          : result.code === "40001"
          ? 409
          : ["22023", "22P02", "23505"].includes(result.code)
          ? 400
          : 503,
        "The customer grant could not be saved or loaded. Check its details and refresh.",
      );
    }
    return reply(200, result);
  } catch {
    return reply(
      503,
      "Customer grant administration is temporarily unavailable.",
    );
  }
}
if (import.meta.main) Deno.serve(handler);
