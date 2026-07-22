using System.Security.Claims;

namespace Multideck.Server.Modules.Warehouse.Portal;

public interface IWarehousePortalService
{
    Task<WarehousePortalReferenceResponse> GetReferenceAsync(ClaimsPrincipal principal, CancellationToken cancellationToken);
    Task<IReadOnlyList<WarehousePortalUserDto>> ListUsersAsync(ClaimsPrincipal principal, Guid customerOrgId, CancellationToken cancellationToken);
    Task<WarehousePortalInvitationResult> InviteAsync(ClaimsPrincipal principal, InviteWarehouseCustomerRequest request, CancellationToken cancellationToken);
    Task<WarehousePortalUserDto> UpdateAccessAsync(ClaimsPrincipal principal, Guid portalUserId, Guid customerOrgId, UpdateWarehouseCustomerAccessRequest request, CancellationToken cancellationToken);
    Task RevokeAsync(ClaimsPrincipal principal, Guid portalUserId, Guid customerOrgId, CancellationToken cancellationToken);
}
