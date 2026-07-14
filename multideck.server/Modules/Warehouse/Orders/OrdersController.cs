using Asp.Versioning;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;

namespace Multideck.Server.Modules.Warehouse.Orders;

[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/warehouse/orders")]
[Produces("application/json")]
public sealed class OrdersController(
    IWarehouseOrderService orders,
    IValidator<CreateWarehouseOrderRequest> createValidator,
    IValidator<ReceiveWarehouseOrderRequest> receiveValidator,
    IValidator<DispatchWarehouseOrderRequest> dispatchValidator) : WarehouseControllerBase
{
    [HttpGet]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<WarehouseOrderDto>>> List(
        [FromQuery] Guid? facilityId,
        [FromQuery] string? typeCode,
        [FromQuery] string? statusCode,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var result = await orders.ListAsync(User, facilityId, typeCode, statusCode, search, cancellationToken);
        return Ok(result);
    }

    [HttpGet("reference")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<WarehouseOrderReferenceResponse>> Reference(CancellationToken cancellationToken)
    {
        return Ok(await orders.GetReferenceAsync(User, cancellationToken));
    }

    [HttpGet("{orderId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<WarehouseOrderDto>> Get(Guid orderId, CancellationToken cancellationToken)
    {
        return Ok(await orders.GetAsync(User, orderId, cancellationToken));
    }

    [HttpPost]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<WarehouseOrderDto>> Create(CreateWarehouseOrderRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(createValidator, request, cancellationToken) is { } validationProblem) return validationProblem;
        var result = await orders.CreateAsync(User, request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { version = "1.0", orderId = result.Id }, result);
    }

    [HttpPost("{orderId:guid}/receive")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<WarehouseOrderDto>> Receive(Guid orderId, ReceiveWarehouseOrderRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(receiveValidator, request, cancellationToken) is { } validationProblem) return validationProblem;
        return Ok(await orders.ReceiveAsync(User, orderId, request, cancellationToken));
    }

    [HttpPost("{orderId:guid}/dispatch")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<WarehouseOrderDto>> Dispatch(Guid orderId, DispatchWarehouseOrderRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(dispatchValidator, request, cancellationToken) is { } validationProblem) return validationProblem;
        return Ok(await orders.DispatchAsync(User, orderId, request, cancellationToken));
    }

    [HttpPost("{orderId:guid}/cancel")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<WarehouseOrderDto>> Cancel(Guid orderId, CancellationToken cancellationToken)
    {
        return Ok(await orders.CancelAsync(User, orderId, cancellationToken));
    }
}
