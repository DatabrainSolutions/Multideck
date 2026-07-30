using Multideck.Server.Configuration;
using Multideck.Server.Modules.Users;

namespace Multideck.Server.Modules.Support;

public static class SupportEndpoints
{
    public static IEndpointRouteBuilder MapSupportModule(
        this IEndpointRouteBuilder endpoints,
        SupabaseAuthOptions supabaseAuth)
    {
        var supportApi = endpoints
            .MapGroup("/api/v1/support")
            .WithTags("Support");

        if (!supabaseAuth.IsConfigured)
        {
            supportApi.MapPost("tickets", () => Results.Problem(
                title: "Authentication is not configured.",
                detail: "Support tickets require a signed-in Multideck account.",
                statusCode: StatusCodes.Status503ServiceUnavailable));
            return endpoints;
        }

        supportApi.MapPost("tickets", async (
                CreateSupportTicketRequest request,
                HttpContext context,
                IUserManagementService users,
                ISupportTicketService support,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var requester = await users.GetCurrentUserAsync(context.User, cancellationToken);
                    var response = await support.CreateAsync(request, requester, cancellationToken);
                    return Results.Json(
                        response,
                        statusCode: response.Duplicate
                            ? StatusCodes.Status200OK
                            : StatusCodes.Status201Created);
                }
                catch (UserCreationException exception)
                {
                    return Results.Problem(
                        title: exception.Title,
                        detail: exception.Message,
                        statusCode: exception.StatusCode);
                }
                catch (SupportTicketException exception)
                {
                    return Results.Json(
                        new { code = exception.Code, message = exception.Message },
                        statusCode: exception.StatusCode);
                }
            })
            .RequireAuthorization();

        return endpoints;
    }
}
