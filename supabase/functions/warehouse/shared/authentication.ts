
// @ts-nocheck
import { many, one, oneOrNull } from "./database.ts";
import { HttpError } from "./http.ts";
import { permissionValues } from "../../_shared/backend.ts";

const INTERNAL_WAREHOUSE_READ_CAPABILITIES = [
  "warehouse_orders:read",
  "warehouse_inventory:read",
  "warehouse_items:read",
];

const INTERNAL_WAREHOUSE_WRITE_CAPABILITIES = [
  "warehouse_items:manage",
  "warehouse_orders:create_inbound",
  "warehouse_orders:create_outbound",
  "warehouse_orders:cancel",
  "warehouse_documents:upload",
];

const customerFacilityPair = (organisationId, facilityId) => `${organisationId}:${facilityId}`;

export async function resolveActor(userDb, admin) {
  const { data: auth, error } = await userDb.auth.getUser();
  if (error || !auth.user) {
    throw new HttpError(401, "Sign in again to manage the warehouse.");
  }
  const { data: internalContext, error: internalContextError } = await admin.rpc("warehouse_edge_internal_actor_context", {
    p_auth_user_id: auth.user.id
  });
  const fastContextAvailable = !internalContextError;
  if (internalContextError && !["42883", "PGRST202"].includes(internalContextError.code ?? "")) {
    throw new HttpError(500, internalContextError.message);
  }
  if (fastContextAvailable && internalContext && typeof internalContext === "object") {
    const context = internalContext;
    if (!context.companyId) {
      throw new HttpError(403, "Your Multideck user is not assigned to a company yet.");
    }
    if (context.accessStatus && context.accessStatus !== "active") {
      throw new HttpError(403, "Your Multideck access has been deactivated. Contact a workspace administrator.");
    }
    const permissions = new Set(Array.isArray(context.permissions) ? context.permissions.filter((value)=>typeof value === "string") : []);
    const capabilities = new Set();
    if (permissions.has("Warehouse.Read") || permissions.has("Warehouse.Write")) {
      INTERNAL_WAREHOUSE_READ_CAPABILITIES.forEach((capability)=>capabilities.add(capability));
    }
    if (permissions.has("Warehouse.Write")) {
      INTERNAL_WAREHOUSE_WRITE_CAPABILITIES.forEach((capability)=>capabilities.add(capability));
    }
    return {
      authId: auth.user.id,
      userId: context.userId,
      companyId: context.companyId,
      portalUserId: null,
      organisationIds: new Set(),
      manageableOrganisationIds: new Set(),
      facilityIds: new Set(Array.isArray(context.facilityIds) ? context.facilityIds.filter((value)=>typeof value === "string") : []),
      facilityScopeResolved: true,
      customerFacilityPairs: new Set(),
      capabilities,
      permissions
    };
  }
  const internal = fastContextAvailable ? null : await oneOrNull(admin.from("cmp_Users").select("User_ID,Company_ID,User_AccessStatus").eq("Auth_User_ID", auth.user.id).maybeSingle());
  if (internal) {
    if (!internal.Company_ID) {
      throw new HttpError(403, "Your Multideck user is not assigned to a company yet.");
    }
    if (internal.User_AccessStatus && internal.User_AccessStatus !== "active") {
      throw new HttpError(403, "Your Multideck access has been deactivated. Contact a workspace administrator.");
    }
    const permissions = new Set(await permissionValues(admin, internal.User_ID));
    const capabilities = new Set();
    if (permissions.has("Warehouse.Read") || permissions.has("Warehouse.Write")) {
      INTERNAL_WAREHOUSE_READ_CAPABILITIES.forEach((capability)=>capabilities.add(capability));
    }
    if (permissions.has("Warehouse.Write")) {
      INTERNAL_WAREHOUSE_WRITE_CAPABILITIES.forEach((capability)=>capabilities.add(capability));
    }
    return {
      authId: auth.user.id,
      userId: internal.User_ID,
      companyId: internal.Company_ID,
      portalUserId: null,
      organisationIds: new Set(),
      manageableOrganisationIds: new Set(),
      facilityIds: new Set(),
      facilityScopeResolved: false,
      customerFacilityPairs: new Set(),
      capabilities,
      permissions
    };
  }
  const identity = await oneOrNull(admin.from("Portal_ExternalIdentities").select("PortalIdentity_PortalUserID").eq("PortalIdentity_ExternalSubject", auth.user.id).eq("PortalIdentity_StatusCode", "active").maybeSingle());
  if (!identity) {
    throw new HttpError(403, "Your account is not linked to an active Multideck company or customer portal profile.");
  }
  const portalUser = await one(admin.from("Portal_Users").select("PortalUser_ID,PortalUser_StatusCode,PortalUser_IsDeleted").eq("PortalUser_ID", identity.PortalIdentity_PortalUserID).maybeSingle(), "Your portal profile is unavailable.");
  if (portalUser.PortalUser_IsDeleted || portalUser.PortalUser_StatusCode !== "active") throw new HttpError(403, "Your customer portal access is not active.");
  const links = await many(admin.from("Portal_UserOrganisations").select("PortalUserOrg_OrgID,PortalUserOrg_CanManageOrgUsers").eq("PortalUserOrg_PortalUserID", portalUser.PortalUser_ID).eq("PortalUserOrg_StatusCode", "active"));
  const organisationIds = new Set(links.map((row)=>row.PortalUserOrg_OrgID));
  const manageableOrganisationIds = new Set(links
    .filter((row)=>row.PortalUserOrg_CanManageOrgUsers)
    .map((row)=>row.PortalUserOrg_OrgID));
  const accesses = organisationIds.size ? await many(admin.from("WMS_CustomerFacilityAccess").select("WMSCustomerFacilityAccess_CustomerOrgID,WMSCustomerFacilityAccess_FacilityID").in("WMSCustomerFacilityAccess_CustomerOrgID", [
    ...organisationIds
  ]).eq("WMSCustomerFacilityAccess_IsActive", true)) : [];
  const facilityIds = new Set(accesses.map((row)=>row.WMSCustomerFacilityAccess_FacilityID));
  const customerFacilityPairs = new Set(accesses.map((row)=>customerFacilityPair(
    row.WMSCustomerFacilityAccess_CustomerOrgID,
    row.WMSCustomerFacilityAccess_FacilityID,
  )));
  // Existing paging RPCs accept organisation and facility allowlists separately.
  // Fail closed unless their Cartesian product is exactly covered by active
  // customer-facility links; otherwise the independent arrays could create
  // cross-organisation combinations that the portal user was never assigned.
  const scopeIsCartesian = [...organisationIds].every((organisationId)=>
    [...facilityIds].every((facilityId)=>customerFacilityPairs.has(customerFacilityPair(organisationId, facilityId))));
  if (!scopeIsCartesian) {
    throw new HttpError(403, "Your portal profile spans organisations with different warehouse assignments. Ask a workspace administrator to separate or align that access.");
  }
  const roleRows = await many(admin.from("Portal_UserRoles").select("PortalUserRole_RoleID").eq("PortalUserRole_PortalUserID", portalUser.PortalUser_ID).eq("PortalUserRole_StatusCode", "active"));
  const roleIds = roleRows.map((row)=>row.PortalUserRole_RoleID);
  const permissions = roleIds.length ? await many(admin.from("Portal_RolePermissions").select("PortalRolePerm_ResourceTypeCode,PortalRolePerm_ActionCode").in("PortalRolePerm_RoleID", roleIds).eq("PortalRolePerm_IsAllowed", true)) : [];
  const capabilities = new Set(permissions.map((row)=>`${row.PortalRolePerm_ResourceTypeCode}:${row.PortalRolePerm_ActionCode}`));
  if (manageableOrganisationIds.size) {
    capabilities.add("warehouse_users:manage");
  }
  return {
    authId: auth.user.id,
    userId: null,
    companyId: null,
    portalUserId: portalUser.PortalUser_ID,
    organisationIds,
    manageableOrganisationIds,
    facilityIds,
    facilityScopeResolved: true,
    customerFacilityPairs,
    capabilities,
    permissions: new Set()
  };
}

