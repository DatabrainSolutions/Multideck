// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { handleDocuments } from "./routes/documents.ts";
import { handleFacilities } from "./routes/facilities.ts";
import { handleInventory } from "./routes/inventory.ts";
import { handleItems } from "./routes/items.ts";
import { handleLocations } from "./routes/locations.ts";
import { handleOrders } from "./routes/orders.ts";
import { handlePortal } from "./routes/portal-users.ts";
import { MAX_BODY_BYTES, HttpError, cors, json, resolveActor } from "./shared/mod.ts";

Deno.serve(async (request)=>{
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: cors(request)
    });
  }
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      throw new HttpError(413, "The warehouse request is too large.");
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim(), anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim(), serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (!supabaseUrl || !anonKey || !serviceRole) {
      throw new HttpError(503, "Warehouse services are temporarily unavailable.");
    }
    const authorization = request.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      throw new HttpError(401, "Sign in again to manage the warehouse.");
    }
    const userDb = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authorization
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }), admin = createClient(supabaseUrl, serviceRole, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }), actor = await resolveActor(userDb, admin), url = new URL(request.url);
    const marker = "/warehouse/", pathname = url.pathname.includes(marker) ? url.pathname.split(marker)[1] : "", path = pathname.split("/").filter(Boolean);
    let result;
    if (path[0] === "facilities" && path.includes("locations")) {
      result = await handleLocations(request, path, url, admin, actor);
    } else if (path[0] === "facilities") {
      result = await handleFacilities(request, path, url, admin, actor);
    } else if (path[0] === "items") {
      result = await handleItems(request, path, url, admin, actor);
    } else if (path[0] === "inventory") {
      result = await handleInventory(path, url, admin, actor);
    } else if (path[0] === "orders" && path[2] === "documents") {
      result = await handleDocuments(request, path, admin, actor);
    } else if (path[0] === "orders") {
      result = await handleOrders(request, path, url, admin, actor);
    } else if (path[0] === "portal") {
      result = await handlePortal(request, path, admin, actor);
    } else throw new HttpError(404, "Warehouse endpoint not found.");
    if (result instanceof Response) return result;
    return json(request, result, result === undefined ? 204 : request.method === "POST" ? 201 : 200);
  } catch (error) {
    if (error instanceof HttpError) {
      return json(request, {
        title: error.status === 409 ? "Conflict" : "Warehouse request failed",
        detail: error.message,
        errors: error.errors
      }, error.status);
    }
    console.error("Warehouse Edge Function failed", error instanceof Error ? error.message : "unknown");
    return json(request, {
      title: "Warehouse service unavailable",
      detail: "The warehouse service could not complete this request. Try again."
    }, 500);
  }
});
