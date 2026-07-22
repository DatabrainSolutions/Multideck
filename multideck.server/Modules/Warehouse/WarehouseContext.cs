using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;

namespace Multideck.Server.Modules.Warehouse;

public static class WarehouseCapabilities
{
    public const string InventoryReadOwn = "Warehouse.Inventory.ReadOwn";
    public const string ItemsReadOwn = "Warehouse.Items.ReadOwn";
    public const string ItemsManageOwn = "Warehouse.Items.ManageOwn";
    public const string OrdersReadOwn = "Warehouse.Orders.ReadOwn";
    public const string OrdersCreateInboundOwn = "Warehouse.Orders.CreateInboundOwn";
    public const string OrdersCreateOutboundOwn = "Warehouse.Orders.CreateOutboundOwn";
    public const string OrdersCancelOwn = "Warehouse.Orders.CancelOwn";
    public const string DocumentsUploadOwn = "Warehouse.Documents.UploadOwn";
    public const string UsersManageOwn = "Warehouse.Users.ManageOwn";

    public static string? FromPortalGrant(string resource, string action) => (resource, action) switch
    {
        ("warehouse_inventory", "read") => InventoryReadOwn,
        ("warehouse_items", "read") => ItemsReadOwn,
        ("warehouse_items", "manage") => ItemsManageOwn,
        ("warehouse_orders", "read") => OrdersReadOwn,
        ("warehouse_orders", "create_inbound") => OrdersCreateInboundOwn,
        ("warehouse_orders", "create_outbound") => OrdersCreateOutboundOwn,
        ("warehouse_orders", "cancel") => OrdersCancelOwn,
        ("warehouse_documents", "upload") => DocumentsUploadOwn,
        ("warehouse_users", "manage") => UsersManageOwn,
        _ => null,
    };
}

/// <summary>An authenticated internal warehouse user.</summary>
public sealed record WarehouseUser(Guid UserId, Guid CompanyId);

public sealed record WarehouseOrganisationAccess(
    Guid OrganisationId,
    IReadOnlySet<Guid> FacilityIds,
    IReadOnlySet<string> Capabilities);

/// <summary>
/// Resolved warehouse actor. Internal users are company scoped; portal users are constrained by
/// both customer organisation and explicitly assigned facility before a query is constructed.
/// </summary>
public sealed record WarehouseActor(
    Guid? UserId,
    Guid? PortalUserId,
    Guid? CompanyId,
    string DisplayName,
    string Email,
    IReadOnlyList<WarehouseOrganisationAccess> Organisations)
{
    public bool IsCustomer => PortalUserId.HasValue;
    public bool IsInternal => UserId.HasValue && CompanyId.HasValue && !PortalUserId.HasValue;
    public IReadOnlySet<Guid> OrganisationIds => Organisations.Select(value => value.OrganisationId).ToHashSet();
    public IReadOnlySet<Guid> FacilityIds => Organisations.SelectMany(value => value.FacilityIds).ToHashSet();

    public bool CanAccess(Guid organisationId, Guid facilityId) => IsInternal || Organisations.Any(value =>
        value.OrganisationId == organisationId && value.FacilityIds.Contains(facilityId));

    public bool HasCapability(string capability, Guid? organisationId = null) => IsInternal || Organisations.Any(value =>
        (!organisationId.HasValue || value.OrganisationId == organisationId.Value) && value.Capabilities.Contains(capability));
}

public interface IWarehouseContext
{
    Task<WarehouseUser> RequireCurrentUserAsync(ClaimsPrincipal principal, CancellationToken cancellationToken);
    Task<WarehouseActor> RequireCurrentActorAsync(ClaimsPrincipal principal, CancellationToken cancellationToken);
    void RequireCapability(WarehouseActor actor, string capability, Guid? organisationId = null);
}

public sealed class WarehouseContext(MultideckContext db) : IWarehouseContext
{
    public async Task<WarehouseUser> RequireCurrentUserAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        var actor = await RequireCurrentActorAsync(principal, cancellationToken);
        if (!actor.IsInternal || !actor.UserId.HasValue || !actor.CompanyId.HasValue)
        {
            throw WarehouseException.Forbidden("This operation is reserved for the warehouse team.");
        }

