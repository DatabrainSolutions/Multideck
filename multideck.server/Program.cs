using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Mail;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
var supabaseAuth = SupabaseAuthOptions.FromConfiguration(builder.Configuration);

const string DefaultCompanyName = "Jenkar Shipping Ltd";
const string DefaultOfficeName = "Telford Way";
const string DefaultOfficeAddress = "Unit C2, Telford Way";

// Add services to the container.
builder.Services.AddOpenApi();
builder.Services.AddAuthorization();
builder.Services.AddHttpClient();
builder.Services.AddMultideckPersistence(builder.Configuration);

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
    authApi.MapGet("/session", async (ClaimsPrincipal user, MultideckContext db, CancellationToken cancellationToken) =>
        {
            var profile = await CreateSessionProfileResponse(user, db, cancellationToken);
            return Results.Ok(CreateSessionResponse(user, profile));
        })
        .RequireAuthorization();
}
else
{
    authApi.MapGet("/session", () => Results.Problem(
        title: "Supabase authentication is not configured.",
        detail: "Set Supabase:Url on the API, and set Supabase:JwtSecret only if your project still uses a legacy shared JWT secret.",
        statusCode: StatusCodes.Status503ServiceUnavailable));
}

var usersApi = app.MapGroup("/api/users").WithTags("Users");

if (supabaseAuth.IsConfigured)
{
    usersApi.MapGet("", async (ClaimsPrincipal user, MultideckContext db, CancellationToken cancellationToken) =>
        {
            try
            {
                var team = await CreateTeamUsersResponse(user, db, cancellationToken);
                return Results.Ok(team);
            }
            catch (UserCreationException ex)
            {
                return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
            }
        })
        .RequireAuthorization();

    usersApi.MapPost("", async (
            CreateUserRequest request,
            ClaimsPrincipal user,
            MultideckContext db,
            IHttpClientFactory httpClientFactory,
            CancellationToken cancellationToken) =>
        {
            return await CreateUser(request, user, db, httpClientFactory, supabaseAuth, cancellationToken);
        })
        .RequireAuthorization();

    usersApi.MapPatch("{userId:guid}/office", async (
            Guid userId,
            ChangeUserOfficeRequest request,
            ClaimsPrincipal user,
            MultideckContext db,
            CancellationToken cancellationToken) =>
        {
            return await ChangeUserOffice(userId, request, user, db, cancellationToken);
        })
        .RequireAuthorization();
}
else
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

app.Run();

static object CreateSessionResponse(ClaimsPrincipal user, object? profile)
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
        profile,
        expiresAt,
    };
}

static async Task<object?> CreateSessionProfileResponse(ClaimsPrincipal user, MultideckContext db, CancellationToken cancellationToken)
{
    if (!Guid.TryParse(user.FindFirstValue("sub"), out var authUserId))
    {
        return null;
    }

    var cmpUser = await db.CmpUsers
        .AsNoTracking()
        .Include(profile => profile.Company)
        .Include(profile => profile.Offices)
        .FirstOrDefaultAsync(profile => profile.AuthUserId == authUserId, cancellationToken);

    if (cmpUser is null)
    {
        return null;
    }

    return new
    {
        id = cmpUser.UserId,
        authUserId = cmpUser.AuthUserId,
        firstName = cmpUser.UserFirstname,
        lastName = cmpUser.UserLastname,
        email = cmpUser.UserEmail,
        company = cmpUser.Company is null ? null : new
        {
            id = cmpUser.Company.CompanyId,
            name = cmpUser.Company.CompanyName,
        },
        offices = cmpUser.Offices
            .OrderBy(office => office.OfficeName)
            .Select(office => new
            {
                id = office.OfficeId,
                name = office.OfficeName,
                address = office.OfficeAddress,
            }),
    };
}

