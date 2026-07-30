namespace Multideck.Server.Modules.Users;

public sealed record CreateUserRequest(string Email, string? FirstName, string? LastName, Guid? CompanyId, Guid? OfficeId, string? RoleTitle, Guid? RoleId);

public sealed record ChangeUserOfficeRequest(Guid OfficeId);

public sealed record UpdateCurrentUserProfileRequest(string? JobTitle);

public sealed record SaveCurrentUserCoverPhotoRequest(
    string Bucket,
    string Path,
    string MimeType,
    long SizeBytes);

public sealed record TeamCompanyDto(Guid Id, string Name);

public sealed record TeamOfficeDto(Guid Id, string Name, string? Address);

public sealed record TeamRoleDto(Guid Id, string Name);

public sealed record UserProfilePhotoDto(
    string Bucket,
    string Path,
    string MimeType,
    long SizeBytes,
    DateTime UpdatedAt);

public sealed record TeamUserDto(
    Guid Id,
    Guid? AuthUserId,
    string DisplayName,
    string? FirstName,
    string? LastName,
    string Email,
    TeamCompanyDto? Company,
    IReadOnlyList<TeamOfficeDto> Offices,
    IReadOnlyList<TeamRoleDto> Roles,
    string Status,
    string? JobTitle,
    UserProfilePhotoDto? ProfilePhoto,
    UserProfilePhotoDto? CoverPhoto);

public sealed record TeamUsersResponse(TeamCompanyDto? Company, IReadOnlyList<TeamOfficeDto> Offices, IReadOnlyList<TeamUserDto> Users);

public sealed record CreateUserResponse(TeamUserDto User, TeamCompanyDto Company, TeamOfficeDto Office, bool Invited);

public sealed record SupabaseInviteResult(Guid AuthUserId, bool Invited);
