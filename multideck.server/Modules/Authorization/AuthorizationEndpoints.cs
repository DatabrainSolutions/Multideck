using System.Security.Claims;
using Multideck.Server.Authorization;
using Multideck.Server.Configuration;

namespace Multideck.Server.Modules.Authorization;

public static class AuthorizationEndpoints
{
    public static IEndpointRouteBuilder MapAuthorizationModule(this IEndpointRouteBuilder endpoints, SupabaseAuthOptions supabaseAuth)
    {
        var authorizationApi = endpoints.MapGroup("/api/authorization").WithTags("Authorization");

        if (supabaseAuth.IsConfigured)
        {
            MapAuthenticatedEndpoints(authorizationApi);
        }
        else
        {
            MapUnavailableEndpoints(authorizationApi);
        }

        return endpoints;
    }

    private static void MapAuthenticatedEndpoints(RouteGroupBuilder authorizationApi)
    {
        authorizationApi.MapGet("", async (
                ClaimsPrincipal user,
                IAuthorizationManagementService authorization,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var response = await authorization.GetAuthorizationStateAsync(user, cancellationToken);
                    return Results.Ok(response);
                }
                catch (AuthorizationManagementException ex)
                {
                    return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
                }
            })
            .RequirePermission(AppPermissions.Authorization.Read);

        authorizationApi.MapPost("roles", async (
                CreateRoleRequest request,
                IAuthorizationManagementService authorization,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var response = await authorization.CreateRoleAsync(request, cancellationToken);
                    return Results.Created($"/api/authorization/roles/{response.Id}", response);
                }
                catch (AuthorizationValidationException ex)
                {
                    return Results.ValidationProblem(ex.Errors);
                }
            })
            .RequirePermission(AppPermissions.Authorization.Manage);

        authorizationApi.MapPatch("roles/{roleId:guid}/permissions", async (
                Guid roleId,
                UpdateRolePermissionsRequest request,
                IAuthorizationManagementService authorization,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var response = await authorization.UpdateRolePermissionsAsync(roleId, request, cancellationToken);
                    return Results.Ok(response);
                }
                catch (AuthorizationValidationException ex)
                {
                    return Results.ValidationProblem(ex.Errors);
                }
                catch (AuthorizationManagementException ex)
                {
                    return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
                }
            })
            .RequirePermission(AppPermissions.Authorization.Manage);

        authorizationApi.MapDelete("roles/{roleId:guid}", async (
                Guid roleId,
                ClaimsPrincipal user,
                IAuthorizationManagementService authorization,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    await authorization.DeleteRoleAsync(roleId, user, cancellationToken);
                    return Results.NoContent();
                }
                catch (AuthorizationManagementException ex)
                {
                    return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
                }
            })
            .RequirePermission(AppPermissions.Authorization.Manage);

        authorizationApi.MapPatch("users/{userId:guid}/roles", async (
                Guid userId,
                UpdateUserRolesRequest request,
                ClaimsPrincipal user,
                IAuthorizationManagementService authorization,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var response = await authorization.UpdateUserRolesAsync(userId, request, user, cancellationToken);
                    return Results.Ok(response);
                }
                catch (AuthorizationValidationException ex)
                {
                    return Results.ValidationProblem(ex.Errors);
                }
                catch (AuthorizationManagementException ex)
                {
                    return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
                }
            })
            .RequirePermission(AppPermissions.Authorization.Manage);
    }

    private static void MapUnavailableEndpoints(RouteGroupBuilder authorizationApi)
    {
        authorizationApi.MapGet("", () => Results.Problem(
            title: "Supabase authentication is not configured.",
            detail: "Set Supabase:Url before authorization roles and permissions can be loaded.",
            statusCode: StatusCodes.Status503ServiceUnavailable));

        authorizationApi.MapPost("roles", () => Results.Problem(
            title: "Supabase authentication is not configured.",
            detail: "Set Supabase:Url before authorization roles can be created.",
            statusCode: StatusCodes.Status503ServiceUnavailable));

        authorizationApi.MapPatch("roles/{roleId:guid}/permissions", () => Results.Problem(
            title: "Supabase authentication is not configured.",
            detail: "Set Supabase:Url before authorization roles can be changed.",
            statusCode: StatusCodes.Status503ServiceUnavailable));

        authorizationApi.MapDelete("roles/{roleId:guid}", () => Results.Problem(
            title: "Supabase authentication is not configured.",
            detail: "Set Supabase:Url before authorization roles can be deleted.",
            statusCode: StatusCodes.Status503ServiceUnavailable));

        authorizationApi.MapPatch("users/{userId:guid}/roles", () => Results.Problem(
            title: "Supabase authentication is not configured.",
            detail: "Set Supabase:Url before user roles can be changed.",
            statusCode: StatusCodes.Status503ServiceUnavailable));
    }
}
