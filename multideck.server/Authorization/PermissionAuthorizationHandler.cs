using Microsoft.AspNetCore.Authorization;

namespace Multideck.Server.Authorization;

public sealed class PermissionAuthorizationHandler(IUserPermissionService permissions) : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        var cancellationToken = context.Resource is HttpContext httpContext
            ? httpContext.RequestAborted
            : CancellationToken.None;

        if (await permissions.HasPermissionAsync(context.User, requirement.PermissionValue, cancellationToken))
        {
            context.Succeed(requirement);
        }
    }
}
