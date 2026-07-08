using Asp.Versioning;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;

namespace Multideck.Server.Modules.Warehouse.Locations;

[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/warehouse/facilities/{facilityId:guid}/locations")]
[Produces("application/json")]
public sealed class LocationsController(
    ILocationService locations,
    IValidator<CreateLocationRequest> createValidator,
    IValidator<UpdateLocationRequest> updateValidator) : WarehouseControllerBase
{
    [HttpGet]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<LocationDto>>> List(
        Guid facilityId,
        [FromQuery] string? search,
        [FromQuery] bool includeInactive,
        CancellationToken cancellationToken)
    {
        var result = await locations.ListAsync(User, facilityId, search, includeInactive, cancellationToken);
        return Ok(result);
    }

    [HttpGet("reference")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<LocationReferenceResponse>> Reference(CancellationToken cancellationToken)
    {
        var result = await locations.GetReferenceAsync(User, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{locationId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<LocationDto>> Get(Guid facilityId, Guid locationId, CancellationToken cancellationToken)
    {
        var result = await locations.GetAsync(User, facilityId, locationId, cancellationToken);
        return Ok(result);
    }

    [HttpPost]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<LocationDto>> Create(Guid facilityId, CreateLocationRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(createValidator, request, cancellationToken) is { } validationProblem)
        {
            return validationProblem;
        }

        var result = await locations.CreateAsync(User, facilityId, request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { version = "1.0", facilityId, locationId = result.Id }, result);
    }

    [HttpPut("{locationId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<LocationDto>> Update(Guid facilityId, Guid locationId, UpdateLocationRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(updateValidator, request, cancellationToken) is { } validationProblem)
        {
            return validationProblem;
        }

        var result = await locations.UpdateAsync(User, facilityId, locationId, request, cancellationToken);
        return Ok(result);
    }

    [HttpDelete("{locationId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<IActionResult> Delete(Guid facilityId, Guid locationId, CancellationToken cancellationToken)
    {
        await locations.DeleteAsync(User, facilityId, locationId, cancellationToken);
        return NoContent();
    }
}
