using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Multideck.Server.Modules.Inbox;

public sealed class InboxException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    public static InboxException BadRequest(string message) => new(StatusCodes.Status400BadRequest, message);
    public static InboxException Forbidden(string message) => new(StatusCodes.Status403Forbidden, message);
    public static InboxException NotFound(string message) => new(StatusCodes.Status404NotFound, message);
    public static InboxException Conflict(string message) => new(StatusCodes.Status409Conflict, message);
    public static InboxException TooLarge(string message) => new(StatusCodes.Status413PayloadTooLarge, message);
    public static InboxException Unavailable(string message) => new(StatusCodes.Status503ServiceUnavailable, message);
}

public sealed class InboxExceptionFilter(ILogger<InboxExceptionFilter> logger) : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not InboxException exception)
        {
            return;
        }

        if (exception.StatusCode >= 500)
        {
            logger.LogWarning(exception, "Inbox operation could not be completed");
        }

        context.Result = new ObjectResult(new ProblemDetails
        {
            Status = exception.StatusCode,
            Title = exception.StatusCode >= 500 ? "Inbox temporarily unavailable" : "Inbox request could not be completed",
            Detail = exception.Message,
        })
        {
            StatusCode = exception.StatusCode,
        };
        context.ExceptionHandled = true;
    }
}
