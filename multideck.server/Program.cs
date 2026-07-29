using Multideck.Server.Modules.Users;
using Multideck.Server.Configuration;
using Multideck.Server.Modules.Auth;
using Multideck.Server.Modules.Authorization;
using Multideck.Server.Modules.Leads;
using Multideck.Server.Modules.Deals;
using Multideck.Server.Modules.Support;
using Multideck.Server.Extensions;
using Serilog;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);
    LoadDotEnv(builder.Environment.ContentRootPath);
    builder.Configuration.AddEnvironmentVariables();

    builder.AddMultideckLogging();

    var supabaseAuth = SupabaseAuthOptions.FromConfiguration(builder.Configuration);
    builder.Services.AddMultideckServer(builder.Configuration, supabaseAuth);

    var app = builder.Build();

    app.UseMultideckRequestLogging();

    if (builder.Configuration.GetValue<bool>("Features:SeedAuthorizationOnStartup"))
    {
        await app.SeedMultideckAuthorizationAsync();
    }

    await app.SeedDevelopmentCrmLeadsAsync();
    await app.SeedDevelopmentCrmDealsAsync();

    app.UseMultideckServer(supabaseAuth);

    app.MapRootEndpoint();
    app.MapAuthModule(supabaseAuth);
    app.MapAuthorizationModule(supabaseAuth);
    app.MapUsersModule(supabaseAuth);
    app.MapSupportModule(supabaseAuth);
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