static async Task<TeamUsersResponse> CreateTeamUsersResponse(ClaimsPrincipal user, MultideckContext db, CancellationToken cancellationToken)
{
    var currentUser = await GetCurrentCmpUser(user, db, trackChanges: false, cancellationToken);
    if (currentUser is null)
    {
        throw new UserCreationException("User profile is not linked", "Your Supabase account is not linked to a Multideck company profile yet.", StatusCodes.Status403Forbidden);
    }

    var companyId = currentUser.CompanyId;
    if (!companyId.HasValue)
    {
        throw new UserCreationException("Company profile is not linked", "Your Multideck user is not assigned to a company yet.", StatusCodes.Status403Forbidden);
    }

    var usersQuery = db.CmpUsers
        .AsNoTracking()
        .Include(teamUser => teamUser.Company)
        .Include(teamUser => teamUser.Offices)
        .AsQueryable();

    if (companyId.HasValue)
    {
        usersQuery = usersQuery.Where(teamUser => teamUser.CompanyId == companyId.Value);
    }

    var users = await usersQuery
        .OrderBy(teamUser => teamUser.UserFirstname)
        .ThenBy(teamUser => teamUser.UserLastname)
        .ThenBy(teamUser => teamUser.UserEmail)
        .ToListAsync(cancellationToken);

    var company = currentUser?.Company;
    if (company is null && companyId.HasValue)
    {
        company = await db.CmpCompanies.AsNoTracking().FirstOrDefaultAsync(item => item.CompanyId == companyId.Value, cancellationToken);
    }

    company ??= await db.CmpCompanies.AsNoTracking()
        .OrderBy(item => item.CompanyName == DefaultCompanyName ? 0 : 1)
        .ThenBy(item => item.CompanyName)
        .FirstOrDefaultAsync(cancellationToken);

    var officesQuery = db.CmpOffices.AsNoTracking().AsQueryable();
    if (company is not null)
    {
        officesQuery = officesQuery.Where(office => office.CompanyId == company.CompanyId);
    }

    var offices = await officesQuery
        .OrderBy(office => office.OfficeName)
        .Select(office => new TeamOfficeDto(office.OfficeId, office.OfficeName, office.OfficeAddress))
        .ToListAsync(cancellationToken);

    return new TeamUsersResponse(
        company is null ? null : new TeamCompanyDto(company.CompanyId, company.CompanyName),
        offices,
        users.Select(ToTeamUserDto).ToList());
}

static async Task<IResult> CreateUser(
    CreateUserRequest request,
    ClaimsPrincipal user,
    MultideckContext db,
    IHttpClientFactory httpClientFactory,
    SupabaseAuthOptions supabaseAuth,
    CancellationToken cancellationToken)
{
    var normalizedEmail = NormalizeEmail(request.Email);
    if (normalizedEmail is null)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            [nameof(request.Email)] = ["Enter a valid email address."],
        });
    }

    if (!supabaseAuth.HasServiceRoleKey)
    {
        return Results.Problem(
            title: "Supabase admin key is not configured.",
            detail: "Set Supabase:ServiceRoleKey on the API before creating users. This must be the service-role key, not the public anon key.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        var (company, office) = await ResolveUserCompanyAndOffice(request, user, db, cancellationToken);
        var invite = await InviteSupabaseUser(request, normalizedEmail, supabaseAuth, httpClientFactory, cancellationToken);
        var cmpUser = await UpsertCmpUserFromInvite(request, normalizedEmail, invite.AuthUserId, company, office, db, cancellationToken);

        return Results.Created($"/api/users/{cmpUser.UserId}", new CreateUserResponse(
            ToTeamUserDto(cmpUser),
            new TeamCompanyDto(company.CompanyId, company.CompanyName),
            new TeamOfficeDto(office.OfficeId, office.OfficeName, office.OfficeAddress),
            invite.Invited));
    }
    catch (UserCreationException ex)
    {
        return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
    }
    catch (SupabaseAdminException ex)
    {
        return Results.Problem(title: "Supabase could not create the user.", detail: ex.Message, statusCode: ex.StatusCode);
    }
}

