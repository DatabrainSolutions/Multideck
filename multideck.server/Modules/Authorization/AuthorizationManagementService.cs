using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Authorization;

namespace Multideck.Server.Modules.Authorization;

public sealed class AuthorizationManagementService(MultideckContext db) : IAuthorizationManagementService
{
    public async Task<AuthorizationStateResponse> GetAuthorizationStateAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        await EnsurePermissionCatalogAsync(cancellationToken);

        var currentUser = await GetCurrentCmpUser(user, trackChanges: false, cancellationToken);
        if (currentUser is null)
        {
            throw new AuthorizationManagementException("User profile is not linked", "Your Supabase account is not linked to a Multideck company profile yet.", StatusCodes.Status403Forbidden);
        }

        if (!currentUser.CompanyId.HasValue)
        {
            throw new AuthorizationManagementException("Company profile is not linked", "Your Multideck user is not assigned to a company yet.", StatusCodes.Status403Forbidden);
        }

        var permissions = await db.SysPermissions
            .AsNoTracking()
            .OrderBy(permission => permission.SysPermissionGroup)
            .ThenBy(permission => permission.SysPermissionValue)
            .Select(permission => ToPermissionDto(permission))
            .ToListAsync(cancellationToken);

        var roles = await db.SysUserRoles
            .AsNoTracking()
            .Include(role => role.Permissions)
            .OrderBy(role => role.SysUserRoleName)
            .ToListAsync(cancellationToken);

        var teamUsers = await db.CmpUsers
            .AsNoTracking()
            .Where(teamUser => teamUser.CompanyId == currentUser.CompanyId.Value)
            .Include(teamUser => teamUser.SysUserRoles)
            .OrderBy(teamUser => teamUser.UserFirstname)
            .ThenBy(teamUser => teamUser.UserLastname)
            .ThenBy(teamUser => teamUser.UserEmail)
            .ToListAsync(cancellationToken);

        var userRoles = teamUsers.Select(teamUser => new UserRoleAssignmentDto(
                teamUser.UserId,
                teamUser.SysUserRoles
                    .OrderBy(role => role.SysUserRoleName)
                    .Select(role => role.SysUserRoleId)
                    .ToList()))
            .ToList();

