using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Authorization;

public sealed class UserPermissionService(MultideckContext db, IWarehouseContext warehouseContext) : IUserPermissionService
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
            .SelectMany(role => role.SysPermissions)
            .Select(permission => permission.SysPermissionValue)
            .Distinct()
            .ToListAsync(cancellationToken);

        var granted = permissions.ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (granted.Count > 0)
        {
            return granted;
        }

        // Portal roles use resource/action grants rather than internal application permissions.
        // Expose the two broad controller gates here; every warehouse service then applies the
        // exact own-organisation capability and row scope before reading or mutating data.
        try
        {
            var actor = await warehouseContext.RequireCurrentActorAsync(user, cancellationToken);
            if (!actor.IsCustomer)
            {
                return granted;
            }

            var capabilities = actor.Organisations
                .SelectMany(scope => scope.Capabilities)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var capability in capabilities)
            {
                granted.Add(capability);
            }

            if (capabilities.Count > 0)
            {
                granted.Add(AppPermissions.Warehouse.ReadValue);
            }

            if (capabilities.Any(value => value is
                WarehouseCapabilities.ItemsManageOwn or
                WarehouseCapabilities.OrdersCreateInboundOwn or
                WarehouseCapabilities.OrdersCreateOutboundOwn or
                WarehouseCapabilities.OrdersCancelOwn or
                WarehouseCapabilities.DocumentsUploadOwn or
                WarehouseCapabilities.UsersManageOwn))
            {
                granted.Add(AppPermissions.Warehouse.WriteValue);
            }
        }
        catch (WarehouseException)
        {
            // An unlinked authenticated account has no application permissions.
        }

        return granted;
    }

    public async Task<bool> HasPermissionAsync(ClaimsPrincipal user, string permissionValue, CancellationToken cancellationToken)
    {
        var permissions = await GetGrantedPermissionValuesAsync(user, cancellationToken);
        return permissions.Contains(permissionValue);
    }
}
