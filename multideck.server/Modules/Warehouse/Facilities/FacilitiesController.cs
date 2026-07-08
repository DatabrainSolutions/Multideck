using Asp.Versioning;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;

namespace Multideck.Server.Modules.Warehouse.Facilities;

[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/warehouse/facilities")]
[Produces("application/json")]
public sealed class FacilitiesController(
    IFacilityService facilities,
    IValidator<CreateFacilityRequest> createValidator,
    IValidator<UpdateFacilityRequest> updateValidator) : WarehouseControllerBase
{
    [HttpGet]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<FacilityDto>>> List(
        [FromQuery] string? search,
        [FromQuery] bool includeInactive,
        CancellationToken cancellationToken)
    {
        var result = await facilities.ListAsync(User, search, includeInactive, cancellationToken);
        return Ok(result);
    }

    [HttpGet("reference")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<FacilityReferenceResponse>> Reference(CancellationToken cancellationToken)
    {
        var result = await facilities.GetReferenceAsync(User, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{facilityId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<FacilityDto>> Get(Guid facilityId, CancellationToken cancellationToken)
    {
        var result = await facilities.GetAsync(User, facilityId, cancellationToken);
        return Ok(result);
    }

    [HttpPost]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<FacilityDto>> Create(CreateFacilityRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(createValidator, request, cancellationToken) is { } validationProblem)
        {
            return validationProblem;
        }

        var result = await facilities.CreateAsync(User, request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { version = "1.0", facilityId = result.Id }, result);
    }

    [HttpPut("{facilityId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<FacilityDto>> Update(Guid facilityId, UpdateFacilityRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(updateValidator, request, cancellationToken) is { } validationProblem)
        {
            return validationProblem;
        }

        var result = await facilities.UpdateAsync(User, facilityId, request, cancellationToken);
        return Ok(result);
    }

    [HttpDelete("{facilityId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<IActionResult> Delete(Guid facilityId, CancellationToken cancellationToken)
    {
        await facilities.DeleteAsync(User, facilityId, cancellationToken);
        return NoContent();
    }
}
