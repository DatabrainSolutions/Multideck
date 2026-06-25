using System.Security.Claims;

namespace Multideck.Server.Authorization;

public interface IUserPermissionService
{
    Task<IReadOnlySet<string>> GetGrantedPermissionValuesAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<bool> HasPermissionAsync(ClaimsPrincipal user, string permissionValue, CancellationToken cancellationToken);
}
