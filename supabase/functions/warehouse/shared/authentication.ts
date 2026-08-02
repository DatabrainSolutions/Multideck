
// @ts-nocheck
import { oneOrNull } from "./database.ts";
import { HttpError } from "./http.ts";

export async function resolveActor(userDb, admin) {
  const { data: auth, error } = await userDb.auth.getUser();
  if (error || !auth.user) {
    throw new HttpError(401, "Sign in again to manage the warehouse.");
  }
  const internal = await oneOrNull(admin.from("cmp_Users").select("User_ID,Company_ID").eq("Auth_User_ID", auth.user.id).maybeSingle());
  if (internal) {
    if (!internal.Company_ID) {
      throw new HttpError(403, "Your Multideck user is not assigned to a company yet.");
    }
    return {
      authId: auth.user.id,
      userId: internal.User_ID,
      companyId: internal.Company_ID,
      portalUserId: null,
      organisationIds: new Set(),
      facilityIds: new Set(),
      capabilities: new Set()
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
  const accesses = organisationIds.size ? await many(admin.from("WMS_CustomerFacilityAccess").select("WMSCustomerFacilityAccess_CustomerOrgID,WMSCustomerFacilityAccess_FacilityID").in("WMSCustomerFacilityAccess_CustomerOrgID", [
    ...organisationIds
  ]).eq("WMSCustomerFacilityAccess_IsActive", true)) : [];
  const facilityIds = new Set(accesses.map((row)=>row.WMSCustomerFacilityAccess_FacilityID));
  const roleRows = await many(admin.from("Portal_UserRoles").select("PortalUserRole_RoleID").eq("PortalUserRole_PortalUserID", portalUser.PortalUser_ID).eq("PortalUserRole_StatusCode", "active"));
  const roleIds = roleRows.map((row)=>row.PortalUserRole_RoleID);
  const permissions = roleIds.length ? await many(admin.from("Portal_RolePermissions").select("PortalRolePerm_ResourceTypeCode,PortalRolePerm_ActionCode").in("PortalRolePerm_RoleID", roleIds).eq("PortalRolePerm_IsAllowed", true)) : [];
  const capabilities = new Set(permissions.map((row)=>`${row.PortalRolePerm_ResourceTypeCode}:${row.PortalRolePerm_ActionCode}`));
  if (links.some((row)=>row.PortalUserOrg_CanManageOrgUsers)) {
    capabilities.add("warehouse_users:manage");
  }
  return {
    authId: auth.user.id,
    userId: null,
    companyId: null,
    portalUserId: portalUser.PortalUser_ID,
    organisationIds,
    facilityIds,
    capabilities
  };
}

export function requireInternal(actor) {
  if (!actor.userId || !actor.companyId) {
    throw new HttpError(403, "This operation is reserved for the warehouse team.");
  }
}
export function requireCapability(actor, capability) {
  if (!actor.companyId && !actor.capabilities.has(capability)) {
    throw new HttpError(403, "Your customer portal role does not allow this warehouse action.");
  }
}
export function requireCustomerScope(actor, orgId, facilityId) {
  if (!actor.companyId && (!actor.organisationIds.has(orgId) || !actor.facilityIds.has(facilityId))) {
    throw new HttpError(403, "You can only access your organisation in an assigned warehouse.");
  }
}
export async function companyFacilityIds(admin, actor) {
  if (!actor.companyId) return [
    ...actor.facilityIds
  ];
  const offices = await many(admin.from("cmp_Offices").select("Office_ID").eq("Company_ID", actor.companyId));
  if (!offices.length) return [];
  const facilities = await many(admin.from("WMS_Facilities").select("WMSFacility_ID").in("WMSFacility_OrgOfficeID", offices.map((row)=>row.Office_ID)).eq("WMSFacility_IsDeleted", false));
  return facilities.map((row)=>row.WMSFacility_ID);
}

