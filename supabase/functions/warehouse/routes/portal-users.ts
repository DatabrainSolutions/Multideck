
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
  const action = request.method === "POST" && path[1] === "invitations"
    ? "invite"
    : request.method === "POST" && path[1] === "customers" && path[3] === "users" && path[5] === "access-link"
    ? "access-link"
    : request.method === "PUT"
    ? "update"
    : request.method === "DELETE"
    ? "revoke"
    : null;
  if (!action) throw new HttpError(404, "Warehouse portal endpoint not found.");
  const input = action === "invite" || action === "update" ? bodyObject(await request.json()) : {};
  const targetCustomerOrgId = customerOrgId ?? uuid(input.customerOrgId, "customer");
  if (!actor.companyId) {
    requireCapability(actor, "warehouse_users:manage");
    if (!actor.organisationIds.has(targetCustomerOrgId)) {
      throw new HttpError(403, "You can only manage users for your organisation.");
    }
  } else requireInternal(actor);

  if (action === "access-link") {
    const portalUserId = uuid(path[4], "portal user");
    const { data: customerUsers, error: usersError } = await admin.rpc("warehouse_edge_portal_users", {
      p_customer_org_id: targetCustomerOrgId
    });
    if (usersError) throw new HttpError(500, usersError.message);
    const portalUser = Array.isArray(customerUsers) ? customerUsers.find((user)=>user?.id === portalUserId) : null;
    if (!portalUser?.email) throw new HttpError(404, "This customer portal user does not exist.");
    return await deliverPortalAccessLink(admin, actor, targetCustomerOrgId, portalUserId, portalUser.email);
  }
  let inviteEmail = null;
  let shouldDeliverAccessLink = false;
  if (action === "invite") {
    const email = clean(input.email, 320)?.toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, "Enter a valid customer email address.");
    }
    inviteEmail = email;
    const existing = await oneOrNull(admin.from("Portal_Users").select("PortalUser_ID").ilike("PortalUser_Email", email).maybeSingle());
    if (existing) {
      shouldDeliverAccessLink = true;
    } else {
      const { data: existingAuthUserId, error: authLookupError } = await admin.rpc("warehouse_edge_auth_user_id_by_email", {
        p_email: email
      });
      if (authLookupError) throw new HttpError(500, authLookupError.message);
      if (existingAuthUserId) {
        input.authUserId = existingAuthUserId;
        shouldDeliverAccessLink = true;
      } else {
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
      }
      input.email = email;
    }
  }
  const { data, error } = await admin.rpc("warehouse_edge_portal_mutation", {
    p_action: action,
    p_customer_org_id: targetCustomerOrgId,
    p_portal_user_id: path[4] ? uuid(path[4], "portal user") : null,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_actor_portal_user_id: actor.portalUserId
  });
  if (error) {
    throw new HttpError(error.message.includes("WMS400:") ? 400 : error.message.includes("WMS409:") ? 409 : 500, error.message.replace(/^.*WMS(?:400|409):\s*/, ""));
  }
  if (action === "invite" && shouldDeliverAccessLink && inviteEmail && data?.user?.id) {
    await deliverPortalAccessLink(admin, actor, targetCustomerOrgId, data.user.id, inviteEmail);
  }
  return data;
}

async function deliverPortalAccessLink(admin, actor, customerOrgId, portalUserId, email) {
  const portalProfile = await one(admin.from("Portal_Users").select("PortalUser_DefaultSiteID").eq("PortalUser_ID", portalUserId).single());
  const { data: audit, error: auditError } = await admin.from("Portal_AuditEvents").insert({
    PortalAudit_EventTypeCode: "access_link_delivery",
    PortalAudit_SiteID: portalProfile.PortalUser_DefaultSiteID,
    PortalAudit_PortalUserID: actor.portalUserId,
    PortalAudit_OrgID: customerOrgId,
    PortalAudit_ResourceTypeCode: "warehouse_users",
    PortalAudit_TargetTable: "Portal_Users",
    PortalAudit_TargetID: portalUserId,
    PortalAudit_ResultCode: "requested",
    PortalAudit_Message: "Warehouse portal access link requested",
    PortalAudit_MetadataJSON: { actorUserId: actor.userId }
  }).select("PortalAudit_ID").single();
  if (auditError || !audit) throw new HttpError(500, "The access-link request could not be audited.");
  const configuredAppUrl = Deno.env.get("APP_URL")?.trim() || "https://dev.multideck.app";
  const redirectTo = new URL("/auth", configuredAppUrl).toString();
  const { error: deliveryError } = await admin.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false }
  });
  const { error: auditUpdateError } = await admin.from("Portal_AuditEvents").update({
    PortalAudit_ResultCode: deliveryError ? "failed" : "sent",
    PortalAudit_Message: deliveryError ? "Warehouse portal access link failed" : "Warehouse portal access link sent",
    PortalAudit_MetadataJSON: { actorUserId: actor.userId, deliveredAt: deliveryError ? null : new Date().toISOString() }
  }).eq("PortalAudit_ID", audit.PortalAudit_ID);
  if (auditUpdateError) console.error("Warehouse access-link audit update failed", auditUpdateError.message);
  if (deliveryError) {
    console.error("Warehouse access-link delivery failed", deliveryError.message);
    throw new HttpError(deliveryError.status === 429 ? 429 : 502, "The access link could not be sent. Try again in a moment.");
  }
  return { delivered: true };
}
