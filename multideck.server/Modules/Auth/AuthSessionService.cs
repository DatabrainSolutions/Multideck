using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Authorization;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.Auth;

public sealed class AuthSessionService(
    MultideckContext db,
    IWarehouseContext warehouseContext,
    IUserPermissionService permissionService) : IAuthSessionService
{
    public object CreateSessionResponse(ClaimsPrincipal user, object? profile)
    {
        var expiresAt = TryReadUnixTime(user.FindFirstValue("exp"));

        return new
        {
            authenticated = user.Identity?.IsAuthenticated == true,
            user = new
            {
                id = user.FindFirstValue("sub"),
                email = user.FindFirstValue("email"),
                role = user.FindFirstValue("role"),
                audience = user.FindFirstValue("aud"),
            },
            profile,
            expiresAt,
        };
    }

    public async Task<object?> CreateProfileResponseAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(user.FindFirstValue("sub"), out var authUserId))
        {
            return null;
        }

        var cmpUser = await db.CmpUsers
            .AsNoTracking()
            .Include(profile => profile.Company)
            .Include(profile => profile.Offices)
            .Include(profile => profile.SysUserRoles)
            .FirstOrDefaultAsync(profile => profile.AuthUserId == authUserId, cancellationToken);

        if (cmpUser is null)
        {
            try
            {
                var actor = await warehouseContext.RequireCurrentActorAsync(user, cancellationToken);
                if (!actor.IsCustomer)
                {
                    return null;
                }

                var organisationIds = actor.OrganisationIds;
                var organisationRows = await db.OrgMasters
                    .AsNoTracking()
                    .Where(organisation => organisationIds.Contains(organisation.OrgId))
                    .OrderBy(organisation => organisation.OrgName)
                    .Select(organisation => new
                    {
                        id = organisation.OrgId,
                        name = organisation.OrgName,
                    })
                    .ToListAsync(cancellationToken);
                var organisations = organisationRows.Select(organisation => new
                {
                    organisation.id,
                    organisation.name,
                    canManageWarehouseUsers = actor.HasCapability(WarehouseCapabilities.UsersManageOwn, organisation.id),
                }).ToList();
                var permissions = await permissionService.GetGrantedPermissionValuesAsync(user, cancellationToken);

                return new
                {
                    id = actor.PortalUserId,
                    authUserId,
                    displayName = actor.DisplayName,
                    firstName = (string?)null,
                    lastName = (string?)null,
                    email = actor.Email,
                    actorType = "customer",
                    company = (object?)null,
                    offices = Array.Empty<object>(),
                    organisations,
                    roles = Array.Empty<object>(),
                    permissions = permissions.OrderBy(value => value).ToArray(),
                    landingPath = "/warehouse/inventory",
                    status = "Active",
                    jobTitle = (string?)null,
                    profilePhoto = (object?)null,
                    coverPhoto = (object?)null,
                };
            }
            catch (WarehouseException)
            {
                return null;
            }
        }

        var nameParts = new[] { cmpUser.UserFirstname, cmpUser.UserLastname }
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .Select(part => part!.Trim());
        var displayName = string.Join(' ', nameParts);

        return new
        {
            id = cmpUser.UserId,
            authUserId = cmpUser.AuthUserId,
            displayName = string.IsNullOrWhiteSpace(displayName) ? cmpUser.UserEmail : displayName,
            firstName = cmpUser.UserFirstname,
            lastName = cmpUser.UserLastname,
            email = cmpUser.UserEmail,
            actorType = "internal",
            company = cmpUser.Company is null ? null : new
            {
                id = cmpUser.Company.CompanyId,
                name = cmpUser.Company.CompanyName,
            },
            offices = cmpUser.Offices
                .OrderBy(office => office.OfficeName)
                .Select(office => new
                {
                    id = office.OfficeId,
                    name = office.OfficeName,
                    address = office.OfficeAddress,
                }),
            roles = cmpUser.SysUserRoles
                .OrderBy(role => role.SysUserRoleName)
                .Select(role => new
                {
                    id = role.SysUserRoleId,
                    name = role.SysUserRoleName,
                }),
            organisations = Array.Empty<object>(),
            permissions = (await permissionService.GetGrantedPermissionValuesAsync(user, cancellationToken)).OrderBy(value => value).ToArray(),
            landingPath = "/",
            status = cmpUser.AuthUserId.HasValue ? "Active" : "Profile only",
            jobTitle = cmpUser.UserJobTitle,
            profilePhoto = CreateProfilePhotoResponse(cmpUser),
            coverPhoto = CreateCoverPhotoResponse(cmpUser),
        };
    }

    private static object? CreateProfilePhotoResponse(CmpUser user)
    {
        if (string.IsNullOrWhiteSpace(user.UserProfilePhotoBucket)
            || string.IsNullOrWhiteSpace(user.UserProfilePhotoPath)
            || string.IsNullOrWhiteSpace(user.UserProfilePhotoMimeType)
            || !user.UserProfilePhotoSizeBytes.HasValue
            || !user.UserProfilePhotoUpdatedAt.HasValue)
        {
            return null;
        }

        return new
        {
            bucket = user.UserProfilePhotoBucket,
            path = user.UserProfilePhotoPath,
            mimeType = user.UserProfilePhotoMimeType,
            sizeBytes = user.UserProfilePhotoSizeBytes.Value,
            updatedAt = user.UserProfilePhotoUpdatedAt.Value,
        };
    }

    private static object? CreateCoverPhotoResponse(CmpUser user)
    {
        if (string.IsNullOrWhiteSpace(user.UserCoverPhotoBucket)
            || string.IsNullOrWhiteSpace(user.UserCoverPhotoPath)
            || string.IsNullOrWhiteSpace(user.UserCoverPhotoMimeType)
            || !user.UserCoverPhotoSizeBytes.HasValue
            || !user.UserCoverPhotoUpdatedAt.HasValue)
        {
            return null;
        }

        return new
        {
            bucket = user.UserCoverPhotoBucket,
            path = user.UserCoverPhotoPath,
            mimeType = user.UserCoverPhotoMimeType,
            sizeBytes = user.UserCoverPhotoSizeBytes.Value,
            updatedAt = user.UserCoverPhotoUpdatedAt.Value,
        };
    }

    private static DateTimeOffset? TryReadUnixTime(string? value)
    {
        return long.TryParse(value, out var seconds) ? DateTimeOffset.FromUnixTimeSeconds(seconds) : null;
    }
}