        return new WarehouseUser(actor.UserId.Value, actor.CompanyId.Value);
    }

    public async Task<WarehouseActor> RequireCurrentActorAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var authUserId))
        {
            throw WarehouseException.Forbidden("Your session is not linked to a Multideck profile yet.");
        }

        var internalUser = await db.CmpUsers
            .AsNoTracking()
            .Where(profile => profile.AuthUserId == authUserId)
            .Select(profile => new
            {
                profile.UserId,
                profile.CompanyId,
                profile.UserFirstname,
                profile.UserLastname,
                profile.UserEmail,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (internalUser is not null)
        {
            if (!internalUser.CompanyId.HasValue)
            {
                throw WarehouseException.Forbidden("Your Multideck user is not assigned to a company yet.");
            }

            var displayName = string.Join(' ', new[] { internalUser.UserFirstname, internalUser.UserLastname }
                .Where(value => !string.IsNullOrWhiteSpace(value)));
            return new WarehouseActor(
                internalUser.UserId,
                null,
                internalUser.CompanyId,
                string.IsNullOrWhiteSpace(displayName) ? internalUser.UserEmail : displayName,
                internalUser.UserEmail,
                []);
        }

        var now = DateTime.UtcNow;
        var portalUser = await db.PortalExternalIdentities
            .AsNoTracking()
            .Where(identity =>
                identity.PortalIdentityExternalSubject == authUserId.ToString() &&
                identity.PortalIdentityStatusCode == "active" &&
                !identity.PortalIdentityPortalUser.PortalUserIsDeleted &&
                identity.PortalIdentityPortalUser.PortalUserStatusCode == "active" &&
                identity.PortalIdentityPortalUser.PortalUserValidFrom <= now &&
                (!identity.PortalIdentityPortalUser.PortalUserValidUntil.HasValue || identity.PortalIdentityPortalUser.PortalUserValidUntil > now))
            .Select(identity => new
            {
                identity.PortalIdentityPortalUser.PortalUserId,
                identity.PortalIdentityPortalUser.PortalUserDisplayName,
                identity.PortalIdentityPortalUser.PortalUserEmail,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (portalUser is null)
        {
            throw WarehouseException.Forbidden("Your account is not linked to an active Multideck company or customer portal profile.");
        }

        var organisationLinks = await db.PortalUserOrganisations
            .AsNoTracking()
            .Where(link =>
                link.PortalUserOrgPortalUserId == portalUser.PortalUserId &&
                link.PortalUserOrgStatusCode == "active")
            .Select(link => new
            {
                OrganisationId = link.PortalUserOrgOrgId,
                link.PortalUserOrgCanManageOrgUsers,
            })
            .ToListAsync(cancellationToken);
        var organisations = organisationLinks.Select(value => value.OrganisationId).Distinct().ToList();

        var facilityRows = await db.WmsCustomerFacilityAccesses
            .AsNoTracking()
            .Where(access => organisations.Contains(access.WmscustomerFacilityAccessCustomerOrgId) && access.WmscustomerFacilityAccessIsActive)
            .Select(access => new
            {
                OrganisationId = access.WmscustomerFacilityAccessCustomerOrgId,
                FacilityId = access.WmscustomerFacilityAccessFacilityId,
            })
            .ToListAsync(cancellationToken);

        var grants = await db.PortalUserRoles
            .AsNoTracking()
            .Where(assignment =>
                assignment.PortalUserRolePortalUserId == portalUser.PortalUserId &&
                assignment.PortalUserRoleStatusCode == "active" &&
                assignment.PortalUserRoleValidFrom <= now &&
                (!assignment.PortalUserRoleValidUntil.HasValue || assignment.PortalUserRoleValidUntil > now) &&
                assignment.PortalUserRoleRole.PortalRoleIsEnabled)
            .SelectMany(assignment => assignment.PortalUserRoleRole.PortalRolePermissions
                .Where(permission => permission.PortalRolePermIsAllowed)
                .Select(permission => new
                {
                    assignment.PortalUserRoleOrgId,
                    permission.PortalRolePermResourceTypeCode,
                    permission.PortalRolePermActionCode,
                }))
            .ToListAsync(cancellationToken);

        var scopes = organisations.Select(organisationId =>
        {
            var facilityIds = facilityRows
                .Where(value => value.OrganisationId == organisationId)
                .Select(value => value.FacilityId)
                .ToHashSet();
            var capabilities = grants
                .Where(value => !value.PortalUserRoleOrgId.HasValue || value.PortalUserRoleOrgId == organisationId)
                .Select(value => WarehouseCapabilities.FromPortalGrant(value.PortalRolePermResourceTypeCode, value.PortalRolePermActionCode))
                .Where(value => value is not null)
                .Select(value => value!)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (organisationLinks.Any(value => value.OrganisationId == organisationId && value.PortalUserOrgCanManageOrgUsers))
                capabilities.Add(WarehouseCapabilities.UsersManageOwn);
            return new WarehouseOrganisationAccess(organisationId, facilityIds, capabilities);
        }).ToList();

        return new WarehouseActor(null, portalUser.PortalUserId, null, portalUser.PortalUserDisplayName, portalUser.PortalUserEmail, scopes);
    }

    public void RequireCapability(WarehouseActor actor, string capability, Guid? organisationId = null)
    {
        if (!actor.HasCapability(capability, organisationId))
        {
            throw WarehouseException.Forbidden("Your customer portal role does not allow this warehouse action.");
        }
    }
}
