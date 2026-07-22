using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;

namespace Multideck.Server.Modules.Warehouse.Portal;

[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/warehouse/portal")]
[Produces("application/json")]
public sealed class WarehousePortalController(IWarehousePortalService portal) : WarehouseControllerBase
{
    [HttpGet("reference")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<WarehousePortalReferenceResponse>> Reference(CancellationToken cancellationToken) =>
        Ok(await portal.GetReferenceAsync(User, cancellationToken));

    [HttpGet("customers/{customerOrgId:guid}/users")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<IReadOnlyList<WarehousePortalUserDto>>> Users(Guid customerOrgId, CancellationToken cancellationToken) =>
        Ok(await portal.ListUsersAsync(User, customerOrgId, cancellationToken));

    [HttpPost("invitations")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<WarehousePortalInvitationResult>> Invite(InviteWarehouseCustomerRequest request, CancellationToken cancellationToken) =>
        Ok(await portal.InviteAsync(User, request, cancellationToken));

    [HttpPut("customers/{customerOrgId:guid}/users/{portalUserId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<WarehousePortalUserDto>> Update(Guid customerOrgId, Guid portalUserId, UpdateWarehouseCustomerAccessRequest request, CancellationToken cancellationToken) =>
        Ok(await portal.UpdateAccessAsync(User, portalUserId, customerOrgId, request, cancellationToken));

    [HttpDelete("customers/{customerOrgId:guid}/users/{portalUserId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<IActionResult> Revoke(Guid customerOrgId, Guid portalUserId, CancellationToken cancellationToken)
    {
        await portal.RevokeAsync(User, portalUserId, customerOrgId, cancellationToken);
        return NoContent();
    }
}
