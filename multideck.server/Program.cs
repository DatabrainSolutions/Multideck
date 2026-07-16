using Multideck.Server.Modules.Users;
using Multideck.Server.Configuration;
using Multideck.Server.Modules.Auth;
using Multideck.Server.Modules.Authorization;
using Multideck.Server.Extensions;

var builder = WebApplication.CreateBuilder(args);
LoadDotEnv(builder.Environment.ContentRootPath);
var supabaseAuth = SupabaseAuthOptions.FromConfiguration(builder.Configuration);

builder.Services.AddMultideckServer(builder.Configuration, supabaseAuth);

var app = builder.Build();

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

app.Run();

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
