using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;

namespace Multideck.Server.Modules.Warehouse;

/// <summary>
/// The signed-in operator resolved to their Multideck company. Warehouse data is scoped to this
/// company so users only ever see and change facilities and items that belong to their workspace.
/// </summary>
public sealed record WarehouseUser(Guid UserId, Guid CompanyId);

public interface IWarehouseContext
{
    Task<WarehouseUser> RequireCurrentUserAsync(ClaimsPrincipal principal, CancellationToken cancellationToken);
}

public sealed class WarehouseContext(MultideckContext db) : IWarehouseContext
{
    public async Task<WarehouseUser> RequireCurrentUserAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var authUserId))
        {
            throw WarehouseException.Forbidden("Your session is not linked to a Multideck user profile yet.");
        }

        var user = await db.CmpUsers
            .AsNoTracking()
            .Where(profile => profile.AuthUserId == authUserId)
            .Select(profile => new { profile.UserId, profile.CompanyId })
            .FirstOrDefaultAsync(cancellationToken);

        if (user is null)
        {
            throw WarehouseException.Forbidden("Your Supabase account is not linked to a Multideck company profile yet.");
        }

        if (!user.CompanyId.HasValue)
        {
            throw WarehouseException.Forbidden("Your Multideck user is not assigned to a company yet.");
        }

        return new WarehouseUser(user.UserId, user.CompanyId.Value);
    }
}