        return new AuthorizationStateResponse(
            permissions,
            roles.Select(ToRoleDto).ToList(),
            userRoles);
    }

    public async Task<RoleDto> CreateRoleAsync(CreateRoleRequest request, CancellationToken cancellationToken)
    {
        await EnsurePermissionCatalogAsync(cancellationToken);

        var roleName = NormalizeRoleName(request.Name);
        var errors = new Dictionary<string, string[]>();

        if (roleName is null)
        {
            errors[nameof(request.Name)] = ["Enter a role name."];
        }
        else if (roleName.Length > 50)
        {
            errors[nameof(request.Name)] = ["Role names must be 50 characters or fewer."];
        }
        else if (await db.SysUserRoles.AnyAsync(role => role.SysUserRoleName.ToLower() == roleName.ToLower(), cancellationToken))
        {
            errors[nameof(request.Name)] = ["A role with this name already exists."];
        }

        var requestedValues = NormalizePermissionValues(request.PermissionValues);
        if (requestedValues.UnknownValues.Count > 0)
        {
            errors[nameof(request.PermissionValues)] = requestedValues.UnknownValues.Select(value => $"Unknown permission '{value}'.").ToArray();
        }

        if (errors.Count > 0)
        {
            throw new AuthorizationValidationException(errors);
        }

        var permissions = await db.SysPermissions
            .Where(permission => requestedValues.Values.Contains(permission.SysPermissionValue))
            .ToListAsync(cancellationToken);

        var role = new SysUserRole { SysUserRoleName = roleName! };
        foreach (var permission in permissions.OrderBy(permission => permission.SysPermissionValue))
        {
            role.Permissions.Add(permission);
        }

        db.SysUserRoles.Add(role);
        await db.SaveChangesAsync(cancellationToken);

        return ToRoleDto(role);
    }

    public async Task<RoleDto> UpdateRolePermissionsAsync(Guid roleId, UpdateRolePermissionsRequest request, CancellationToken cancellationToken)
    {
        await EnsurePermissionCatalogAsync(cancellationToken);

        var requestedValues = NormalizePermissionValues(request.PermissionValues);
        if (requestedValues.UnknownValues.Count > 0)
        {
            throw new AuthorizationValidationException(new Dictionary<string, string[]>
            {
                [nameof(request.PermissionValues)] = requestedValues.UnknownValues.Select(value => $"Unknown permission '{value}'.").ToArray(),
            });
        }

        var role = await db.SysUserRoles
            .Include(item => item.Permissions)
            .FirstOrDefaultAsync(item => item.SysUserRoleId == roleId, cancellationToken);

        if (role is null)
        {
            throw new AuthorizationManagementException("Role not found", "Choose a valid role before changing permissions.", StatusCodes.Status404NotFound);
        }

        var roleDefinition = SystemRoleDefinitions.FindByName(role.SysUserRoleName);
        if (roleDefinition?.CanEditPermissions == false)
        {
            throw new AuthorizationManagementException("Role is protected", "The Administrator role is built in and always keeps every permission to prevent workspace lockout.", StatusCodes.Status400BadRequest);
        }

        var permissions = await db.SysPermissions
            .Where(permission => requestedValues.Values.Contains(permission.SysPermissionValue))
            .ToListAsync(cancellationToken);

        role.Permissions.Clear();
        foreach (var permission in permissions.OrderBy(permission => permission.SysPermissionValue))
        {
            role.Permissions.Add(permission);
        }

        await db.SaveChangesAsync(cancellationToken);
        return ToRoleDto(role);
    }

    public async Task DeleteRoleAsync(Guid roleId, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        await EnsurePermissionCatalogAsync(cancellationToken);
        await EnsureCurrentUserIsAdministratorAsync(user, cancellationToken);

        var role = await db.SysUserRoles
            .Include(item => item.Permissions)
            .FirstOrDefaultAsync(item => item.SysUserRoleId == roleId, cancellationToken);

        if (role is null)
        {
            throw new AuthorizationManagementException("Role not found", "Choose a valid role before deleting it.", StatusCodes.Status404NotFound);
        }

        if (SystemRoleDefinitions.FindByName(role.SysUserRoleName) is not null)
        {
            throw new AuthorizationManagementException("Role is protected", "Built-in roles cannot be deleted. Create and delete custom roles instead.", StatusCodes.Status400BadRequest);
        }

        var roleIsAssigned = await db.CmpUsers
            .AsNoTracking()
            .AnyAsync(teamUser => teamUser.SysUserRoles.Any(userRole => userRole.SysUserRoleId == roleId), cancellationToken);

        if (roleIsAssigned)
        {
            throw new AuthorizationManagementException("Role is still assigned", "Move every user off this role before deleting it.", StatusCodes.Status400BadRequest);
        }

        role.Permissions.Clear();
        db.SysUserRoles.Remove(role);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<UserRoleAssignmentDto> UpdateUserRolesAsync(
        Guid userId,
        UpdateUserRolesRequest request,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        await EnsurePermissionCatalogAsync(cancellationToken);

        var roleIds = (request.RoleIds ?? [])
            .Where(roleId => roleId != Guid.Empty)
            .Distinct()
            .ToList();

        if (roleIds.Count == 0)
        {
            throw new AuthorizationValidationException(new Dictionary<string, string[]>
            {
                [nameof(request.RoleIds)] = ["Choose at least one role."],
            });
        }

        var currentUser = await GetCurrentCmpUser(user, trackChanges: false, cancellationToken);
        if (currentUser is null)
        {
            throw new AuthorizationManagementException("User profile is not linked", "Your Supabase account is not linked to a Multideck company profile yet.", StatusCodes.Status403Forbidden);
        }

        if (!currentUser.CompanyId.HasValue)
        {
            throw new AuthorizationManagementException("Company profile is not linked", "Your Multideck user is not assigned to a company yet.", StatusCodes.Status403Forbidden);
        }

        var roles = await db.SysUserRoles
            .Where(role => roleIds.Contains(role.SysUserRoleId))
            .ToListAsync(cancellationToken);

        if (roles.Count != roleIds.Count)
        {
            throw new AuthorizationValidationException(new Dictionary<string, string[]>
            {
                [nameof(request.RoleIds)] = ["Choose valid roles before updating the user."],
            });
        }

        var targetUser = await db.CmpUsers
            .Include(item => item.SysUserRoles)
            .FirstOrDefaultAsync(item => item.UserId == userId, cancellationToken);

        if (targetUser is null)
        {
            throw new AuthorizationManagementException("User not found", "Choose a valid team user before changing roles.", StatusCodes.Status404NotFound);
        }

        if (targetUser.CompanyId != currentUser.CompanyId.Value)
        {
            throw new AuthorizationManagementException("User is not in this company", "You can only change roles for users in your company.", StatusCodes.Status403Forbidden);
        }

        await ProtectLastAdministratorAsync(targetUser, roles, currentUser.CompanyId.Value, cancellationToken);

        targetUser.SysUserRoles.Clear();
        foreach (var role in roles.OrderBy(role => role.SysUserRoleName))
        {
            targetUser.SysUserRoles.Add(role);
        }

        await db.SaveChangesAsync(cancellationToken);

        return new UserRoleAssignmentDto(targetUser.UserId, targetUser.SysUserRoles
            .OrderBy(role => role.SysUserRoleName)
            .Select(role => role.SysUserRoleId)
            .ToList());
    }

    private async Task EnsureCurrentUserIsAdministratorAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(user.FindFirstValue("sub"), out var authUserId))
        {
            throw new AuthorizationManagementException("Administrator role is required", "Only administrators can delete roles.", StatusCodes.Status403Forbidden);
        }

        var isAdministrator = await db.CmpUsers
            .AsNoTracking()
            .Where(profile => profile.AuthUserId == authUserId)
            .AnyAsync(profile => profile.SysUserRoles.Any(role => role.SysUserRoleName == SystemRoleDefinitions.Administrator.Name), cancellationToken);

        if (!isAdministrator)
        {
            throw new AuthorizationManagementException("Administrator role is required", "Only administrators can delete roles.", StatusCodes.Status403Forbidden);
        }
    }

    private async Task ProtectLastAdministratorAsync(
        CmpUser targetUser,
        IReadOnlyCollection<SysUserRole> requestedRoles,
        Guid companyId,
        CancellationToken cancellationToken)
    {
        var administratorRole = await db.SysUserRoles
            .AsNoTracking()
            .FirstOrDefaultAsync(role => role.SysUserRoleName == SystemRoleDefinitions.Administrator.Name, cancellationToken);

        if (administratorRole is null)
        {
            return;
        }

        var targetHadAdministrator = targetUser.SysUserRoles.Any(role => role.SysUserRoleId == administratorRole.SysUserRoleId);
        var targetKeepsAdministrator = requestedRoles.Any(role => role.SysUserRoleId == administratorRole.SysUserRoleId);
        if (!targetHadAdministrator || targetKeepsAdministrator)
        {
            return;
        }

        var anotherAdministratorExists = await db.CmpUsers
            .AsNoTracking()
            .Where(teamUser => teamUser.CompanyId == companyId && teamUser.UserId != targetUser.UserId)
            .AnyAsync(teamUser => teamUser.SysUserRoles.Any(role => role.SysUserRoleId == administratorRole.SysUserRoleId), cancellationToken);

        if (!anotherAdministratorExists)
        {
            throw new AuthorizationManagementException(
                "Administrator role is required",
                "Keep at least one administrator in the company before changing this user's roles.",
                StatusCodes.Status400BadRequest);
        }
    }

    private async Task EnsurePermissionCatalogAsync(CancellationToken cancellationToken)
    {
        var permissions = await db.SysPermissions.ToListAsync(cancellationToken);
        var permissionsByValue = permissions.ToDictionary(permission => permission.SysPermissionValue, StringComparer.OrdinalIgnoreCase);
        var changed = false;

        foreach (var definition in AppPermissions.All)
        {
            if (!permissionsByValue.TryGetValue(definition.Value, out var permission))
            {
                permission = new SysPermission
                {
                    SysPermissionValue = definition.Value,
                    SysPermissionGroup = definition.Group,
                    SysPermissionName = definition.Name,
                    SysPermissionDescription = definition.Description,
                    SysPermissionIsDangerous = definition.IsDangerous,
                };

                db.SysPermissions.Add(permission);
                permissionsByValue[definition.Value] = permission;
                changed = true;
                continue;
            }

            if (permission.SysPermissionGroup != definition.Group ||
                permission.SysPermissionName != definition.Name ||
                permission.SysPermissionDescription != definition.Description ||
                permission.SysPermissionIsDangerous != definition.IsDangerous)
            {
                permission.SysPermissionGroup = definition.Group;
                permission.SysPermissionName = definition.Name;
                permission.SysPermissionDescription = definition.Description;
                permission.SysPermissionIsDangerous = definition.IsDangerous;
                changed = true;
            }
        }

        if (changed)
        {
            await db.SaveChangesAsync(cancellationToken);
            permissions = await db.SysPermissions.ToListAsync(cancellationToken);
            permissionsByValue = permissions.ToDictionary(permission => permission.SysPermissionValue, StringComparer.OrdinalIgnoreCase);
        }

        var roles = await db.SysUserRoles
            .Include(role => role.Permissions)
            .ToListAsync(cancellationToken);
        var rolesByName = roles
            .GroupBy(role => role.SysUserRoleName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        changed = false;

        foreach (var roleDefinition in SystemRoleDefinitions.All)
        {
            if (!rolesByName.TryGetValue(roleDefinition.Name, out var role))
            {
                role = new SysUserRole { SysUserRoleName = roleDefinition.Name };
                db.SysUserRoles.Add(role);
                rolesByName[roleDefinition.Name] = role;
                changed = true;
            }

            if (roleDefinition == SystemRoleDefinitions.Administrator || role.Permissions.Count == 0)
            {
                var targetValues = roleDefinition.Permissions.Select(permission => permission.Value).ToHashSet(StringComparer.OrdinalIgnoreCase);
                foreach (var permission in permissionsByValue.Values.Where(permission => targetValues.Contains(permission.SysPermissionValue)))
                {
                    if (role.Permissions.All(existing => existing.SysPermissionValue != permission.SysPermissionValue))
                    {
                        role.Permissions.Add(permission);
                        changed = true;
                    }
                }
            }
        }

        if (changed)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task<CmpUser?> GetCurrentCmpUser(ClaimsPrincipal user, bool trackChanges, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(user.FindFirstValue("sub"), out var authUserId))
        {
            return null;
        }

        var query = db.CmpUsers.AsQueryable();
        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        return await query.FirstOrDefaultAsync(profile => profile.AuthUserId == authUserId, cancellationToken);
    }

    private static PermissionDto ToPermissionDto(SysPermission permission)
    {
        return new PermissionDto(
            permission.SysPermissionId,
            permission.SysPermissionValue,
            permission.SysPermissionGroup,
            permission.SysPermissionName,
            permission.SysPermissionDescription,
            permission.SysPermissionIsDangerous);
    }

    private static RoleDto ToRoleDto(SysUserRole role)
    {
        var roleDefinition = SystemRoleDefinitions.FindByName(role.SysUserRoleName);
        return new RoleDto(
            role.SysUserRoleId,
            role.SysUserRoleName,
            roleDefinition?.Description ?? "Custom role.",
            roleDefinition is not null,
            roleDefinition?.CanEditPermissions ?? true,
            role.Permissions
                .OrderBy(permission => permission.SysPermissionValue)
                .Select(permission => permission.SysPermissionValue)
                .ToList());
    }

    private static string? NormalizeRoleName(string? name)
    {
        var trimmed = name?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return null;
        }

        return string.Join(' ', trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private static NormalizedPermissionValues NormalizePermissionValues(IReadOnlyList<string>? permissionValues)
    {
        var values = new List<string>();
        var unknownValues = new List<string>();

        foreach (var rawValue in permissionValues ?? [])
        {
            var value = rawValue.Trim();
            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            if (!AppPermissions.ByValue.TryGetValue(value, out var definition))
            {
                unknownValues.Add(value);
                continue;
            }

            if (!values.Contains(definition.Value, StringComparer.OrdinalIgnoreCase))
            {
                values.Add(definition.Value);
            }
        }

        return new NormalizedPermissionValues(values, unknownValues);
    }

    private sealed record NormalizedPermissionValues(IReadOnlyList<string> Values, IReadOnlyList<string> UnknownValues);
}
