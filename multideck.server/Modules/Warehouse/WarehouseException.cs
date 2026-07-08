namespace Multideck.Server.Modules.Warehouse;

/// <summary>
/// Domain error for the Warehouse module. Carries a human title, message, and HTTP status so
/// controllers can translate it into a consistent ProblemDetails response.
/// </summary>
public sealed class WarehouseException(string title, string message, int statusCode) : Exception(message)
{
    public string Title { get; } = title;
    public int StatusCode { get; } = statusCode;

    public static WarehouseException NotFound(string message) =>
        new("Not found", message, StatusCodes.Status404NotFound);

    public static WarehouseException Conflict(string message) =>
        new("Conflict", message, StatusCodes.Status409Conflict);

    public static WarehouseException Forbidden(string message) =>
        new("Access denied", message, StatusCodes.Status403Forbidden);

    public static WarehouseException BadRequest(string message) =>
        new("Invalid request", message, StatusCodes.Status400BadRequest);
}
