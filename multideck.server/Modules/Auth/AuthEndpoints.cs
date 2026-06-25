using System.Security.Claims;
using Multideck.Server.Configuration;

namespace Multideck.Server.Modules.Auth;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthModule(this IEndpointRouteBuilder endpoints, SupabaseAuthOptions supabaseAuth)
    {
        var authApi = endpoints.MapGroup("/api/auth").WithTags("Auth");

        authApi.MapGet("/config", () => Results.Ok(new
        {
            configured = supabaseAuth.IsConfigured,
            issuer = supabaseAuth.IsConfigured ? supabaseAuth.Issuer : null,
            audience = supabaseAuth.IsConfigured ? supabaseAuth.Audience : null,
            validationMode = supabaseAuth.ValidationMode,
        }));

        if (supabaseAuth.IsConfigured)
        {
            authApi.MapGet("/session", async (
                    ClaimsPrincipal user,
                    IAuthSessionService sessionService,
                    CancellationToken cancellationToken) =>
                {
                    var profile = await sessionService.CreateProfileResponseAsync(user, cancellationToken);
                    return Results.Ok(sessionService.CreateSessionResponse(user, profile));
                })
                .RequireAuthorization();
        }
        else
        {
            authApi.MapGet("/session", () => Results.Problem(
                title: "Supabase authentication is not configured.",
                detail: "Set Supabase:Url on the API, and set Supabase:JwtSecret only if your project still uses a legacy shared JWT secret.",
                statusCode: StatusCodes.Status503ServiceUnavailable));
        }

        return endpoints;
    }
}
