using Asp.Versioning;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;

namespace Multideck.Server.Modules.Warehouse.Items;

[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/warehouse/items")]
[Produces("application/json")]
public sealed class ItemsController(
    IItemService items,
    IItemImportWorkbook importWorkbook,
    IValidator<CreateItemRequest> createValidator,
    IValidator<UpdateItemRequest> updateValidator) : WarehouseControllerBase
{
    private const long MaxImportFileBytes = 5 * 1024 * 1024;
    private const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    [HttpGet]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<ItemDto>>> List(
        [FromQuery] Guid? facilityId,
        [FromQuery] string? search,
        [FromQuery] bool includeInactive,
        CancellationToken cancellationToken)
    {
        var result = await items.ListAsync(User, facilityId, search, includeInactive, cancellationToken);
        return Ok(result);
    }

    [HttpGet("reference")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<ItemReferenceResponse>> Reference(CancellationToken cancellationToken)
    {
        var result = await items.GetReferenceAsync(User, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{itemId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<ItemDto>> Get(Guid itemId, CancellationToken cancellationToken)
    {
        var result = await items.GetAsync(User, itemId, cancellationToken);
        return Ok(result);
    }

    [HttpPost]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<ItemDto>> Create(CreateItemRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(createValidator, request, cancellationToken) is { } validationProblem)
        {
            return validationProblem;
        }

        var result = await items.CreateAsync(User, request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { version = "1.0", itemId = result.Id }, result);
    }

    [HttpPut("{itemId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<ActionResult<ItemDto>> Update(Guid itemId, UpdateItemRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(updateValidator, request, cancellationToken) is { } validationProblem)
        {
            return validationProblem;
        }

        var result = await items.UpdateAsync(User, itemId, request, cancellationToken);
        return Ok(result);
    }

    [HttpGet("import/template")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public ActionResult DownloadTemplate()
    {
        var bytes = importWorkbook.BuildTemplate();
        return File(bytes, XlsxContentType, "multideck-items-template.xlsx");
    }

    [HttpPost("import")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    [RequestSizeLimit(MaxImportFileBytes)]
    public async Task<ActionResult<ImportItemsResponse>> Import(
        [FromForm] Guid customerOrgId,
        [FromForm] Guid facilityId,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (customerOrgId == Guid.Empty)
        {
            return ValidationProblemFor(nameof(customerOrgId), "Choose the customer to import items for.");
        }

        if (facilityId == Guid.Empty)
        {
            return ValidationProblemFor(nameof(facilityId), "Choose the facility to import items into.");
        }

        if (file is null || file.Length == 0)
        {
            return ValidationProblemFor(nameof(file), "Upload a filled-in .xlsx template.");
        }

        if (!file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            return ValidationProblemFor(nameof(file), "The import file must be an .xlsx spreadsheet.");
        }

        IReadOnlyList<ImportItemRow> rows;
        try
        {
            await using var stream = file.OpenReadStream();
            rows = importWorkbook.Parse(stream);
        }
        catch (Exception)
        {
            return ValidationProblemFor(nameof(file), "This file could not be read as an .xlsx spreadsheet.");
        }

        var result = await items.ImportAsync(User, customerOrgId, facilityId, rows, cancellationToken);
        return Ok(result);
    }

    private ActionResult ValidationProblemFor(string field, string message)
    {
        ModelState.AddModelError(field, message);
        return ValidationProblem(ModelState);
    }

    [HttpDelete("{itemId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.WriteValue)]
    public async Task<IActionResult> Delete(Guid itemId, CancellationToken cancellationToken)
    {
        await items.DeleteAsync(User, itemId, cancellationToken);
        return NoContent();
    }
}
