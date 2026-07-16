namespace Multideck.Server.Modules.AgentDexter;

public sealed class AgentDexterException(string title, string message, int statusCode) : Exception(message)
{
    public string Title { get; } = title;

    public int StatusCode { get; } = statusCode;

    public static AgentDexterException NotFound(string message) =>
        new("Conversation not found", message, StatusCodes.Status404NotFound);

    public static AgentDexterException InvalidRequest(string message) =>
        new("Invalid Dexter request", message, StatusCodes.Status400BadRequest);

    public static AgentDexterException Unavailable(string message) =>
        new("Dexter is unavailable", message, StatusCodes.Status503ServiceUnavailable);
}
