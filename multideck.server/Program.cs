using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
LoadDotEnv(builder.Environment.ContentRootPath);
var supabaseAuth = SupabaseAuthOptions.FromConfiguration(builder.Configuration);

// Add services to the container.
builder.Services.AddOpenApi();
builder.Services.AddAuthorization();
builder.Services.AddSingleton(supabaseAuth);
builder.Services.AddHttpClient<SupabaseRestClient>();
builder.Services.AddScoped<WarehouseService>();

if (supabaseAuth.IsConfigured)
{
    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.MapInboundClaims = false;
            options.RequireHttpsMetadata = supabaseAuth.Issuer.StartsWith("https://", StringComparison.OrdinalIgnoreCase);

            if (supabaseAuth.UsesRemoteSigningKeys)
            {
                options.Authority = supabaseAuth.Issuer;
                options.MetadataAddress = $"{supabaseAuth.Issuer}/.well-known/openid-configuration";
            }

            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = supabaseAuth.Issuer,
                ValidateAudience = !string.IsNullOrWhiteSpace(supabaseAuth.Audience),
                ValidAudience = supabaseAuth.Audience,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromMinutes(2),
                NameClaimType = "email",
                RoleClaimType = "role",
            };

            if (supabaseAuth.UsesJwtSecret)
            {
                options.TokenValidationParameters.IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(supabaseAuth.JwtSecret));
                options.TokenValidationParameters.ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 };
            }
        });
}

// Add CORS for the client app. Configure Cors:AllowedOrigins for deployed environments.
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                .AllowAnyMethod()
                .AllowAnyHeader();

            return;
        }

        policy.AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(); // Scalar API docs at /scalar/v1
}

app.UseCors();

if (supabaseAuth.IsConfigured)
{
    app.UseAuthentication();
}

app.UseAuthorization();

// ═══════════════════════════════════════════════════════════
// API Endpoints — add your routes below
// ═══════════════════════════════════════════════════════════

app.MapGet("/", () => "Multideck Server is running.");
app.MapWarehouseApi(supabaseAuth);

var authApi = app.MapGroup("/api/auth").WithTags("Auth");

authApi.MapGet("/config", () => Results.Ok(new
{
    configured = supabaseAuth.IsConfigured,
    issuer = supabaseAuth.IsConfigured ? supabaseAuth.Issuer : null,
    audience = supabaseAuth.IsConfigured ? supabaseAuth.Audience : null,
    validationMode = supabaseAuth.ValidationMode,
}));

if (supabaseAuth.IsConfigured)
{
    authApi.MapGet("/session", (ClaimsPrincipal user) => Results.Ok(CreateSessionResponse(user)))
        .RequireAuthorization();
}
else
{
    authApi.MapGet("/session", () => Results.Problem(
        title: "Supabase authentication is not configured.",
        detail: "Set Supabase:Url on the API, and set Supabase:JwtSecret only if your project still uses a legacy shared JWT secret.",
        statusCode: StatusCodes.Status503ServiceUnavailable));
}

app.Run();

static object CreateSessionResponse(ClaimsPrincipal user)
{
    var expiresAt = TryReadUnixTime(user.FindFirstValue("exp"));

    return new
    {
        authenticated = user.Identity?.IsAuthenticated == true,
        user = new
        {
            id = user.FindFirstValue("sub"),
            email = user.FindFirstValue("email"),
            role = user.FindFirstValue("role"),
            audience = user.FindFirstValue("aud"),
        },
        expiresAt,
    };
}

static DateTimeOffset? TryReadUnixTime(string? value)
{
    return long.TryParse(value, out var seconds) ? DateTimeOffset.FromUnixTimeSeconds(seconds) : null;
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

sealed record SupabaseAuthOptions(string Url, string AnonKey, string JwtIssuer, string Audience, string JwtSecret)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Url);
    public bool HasRestAccess => IsConfigured && !string.IsNullOrWhiteSpace(AnonKey);
    public string Issuer => !string.IsNullOrWhiteSpace(JwtIssuer) ? JwtIssuer.TrimEnd('/') : $"{Url.TrimEnd('/')}/auth/v1";
    public bool UsesJwtSecret => !string.IsNullOrWhiteSpace(JwtSecret);
    public bool UsesRemoteSigningKeys => IsConfigured && !UsesJwtSecret;
    public string ValidationMode => !IsConfigured ? "not-configured" : UsesJwtSecret ? "jwt-secret" : "jwks";

    public static SupabaseAuthOptions FromConfiguration(IConfiguration configuration)
    {
        var url = (configuration["Supabase:Url"] ?? configuration["VITE_SUPABASE_URL"] ?? Environment.GetEnvironmentVariable("VITE_SUPABASE_URL") ?? string.Empty).Trim().TrimEnd('/');
        var anonKey = (configuration["Supabase:AnonKey"] ?? configuration["VITE_SUPABASE_ANON_KEY"] ?? Environment.GetEnvironmentVariable("VITE_SUPABASE_ANON_KEY") ?? string.Empty).Trim();
        var jwtIssuer = (configuration["Supabase:JwtIssuer"] ?? Environment.GetEnvironmentVariable("SUPABASE_JWT_ISSUER") ?? string.Empty).Trim().TrimEnd('/');
        var audience = (configuration["Supabase:JwtAudience"] ?? Environment.GetEnvironmentVariable("SUPABASE_JWT_AUDIENCE") ?? "authenticated").Trim();
        var jwtSecret = (configuration["Supabase:JwtSecret"] ?? Environment.GetEnvironmentVariable("SUPABASE_JWT_SECRET") ?? string.Empty).Trim();

        return new SupabaseAuthOptions(url, anonKey, jwtIssuer, audience, jwtSecret);
    }
}
