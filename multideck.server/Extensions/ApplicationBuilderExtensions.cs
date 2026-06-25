using Multideck.Server.Configuration;
using Scalar.AspNetCore;

namespace Multideck.Server.Extensions;

public static class ApplicationBuilderExtensions
{
    public static WebApplication UseMultideckServer(this WebApplication app, SupabaseAuthOptions supabaseAuth)
    {
        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
            app.MapScalarApiReference();
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
        endpoints.MapGet("/", () => "Multideck Server is running.");
        endpoints.MapGet("/api/health", () => Results.Ok(new
        {
            status = "healthy",
            service = "Multideck",
            timestamp = DateTimeOffset.UtcNow,
        }));

        return endpoints;
    }
}
