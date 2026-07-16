using Asp.Versioning;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.Customers;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/customers")]
[Produces("application/json")]
[TypeFilter(typeof(WarehouseExceptionFilter))]
public sealed class CustomersController(ICustomerService customers, IValidator<CreateCustomerRequest> createValidator) : WarehouseControllerBase
{
    [HttpGet]
    [RequirePermission(AppPermissions.Customers.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<CustomerDto>>> List([FromQuery] string? search, CancellationToken cancellationToken)
    {
        var result = await customers.ListAsync(User, search, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{customerId:guid}")]
    [RequirePermission(AppPermissions.Customers.ReadValue)]
    public async Task<ActionResult<CustomerDetailDto>> Get(Guid customerId, CancellationToken cancellationToken)
    {
        var result = await customers.GetAsync(User, customerId, cancellationToken);
        return Ok(result);
    }

    [HttpGet("reference")]
    [RequirePermission(AppPermissions.Customers.ReadValue)]
    public async Task<ActionResult<CustomerReferenceResponse>> Reference(CancellationToken cancellationToken)
    {
        var result = await customers.GetReferenceAsync(User, cancellationToken);
        return Ok(result);
    }

    [HttpPost]
    [RequirePermission(AppPermissions.Customers.WriteValue)]
    public async Task<ActionResult<CustomerDto>> Create(CreateCustomerRequest request, CancellationToken cancellationToken)
    {
        if (await ValidateAsync(createValidator, request, cancellationToken) is { } validationProblem)
        {
            return validationProblem;
        }

        var result = await customers.CreateAsync(User, request, cancellationToken);
        return CreatedAtAction(nameof(List), new { version = "1.0" }, result);
    }
}
