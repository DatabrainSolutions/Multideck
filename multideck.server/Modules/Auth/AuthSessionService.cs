using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;

namespace Multideck.Server.Modules.Auth;

public sealed class AuthSessionService(MultideckContext db) : IAuthSessionService
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
            return null;
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
            status = cmpUser.AuthUserId.HasValue ? "Active" : "Profile only",
        };
    }

    private static DateTimeOffset? TryReadUnixTime(string? value)
    {
        return long.TryParse(value, out var seconds) ? DateTimeOffset.FromUnixTimeSeconds(seconds) : null;
    }
}