static async Task<IResult> ChangeUserOffice(
    Guid userId,
    ChangeUserOfficeRequest request,
    ClaimsPrincipal user,
    MultideckContext db,
    CancellationToken cancellationToken)
{
    try
    {
        var currentUser = await GetCurrentCmpUser(user, db, trackChanges: false, cancellationToken);
        if (currentUser is null)
        {
            throw new UserCreationException("User profile is not linked", "Your Supabase account is not linked to a Multideck company profile yet.", StatusCodes.Status403Forbidden);
        }

        if (!currentUser.CompanyId.HasValue)
        {
            throw new UserCreationException("Company profile is not linked", "Your Multideck user is not assigned to a company yet.", StatusCodes.Status403Forbidden);
        }

        var office = await db.CmpOffices.FirstOrDefaultAsync(item => item.OfficeId == request.OfficeId, cancellationToken);
        if (office is null)
        {
            throw new UserCreationException("Office not found", "Choose a valid office before changing the user.", StatusCodes.Status400BadRequest);
        }

        if (office.CompanyId != currentUser.CompanyId.Value)
        {
            throw new UserCreationException("Office is not in this company", "Choose an office that belongs to your company.", StatusCodes.Status403Forbidden);
        }

        var targetUser = await db.CmpUsers
            .Include(item => item.Company)
            .Include(item => item.Offices)
            .FirstOrDefaultAsync(item => item.UserId == userId, cancellationToken);

        if (targetUser is null)
        {
            throw new UserCreationException("User not found", "Choose a valid team user before changing the office.", StatusCodes.Status404NotFound);
        }

        if (targetUser.CompanyId != currentUser.CompanyId.Value)
        {
            throw new UserCreationException("User is not in this company", "You can only change offices for users in your company.", StatusCodes.Status403Forbidden);
        }

        foreach (var assignedOffice in targetUser.Offices.ToList())
        {
            targetUser.Offices.Remove(assignedOffice);
        }

        targetUser.Offices.Add(office);
        await db.SaveChangesAsync(cancellationToken);

        targetUser.Company ??= currentUser.Company;
        return Results.Ok(ToTeamUserDto(targetUser));
    }
    catch (UserCreationException ex)
    {
        return Results.Problem(title: ex.Title, detail: ex.Message, statusCode: ex.StatusCode);
    }
}

static async Task<(CmpCompany Company, CmpOffice Office)> ResolveUserCompanyAndOffice(
    CreateUserRequest request,
    ClaimsPrincipal user,
    MultideckContext db,
    CancellationToken cancellationToken)
{
    var currentUser = await GetCurrentCmpUser(user, db, trackChanges: true, cancellationToken);
    if (currentUser is null)
    {
        throw new UserCreationException("User profile is not linked", "Your Supabase account is not linked to a Multideck company profile yet.", StatusCodes.Status403Forbidden);
    }

    var companyId = request.CompanyId ?? currentUser.CompanyId;
    var company = companyId.HasValue
        ? await db.CmpCompanies.FirstOrDefaultAsync(item => item.CompanyId == companyId.Value, cancellationToken)
        : null;

    company ??= await GetOrCreateDefaultCompany(db, cancellationToken);

    CmpOffice? office = null;
    var requestedOfficeId = request.OfficeId ?? currentUser?.Offices.OrderBy(item => item.OfficeName).FirstOrDefault()?.OfficeId;

    if (requestedOfficeId.HasValue)
    {
        office = await db.CmpOffices.FirstOrDefaultAsync(item => item.OfficeId == requestedOfficeId.Value, cancellationToken);
        if (office is null)
        {
            throw new UserCreationException("Office not found", "Choose a valid office before creating the user.", StatusCodes.Status400BadRequest);
        }

        if (office.CompanyId != company.CompanyId)
        {
            throw new UserCreationException("Office is not in this company", "Choose an office that belongs to the selected company.", StatusCodes.Status400BadRequest);
        }
    }

    office ??= await db.CmpOffices
        .OrderBy(item => item.OfficeAddress == DefaultOfficeAddress ? 0 : 1)
        .ThenBy(item => item.OfficeName)
        .FirstOrDefaultAsync(item => item.CompanyId == company.CompanyId, cancellationToken);

    if (office is null)
    {
        office = new CmpOffice
        {
            CompanyId = company.CompanyId,
            OfficeName = DefaultOfficeName,
            OfficeAddress = DefaultOfficeAddress,
        };

        db.CmpOffices.Add(office);
        await db.SaveChangesAsync(cancellationToken);
    }

    return (company, office);
}

