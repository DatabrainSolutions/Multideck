using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace Multideck.Server.Modules.Warehouse;

/// <summary>
/// Shared base for warehouse controllers. Applies the module exception filter and provides a small
/// FluentValidation helper that returns a standard validation ProblemDetails when a request is invalid.
/// </summary>
[ApiController]
[TypeFilter(typeof(WarehouseExceptionFilter))]
public abstract class WarehouseControllerBase : ControllerBase
{
    protected async Task<ActionResult?> ValidateAsync<T>(IValidator<T> validator, T request, CancellationToken cancellationToken)
    {
        var result = await validator.ValidateAsync(request, cancellationToken);
        if (result.IsValid)
        {
            return null;
        }

        foreach (var error in result.Errors)
        {
            ModelState.AddModelError(error.PropertyName, error.ErrorMessage);
        }

        return ValidationProblem(ModelState);
    }
}
