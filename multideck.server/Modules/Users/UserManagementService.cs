using System.Net.Mail;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Authorization;
using Multideck.Server.Common;
using Multideck.Server.Configuration;
using Multideck.Server.Modules.Users.Supabase;

namespace Multideck.Server.Modules.Users;

public sealed class UserManagementService(
    MultideckContext db,
    SupabaseAuthOptions supabaseAuth,
    ISupabaseAdminClient supabaseAdminClient) : IUserManagementService
{
    private const string ProfilePhotoBucket = "profile-photos";
    private const long ProfilePhotoMaxBytes = 5 * 1024 * 1024;
    private static readonly string[] ProfilePhotoMimeTypes = ["image/jpeg", "image/png", "image/webp"];

    public async Task<TeamUsersResponse> GetTeamUsersAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentCmpUser(user, trackChanges: false, cancellationToken);
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
            .Include(teamUser => teamUser.SysUserRoles)
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

        var company = currentUser.Company;
        if (company is null && companyId.HasValue)
        {
            company = await db.CmpCompanies.AsNoTracking().FirstOrDefaultAsync(item => item.CompanyId == companyId.Value, cancellationToken);
        }

        company ??= await db.CmpCompanies.AsNoTracking()
            .OrderBy(item => item.CompanyName == Defaults.CompanyName ? 0 : 1)
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

    public async Task<TeamUserDto> GetCurrentUserAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentCmpUser(user, trackChanges: false, cancellationToken);
        if (currentUser is null)
        {
            throw new UserCreationException("User profile is not linked", "Your Supabase account is not linked to a Multideck user profile yet.", StatusCodes.Status403Forbidden);
        }

        return ToTeamUserDto(currentUser);
    }

    public async Task<TeamUserDto> UpdateCurrentUserProfileAsync(
        UpdateCurrentUserProfileRequest request,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentCmpUser(user, trackChanges: true, cancellationToken);
        if (currentUser is null)
        {
            throw new UserCreationException("User profile is not linked", "Your Supabase account is not linked to a Multideck user profile yet.", StatusCodes.Status403Forbidden);
        }

        var jobTitle = NormalizeText(request.JobTitle);
        if (jobTitle?.Length > 120)
        {
            throw new UserValidationException(new Dictionary<string, string[]>
            {
                [nameof(request.JobTitle)] = ["Keep the job title to 120 characters or fewer."],
            });
        }

        currentUser.UserJobTitle = jobTitle;
        await db.SaveChangesAsync(cancellationToken);
        return ToTeamUserDto(currentUser);
    }

    public async Task<UserProfilePhotoDto> SaveCurrentUserCoverPhotoAsync(
        SaveCurrentUserCoverPhotoRequest request,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentCmpUser(user, trackChanges: true, cancellationToken);
        if (currentUser is null || !currentUser.AuthUserId.HasValue)
        {
            throw new UserCreationException("User profile is not linked", "Your Supabase account is not linked to a Multideck user profile yet.", StatusCodes.Status403Forbidden);
        }

        var expectedPrefix = $"{currentUser.AuthUserId.Value:D}/";
        var expectedExtension = request.MimeType switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => null,
        };

        if (request.Bucket != ProfilePhotoBucket
            || !ProfilePhotoMimeTypes.Contains(request.MimeType, StringComparer.Ordinal)
            || request.SizeBytes is < 1 or > ProfilePhotoMaxBytes
            || !request.Path.StartsWith(expectedPrefix, StringComparison.Ordinal)
            || expectedExtension is null
            || !request.Path.EndsWith(expectedExtension, StringComparison.OrdinalIgnoreCase))
        {
            throw new UserValidationException(new Dictionary<string, string[]>
            {
                [nameof(request.Path)] = ["Choose a valid cover photo before saving."],
            });
        }

        currentUser.UserCoverPhotoBucket = request.Bucket;
        currentUser.UserCoverPhotoPath = request.Path;
        currentUser.UserCoverPhotoMimeType = request.MimeType;
        currentUser.UserCoverPhotoSizeBytes = request.SizeBytes;
        currentUser.UserCoverPhotoUpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return ToCoverPhotoDto(currentUser)
            ?? throw new InvalidOperationException("The cover photo metadata was not saved.");
    }

    public async Task<bool> RemoveCurrentUserCoverPhotoAsync(
        string expectedPath,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentCmpUser(user, trackChanges: true, cancellationToken);
        if (currentUser is null)
        {
            throw new UserCreationException("User profile is not linked", "Your Supabase account is not linked to a Multideck user profile yet.", StatusCodes.Status403Forbidden);
        }

        if (!string.Equals(currentUser.UserCoverPhotoPath, expectedPath, StringComparison.Ordinal))
        {
            return false;
        }

        currentUser.UserCoverPhotoBucket = null;
        currentUser.UserCoverPhotoPath = null;
        currentUser.UserCoverPhotoMimeType = null;
        currentUser.UserCoverPhotoSizeBytes = null;
        currentUser.UserCoverPhotoUpdatedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<CreateUserResponse> CreateUserAsync(CreateUserRequest request, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(request.Email);
        if (normalizedEmail is null)
        {
            throw new UserValidationException(new Dictionary<string, string[]>
            {
                [nameof(request.Email)] = ["Enter a valid email address."],
            });
        }

        if (!supabaseAuth.HasServiceRoleKey)
        {
            throw new UserCreationException(
                "Supabase admin key is not configured.",
                "Set Supabase:ServiceRoleKey on the API before creating users. This must be the service-role key, not the public anon key.",
                StatusCodes.Status503ServiceUnavailable);
        }

        var (company, office) = await ResolveUserCompanyAndOffice(request, user, cancellationToken);
        var initialRole = await ResolveInitialRoleAsync(request.RoleId, cancellationToken);
        var invite = await supabaseAdminClient.InviteUserAsync(request, normalizedEmail, supabaseAuth, cancellationToken);
        var cmpUser = await UpsertCmpUserFromInvite(request, normalizedEmail, invite.AuthUserId, company, office, initialRole, request.RoleId.HasValue, cancellationToken);

        return new CreateUserResponse(
            ToTeamUserDto(cmpUser),
            new TeamCompanyDto(company.CompanyId, company.CompanyName),
            new TeamOfficeDto(office.OfficeId, office.OfficeName, office.OfficeAddress),
            invite.Invited);
    }

    public async Task<TeamUserDto> ChangeUserOfficeAsync(
        Guid userId,
        ChangeUserOfficeRequest request,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentCmpUser(user, trackChanges: false, cancellationToken);
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
            .Include(item => item.SysUserRoles)
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
        return ToTeamUserDto(targetUser);
    }

    private async Task<(CmpCompany Company, CmpOffice Office)> ResolveUserCompanyAndOffice(
        CreateUserRequest request,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var currentUser = await GetCurrentCmpUser(user, trackChanges: true, cancellationToken);
        if (currentUser is null)
        {
            throw new UserCreationException("User profile is not linked", "Your Supabase account is not linked to a Multideck company profile yet.", StatusCodes.Status403Forbidden);
        }

        var companyId = request.CompanyId ?? currentUser.CompanyId;
        var company = companyId.HasValue
            ? await db.CmpCompanies.FirstOrDefaultAsync(item => item.CompanyId == companyId.Value, cancellationToken)
            : null;

        company ??= await GetOrCreateDefaultCompany(cancellationToken);

        CmpOffice? office = null;
        var requestedOfficeId = request.OfficeId ?? currentUser.Offices.OrderBy(item => item.OfficeName).FirstOrDefault()?.OfficeId;

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
            .OrderBy(item => item.OfficeAddress == Defaults.OfficeAddress ? 0 : 1)
            .ThenBy(item => item.OfficeName)
            .FirstOrDefaultAsync(item => item.CompanyId == company.CompanyId, cancellationToken);

        if (office is null)
        {
            office = new CmpOffice
            {
                CompanyId = company.CompanyId,
                OfficeName = Defaults.OfficeName,
                OfficeAddress = Defaults.OfficeAddress,
            };

            db.CmpOffices.Add(office);
            await db.SaveChangesAsync(cancellationToken);
        }

        return (company, office);
    }

    private async Task<CmpCompany> GetOrCreateDefaultCompany(CancellationToken cancellationToken)
    {
        var company = await db.CmpCompanies.FirstOrDefaultAsync(item => item.CompanyName == Defaults.CompanyName, cancellationToken);
        if (company is not null)
        {
            return company;
        }

        company = new CmpCompany { CompanyName = Defaults.CompanyName };
        db.CmpCompanies.Add(company);
        await db.SaveChangesAsync(cancellationToken);
        return company;
    }

    private async Task<CmpUser?> GetCurrentCmpUser(ClaimsPrincipal user, bool trackChanges, CancellationToken cancellationToken)
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

    private async Task<SysUserRole?> ResolveInitialRoleAsync(Guid? roleId, CancellationToken cancellationToken)
    {
        if (roleId.HasValue)
        {
            var requestedRole = await db.SysUserRoles.FirstOrDefaultAsync(role => role.SysUserRoleId == roleId.Value, cancellationToken);
            if (requestedRole is null)
            {
                throw new UserCreationException("Role not found", "Choose a valid role before creating the user.", StatusCodes.Status400BadRequest);
            }

            return requestedRole;
        }

        return await db.SysUserRoles.FirstOrDefaultAsync(role => role.SysUserRoleName == SystemRoleDefinitions.Operator.Name, cancellationToken);
    }

    private static void AssignInitialRole(CmpUser user, SysUserRole? initialRole, bool replaceExistingRoles)
    {
        if (initialRole is null)
        {
            return;
        }

        if (replaceExistingRoles)
        {
            user.SysUserRoles.Clear();
        }

        if (user.SysUserRoles.All(role => role.SysUserRoleId != initialRole.SysUserRoleId))
        {
            user.SysUserRoles.Add(initialRole);
        }
    }

    private async Task<CmpUser> UpsertCmpUserFromInvite(
        CreateUserRequest request,
        string normalizedEmail,
        Guid authUserId,
        CmpCompany company,
        CmpOffice office,
        SysUserRole? initialRole,
        bool replaceExistingRoles,
        CancellationToken cancellationToken)
    {
        var cmpUser = await db.CmpUsers
            .Include(item => item.Company)
            .Include(item => item.Offices)
            .Include(item => item.SysUserRoles)
            .FirstOrDefaultAsync(item => item.AuthUserId == authUserId, cancellationToken)
            ?? await db.CmpUsers
                .Include(item => item.Company)
                .Include(item => item.Offices)
                .Include(item => item.SysUserRoles)
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
                UserJobTitle = NormalizeText(request.RoleTitle),
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
            cmpUser.UserJobTitle = NormalizeText(request.RoleTitle) ?? cmpUser.UserJobTitle;

            if (cmpUser.Offices.All(item => item.OfficeId != office.OfficeId))
            {
                cmpUser.Offices.Add(office);
            }
        }

        AssignInitialRole(cmpUser, initialRole, replaceExistingRoles);

        await db.SaveChangesAsync(cancellationToken);
        cmpUser.Company ??= company;
        return cmpUser;
    }

    private static TeamUserDto ToTeamUserDto(CmpUser user)
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
            user.SysUserRoles
                .OrderBy(role => role.SysUserRoleName)
                .Select(role => new TeamRoleDto(role.SysUserRoleId, role.SysUserRoleName))
                .ToList(),
            user.AuthUserId.HasValue ? "Active" : "Profile only",
            user.UserJobTitle,
            ToProfilePhotoDto(user),
            ToCoverPhotoDto(user));
    }

    private static UserProfilePhotoDto? ToProfilePhotoDto(CmpUser user)
    {
        if (string.IsNullOrWhiteSpace(user.UserProfilePhotoBucket)
            || string.IsNullOrWhiteSpace(user.UserProfilePhotoPath)
            || string.IsNullOrWhiteSpace(user.UserProfilePhotoMimeType)
            || !user.UserProfilePhotoSizeBytes.HasValue
            || !user.UserProfilePhotoUpdatedAt.HasValue)
        {
            return null;
        }

        return new UserProfilePhotoDto(
            user.UserProfilePhotoBucket,
            user.UserProfilePhotoPath,
            user.UserProfilePhotoMimeType,
            user.UserProfilePhotoSizeBytes.Value,
            user.UserProfilePhotoUpdatedAt.Value);
    }

    private static UserProfilePhotoDto? ToCoverPhotoDto(CmpUser user)
    {
        if (string.IsNullOrWhiteSpace(user.UserCoverPhotoBucket)
            || string.IsNullOrWhiteSpace(user.UserCoverPhotoPath)
            || string.IsNullOrWhiteSpace(user.UserCoverPhotoMimeType)
            || !user.UserCoverPhotoSizeBytes.HasValue
            || !user.UserCoverPhotoUpdatedAt.HasValue)
        {
            return null;
        }

        return new UserProfilePhotoDto(
            user.UserCoverPhotoBucket,
            user.UserCoverPhotoPath,
            user.UserCoverPhotoMimeType,
            user.UserCoverPhotoSizeBytes.Value,
            user.UserCoverPhotoUpdatedAt.Value);
    }

    private static string? NormalizeEmail(string? email)
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

    private static string? NormalizeText(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
