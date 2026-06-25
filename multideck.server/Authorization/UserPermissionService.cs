using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;

namespace Multideck.Server.Authorization;

public sealed class UserPermissionService(MultideckContext db) : IUserPermissionService
{
    public async Task<IReadOnlySet<string>> GetGrantedPermissionValuesAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(user.FindFirstValue("sub"), out var authUserId))
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        var permissions = await db.CmpUsers
            .AsNoTracking()
            .Where(profile => profile.AuthUserId == authUserId)
            .SelectMany(profile => profile.SysUserRoles)
            .SelectMany(role => role.Permissions)
            .Select(permission => permission.SysPermissionValue)
            .Distinct()
            .ToListAsync(cancellationToken);

        return permissions.ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public async Task<bool> HasPermissionAsync(ClaimsPrincipal user, string permissionValue, CancellationToken cancellationToken)
    {
        var permissions = await GetGrantedPermissionValuesAsync(user, cancellationToken);
        return permissions.Contains(permissionValue);
    }
}
