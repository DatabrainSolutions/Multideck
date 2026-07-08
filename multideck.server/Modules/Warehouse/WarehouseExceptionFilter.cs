using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Multideck.Server.Modules.Warehouse;

/// <summary>
/// Turns <see cref="WarehouseException"/> into a ProblemDetails response so warehouse controllers
/// stay free of repetitive try/catch blocks. Other exceptions bubble up unchanged.
/// </summary>
public sealed class WarehouseExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not WarehouseException ex)
        {
            return;
        }

        context.Result = new ObjectResult(new ProblemDetails
        {
            Title = ex.Title,
            Detail = ex.Message,
            Status = ex.StatusCode,
        })
        {
            StatusCode = ex.StatusCode,
        };

        context.ExceptionHandled = true;
    }
}
