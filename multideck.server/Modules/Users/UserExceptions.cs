namespace Multideck.Server.Modules.Users;

public sealed class SupabaseAdminException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public sealed class UserValidationException(IDictionary<string, string[]> errors) : Exception("Request validation failed.")
{
    public IDictionary<string, string[]> Errors { get; } = errors;
}

public sealed class UserCreationException(string title, string message, int statusCode) : Exception(message)
{
    public string Title { get; } = title;
    public int StatusCode { get; } = statusCode;
}
