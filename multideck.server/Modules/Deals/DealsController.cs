using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.Deals;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/crm/deals")]
[Produces("application/json")]
[TypeFilter(typeof(WarehouseExceptionFilter))]
public sealed class DealsController(IDealService deals) : WarehouseControllerBase
{
    [HttpGet]
    [RequirePermission(AppPermissions.Customers.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<DealDto>>> List(CancellationToken cancellationToken)
    {
        return Ok(await deals.ListAsync(User, cancellationToken));
    }

    [HttpGet("conversion-options")]
    [RequirePermission(AppPermissions.Customers.ReadValue)]
    public async Task<ActionResult<DealConversionOptionsDto>> ConversionOptions(CancellationToken cancellationToken)
    {
        return Ok(await deals.GetConversionOptionsAsync(User, cancellationToken));
    }

    [HttpPost("from-lead/{leadId:guid}")]
    [RequirePermission(AppPermissions.Customers.WriteValue)]
    public async Task<ActionResult<DealDto>> ConvertLead(
        Guid leadId,
        [FromBody] ConvertLeadToDealRequest request,
        CancellationToken cancellationToken)
    {
        var result = await deals.ConvertLeadAsync(User, leadId, request, cancellationToken);
        return CreatedAtAction(nameof(List), new { version = "1.0" }, result);
    }

    [HttpPut("{dealId:guid}/stage")]
    [RequirePermission(AppPermissions.Customers.WriteValue)]
    public async Task<ActionResult<DealDto>> MoveStage(
        Guid dealId,
        [FromBody] MoveDealStageRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await deals.MoveStageAsync(User, dealId, request, cancellationToken));
    }
}
