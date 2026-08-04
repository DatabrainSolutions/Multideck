
// @ts-nocheck
import {
  BUCKET,
  HttpError,
  allowedExtensions,
  bodyObject,
  bool,
  clean,
  companyFacilityIds,
  cors,
  id,
  many,
  numberOrNull,
  one,
  oneOrNull,
  requireCapability,
  requireCustomerScope,
  requireInternal,
  required,
  uuid,
} from "../shared/mod.ts";
import { orderContext } from "./orders.ts";

export async function handlePortal(request, path, admin, actor) {
  const context = await orderContext(admin, actor);
  if (request.method === "GET" && path[1] === "reference") {
    return {
      roles: [
        {
          code: "warehouse_viewer",
          name: "Warehouse viewer",
          description: "View own inventory, items, and orders."
        },
        {
          code: "warehouse_operator",
          name: "Warehouse customer operator",
          description: "Manage own items and create warehouse requests."
        },
        {
          code: "warehouse_customer_admin",
          name: "Warehouse customer administrator",
          description: "Full self-service and user administration."
        }
      ],
      facilities: context.facilities.map((r)=>({
          id: r.WMSFacility_ID,
          code: r.WMSFacility_Code,
          name: r.WMSFacility_Name
        }))
    };
  }
  const customerOrgId = path[1] === "customers" ? uuid(path[2], "customer") : null;
  if (request.method === "GET" && path[3] === "users") {
    if (!customerOrgId) throw new HttpError(400, "Choose a customer.");
    if (!actor.companyId) {
      requireCapability(actor, "warehouse_users:manage");
      if (!actor.organisationIds.has(customerOrgId)) {
        throw new HttpError(403, "You can only manage users for your organisation.");
      }
    }
    const { data, error } = await admin.rpc("warehouse_edge_portal_users", {
      p_customer_org_id: customerOrgId
    });
    if (error) throw new HttpError(500, error.message);
    return data ?? [];
  }
  if (!actor.companyId) requireCapability(actor, "warehouse_users:manage");
  else requireInternal(actor);
  const input = request.method === "DELETE" ? {} : bodyObject(await request.json()), action = path[1] === "invitations" ? "invite" : request.method === "PUT" ? "update" : request.method === "DELETE" ? "revoke" : null;
  if (!action) throw new HttpError(404, "Warehouse portal endpoint not found.");
  if (action === "invite") {
    const email = clean(input.email, 320)?.toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, "Enter a valid customer email address.");
    }
    const existing = await oneOrNull(admin.from("Portal_Users").select("PortalUser_ID").ilike("PortalUser_Email", email).maybeSingle());
    if (!existing) {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: clean(input.displayName, 180) ?? email,
          account_type: "Warehouse customer"
        }
      });
      if (inviteError || !invited.user) {
        throw new HttpError(409, inviteError?.message ?? "The customer invitation could not be created.");
      }
      input.authUserId = invited.user.id;
      input.email = email;
    }
  }
  const { data, error } = await admin.rpc("warehouse_edge_portal_mutation", {
    p_action: action,
    p_customer_org_id: customerOrgId ?? input.customerOrgId,
    p_portal_user_id: path[4] ?? null,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_actor_portal_user_id: actor.portalUserId
  });
  if (error) {
    throw new HttpError(error.message.includes("WMS400:") ? 400 : error.message.includes("WMS409:") ? 409 : 500, error.message.replace(/^.*WMS(?:400|409):\s*/, ""));
  }
  return data;
}
