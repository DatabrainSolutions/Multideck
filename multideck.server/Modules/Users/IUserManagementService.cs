using System.Security.Claims;

namespace Multideck.Server.Modules.Users;

public interface IUserManagementService
{
    Task<TeamUsersResponse> GetTeamUsersAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<TeamUserDto> GetCurrentUserAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<TeamUserDto> UpdateCurrentUserProfileAsync(UpdateCurrentUserProfileRequest request, ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<UserProfilePhotoDto> SaveCurrentUserCoverPhotoAsync(SaveCurrentUserCoverPhotoRequest request, ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<bool> RemoveCurrentUserCoverPhotoAsync(string expectedPath, ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<CreateUserResponse> CreateUserAsync(CreateUserRequest request, ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<TeamUserDto> ChangeUserOfficeAsync(Guid userId, ChangeUserOfficeRequest request, ClaimsPrincipal user, CancellationToken cancellationToken);
}
