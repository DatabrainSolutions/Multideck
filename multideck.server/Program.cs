using Multideck.Server.Modules.Users;
using Multideck.Server.Configuration;
using Multideck.Server.Modules.Auth;
using Multideck.Server.Modules.Authorization;
using Multideck.Server.Extensions;
using Serilog;
using Serilog.Events;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);
    LoadDotEnv(builder.Environment.ContentRootPath);
    builder.Configuration.AddEnvironmentVariables();

    ConfigureSerilog(builder);

    var supabaseAuth = SupabaseAuthOptions.FromConfiguration(builder.Configuration);
    builder.Services.AddMultideckServer(builder.Configuration, supabaseAuth);

    var app = builder.Build();

    app.UseSerilogRequestLogging();

    if (builder.Configuration.GetValue<bool>("Features:SeedAuthorizationOnStartup"))
    {
        await app.SeedMultideckAuthorizationAsync();
    }

    app.UseMultideckServer(supabaseAuth);

    app.MapRootEndpoint();
    app.MapAuthModule(supabaseAuth);
    app.MapAuthorizationModule(supabaseAuth);
    app.MapUsersModule(supabaseAuth);
    app.MapControllers();

    await app.RunAsync();
}
catch (Exception exception)
{
    Log.Fatal(exception, "The Multideck API terminated unexpectedly");
}
finally
{
    await Log.CloseAndFlushAsync();
}

static void ConfigureSerilog(WebApplicationBuilder builder)
{
    var sourceToken = builder.Configuration["BetterStack:SourceToken"]?.Trim();
    var endpoint = builder.Configuration["BetterStack:Endpoint"]?.Trim().TrimEnd('/');

    var loggerConfiguration = new LoggerConfiguration()
        .MinimumLevel.Information()
        .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
        .Enrich.FromLogContext()
        .Enrich.WithProperty("Application", "Multideck.Api")
        .Enrich.WithProperty("Environment", builder.Environment.EnvironmentName)
        .WriteTo.Console();

    if (!string.IsNullOrWhiteSpace(sourceToken) && !string.IsNullOrWhiteSpace(endpoint))
    {
        loggerConfiguration.WriteTo.BetterStack(
            sourceToken: sourceToken,
            betterStackEndpoint: endpoint);
    }

    Log.Logger = loggerConfiguration.CreateLogger();
    builder.Logging.ClearProviders();
    builder.Services.AddSerilog(Log.Logger, dispose: false);

    if (string.IsNullOrWhiteSpace(sourceToken) || string.IsNullOrWhiteSpace(endpoint))
    {
        Log.Warning(
            "Better Stack logging is disabled. Configure BetterStack:SourceToken and BetterStack:Endpoint to enable cloud logging");
    }
}

static void LoadDotEnv(string contentRootPath)
{
    var envPath = Path.Combine(contentRootPath, ".env");
    if (!File.Exists(envPath)) return;

    foreach (var rawLine in File.ReadAllLines(envPath))
    {
        var line = rawLine.Trim();
        if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#')) continue;

        var separatorIndex = line.IndexOf('=');
        if (separatorIndex <= 0) continue;

        var key = line[..separatorIndex].Trim();
        var value = line[(separatorIndex + 1)..].Trim().Trim('"');

        if (string.IsNullOrWhiteSpace(key) || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))) continue;

        Environment.SetEnvironmentVariable(key, value);
    }
}
