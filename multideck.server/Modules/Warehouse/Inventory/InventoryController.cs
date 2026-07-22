using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;

namespace Multideck.Server.Modules.Warehouse.Inventory;

[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/warehouse/inventory")]
[Produces("application/json")]
public sealed class InventoryController(IInventoryService inventory) : WarehouseControllerBase
{
    [HttpGet]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<InventoryBalanceDto>>> List(
        [FromQuery] Guid? facilityId,
        [FromQuery] Guid? itemId,
        [FromQuery] string? search,
        [FromQuery] bool includeZero,
        CancellationToken cancellationToken)
    {
        var result = await inventory.ListBalancesAsync(User, facilityId, itemId, search, includeZero, cancellationToken);
        return Ok(result);
    }

    [HttpGet("movements")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<InventoryMovementDto>>> Movements(
        [FromQuery] Guid? facilityId,
        [FromQuery] Guid? itemId,
        [FromQuery] string? search,
        [FromQuery] int take = 100,
        CancellationToken cancellationToken = default)
    {
        var result = await inventory.ListMovementsAsync(User, facilityId, itemId, search, take, cancellationToken);
        return Ok(result);
    }
}
