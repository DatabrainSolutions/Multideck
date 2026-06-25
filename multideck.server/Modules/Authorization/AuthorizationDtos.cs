namespace Multideck.Server.Modules.Authorization;

public sealed record PermissionDto(
    Guid Id,
    string Value,
    string Group,
    string Name,
    string Description,
    bool IsDangerous);

public sealed record RoleDto(
    Guid Id,
    string Name,
    string Description,
    bool IsSystem,
    bool CanEditPermissions,
    IReadOnlyList<string> PermissionValues);

public sealed record UserRoleAssignmentDto(Guid UserId, IReadOnlyList<Guid> RoleIds);

public sealed record AuthorizationStateResponse(
    IReadOnlyList<PermissionDto> Permissions,
    IReadOnlyList<RoleDto> Roles,
    IReadOnlyList<UserRoleAssignmentDto> UserRoles);

public sealed record CreateRoleRequest(string Name, IReadOnlyList<string> PermissionValues);

public sealed record UpdateRolePermissionsRequest(IReadOnlyList<string> PermissionValues);

public sealed record UpdateUserRolesRequest(IReadOnlyList<Guid> RoleIds);