static async Task<CmpCompany> GetOrCreateDefaultCompany(MultideckContext db, CancellationToken cancellationToken)
{
    var company = await db.CmpCompanies.FirstOrDefaultAsync(item => item.CompanyName == DefaultCompanyName, cancellationToken);
    if (company is not null)
    {
        return company;
    }

    company = new CmpCompany { CompanyName = DefaultCompanyName };
    db.CmpCompanies.Add(company);
    await db.SaveChangesAsync(cancellationToken);
    return company;
}

static async Task<CmpUser?> GetCurrentCmpUser(ClaimsPrincipal user, MultideckContext db, bool trackChanges, CancellationToken cancellationToken)
{
    if (!Guid.TryParse(user.FindFirstValue("sub"), out var authUserId))
    {
        return null;
    }

    var query = db.CmpUsers
        .Include(profile => profile.Company)
        .Include(profile => profile.Offices)
        .AsQueryable();

    if (!trackChanges)
    {
        query = query.AsNoTracking();
    }

    return await query.FirstOrDefaultAsync(profile => profile.AuthUserId == authUserId, cancellationToken);
}

static async Task<SupabaseInviteResult> InviteSupabaseUser(
    CreateUserRequest request,
    string normalizedEmail,
    SupabaseAuthOptions supabaseAuth,
    IHttpClientFactory httpClientFactory,
    CancellationToken cancellationToken)
{
    var inviteUrl = $"{supabaseAuth.Url.TrimEnd('/')}/auth/v1/invite";
    if (!string.IsNullOrWhiteSpace(supabaseAuth.InviteRedirectUrl))
    {
        inviteUrl = $"{inviteUrl}?redirect_to={Uri.EscapeDataString(supabaseAuth.InviteRedirectUrl)}";
    }

    var fullName = string.Join(' ', new[] { request.FirstName, request.LastName }.Where(part => !string.IsNullOrWhiteSpace(part))).Trim();
    var body = new
    {
        email = normalizedEmail,
        data = new
        {
            first_name = NormalizeText(request.FirstName),
            last_name = NormalizeText(request.LastName),
            full_name = string.IsNullOrWhiteSpace(fullName) ? null : fullName,
            role_title = NormalizeText(request.RoleTitle),
        },
    };

    var httpClient = httpClientFactory.CreateClient();
    using var httpRequest = new HttpRequestMessage(HttpMethod.Post, inviteUrl);
    httpRequest.Headers.Add("apikey", supabaseAuth.ServiceRoleKey);
    httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supabaseAuth.ServiceRoleKey);
    httpRequest.Content = JsonContent.Create(body);

    using var response = await httpClient.SendAsync(httpRequest, cancellationToken);
    var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

    if (!response.IsSuccessStatusCode)
    {
        throw new SupabaseAdminException(ReadSupabaseError(responseBody), (int)response.StatusCode);
    }

    if (!TryReadSupabaseUser(responseBody, out var authUserId, out var invited))
    {
        throw new SupabaseAdminException("Supabase created a user, but the response did not include a readable user id.", StatusCodes.Status502BadGateway);
    }

    return new SupabaseInviteResult(authUserId, invited);
}

