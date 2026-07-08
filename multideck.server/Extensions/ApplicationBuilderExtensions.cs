using Multideck.Server.Configuration;
using Multideck.Server.Modules.Authorization;
using Scalar.AspNetCore;

namespace Multideck.Server.Extensions;

public static class ApplicationBuilderExtensions
{
    public static WebApplication UseMultideckServer(this WebApplication app, SupabaseAuthOptions supabaseAuth)
    {
        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
            app.MapScalarApiReference(options =>
            {
                options
                    .WithTitle("Multideck API")
                    .WithOpenApiRoutePattern("/openapi/{documentName}.json")
                    .WithDefaultHttpClient(ScalarTarget.Shell, ScalarClient.Curl)
                    .EnablePersistentAuthentication();
            });
        }

        app.UseCors();

        if (supabaseAuth.IsConfigured)
        {
            app.UseAuthentication();
        }

        app.UseAuthorization();

        return app;
    }

    public static IEndpointRouteBuilder MapRootEndpoint(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/status", () => "Multideck Server is running.");
        return endpoints;
    }

    /// <summary>
    /// Seeds the permission catalog and system roles at startup so permission checks work before
    /// anyone opens the authorization screen. A transient database issue is logged, not fatal.
    /// </summary>
    public static async Task<WebApplication> SeedMultideckAuthorizationAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var authorization = scope.ServiceProvider.GetRequiredService<IAuthorizationManagementService>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("MultideckSeed");

        try
        {
            await authorization.EnsurePermissionCatalogAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not seed the authorization catalog at startup. It will be seeded on first authorization request.");
        }

        return app;
    }
}
