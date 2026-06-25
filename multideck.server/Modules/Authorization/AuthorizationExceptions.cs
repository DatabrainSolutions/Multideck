namespace Multideck.Server.Modules.Authorization;

public sealed class AuthorizationManagementException(string title, string message, int statusCode) : Exception(message)
{
    public string Title { get; } = title;
    public int StatusCode { get; } = statusCode;
}

public sealed class AuthorizationValidationException(IReadOnlyDictionary<string, string[]> errors) : Exception("Authorization request validation failed.")
{
    public IReadOnlyDictionary<string, string[]> Errors { get; } = errors;
}