static async Task<CmpUser> UpsertCmpUserFromInvite(
    CreateUserRequest request,
    string normalizedEmail,
    Guid authUserId,
    CmpCompany company,
    CmpOffice office,
    MultideckContext db,
    CancellationToken cancellationToken)
{
    var cmpUser = await db.CmpUsers
        .Include(item => item.Company)
        .Include(item => item.Offices)
        .FirstOrDefaultAsync(item => item.AuthUserId == authUserId, cancellationToken)
        ?? await db.CmpUsers
            .Include(item => item.Company)
            .Include(item => item.Offices)
            .FirstOrDefaultAsync(item => item.UserEmail.ToLower() == normalizedEmail, cancellationToken);

    if (cmpUser is null)
    {
        cmpUser = new CmpUser
        {
            AuthUserId = authUserId,
            CompanyId = company.CompanyId,
            UserEmail = normalizedEmail,
            UserFirstname = NormalizeText(request.FirstName),
            UserLastname = NormalizeText(request.LastName),
        };
        cmpUser.Offices.Add(office);
        db.CmpUsers.Add(cmpUser);
    }
    else
    {
        cmpUser.AuthUserId = authUserId;
        cmpUser.CompanyId = company.CompanyId;
        cmpUser.Company = company;
        cmpUser.UserEmail = normalizedEmail;
        cmpUser.UserFirstname = NormalizeText(request.FirstName) ?? cmpUser.UserFirstname;
        cmpUser.UserLastname = NormalizeText(request.LastName) ?? cmpUser.UserLastname;

        if (cmpUser.Offices.All(item => item.OfficeId != office.OfficeId))
        {
            cmpUser.Offices.Add(office);
        }
    }

    await db.SaveChangesAsync(cancellationToken);
    cmpUser.Company ??= company;
    return cmpUser;
}

static TeamUserDto ToTeamUserDto(CmpUser user)
{
    var nameParts = new[] { user.UserFirstname, user.UserLastname }
        .Where(part => !string.IsNullOrWhiteSpace(part))
        .Select(part => part!.Trim());
    var displayName = string.Join(' ', nameParts);

    return new TeamUserDto(
        user.UserId,
        user.AuthUserId,
        string.IsNullOrWhiteSpace(displayName) ? user.UserEmail : displayName,
        user.UserFirstname,
        user.UserLastname,
        user.UserEmail,
        user.Company is null ? null : new TeamCompanyDto(user.Company.CompanyId, user.Company.CompanyName),
        user.Offices
            .OrderBy(office => office.OfficeName)
            .Select(office => new TeamOfficeDto(office.OfficeId, office.OfficeName, office.OfficeAddress))
            .ToList(),
        user.AuthUserId.HasValue ? "Active" : "Profile only");
}

static string? NormalizeEmail(string? email)
{
    if (string.IsNullOrWhiteSpace(email))
    {
        return null;
    }

    var trimmed = email.Trim();
    try
    {
        var address = new MailAddress(trimmed);
        return string.Equals(address.Address, trimmed, StringComparison.OrdinalIgnoreCase) ? address.Address.ToLowerInvariant() : null;
    }
    catch
    {
        return null;
    }
}

static string? NormalizeText(string? value)
{
    var trimmed = value?.Trim();
    return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
}

static bool TryReadSupabaseUser(string responseBody, out Guid authUserId, out bool invited)
{
    authUserId = Guid.Empty;
    invited = true;

    using var document = JsonDocument.Parse(responseBody);
    var root = document.RootElement;

    if (TryReadSupabaseUserElement(root, out authUserId, out invited))
    {
        return true;
    }

    if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("user", out var userElement))
    {
        return TryReadSupabaseUserElement(userElement, out authUserId, out invited);
    }

    return false;
}

static bool TryReadSupabaseUserElement(JsonElement element, out Guid authUserId, out bool invited)
{
    authUserId = Guid.Empty;
    invited = true;

    if (element.ValueKind != JsonValueKind.Object)
    {
        return false;
    }

    if (!element.TryGetProperty("id", out var idElement) || idElement.ValueKind != JsonValueKind.String || !Guid.TryParse(idElement.GetString(), out authUserId))
    {
        return false;
    }

    invited = element.TryGetProperty("invited_at", out var invitedElement) && invitedElement.ValueKind != JsonValueKind.Null;
    return true;
}

