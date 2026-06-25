using System.Security.Claims;

namespace Multideck.Server.Modules.Users;

public interface IUserManagementService
{
    Task<TeamUsersResponse> GetTeamUsersAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<CreateUserResponse> CreateUserAsync(CreateUserRequest request, ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<TeamUserDto> ChangeUserOfficeAsync(Guid userId, ChangeUserOfficeRequest request, ClaimsPrincipal user, CancellationToken cancellationToken);
}
