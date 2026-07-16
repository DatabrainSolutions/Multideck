using Serilog.Events;
using Serilog;

namespace Multideck.Server.Extensions;

public static class LoggingExtensions
{
    public static WebApplicationBuilder AddMultideckLogging(this WebApplicationBuilder builder)
    {
        var token = builder.Configuration["BetterStack:SourceToken"]?.Trim();
        var endpoint = builder.Configuration["BetterStack:Endpoint"]?.Trim().TrimEnd('/');

        var loggerConfiguration = new LoggerConfiguration()
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
            .Enrich.FromLogContext()
            .Enrich.WithProperty("Application", "Multideck.API")
            .Enrich.WithProperty("Environment", builder.Environment.EnvironmentName)
            .WriteTo.Console();

        if (!string.IsNullOrWhiteSpace(token) && !string.IsNullOrWhiteSpace(endpoint))
        {
            loggerConfiguration.WriteTo.BetterStack(sourceToken: token, betterStackEndpoint: endpoint);
        }

        Log.Logger = loggerConfiguration.CreateLogger();
        builder.Logging.ClearProviders();
        builder.Services.AddSerilog(Log.Logger, dispose: false);

        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(endpoint))
        {
            Log.Warning("Better Stack logging is disabled. Configure BetterStack Token and Endpoint to enable cloud logging");
        }

        return builder;
    }

    public static WebApplication UseMultideckRequestLogging(this WebApplication app)
    {
        app.UseSerilogRequestLogging(options =>
        {
            options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
            {
                var remoteIpAddress = httpContext.Connection.RemoteIpAddress;
                if (remoteIpAddress is not null)
                {
                    var clientIpAddress = remoteIpAddress.IsIPv4MappedToIPv6
                        ? remoteIpAddress.MapToIPv4().ToString()
                        : remoteIpAddress.ToString();

                    diagnosticContext.Set("IpAddress", clientIpAddress);
                }

                var identity = httpContext.User.Identity;
                if (identity?.IsAuthenticated == true && !string.IsNullOrWhiteSpace(identity.Name))
                {
                    diagnosticContext.Set("Username", identity.Name);
                }
            };
        });

        return app;
    }
}