static string ReadSupabaseError(string responseBody)
{
    if (string.IsNullOrWhiteSpace(responseBody))
    {
        return "Supabase did not return an error message.";
    }

    try
    {
        using var document = JsonDocument.Parse(responseBody);
        var root = document.RootElement;

        foreach (var propertyName in new[] { "msg", "message", "error_description", "error" })
        {
            if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String)
            {
                var value = property.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    return value;
                }
            }
        }
    }
    catch (JsonException)
    {
        // Fall back to the raw text below.
    }

    return responseBody;
}

static DateTimeOffset? TryReadUnixTime(string? value)
{
    return long.TryParse(value, out var seconds) ? DateTimeOffset.FromUnixTimeSeconds(seconds) : null;
}

sealed record CreateUserRequest(string Email, string? FirstName, string? LastName, Guid? CompanyId, Guid? OfficeId, string? RoleTitle);

sealed record ChangeUserOfficeRequest(Guid OfficeId);

sealed record TeamCompanyDto(Guid Id, string Name);

sealed record TeamOfficeDto(Guid Id, string Name, string? Address);

sealed record TeamUserDto(
    Guid Id,
    Guid? AuthUserId,
    string DisplayName,
    string? FirstName,
    string? LastName,
    string Email,
    TeamCompanyDto? Company,
    IReadOnlyList<TeamOfficeDto> Offices,
    string Status);

sealed record TeamUsersResponse(TeamCompanyDto? Company, IReadOnlyList<TeamOfficeDto> Offices, IReadOnlyList<TeamUserDto> Users);

sealed record CreateUserResponse(TeamUserDto User, TeamCompanyDto Company, TeamOfficeDto Office, bool Invited);

sealed record SupabaseInviteResult(Guid AuthUserId, bool Invited);

sealed class SupabaseAdminException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

sealed class UserCreationException(string title, string message, int statusCode) : Exception(message)
{
    public string Title { get; } = title;
    public int StatusCode { get; } = statusCode;
}

sealed record SupabaseAuthOptions(string Url, string JwtIssuer, string Audience, string JwtSecret, string ServiceRoleKey, string InviteRedirectUrl)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Url);
    public string Issuer => !string.IsNullOrWhiteSpace(JwtIssuer) ? JwtIssuer.TrimEnd('/') : $"{Url.TrimEnd('/')}/auth/v1";
    public bool UsesJwtSecret => !string.IsNullOrWhiteSpace(JwtSecret);
    public bool UsesRemoteSigningKeys => IsConfigured && !UsesJwtSecret;
    public bool HasServiceRoleKey => !string.IsNullOrWhiteSpace(ServiceRoleKey);
    public string ValidationMode => !IsConfigured ? "not-configured" : UsesJwtSecret ? "jwt-secret" : "jwks";

    public static SupabaseAuthOptions FromConfiguration(IConfiguration configuration)
    {
        var url = (configuration["Supabase:Url"] ?? string.Empty).Trim().TrimEnd('/');
        var jwtIssuer = (configuration["Supabase:JwtIssuer"] ?? string.Empty).Trim().TrimEnd('/');
        var audience = (configuration["Supabase:JwtAudience"] ?? "authenticated").Trim();
        var jwtSecret = (configuration["Supabase:JwtSecret"] ?? string.Empty).Trim();
        var serviceRoleKey = (configuration["Supabase:ServiceRoleKey"] ?? string.Empty).Trim();
        var inviteRedirectUrl = (configuration["Supabase:InviteRedirectUrl"] ?? string.Empty).Trim();

        return new SupabaseAuthOptions(url, jwtIssuer, audience, jwtSecret, serviceRoleKey, inviteRedirectUrl);
    }
}
