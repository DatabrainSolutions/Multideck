using System.Text;
using Asp.Versioning;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using Multideck.Intelligence;
using Multideck.Persistence;
using Multideck.Server.Authorization;
using Multideck.Server.Configuration;
using Multideck.Server.Modules.Auth;
using Multideck.Server.Modules.Authorization;
using Multideck.Server.Modules.Users;
using Multideck.Server.Modules.Users.Supabase;
using Multideck.Server.Modules.Warehouse;
using Multideck.Server.Modules.Customers;
using Multideck.Server.Modules.Documents;
using Multideck.Server.Modules.Finance;
using Multideck.Server.Modules.CrmPipelines;
using Multideck.Server.Modules.Leads;
using Multideck.Server.Modules.Deals;
using Multideck.Server.Modules.Support;

namespace Multideck.Server.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddMultideckServer(this IServiceCollection services, IConfiguration configuration,SupabaseAuthOptions supabaseAuth)
    {
        services.AddOpenApi();
        services.AddControllers();
        services.AddApiVersioningForMultideck();
        services.AddAuthorization();
        services.AddHttpClient();
        services.AddMultideckIntelligence(configuration);
        services.AddMultideckPersistence(configuration);
        services.AddDocumentStorage(configuration);
        services.AddHttpClient<IFinanceRateService, FinanceRateService>(client =>
        {
            client.BaseAddress = new Uri("https://www.ecb.europa.eu/");
            client.Timeout = TimeSpan.FromSeconds(20);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Multideck/1.0 (+https://multideck.app)");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/xml");
        });
        services.AddWarehouseModule();
        services.AddScoped<ICustomerService, CustomerService>();
        services.AddScoped<ILeadService, LeadService>();
        services.AddScoped<IDealService, DealService>();
        services.AddScoped<ICrmPipelineService, CrmPipelineService>();
        services
            .AddOptions<SupportTicketOptions>()
            .Bind(configuration.GetSection(SupportTicketOptions.SectionName));
        services.AddHttpClient<ISupportTicketService, SupportTicketService>(client =>
        {
            client.Timeout = Timeout.InfiniteTimeSpan;
        });

        services.AddSingleton(supabaseAuth);
        services.AddScoped<IAuthSessionService, AuthSessionService>();
        services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
        services.AddScoped<IUserPermissionService, UserPermissionService>();
        services.AddScoped<IAuthorizationManagementService, AuthorizationManagementService>();
        services.AddScoped<IUserManagementService, UserManagementService>();
        services.AddScoped<ISupabaseAdminClient, SupabaseAdminClient>();

        services.AddSupabaseAuthentication(supabaseAuth);
        services.AddClientCors(configuration);

        return services;
    }

    private static IServiceCollection AddApiVersioningForMultideck(this IServiceCollection services)
    {
        services
            .AddApiVersioning(options =>
            {
                options.DefaultApiVersion = ApiVersions.V1;
                options.AssumeDefaultVersionWhenUnspecified = true;
                options.ReportApiVersions = true;
                options.ApiVersionReader = ApiVersionReader.Combine(
                    new UrlSegmentApiVersionReader(),
                    new HeaderApiVersionReader("X-Api-Version"));
            })
            .AddMvc()
            .AddApiExplorer(options =>
            {
                options.GroupNameFormat = "'v'VVV";
                options.SubstituteApiVersionInUrl = true;
            });

        return services;
    }

    private static IServiceCollection AddSupabaseAuthentication(this IServiceCollection services, SupabaseAuthOptions supabaseAuth)
    {
        if (!supabaseAuth.IsConfigured)
        {
            return services;
        }

        services
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
                    options.TokenValidationParameters.ValidAlgorithms = [SecurityAlgorithms.HmacSha256];
                }
            });

        return services;
    }

    private static IServiceCollection AddClientCors(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

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

        return services;
    }
}
