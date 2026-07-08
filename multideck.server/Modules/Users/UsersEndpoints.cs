using System.Security.Claims;
using Multideck.Server.Authorization;
using Multideck.Server.Configuration;

namespace Multideck.Server.Modules.Users;

public static class UsersEndpoints
{
    public static IEndpointRouteBuilder MapUsersModule(this IEndpointRouteBuilder endpoints, SupabaseAuthOptions supabaseAuth)
    {
        var usersApi = endpoints.NewVersionedApi("Users")
            .MapGroup("/api/v{version:apiVersion}/users")
            .HasApiVersion(ApiVersions.V1)
            .WithTags("Users");

        if (supabaseAuth.IsConfigured)
        {
            MapAuthenticatedEndpoints(usersApi);
        }
        else
        {
            MapUnavailableEndpoints(usersApi);
        }

        return endpoints;
    }

    private static void MapAuthenticatedEndpoints(RouteGroupBuilder usersApi)
    {
        usersApi.MapGet("", async (
                ClaimsPrincipal user,
                IUserManagementService users,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var team = await users.GetTeamUsersAsync(user, cancellationToken);
                    return Results.Ok(team);
                }
                catch (UserCreationException ex)
                {
                    return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
                }
            })
            .RequirePermission(AppPermissions.Users.Read);

        usersApi.MapPost("", async (
                CreateUserRequest request,
                ClaimsPrincipal user,
                IUserManagementService users,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var response = await users.CreateUserAsync(request, user, cancellationToken);
                    return Results.Created($"/api/users/{response.User.Id}", response);
                }
                catch (UserValidationException ex)
                {
                    return Results.ValidationProblem(ex.Errors);
                }
                catch (UserCreationException ex)
                {
                    return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
                }
                catch (SupabaseAdminException ex)
                {
                    return Results.Problem(title: "Supabase could not create the user.", detail: ex.Message, statusCode: ex.StatusCode);
                }
            })
            .RequirePermission(AppPermissions.Users.Invite);

        usersApi.MapPatch("{userId:guid}/office", async (
                Guid userId,
                ChangeUserOfficeRequest request,
                ClaimsPrincipal user,
                IUserManagementService users,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var response = await users.ChangeUserOfficeAsync(userId, request, user, cancellationToken);
                    return Results.Ok(response);
                }
                catch (UserCreationException ex)
                {
                    return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
                }
            })
            .RequirePermission(AppPermissions.Users.Manage);
    }

    private static void MapUnavailableEndpoints(RouteGroupBuilder usersApi)
    {
        usersApi.MapGet("", () => Results.Problem(
            title: "Supabase authentication is not configured.",
            detail: "Set Supabase:Url before team users can be loaded.",
            statusCode: StatusCodes.Status503ServiceUnavailable));

        usersApi.MapPost("", () => Results.Problem(
            title: "Supabase authentication is not configured.",
            detail: "Set Supabase:Url before users can be created.",
            statusCode: StatusCodes.Status503ServiceUnavailable));

        usersApi.MapPatch("{userId:guid}/office", () => Results.Problem(
            title: "Supabase authentication is not configured.",
            detail: "Set Supabase:Url before user offices can be changed.",
            statusCode: StatusCodes.Status503ServiceUnavailable));
    }
}