export function requireInternal(actor) {
  if (!actor.userId || !actor.companyId) {
    throw new HttpError(403, "This operation is reserved for the warehouse team.");
  }
}
export function requireInternalWarehouseRead(actor) {
  requireInternal(actor);
  if (!actor.permissions.has("Warehouse.Read") && !actor.permissions.has("Warehouse.Write")) {
    throw new HttpError(403, "You do not have permission to view warehouse data.");
  }
}
export function requireInternalWarehouseWrite(actor) {
  requireInternal(actor);
  if (!actor.permissions.has("Warehouse.Write")) {
    throw new HttpError(403, "You do not have permission to change warehouse data.");
  }
}
export function requireCapability(actor, capability) {
  if (!actor.capabilities.has(capability)) {
    throw new HttpError(403, actor.companyId
      ? "You do not have permission for this warehouse action."
      : "Your customer portal role does not allow this warehouse action.");
  }
}
export function requireInternalPermission(actor, permission) {
  if (permission === "Users.Read") requireInternalWarehouseRead(actor);
  else requireInternalWarehouseWrite(actor);
  if (!actor.permissions.has(permission)) {
    throw new HttpError(403, "You do not have permission to manage warehouse portal users.");
  }
}
export function requireCustomerScope(actor, orgId, facilityId) {
  if (!actor.companyId && !actor.customerFacilityPairs.has(customerFacilityPair(orgId, facilityId))) {
    throw new HttpError(403, "You can only access your organisation in an assigned warehouse.");
  }
}
export async function companyOfficeIds(admin, actor) {
  if (!actor.companyId) return [];
  const assignedOffices = await many(admin.from("cmp_Users_Offices").select("Office_ID").eq("User_ID", actor.userId));
  const assignedOfficeIds = [...new Set(assignedOffices.map((row)=>row.Office_ID).filter(Boolean))];
  if (!assignedOfficeIds.length) return [];
  const offices = await many(admin.from("cmp_Offices").select("Office_ID").eq("Company_ID", actor.companyId).in("Office_ID", assignedOfficeIds));
  return offices.map((row)=>row.Office_ID);
}
export async function companyFacilityIds(admin, actor) {
  if (!actor.companyId) return [
    ...actor.facilityIds
  ];
  if (actor.facilityScopeResolved) return [...actor.facilityIds];
  const officeIds = await companyOfficeIds(admin, actor);
  if (!officeIds.length) return [];
  const facilities = await many(admin.from("WMS_Facilities").select("WMSFacility_ID").in("WMSFacility_OrgOfficeID", officeIds).eq("WMSFacility_IsDeleted", false));
  return facilities.map((row)=>row.WMSFacility_ID);
}
