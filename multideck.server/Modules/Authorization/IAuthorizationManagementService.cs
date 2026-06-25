using System.Security.Claims;

namespace Multideck.Server.Modules.Authorization;

public interface IAuthorizationManagementService
{
    Task<AuthorizationStateResponse> GetAuthorizationStateAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<RoleDto> CreateRoleAsync(CreateRoleRequest request, CancellationToken cancellationToken);
    Task<RoleDto> UpdateRolePermissionsAsync(Guid roleId, UpdateRolePermissionsRequest request, CancellationToken cancellationToken);
    Task DeleteRoleAsync(Guid roleId, ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<UserRoleAssignmentDto> UpdateUserRolesAsync(Guid userId, UpdateUserRolesRequest request, ClaimsPrincipal user, CancellationToken cancellationToken);
}
