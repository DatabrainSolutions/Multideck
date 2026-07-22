using Asp.Versioning;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;
using Multideck.Server.Modules.Warehouse.Documents;

namespace Multideck.Server.Modules.Warehouse.Orders;

[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/warehouse/orders")]
[Produces("application/json")]
public sealed class OrdersController(
    IWarehouseOrderService orders,
    IWarehouseOrderDocumentService documents,
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
        [FromQuery] bool openOnly,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var result = await orders.ListAsync(User, facilityId, typeCode, statusCode, openOnly, search, cancellationToken);
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

    [HttpGet("{orderId:guid}/documents")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<WarehouseOrderDocumentDto>>> Documents(Guid orderId, CancellationToken cancellationToken) =>
        Ok(await documents.ListAsync(User, orderId, cancellationToken));

    [HttpPost("{orderId:guid}/documents")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    [RequestSizeLimit(26 * 1024 * 1024)] // Allows multipart framing; the service enforces a 25 MB file limit.
    public async Task<ActionResult<WarehouseOrderDocumentDto>> UploadDocument(Guid orderId, [FromForm] IFormFile? file, [FromForm] string? documentTypeCode, CancellationToken cancellationToken)
    {
        if (file is null) return ValidationProblemFor(nameof(file), "Choose a warehouse document to upload.");
        return Ok(await documents.UploadAsync(User, orderId, file, documentTypeCode, cancellationToken));
    }

    [HttpGet("{orderId:guid}/documents/{documentId:guid}/download")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<IActionResult> DownloadDocument(Guid orderId, Guid documentId, CancellationToken cancellationToken)
    {
        var content = await documents.DownloadAsync(User, orderId, documentId, cancellationToken);
        return File(content.Bytes, content.ContentType, content.FileName);
    }

    [HttpGet("{orderId:guid}/documents/{documentId:guid}/url")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<ActionResult<WarehouseDocumentReadUrlDto>> CreateDocumentReadUrl(Guid orderId, Guid documentId, CancellationToken cancellationToken) =>
        Ok(await documents.CreateReadUrlAsync(User, orderId, documentId, cancellationToken));

    [HttpPost("{orderId:guid}/documents/{documentId:guid}/review")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<WarehouseOrderDocumentDto>> ReviewDocument(Guid orderId, Guid documentId, ReviewWarehouseDocumentRequest request, CancellationToken cancellationToken) =>
        Ok(await documents.ReviewAsync(User, orderId, documentId, request, cancellationToken));

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

    private ActionResult ValidationProblemFor(string field, string message)
    {
        ModelState.AddModelError(field, message);
        return ValidationProblem(ModelState);
    }
}
