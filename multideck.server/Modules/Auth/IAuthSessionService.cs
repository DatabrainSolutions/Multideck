using System.Security.Claims;

namespace Multideck.Server.Modules.Auth;

public interface IAuthSessionService
{
    Task<object?> CreateProfileResponseAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    object CreateSessionResponse(ClaimsPrincipal user, object? profile);
}
