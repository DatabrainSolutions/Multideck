using System.Net.Mail;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Configuration;
using Multideck.Server.Modules.Users;
using Multideck.Server.Modules.Users.Supabase;

namespace Multideck.Server.Modules.Warehouse.Portal;

public sealed class WarehousePortalService(
    MultideckContext db,
    IWarehouseContext warehouseContext,
    SupabaseAuthOptions supabaseAuth,
    ISupabaseAdminClient supabaseAdminClient) : IWarehousePortalService
{
    private sealed record RoleDefinition(string Code, string Name, string Description, IReadOnlyList<(string Resource, string Action)> Grants);

    private static readonly IReadOnlyList<RoleDefinition> RoleDefinitions =
    [
        new("warehouse_viewer", "Warehouse viewer", "View own inventory, items, and orders.",
        [
            ("warehouse_inventory", "read"), ("warehouse_items", "read"), ("warehouse_orders", "read"),
        ]),
        new("warehouse_operator", "Warehouse customer operator", "Manage own items and create inbound and outbound requests.",
        [
            ("warehouse_inventory", "read"), ("warehouse_items", "read"), ("warehouse_items", "manage"),
            ("warehouse_orders", "read"), ("warehouse_orders", "create_inbound"), ("warehouse_orders", "create_outbound"),
            ("warehouse_orders", "cancel"), ("warehouse_documents", "upload"),
        ]),
        new("warehouse_customer_admin", "Warehouse customer administrator", "Full customer self-service access and organisation-user administration.",
        [
            ("warehouse_inventory", "read"), ("warehouse_items", "read"), ("warehouse_items", "manage"),
            ("warehouse_orders", "read"), ("warehouse_orders", "create_inbound"), ("warehouse_orders", "create_outbound"),
            ("warehouse_orders", "cancel"), ("warehouse_documents", "upload"),
            ("warehouse_users", "manage"),
        ]),
    ];

    public async Task<WarehousePortalReferenceResponse> GetReferenceAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        IQueryable<WmsFacility> facilityQuery;
        if (actor.IsInternal)
        {
            facilityQuery = CompanyFacilities(actor.CompanyId!.Value);
        }
        else
        {
            warehouseContext.RequireCapability(actor, WarehouseCapabilities.UsersManageOwn);
            var facilityIds = actor.FacilityIds;
            facilityQuery = db.WmsFacilities.AsNoTracking().Where(value => facilityIds.Contains(value.WmsfacilityId) && value.WmsfacilityIsActive && !value.WmsfacilityIsDeleted);
        }
        var facilities = await facilityQuery
            .OrderBy(value => value.WmsfacilityName)
            .Select(value => new WarehousePortalFacilityOption(value.WmsfacilityId, value.WmsfacilityCode, value.WmsfacilityName))
            .ToListAsync(cancellationToken);
        return new WarehousePortalReferenceResponse(
            RoleDefinitions.Select(value => new WarehousePortalRoleOption(value.Code, value.Name, value.Description)).ToList(),
            facilities);
    }

    public async Task<IReadOnlyList<WarehousePortalUserDto>> ListUsersAsync(ClaimsPrincipal principal, Guid customerOrgId, CancellationToken cancellationToken)
    {
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        if (actor.IsInternal)
        {
            var linked = await IsCustomerInCompanyAsync(actor.CompanyId!.Value, customerOrgId, cancellationToken);
            if (!linked)
            {
                var exists = await db.OrgMasters.AnyAsync(value => value.OrgId == customerOrgId && (value.OrgCrmisPotentialCustomer || value.OrgTypes.Any(type => type.OrgTypeName == "Customer")), cancellationToken);
                if (!exists) throw WarehouseException.NotFound("This customer organisation does not exist.");
                return [];
            }
        }
        else
        {
            warehouseContext.RequireCapability(actor, WarehouseCapabilities.UsersManageOwn, customerOrgId);
            if (!actor.OrganisationIds.Contains(customerOrgId)) throw WarehouseException.Forbidden("You can only manage users in your own organisation.");
        }

        var users = await db.PortalUserOrganisations
            .AsNoTracking()
            .Where(link =>
                link.PortalUserOrgOrgId == customerOrgId &&
                link.PortalUserOrgStatusCode != "revoked" &&
                !link.PortalUserOrgPortalUser.PortalUserIsDeleted)
            .Select(link => link.PortalUserOrgPortalUser)
            .Distinct()
            .OrderBy(value => value.PortalUserDisplayName)
            .ToListAsync(cancellationToken);

        var userIds = users.Select(value => value.PortalUserId).ToList();
        var roles = await db.PortalUserRoles.AsNoTracking()
            .Where(value => userIds.Contains(value.PortalUserRolePortalUserId) && value.PortalUserRoleOrgId == customerOrgId && value.PortalUserRoleStatusCode == "active")
            .Select(value => new { value.PortalUserRolePortalUserId, value.PortalUserRoleRole.PortalRoleCode })
            .ToListAsync(cancellationToken);
        var facilities = await db.WmsCustomerFacilityAccesses.AsNoTracking()
            .Where(value => value.WmscustomerFacilityAccessCustomerOrgId == customerOrgId && value.WmscustomerFacilityAccessIsActive)
            .Select(value => value.WmscustomerFacilityAccessFacilityId)
            .ToListAsync(cancellationToken);

        return users.Select(user => new WarehousePortalUserDto(
            user.PortalUserId,
            user.PortalUserDisplayName,
            user.PortalUserEmail,
            user.PortalUserStatusCode,
            roles.FirstOrDefault(value => value.PortalUserRolePortalUserId == user.PortalUserId)?.PortalRoleCode ?? "warehouse_viewer",
            facilities,
            user.PortalUserLastLoginAt)).ToList();
    }

    public async Task<WarehousePortalInvitationResult> InviteAsync(ClaimsPrincipal principal, InviteWarehouseCustomerRequest request, CancellationToken cancellationToken)
    {
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        var email = NormalizeEmail(request.Email) ?? throw WarehouseException.BadRequest("Enter a valid customer email address.");
        var definition = RequireRoleDefinition(request.RoleCode);
        IReadOnlyList<Guid> facilityIds;
        Guid? internalUserId;
        PortalSite site;
        var updateOrganisationFacilities = actor.IsInternal;
        if (actor.IsInternal)
        {
            var current = new WarehouseUser(actor.UserId!.Value, actor.CompanyId!.Value);
            facilityIds = await RequireFacilitiesAsync(current.CompanyId, request.FacilityIds, cancellationToken);
            await EnsureCustomerProfileAsync(current, request.CustomerOrgId, facilityIds[0], cancellationToken);
            site = await EnsureSiteAsync(current, cancellationToken);
            internalUserId = current.UserId;
        }
        else
        {
            warehouseContext.RequireCapability(actor, WarehouseCapabilities.UsersManageOwn, request.CustomerOrgId);
            var scope = actor.Organisations.FirstOrDefault(value => value.OrganisationId == request.CustomerOrgId)
                ?? throw WarehouseException.Forbidden("You can only invite users to your own organisation.");
            facilityIds = scope.FacilityIds.ToList();
            if (facilityIds.Count == 0) throw WarehouseException.Conflict("Your organisation does not have an active warehouse assignment.");
            site = await RequirePortalSiteAsync(actor.PortalUserId!.Value, cancellationToken);
            internalUserId = null;
        }

        if (!supabaseAuth.HasServiceRoleKey)
        {
            throw WarehouseException.Conflict("Configure the Supabase service-role key before inviting customer users.");
        }

        var role = await EnsureRoleAsync(site.PortalSiteId, definition, internalUserId, cancellationToken);
        var portalUser = await db.PortalUsers
            .Include(value => value.PortalExternalIdentities)
            .FirstOrDefaultAsync(value => value.PortalUserEmail.ToLower() == email, cancellationToken);
        var invited = false;

        if (portalUser is null)
        {
            var names = SplitName(request.DisplayName);
            var invite = await supabaseAdminClient.InviteUserAsync(
                new CreateUserRequest(email, names.FirstName, names.LastName, null, null, "Warehouse customer", null),
                email,
                supabaseAuth,
                cancellationToken);
            invited = invite.Invited;
            var now = DateTime.UtcNow;
            portalUser = new PortalUser
            {
                PortalUserDefaultSiteId = site.PortalSiteId,
                PortalUserAudienceTypeCode = "customer",
                PortalUserStatusCode = "active",
                PortalUserPrimaryOrgId = request.CustomerOrgId,
                PortalUserDisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? email : request.DisplayName.Trim(),
                PortalUserEmail = email,
                PortalUserPreferredLanguageCode = "en-GB",
                PortalUserMfarequired = false,
                PortalUserFailedLoginCount = 0,
                PortalUserValidFrom = now,
                PortalUserPreferencesJson = "{}",
                PortalUserCreatedAt = now,
                PortalUserCreatedBy = internalUserId,
                PortalUserUpdatedAt = now,
                PortalUserUpdatedBy = internalUserId,
                PortalUserIsDeleted = false,
            };
            portalUser.PortalExternalIdentities.Add(new PortalExternalIdentity
            {
                PortalIdentityAuthProviderCode = "supabase",
                PortalIdentityExternalSubject = invite.AuthUserId.ToString(),
                PortalIdentityExternalUsername = email,
                PortalIdentityEmailSnapshot = email,
                PortalIdentityStatusCode = "active",
                PortalIdentityMetadataJson = "{}",
                PortalIdentityCreatedAt = now,
                PortalIdentityUpdatedAt = now,
            });
            db.PortalUsers.Add(portalUser);
        }

        await db.SaveChangesAsync(cancellationToken);
        await UpsertAccessAsync(portalUser, request.CustomerOrgId, role, facilityIds, internalUserId, updateOrganisationFacilities, cancellationToken);

        var invitation = new PortalInvitation
        {
            PortalInviteSiteId = site.PortalSiteId,
            PortalInvitePortalUserId = portalUser.PortalUserId,
            PortalInviteOrgId = request.CustomerOrgId,
            PortalInviteEmail = email,
            PortalInviteDisplayName = portalUser.PortalUserDisplayName,
            PortalInviteAudienceTypeCode = "customer",
            PortalInviteRoleId = role.PortalRoleId,
            PortalInviteStatusCode = "invited",
            PortalInviteExpiresAt = DateTime.UtcNow.AddDays(7),
            PortalInviteSentAt = DateTime.UtcNow,
            PortalInviteCreatedAt = DateTime.UtcNow,
            PortalInviteCreatedBy = internalUserId,
        };
        db.PortalInvitations.Add(invitation);
        await db.SaveChangesAsync(cancellationToken);

        return new WarehousePortalInvitationResult(ToDto(portalUser, request.CustomerOrgId, role.PortalRoleCode, facilityIds), invited);
    }

    public async Task<WarehousePortalUserDto> UpdateAccessAsync(ClaimsPrincipal principal, Guid portalUserId, Guid customerOrgId, UpdateWarehouseCustomerAccessRequest request, CancellationToken cancellationToken)
    {
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        IReadOnlyList<Guid> facilities;
        Guid? internalUserId;
        PortalSite site;
        var updateOrganisationFacilities = actor.IsInternal;
        if (actor.IsInternal)
        {
            var current = new WarehouseUser(actor.UserId!.Value, actor.CompanyId!.Value);
            await RequireCustomerInCompanyAsync(current.CompanyId, customerOrgId, cancellationToken);
            facilities = await RequireFacilitiesAsync(current.CompanyId, request.FacilityIds, cancellationToken);
            site = await EnsureSiteAsync(current, cancellationToken);
            internalUserId = current.UserId;
        }
        else
        {
            warehouseContext.RequireCapability(actor, WarehouseCapabilities.UsersManageOwn, customerOrgId);
            if (actor.PortalUserId == portalUserId) throw WarehouseException.BadRequest("You cannot change your own portal role.");
            var scope = actor.Organisations.FirstOrDefault(value => value.OrganisationId == customerOrgId)
                ?? throw WarehouseException.Forbidden("You can only manage users in your own organisation.");
            var targetBelongsToOrganisation = await db.PortalUserOrganisations.AsNoTracking().AnyAsync(value =>
                value.PortalUserOrgPortalUserId == portalUserId &&
                value.PortalUserOrgOrgId == customerOrgId &&
                value.PortalUserOrgStatusCode != "revoked", cancellationToken);
            if (!targetBelongsToOrganisation) throw WarehouseException.NotFound("This customer portal user does not belong to your organisation.");
            facilities = scope.FacilityIds.ToList();
            site = await RequirePortalSiteAsync(actor.PortalUserId!.Value, cancellationToken);
            internalUserId = null;
        }
        var definition = RequireRoleDefinition(request.RoleCode);
        var role = await EnsureRoleAsync(site.PortalSiteId, definition, internalUserId, cancellationToken);
        var portalUser = await db.PortalUsers.FirstOrDefaultAsync(value => value.PortalUserId == portalUserId && !value.PortalUserIsDeleted, cancellationToken)
            ?? throw WarehouseException.NotFound("This customer portal user does not exist.");
        await UpsertAccessAsync(portalUser, customerOrgId, role, facilities, internalUserId, updateOrganisationFacilities, cancellationToken);
        return ToDto(portalUser, customerOrgId, role.PortalRoleCode, facilities);
    }

    public async Task RevokeAsync(ClaimsPrincipal principal, Guid portalUserId, Guid customerOrgId, CancellationToken cancellationToken)
    {
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        if (actor.IsInternal)
        {
            await RequireCustomerInCompanyAsync(actor.CompanyId!.Value, customerOrgId, cancellationToken);
        }
        else
        {
            warehouseContext.RequireCapability(actor, WarehouseCapabilities.UsersManageOwn, customerOrgId);
            if (!actor.OrganisationIds.Contains(customerOrgId)) throw WarehouseException.Forbidden("You can only manage users in your own organisation.");
            if (actor.PortalUserId == portalUserId) throw WarehouseException.BadRequest("You cannot revoke your own portal access.");
        }
        var userOrg = await db.PortalUserOrganisations.FirstOrDefaultAsync(value => value.PortalUserOrgPortalUserId == portalUserId && value.PortalUserOrgOrgId == customerOrgId, cancellationToken)
            ?? throw WarehouseException.NotFound("This customer portal access does not exist.");
        userOrg.PortalUserOrgStatusCode = "revoked";
        var roles = await db.PortalUserRoles.Where(value => value.PortalUserRolePortalUserId == portalUserId && value.PortalUserRoleOrgId == customerOrgId).ToListAsync(cancellationToken);
        roles.ForEach(value => value.PortalUserRoleStatusCode = "revoked");
        await db.SaveChangesAsync(cancellationToken);
    }

    private IQueryable<WmsFacility> CompanyFacilities(Guid companyId) => db.WmsFacilities.AsNoTracking().Where(value =>
        !value.WmsfacilityIsDeleted && value.WmsfacilityIsActive && value.WmsfacilityOrgOffice != null && value.WmsfacilityOrgOffice.CompanyId == companyId);

    private async Task RequireCustomerInCompanyAsync(Guid companyId, Guid customerOrgId, CancellationToken cancellationToken)
    {
        var linked = await IsCustomerInCompanyAsync(companyId, customerOrgId, cancellationToken);
        if (!linked) throw WarehouseException.BadRequest("Set up this organisation as a warehouse customer before managing portal users.");
    }

    private Task<bool> IsCustomerInCompanyAsync(Guid companyId, Guid customerOrgId, CancellationToken cancellationToken) =>
        db.WmsCustomerProfiles.AnyAsync(value =>
            value.WmscustomerProfileCustomerOrgId == customerOrgId && value.WmscustomerProfileIsActive &&
            ((value.WmscustomerProfileOrgOffice != null && value.WmscustomerProfileOrgOffice.CompanyId == companyId) ||
             (value.WmscustomerProfileDefaultFacility != null && value.WmscustomerProfileDefaultFacility.WmsfacilityOrgOffice != null && value.WmscustomerProfileDefaultFacility.WmsfacilityOrgOffice.CompanyId == companyId)), cancellationToken);

    private async Task EnsureCustomerProfileAsync(WarehouseUser current, Guid customerOrgId, Guid facilityId, CancellationToken cancellationToken)
    {
        if (await IsCustomerInCompanyAsync(current.CompanyId, customerOrgId, cancellationToken)) return;
        var facility = await CompanyFacilities(current.CompanyId).FirstOrDefaultAsync(value => value.WmsfacilityId == facilityId, cancellationToken)
            ?? throw WarehouseException.BadRequest("Choose a warehouse that belongs to your company.");
        var customerExists = await db.OrgMasters.AnyAsync(value => value.OrgId == customerOrgId && (value.OrgCrmisPotentialCustomer || value.OrgTypes.Any(type => type.OrgTypeName == "Customer")), cancellationToken);
        if (!customerExists) throw WarehouseException.NotFound("This customer organisation does not exist.");

        db.WmsCustomerProfiles.Add(new WmsCustomerProfile
        {
            WmscustomerProfileCustomerOrgId = customerOrgId,
            WmscustomerProfileOrgOfficeId = facility.WmsfacilityOrgOfficeId,
            WmscustomerProfileDefaultFacilityId = facilityId,
            WmscustomerProfileDefaultAllocationMethodCode = "fifo",
            WmscustomerProfileDefaultPickMethodCode = "fifo",
            WmscustomerProfilePortalStockVisible = true,
            WmscustomerProfileRulesJson = "{}",
            WmscustomerProfileIsActive = true,
            WmscustomerProfileCreatedAt = DateTime.UtcNow,
            WmscustomerProfileCreatedBy = current.UserId,
            WmscustomerProfileUpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<Guid>> RequireFacilitiesAsync(Guid companyId, IReadOnlyList<Guid> requested, CancellationToken cancellationToken)
    {
        var ids = requested.Distinct().ToList();
        if (ids.Count == 0) throw WarehouseException.BadRequest("Choose at least one warehouse for this customer.");
        var valid = await CompanyFacilities(companyId).Where(value => ids.Contains(value.WmsfacilityId)).Select(value => value.WmsfacilityId).ToListAsync(cancellationToken);
        if (valid.Count != ids.Count) throw WarehouseException.BadRequest("One or more selected warehouses are outside your company.");
        return valid;
    }

    private async Task<PortalSite> EnsureSiteAsync(WarehouseUser current, CancellationToken cancellationToken)
    {
        var code = $"warehouse-{current.CompanyId:N}";
        var site = await db.PortalSites.FirstOrDefaultAsync(value => value.PortalSiteCode == code, cancellationToken);
        if (site is not null) return site;
        var officeId = await db.CmpOffices.Where(value => value.CompanyId == current.CompanyId).OrderBy(value => value.OfficeName).Select(value => (Guid?)value.OfficeId).FirstOrDefaultAsync(cancellationToken);
        site = new PortalSite
        {
            PortalSiteCode = code,
            PortalSiteName = "Warehouse customer portal",
            PortalSiteDescription = "Customer self-service inventory and warehouse requests.",
            PortalSiteSiteTypeCode = "warehouse_customer",
            PortalSiteDefaultAudienceTypeCode = "customer",
            PortalSiteOrgOfficeId = officeId,
            PortalSiteDefaultLanguageCode = "en-GB",
            PortalSiteDefaultTimeZone = "UTC",
            PortalSiteAllowedAuthMethodsJson = "[\"password\",\"magic_link\"]",
            PortalSiteFieldPolicyJson = "{}",
            PortalSiteFeatureFlagsJson = "{\"warehouse\":true}",
            PortalSiteIsActive = true,
            PortalSiteCreatedAt = DateTime.UtcNow,
            PortalSiteCreatedBy = current.UserId,
            PortalSiteUpdatedAt = DateTime.UtcNow,
            PortalSiteUpdatedBy = current.UserId,
            PortalSiteIsDeleted = false,
        };
        db.PortalSites.Add(site);
        await db.SaveChangesAsync(cancellationToken);
        return site;
    }

    private async Task<PortalSite> RequirePortalSiteAsync(Guid portalUserId, CancellationToken cancellationToken)
    {
        var site = await db.PortalUsers.AsNoTracking()
            .Where(value => value.PortalUserId == portalUserId && !value.PortalUserIsDeleted)
            .Select(value => value.PortalUserDefaultSite)
            .FirstOrDefaultAsync(cancellationToken);
        if (site is null || !site.PortalSiteIsActive || site.PortalSiteIsDeleted)
            throw WarehouseException.Conflict("Your customer portal is not active.");
        return site;
    }

    private async Task<PortalRole> EnsureRoleAsync(Guid siteId, RoleDefinition definition, Guid? currentUserId, CancellationToken cancellationToken)
    {
        var role = await db.PortalRoles.Include(value => value.PortalRolePermissions)
            .FirstOrDefaultAsync(value => value.PortalRoleSiteId == siteId && value.PortalRoleCode == definition.Code, cancellationToken);
        if (role is null)
        {
            role = new PortalRole
            {
                PortalRoleSiteId = siteId,
                PortalRoleCode = definition.Code,
                PortalRoleName = definition.Name,
                PortalRoleDescription = definition.Description,
                PortalRoleAudienceTypeCode = "customer",
                PortalRoleIsSystemRole = true,
                PortalRoleIsEnabled = true,
                PortalRoleCreatedAt = DateTime.UtcNow,
                PortalRoleCreatedBy = currentUserId,
            };
            db.PortalRoles.Add(role);
        }
        foreach (var grant in definition.Grants.Where(grant => !role.PortalRolePermissions.Any(value => value.PortalRolePermResourceTypeCode == grant.Resource && value.PortalRolePermActionCode == grant.Action)))
        {
            role.PortalRolePermissions.Add(new PortalRolePermission
            {
                PortalRolePermResourceTypeCode = grant.Resource,
                PortalRolePermActionCode = grant.Action,
                PortalRolePermIsAllowed = true,
                PortalRolePermRequiresExplicitShare = false,
                PortalRolePermRequiresInternalReview = false,
                PortalRolePermFieldAllowListJson = "[]",
                PortalRolePermFieldDenyListJson = "[]",
                PortalRolePermCreatedAt = DateTime.UtcNow,
            });
        }
        await db.SaveChangesAsync(cancellationToken);
        return role;
    }

    private async Task UpsertAccessAsync(PortalUser portalUser, Guid customerOrgId, PortalRole role, IReadOnlyList<Guid> facilityIds, Guid? currentUserId, bool updateOrganisationFacilities, CancellationToken cancellationToken)
    {
        var userOrg = await db.PortalUserOrganisations.FirstOrDefaultAsync(value => value.PortalUserOrgPortalUserId == portalUser.PortalUserId && value.PortalUserOrgOrgId == customerOrgId, cancellationToken);
        if (userOrg is null)
        {
            userOrg = new PortalUserOrganisation
            {
                PortalUserOrgPortalUserId = portalUser.PortalUserId,
                PortalUserOrgOrgId = customerOrgId,
                PortalUserOrgAudienceTypeCode = "customer",
                PortalUserOrgStatusCode = "active",
                PortalUserOrgIsPrimary = portalUser.PortalUserPrimaryOrgId == customerOrgId,
                PortalUserOrgCanManageOrgUsers = role.PortalRoleCode == "warehouse_customer_admin",
                PortalUserOrgFieldPolicyJson = "{}",
                PortalUserOrgCreatedAt = DateTime.UtcNow,
                PortalUserOrgCreatedBy = currentUserId,
            };
            db.PortalUserOrganisations.Add(userOrg);
        }
        else
        {
            userOrg.PortalUserOrgStatusCode = "active";
            userOrg.PortalUserOrgCanManageOrgUsers = role.PortalRoleCode == "warehouse_customer_admin";
        }

        var assignedRoles = await db.PortalUserRoles.Where(value => value.PortalUserRolePortalUserId == portalUser.PortalUserId && value.PortalUserRoleOrgId == customerOrgId).ToListAsync(cancellationToken);
        foreach (var assigned in assignedRoles) assigned.PortalUserRoleStatusCode = assigned.PortalUserRoleRoleId == role.PortalRoleId ? "active" : "revoked";
        if (assignedRoles.All(value => value.PortalUserRoleRoleId != role.PortalRoleId))
        {
            db.PortalUserRoles.Add(new PortalUserRole
            {
                PortalUserRolePortalUserId = portalUser.PortalUserId,
                PortalUserRoleRoleId = role.PortalRoleId,
                PortalUserRoleSiteId = role.PortalRoleSiteId,
                PortalUserRoleOrgId = customerOrgId,
                PortalUserRoleStatusCode = "active",
                PortalUserRoleValidFrom = DateTime.UtcNow,
                PortalUserRoleAssignedAt = DateTime.UtcNow,
                PortalUserRoleAssignedBy = currentUserId,
            });
        }

        if (updateOrganisationFacilities)
        {
            var allAccess = await db.WmsCustomerFacilityAccesses.Where(value => value.WmscustomerFacilityAccessCustomerOrgId == customerOrgId).ToListAsync(cancellationToken);
            foreach (var access in allAccess)
            {
                access.WmscustomerFacilityAccessIsActive = facilityIds.Contains(access.WmscustomerFacilityAccessFacilityId);
                access.WmscustomerFacilityAccessUpdatedAt = DateTime.UtcNow;
            }
            foreach (var facilityId in facilityIds.Where(id => allAccess.All(value => value.WmscustomerFacilityAccessFacilityId != id)))
            {
                db.WmsCustomerFacilityAccesses.Add(new WmsCustomerFacilityAccess
                {
                    WmscustomerFacilityAccessCustomerOrgId = customerOrgId,
                    WmscustomerFacilityAccessFacilityId = facilityId,
                    WmscustomerFacilityAccessIsActive = true,
                    WmscustomerFacilityAccessCreatedAt = DateTime.UtcNow,
                    WmscustomerFacilityAccessCreatedBy = currentUserId,
                    WmscustomerFacilityAccessUpdatedAt = DateTime.UtcNow,
                });
            }
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    private static RoleDefinition RequireRoleDefinition(string roleCode) => RoleDefinitions.FirstOrDefault(value => value.Code == roleCode.Trim().ToLowerInvariant())
        ?? throw WarehouseException.BadRequest("Choose a valid warehouse customer role.");

    private static WarehousePortalUserDto ToDto(PortalUser user, Guid customerOrgId, string roleCode, IReadOnlyList<Guid> facilityIds) =>
        new(user.PortalUserId, user.PortalUserDisplayName, user.PortalUserEmail, user.PortalUserStatusCode, roleCode, facilityIds, user.PortalUserLastLoginAt);

    private static string? NormalizeEmail(string value)
    {
        try { return new MailAddress(value.Trim()).Address.ToLowerInvariant(); }
        catch { return null; }
    }

    private static (string? FirstName, string? LastName) SplitName(string? displayName)
    {
        var parts = displayName?.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries) ?? [];
        return parts.Length switch { 0 => (null, null), 1 => (parts[0], null), _ => (parts[0], string.Join(' ', parts.Skip(1))) };
    }
}
