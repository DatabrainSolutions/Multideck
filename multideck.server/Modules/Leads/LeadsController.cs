using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.Leads;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/crm/leads")]
[Produces("application/json")]
[TypeFilter(typeof(WarehouseExceptionFilter))]
public sealed class LeadsController(ILeadService leads) : WarehouseControllerBase
{
    [HttpGet]
    [RequirePermission(AppPermissions.Customers.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<LeadDto>>> List([FromQuery] string? search, CancellationToken cancellationToken)
    {
        var result = await leads.ListAsync(User, search, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{leadId:guid}")]
    [RequirePermission(AppPermissions.Customers.ReadValue)]
    public async Task<ActionResult<LeadDetailDto>> Get(Guid leadId, CancellationToken cancellationToken)
    {
        var result = await leads.GetAsync(User, leadId, cancellationToken);
        return Ok(result);
    }
}
